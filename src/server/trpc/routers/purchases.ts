import { z } from 'zod';
import { createTRPCRouter, protectedProcedure, managerProcedure } from '@/server/trpc';
import { TRPCError } from '@trpc/server';
import { Prisma } from '@prisma/client';
import { getNextSequenceValue } from '@/lib/sequences';
import { toDecimal } from '@/lib/money';

// Máquina de estados para órdenes de compra.
// Solo transiciones hacia adelante permitidas — previene reversiones accidentales.
const VALID_PO_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['SENT'],
  SENT: ['IN_TRANSIT'],
  IN_TRANSIT: ['RECEIVED'],
  RECEIVED: ['CLOSED'],
  CLOSED: [],
};

export const purchasesRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        status: z.enum(['DRAFT', 'SENT', 'IN_TRANSIT', 'RECEIVED', 'CLOSED']).optional(),
        supplierId: z.string().optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(1000).default(50),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const { status, supplierId, page = 1, pageSize = 50 } = input ?? {};
      const skip = (page - 1) * pageSize;

      const where: Prisma.PurchaseOrderWhereInput = {
        ...(status && { status }),
        ...(supplierId && { supplierId }),
      };

      const [orders, total] = await Promise.all([
        ctx.db.purchaseOrder.findMany({
          where,
          include: {
            supplier: { select: { name: true, country: true } },
            _count: { select: { items: true } },
            items: { select: { quantityOrdered: true, quantityReceived: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: pageSize,
        }),
        ctx.db.purchaseOrder.count({ where }),
      ]);

      return { orders, total, page, pageSize };
    }),

  byId: protectedProcedure
    .input(z.string().cuid())
    .query(async ({ ctx, input }) => {
      const order = await ctx.db.purchaseOrder.findUnique({
        where: { id: input },
        include: {
          supplier: true,
          items: {
            include: { product: { select: { name: true, sku: true } } },
          },
        },
      });
      if (!order) throw new TRPCError({ code: 'NOT_FOUND' });
      return order;
    }),

  create: protectedProcedure
    .input(
      z.object({
        supplierId: z.string().cuid(),
        items: z
          .array(
            z.object({
              productId: z.string().cuid(),
              quantityOrdered: z.number().int().positive(),
              unitCostUsd: z.number().positive(),
              unitCostDop: z.number().positive().optional(),
            })
          )
          .min(1),
        expectedDate: z.date().optional(),
        freightCost: z.number().min(0).default(0),
        customsCost: z.number().min(0).default(0),
        exchangeRate: z.number().positive().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { items, freightCost, customsCost, ...rest } = input;

      const subtotal = items.reduce(
        (sum, item) => sum.add(toDecimal(item.quantityOrdered).mul(toDecimal(item.unitCostUsd))),
        toDecimal(0)
      );
      const totalLandedCost = subtotal
        .add(toDecimal(freightCost))
        .add(toDecimal(customsCost));

      const order = await ctx.db.$transaction(async (tx) => {
        const poNumber = await getNextSequenceValue(tx, 'PURCHASE_ORDER');

        const created = await tx.purchaseOrder.create({
          data: {
            ...rest,
            poNumber,
            freightCost: toDecimal(freightCost),
            customsCost: toDecimal(customsCost),
            totalLandedCost,
            items: { create: items },
          },
          include: { items: true, supplier: true },
        });

        await tx.auditLog.create({
          data: {
            userId: ctx.session!.user!.id!,
            action: 'CREATE',
            entityType: 'PurchaseOrder',
            entityId: created.id,
            newValues: {
              poNumber,
              supplierId: input.supplierId,
              itemCount: items.length,
              totalLandedCost: totalLandedCost.toString(),
            } as Prisma.InputJsonValue,
            ipAddress: ctx.req.headers.get('x-forwarded-for') ?? undefined,
          },
        });

        return created;
      });

      return order;
    }),

  // Edición de órdenes en DRAFT: cambia items y/o datos de cabecera.
  // Solo disponible cuando la PO no ha sido enviada al proveedor.
  update: managerProcedure
    .input(
      z.object({
        id: z.string().cuid(),
        supplierId: z.string().cuid().optional(),
        expectedDate: z.date().optional(),
        freightCost: z.number().min(0).optional(),
        customsCost: z.number().min(0).optional(),
        exchangeRate: z.number().positive().optional(),
        notes: z.string().optional(),
        // Si se proveen items, reemplaza todos los items existentes
        items: z
          .array(
            z.object({
              productId: z.string().cuid(),
              quantityOrdered: z.number().int().positive(),
              unitCostUsd: z.number().positive(),
              unitCostDop: z.number().positive().optional(),
            })
          )
          .min(1)
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, items, freightCost, customsCost, ...headerData } = input;

      const order = await ctx.db.purchaseOrder.findUnique({
        where: { id },
        include: { items: true },
      });
      if (!order) throw new TRPCError({ code: 'NOT_FOUND' });
      if (order.status !== 'DRAFT') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Solo se pueden editar órdenes en estado DRAFT. Estado actual: ${order.status}`,
        });
      }

      const updated = await ctx.db.$transaction(async (tx) => {
        const resolvedFreight = freightCost !== undefined ? toDecimal(freightCost) : order.freightCost;
        const resolvedCustoms = customsCost !== undefined ? toDecimal(customsCost) : order.customsCost;

        let totalLandedCost = order.totalLandedCost;

        if (items) {
          await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } });

          const subtotal = items.reduce(
            (sum, item) => sum.add(toDecimal(item.quantityOrdered).mul(toDecimal(item.unitCostUsd))),
            toDecimal(0)
          );
          totalLandedCost = subtotal.add(resolvedFreight).add(resolvedCustoms);

          await tx.purchaseOrderItem.createMany({
            data: items.map((item) => ({ ...item, purchaseOrderId: id })),
          });
        } else if (freightCost !== undefined || customsCost !== undefined) {
          // Recalcular landed cost sin cambiar items
          const existingSubtotal = order.items.reduce(
            (sum, i) => sum.add(i.unitCostUsd.mul(i.quantityOrdered)),
            toDecimal(0)
          );
          totalLandedCost = existingSubtotal.add(resolvedFreight).add(resolvedCustoms);
        }

        const result = await tx.purchaseOrder.update({
          where: { id },
          data: {
            ...headerData,
            ...(freightCost !== undefined && { freightCost: resolvedFreight }),
            ...(customsCost !== undefined && { customsCost: resolvedCustoms }),
            totalLandedCost,
          },
          include: { items: true, supplier: true },
        });

        await tx.auditLog.create({
          data: {
            userId: ctx.session!.user!.id!,
            action: 'UPDATE',
            entityType: 'PurchaseOrder',
            entityId: id,
            newValues: {
              poNumber: order.poNumber,
              changedFields: Object.keys(headerData),
              itemsReplaced: !!items,
            } as Prisma.InputJsonValue,
            ipAddress: ctx.req.headers.get('x-forwarded-for') ?? undefined,
          },
        });

        return result;
      });

      return updated;
    }),

  // Cambio de estado con máquina de estados estricta.
  // Solo MANAGER o ADMIN pueden avanzar el estado de una PO.
  updateStatus: managerProcedure
    .input(
      z.object({
        id: z.string().cuid(),
        status: z.enum(['DRAFT', 'SENT', 'IN_TRANSIT', 'RECEIVED', 'CLOSED']),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const order = await ctx.db.purchaseOrder.findUnique({
        where: { id: input.id },
        select: { status: true, poNumber: true },
      });
      if (!order) throw new TRPCError({ code: 'NOT_FOUND' });

      const allowed = VALID_PO_TRANSITIONS[order.status] ?? [];
      if (!allowed.includes(input.status)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Transición inválida: ${order.status} → ${input.status}. Transiciones permitidas desde ${order.status}: ${allowed.join(', ') || 'ninguna (estado terminal)'}`,
        });
      }

      const data: Prisma.PurchaseOrderUpdateInput = { status: input.status };
      if (input.status === 'RECEIVED') data.receivedDate = new Date();

      const updated = await ctx.db.purchaseOrder.update({ where: { id: input.id }, data });

      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session!.user!.id!,
          action: 'UPDATE_STATUS',
          entityType: 'PurchaseOrder',
          entityId: input.id,
          newValues: {
            poNumber: order.poNumber,
            previousStatus: order.status,
            newStatus: input.status,
          } as Prisma.InputJsonValue,
          ipAddress: ctx.req.headers.get('x-forwarded-for') ?? undefined,
        },
      });

      return updated;
    }),

  // Recepción de mercancía: solo cuando la PO está IN_TRANSIT.
  // Solo MANAGER o ADMIN pueden registrar recepciones.
  receive: managerProcedure
    .input(
      z.object({
        id: z.string().cuid(),
        items: z.array(
          z.object({
            itemId: z.string().cuid(),
            quantityReceived: z.number().int().min(0),
            locationId: z.string().cuid().optional(),
            warehouseId: z.string().cuid().optional(),
          }).refine(
            (d) => d.locationId || d.warehouseId,
            { message: 'Se requiere locationId o warehouseId', path: ['locationId'] }
          )
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const order = await ctx.db.purchaseOrder.findUnique({
        where: { id: input.id },
        include: { items: true },
      });
      if (!order) throw new TRPCError({ code: 'NOT_FOUND' });

      if (order.status !== 'IN_TRANSIT') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Solo se puede recibir mercancía de órdenes IN_TRANSIT. Estado actual: ${order.status}`,
        });
      }

      await ctx.db.$transaction(async (tx) => {
        const receivedSummary: Array<{
          itemId: string;
          productId: string;
          quantityReceived: number;
        }> = [];

        for (const recv of input.items) {
          const item = order.items.find((i) => i.id === recv.itemId);
          if (!item || recv.quantityReceived === 0) continue;

          const alreadyReceived = item.quantityReceived + recv.quantityReceived;
          if (alreadyReceived > item.quantityOrdered) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `Cantidad a recibir (${recv.quantityReceived}) excede el saldo pendiente del ítem (${item.quantityOrdered - item.quantityReceived} restantes)`,
            });
          }

          let resolvedLocationId: string;
          if (recv.locationId) {
            const location = await tx.productLocation.findUnique({
              where: { id: recv.locationId },
              select: { productId: true },
            });
            if (!location) {
              throw new TRPCError({
                code: 'NOT_FOUND',
                message: `Ubicación ${recv.locationId} no encontrada`,
              });
            }
            if (location.productId !== item.productId) {
              throw new TRPCError({
                code: 'BAD_REQUEST',
                message: `La ubicación no pertenece al producto del ítem`,
              });
            }
            resolvedLocationId = recv.locationId;
          } else {
            const loc = await tx.productLocation.upsert({
              where: { productId_warehouseId: { productId: item.productId, warehouseId: recv.warehouseId! } },
              update: {},
              create: {
                productId: item.productId,
                warehouseId: recv.warehouseId!,
                locationCode: 'PRINCIPAL',
                quantityOnHand: 0,
                reservedQuantity: 0,
                backorderQuantity: 0,
              },
            });
            resolvedLocationId = loc.id;
          }

          await tx.purchaseOrderItem.update({
            where: { id: recv.itemId },
            data: { quantityReceived: { increment: recv.quantityReceived } },
          });

          await tx.inventoryMovement.create({
            data: {
              productId: item.productId,
              locationId: resolvedLocationId,
              movementType: 'IN',
              quantity: recv.quantityReceived,
              referenceType: 'PURCHASE_ORDER',
              referenceId: order.id,
              userId: ctx.session!.user!.id!,
              ipAddress: ctx.req.headers.get('x-forwarded-for') ?? undefined,
            },
          });

          await tx.productLocation.update({
            where: { id: resolvedLocationId },
            data: { quantityOnHand: { increment: recv.quantityReceived } },
          });

          receivedSummary.push({
            itemId: recv.itemId,
            productId: item.productId,
            quantityReceived: recv.quantityReceived,
          });
        }

        const updatedItems = await tx.purchaseOrderItem.findMany({
          where: { purchaseOrderId: input.id },
          select: { quantityOrdered: true, quantityReceived: true },
        });
        const fullyReceived = updatedItems.every(
          (i) => i.quantityReceived >= i.quantityOrdered
        );

        await tx.purchaseOrder.update({
          where: { id: input.id },
          data: {
            status: fullyReceived ? 'RECEIVED' : 'IN_TRANSIT',
            receivedDate: fullyReceived ? new Date() : undefined,
          },
        });

        await tx.auditLog.create({
          data: {
            userId: ctx.session!.user!.id!,
            action: 'RECEIVE',
            entityType: 'PurchaseOrder',
            entityId: input.id,
            newValues: {
              poNumber: order.poNumber,
              itemsReceived: receivedSummary,
              fullyReceived,
            } as Prisma.InputJsonValue,
            ipAddress: ctx.req.headers.get('x-forwarded-for') ?? undefined,
          },
        });
      });

      return { success: true };
    }),
});
