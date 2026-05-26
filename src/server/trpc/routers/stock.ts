import { z } from 'zod';
import { createTRPCRouter, protectedProcedure, managerProcedure } from '@/server/trpc';
import { TRPCError } from '@trpc/server';
import { Prisma } from '@prisma/client';

// ─── Helper ───────────────────────────────────────────────────────────────────

function buildVentanaSku(lama: '3' | '4', width: number, height: number, acabado: 'AE' | 'BG'): string {
  return `VS-L${lama}-${width}X${Math.round(height * 100)}-${acabado}`;
}

async function resolveProductAndLocation(
  db: Parameters<Parameters<typeof protectedProcedure.query>[0]>[0]['ctx']['db'],
  sku: string,
  warehouseName: string,
) {
  const product = await db.product.findUnique({ where: { sku } });
  if (!product) throw new TRPCError({ code: 'NOT_FOUND', message: `SKU '${sku}' no encontrado` });

  const warehouse = await db.warehouse.findFirst({ where: { name: warehouseName, isActive: true } });
  if (!warehouse) throw new TRPCError({ code: 'NOT_FOUND', message: `Almacén '${warehouseName}' no encontrado` });

  return { product, warehouse };
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const stockRouter = createTRPCRouter({
  /**
   * 1. getStockBySku
   * Consulta el stock de un producto específico.
   * Acepta SKU directo o (lama, width, height, acabado).
   * Si warehouseName se omite, retorna todas las ubicaciones.
   */
  getStockBySku: protectedProcedure
    .input(
      z.object({
        sku: z.string().optional(),
        lama: z.enum(['3', '4']).optional(),
        width: z.number().int().positive().optional(),
        height: z.number().positive().optional(), // decimal, ej: 45.75
        acabado: z.enum(['AE', 'BG']).optional(),
        warehouseName: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      let sku = input.sku;

      if (!sku) {
        const { lama, width, height, acabado } = input;
        if (!lama || !width || height === undefined || !acabado) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Proporciona sku o (lama, width, height, acabado)',
          });
        }
        sku = buildVentanaSku(lama, width, height, acabado);
      }

      const product = await ctx.db.product.findUnique({
        where: { sku },
        include: {
          locations: {
            where: input.warehouseName ? { warehouse: { name: input.warehouseName } } : undefined,
            include: { warehouse: { select: { name: true } } },
          },
        },
      });

      if (!product) throw new TRPCError({ code: 'NOT_FOUND', message: `SKU '${sku}' no encontrado` });

      return {
        sku: product.sku,
        name: product.name,
        locations: product.locations.map((loc) => ({
          warehouse: loc.warehouse.name,
          quantityOnHand: loc.quantityOnHand,
          reservedQuantity: loc.reservedQuantity,
          available: loc.quantityOnHand - loc.reservedQuantity,
        })),
        totalStock: product.locations.reduce((s, l) => s + l.quantityOnHand, 0),
        totalAvailable: product.locations.reduce((s, l) => s + (l.quantityOnHand - l.reservedQuantity), 0),
      };
    }),

  /**
   * 2. getTotalByLama
   * Suma el stock total de todas las ventanas de una lama específica,
   * desglosado por acabado (AE / BG) y por almacén.
   */
  getTotalByLama: protectedProcedure
    .input(z.object({ lama: z.enum(['3', '4']) }))
    .query(async ({ ctx, input }) => {
      const products = await ctx.db.product.findMany({
        where: {
          sku: { startsWith: `VS-L${input.lama}-` },
          type: 'Ventana',
        },
        include: {
          locations: { include: { warehouse: { select: { name: true } } } },
        },
      });

      let ae = 0;
      let bg = 0;
      const byWarehouse: Record<string, { ae: number; bg: number }> = {};

      for (const product of products) {
        const isAe = product.color === 'Acid Etched';
        for (const loc of product.locations) {
          const wh = loc.warehouse.name;
          if (!byWarehouse[wh]) byWarehouse[wh] = { ae: 0, bg: 0 };
          if (isAe) {
            ae += loc.quantityOnHand;
            byWarehouse[wh].ae += loc.quantityOnHand;
          } else {
            bg += loc.quantityOnHand;
            byWarehouse[wh].bg += loc.quantityOnHand;
          }
        }
      }

      return {
        lama: input.lama,
        ae,
        bg,
        total: ae + bg,
        byWarehouse,
      };
    }),

  /**
   * 3. updateStock
   * Reemplaza la cantidad en mano con un valor exacto (ajuste de administrador).
   * Crea un movimiento ADJUSTMENT por la diferencia. Requiere rol MANAGER.
   */
  updateStock: managerProcedure
    .input(
      z.object({
        sku: z.string().min(1),
        warehouseName: z.string().min(1),
        newQuantity: z.number().int().min(0),
        notes: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { product, warehouse } = await resolveProductAndLocation(
        ctx.db,
        input.sku,
        input.warehouseName,
      );

      const location = await ctx.db.productLocation.findUnique({
        where: { productId_warehouseId: { productId: product.id, warehouseId: warehouse.id } },
      });
      if (!location) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `'${input.sku}' no tiene ubicación en '${input.warehouseName}'`,
        });
      }

      const diff = input.newQuantity - location.quantityOnHand;

      await ctx.db.$transaction(async (tx) => {
        await tx.productLocation.update({
          where: { id: location.id },
          data: { quantityOnHand: input.newQuantity },
        });

        if (diff !== 0) {
          await tx.inventoryMovement.create({
            data: {
              productId: product.id,
              locationId: location.id,
              movementType: 'ADJUSTMENT',
              quantity: diff,
              referenceType: 'ADJUSTMENT',
              referenceId: `ADJ-${Date.now()}`,
              userId: ctx.session!.user!.id!,
              notes: input.notes,
            },
          });
        }

        await tx.auditLog.create({
          data: {
            userId: ctx.session!.user!.id!,
            action: 'UPDATE_STOCK',
            entityType: 'ProductLocation',
            entityId: location.id,
            oldValues: { quantityOnHand: location.quantityOnHand } as Prisma.InputJsonValue,
            newValues: {
              quantityOnHand: input.newQuantity,
              diff,
              sku: input.sku,
              warehouse: input.warehouseName,
              notes: input.notes ?? null,
            } as Prisma.InputJsonValue,
          },
        });
      });

      return {
        sku: input.sku,
        warehouse: input.warehouseName,
        previousQuantity: location.quantityOnHand,
        newQuantity: input.newQuantity,
        diff,
      };
    }),

  /**
   * 4. transferStock
   * Mueve unidades de un almacén a otro.
   * Crea DOS movimientos TRANSFER atómicos (regla crítica CLAUDE.md).
   * Crea la ubicación destino si no existe. Requiere rol MANAGER.
   */
  transferStock: managerProcedure
    .input(
      z.object({
        sku: z.string().min(1),
        fromWarehouseName: z.string().min(1),
        toWarehouseName: z.string().min(1),
        quantity: z.number().int().min(1),
        notes: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.fromWarehouseName === input.toWarehouseName) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Origen y destino son el mismo almacén' });
      }

      const product = await ctx.db.product.findUnique({ where: { sku: input.sku } });
      if (!product) throw new TRPCError({ code: 'NOT_FOUND', message: `SKU '${input.sku}' no encontrado` });

      const [fromWh, toWh] = await Promise.all([
        ctx.db.warehouse.findFirst({ where: { name: input.fromWarehouseName, isActive: true } }),
        ctx.db.warehouse.findFirst({ where: { name: input.toWarehouseName, isActive: true } }),
      ]);
      if (!fromWh) throw new TRPCError({ code: 'NOT_FOUND', message: `Almacén origen '${input.fromWarehouseName}' no encontrado` });
      if (!toWh) throw new TRPCError({ code: 'NOT_FOUND', message: `Almacén destino '${input.toWarehouseName}' no encontrado` });

      const fromLoc = await ctx.db.productLocation.findUnique({
        where: { productId_warehouseId: { productId: product.id, warehouseId: fromWh.id } },
      });
      if (!fromLoc) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `'${input.sku}' no tiene ubicación en '${input.fromWarehouseName}'`,
        });
      }

      const available = fromLoc.quantityOnHand - fromLoc.reservedQuantity;
      if (available < input.quantity) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Stock insuficiente en '${input.fromWarehouseName}'. Disponible: ${available}, solicitado: ${input.quantity}`,
        });
      }

      const transferRef = `TRF-${Date.now()}`;

      await ctx.db.$transaction(async (tx) => {
        // Obtener o crear la ubicación destino
        const toLoc = await tx.productLocation.upsert({
          where: { productId_warehouseId: { productId: product.id, warehouseId: toWh.id } },
          update: {},
          create: {
            productId: product.id,
            warehouseId: toWh.id,
            locationCode: 'PRINCIPAL',
            quantityOnHand: 0,
          },
        });

        // Movimiento OUT (negativo) en origen
        await tx.inventoryMovement.create({
          data: {
            productId: product.id,
            locationId: fromLoc.id,
            movementType: 'TRANSFER',
            quantity: -input.quantity,
            referenceType: 'TRANSFER',
            referenceId: transferRef,
            userId: ctx.session!.user!.id!,
            notes: input.notes,
          },
        });

        // Movimiento IN (positivo) en destino
        await tx.inventoryMovement.create({
          data: {
            productId: product.id,
            locationId: toLoc.id,
            movementType: 'TRANSFER',
            quantity: input.quantity,
            referenceType: 'TRANSFER',
            referenceId: transferRef,
            userId: ctx.session!.user!.id!,
            notes: input.notes,
          },
        });

        // Actualizar cantidades
        await tx.productLocation.update({
          where: { id: fromLoc.id },
          data: { quantityOnHand: { decrement: input.quantity } },
        });
        await tx.productLocation.update({
          where: { id: toLoc.id },
          data: { quantityOnHand: { increment: input.quantity } },
        });

        await tx.auditLog.create({
          data: {
            userId: ctx.session!.user!.id!,
            action: 'TRANSFER_STOCK',
            entityType: 'ProductLocation',
            entityId: fromLoc.id,
            newValues: {
              sku: input.sku,
              from: input.fromWarehouseName,
              to: input.toWarehouseName,
              quantity: input.quantity,
              referenceId: transferRef,
              notes: input.notes ?? null,
            } as Prisma.InputJsonValue,
          },
        });
      });

      return {
        sku: input.sku,
        from: input.fromWarehouseName,
        to: input.toWarehouseName,
        quantity: input.quantity,
        referenceId: transferRef,
      };
    }),

  /**
   * 5. addStock
   * Agrega unidades a un almacén (llegada de mercancía, orden de compra).
   * Crea un movimiento IN. Crea la ubicación si no existe. Requiere rol MANAGER.
   */
  addStock: managerProcedure
    .input(
      z.object({
        sku: z.string().min(1),
        warehouseName: z.string().min(1),
        quantity: z.number().int().min(1),
        referenceId: z.string().max(100).optional(), // número de OC o factura de proveedor
        notes: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { product, warehouse } = await resolveProductAndLocation(
        ctx.db,
        input.sku,
        input.warehouseName,
      );

      const result = await ctx.db.$transaction(async (tx) => {
        const location = await tx.productLocation.upsert({
          where: { productId_warehouseId: { productId: product.id, warehouseId: warehouse.id } },
          update: {},
          create: {
            productId: product.id,
            warehouseId: warehouse.id,
            locationCode: 'PRINCIPAL',
            quantityOnHand: 0,
          },
        });

        await tx.inventoryMovement.create({
          data: {
            productId: product.id,
            locationId: location.id,
            movementType: 'IN',
            quantity: input.quantity,
            referenceType: 'PURCHASE_ORDER',
            referenceId: input.referenceId ?? `MANUAL-${Date.now()}`,
            userId: ctx.session!.user!.id!,
            notes: input.notes,
          },
        });

        const updated = await tx.productLocation.update({
          where: { id: location.id },
          data: { quantityOnHand: { increment: input.quantity } },
          select: { quantityOnHand: true },
        });

        await tx.auditLog.create({
          data: {
            userId: ctx.session!.user!.id!,
            action: 'ADD_STOCK',
            entityType: 'ProductLocation',
            entityId: location.id,
            newValues: {
              sku: input.sku,
              warehouse: input.warehouseName,
              quantityAdded: input.quantity,
              newTotal: updated.quantityOnHand,
              referenceId: input.referenceId ?? null,
              notes: input.notes ?? null,
            } as Prisma.InputJsonValue,
          },
        });

        return updated.quantityOnHand;
      });

      return {
        sku: input.sku,
        warehouse: input.warehouseName,
        quantityAdded: input.quantity,
        newTotal: result,
      };
    }),

  /**
   * Utilidad: lista todos los almacenes con su stock total.
   */
  warehousesSummary: protectedProcedure.query(async ({ ctx }) => {
    const warehouses = await ctx.db.warehouse.findMany({
      where: { isActive: true },
      include: {
        locations: { select: { quantityOnHand: true } },
      },
      orderBy: { name: 'asc' },
    });

    return warehouses.map((wh) => ({
      id: wh.id,
      name: wh.name,
      totalUnits: wh.locations.reduce((s, l) => s + l.quantityOnHand, 0),
      skuCount: wh.locations.length,
    }));
  }),
});
