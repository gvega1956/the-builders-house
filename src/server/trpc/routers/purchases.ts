import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';
import { TRPCError } from '@trpc/server';
import { Prisma } from '@prisma/client';
import { getNextSequenceValue } from '@/lib/sequences';
import { toDecimal } from '@/lib/money';

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
              unitCostDop: z.number().optional(),
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
      const totalLandedCost = subtotal.add(toDecimal(freightCost)).add(toDecimal(customsCost));

      const order = await ctx.db.$transaction(async (tx) => {
        const poNumber = await getNextSequenceValue(tx, 'PURCHASE_ORDER');

        return tx.purchaseOrder.create({
          data: {
            ...rest,
            poNumber,
            freightCost,
            customsCost,
            totalLandedCost,
            items: { create: items },
          },
          include: { items: true, supplier: true },
        });
      });

      return order;
    }),

  updateStatus: protectedProcedure
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

  receive: protectedProcedure
    .input(
      z.object({
        id: z.string().cuid(),
        items: z.array(
          z.object({
            itemId: z.string().cuid(),
            quantityReceived: z.number().int().min(0),
            locationId: z.string().cuid(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const order = await ctx.db.purchaseOrder.findUnique({
        where: { id: input.id },
        include: { items: true },
      });
      if (!order) throw new TRPCError({ code: 'NOT_FOUND' });

      if (order.status !== 'IN_TRANSIT' && order.status !== 'RECEIVED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `No se puede recibir una orden en estado ${order.status}. La orden debe estar IN_TRANSIT.`,
        });
      }

      await ctx.db.$transaction(async (tx) => {
        const receivedSummary: Array<{ itemId: string; productId: string; quantityReceived: number }> = [];

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

          // Validate that the location belongs to the same product
          const location = await tx.productLocation.findUnique({
            where: { id: recv.locationId },
            select: { productId: true },
          });
          if (!location) {
            throw new TRPCError({ code: 'NOT_FOUND', message: `Ubicación ${recv.locationId} no encontrada` });
          }
          if (location.productId !== item.productId) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `La ubicación no pertenece al producto del ítem`,
            });
          }

          await tx.purchaseOrderItem.update({
            where: { id: recv.itemId },
            data: { quantityReceived: { increment: recv.quantityReceived } },
          });

          await tx.inventoryMovement.create({
            data: {
              productId: item.productId,
              locationId: recv.locationId,
              movementType: 'IN',
              quantity: recv.quantityReceived,
              referenceType: 'PURCHASE_ORDER',
              referenceId: order.poNumber,
              userId: ctx.session!.user!.id!,
              ipAddress: ctx.req.headers.get('x-forwarded-for') ?? undefined,
            },
          });

          await tx.productLocation.update({
            where: { id: recv.locationId },
            data: { quantityOnHand: { increment: recv.quantityReceived } },
          });

          receivedSummary.push({ itemId: recv.itemId, productId: item.productId, quantityReceived: recv.quantityReceived });
        }

        // Check if order is fully received after this batch
        const updatedItems = await tx.purchaseOrderItem.findMany({
          where: { purchaseOrderId: input.id },
          select: { quantityOrdered: true, quantityReceived: true },
        });
        const fullyReceived = updatedItems.every((i) => i.quantityReceived >= i.quantityOrdered);

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
