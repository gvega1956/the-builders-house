import { z } from 'zod';
import { createTRPCRouter, protectedProcedure, managerProcedure } from '@/server/trpc';
import { TRPCError } from '@trpc/server';
import { type Prisma } from '@prisma/client';
import { calculateAvailableStock } from '@/lib/inventory';

// Same shape as the locked row SELECT used in invoicing.ts
type LocationRow = {
  id: string;
  productId: string;
  quantityOnHand: number;
  reservedQuantity: number;
  warehouseId: string;
};

// Generates TRF-YYYY-NNNN using the same lock-safe sequence mechanism as invoicing/purchases.
// Must be called inside an active $transaction.
async function generateTransferNumber(tx: Prisma.TransactionClient): Promise<string> {
  const rows = await tx.$queryRaw<Array<{ currentValue: number }>>`
    UPDATE sequences
    SET    "currentValue" = "currentValue" + 1,
           "updatedAt"    = NOW()
    WHERE  name = 'TRANSFER'
    RETURNING "currentValue"
  `;
  if (rows.length === 0) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: "Secuencia 'TRANSFER' no encontrada. Aplica la migración 20260602000001.",
    });
  }
  const year = new Date().getFullYear();
  return `TRF-${year}-${String(rows[0]!.currentValue).padStart(4, '0')}`;
}

export const transfersRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED']).optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
      }).optional(),
    )
    .query(async ({ ctx, input }) => {
      const { status, page = 1, pageSize = 20 } = input ?? {};
      const skip = (page - 1) * pageSize;
      const where = status ? { status } : {};

      const [transfers, total] = await Promise.all([
        ctx.db.transfer.findMany({
          where,
          include: {
            fromWarehouse: { select: { name: true } },
            toWarehouse: { select: { name: true } },
            createdBy: { select: { name: true } },
            confirmedBy: { select: { name: true } },
            cancelledBy: { select: { name: true } },
            lines: {
              include: { product: { select: { sku: true, name: true } } },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: pageSize,
        }),
        ctx.db.transfer.count({ where }),
      ]);

      return { transfers, total, page, pageSize };
    }),

  byId: protectedProcedure
    .input(z.string().cuid())
    .query(async ({ ctx, input }) => {
      const transfer = await ctx.db.transfer.findUnique({
        where: { id: input },
        include: {
          fromWarehouse: { select: { name: true } },
          toWarehouse: { select: { name: true } },
          createdBy: { select: { name: true } },
          confirmedBy: { select: { name: true } },
          cancelledBy: { select: { name: true } },
          lines: {
            include: { product: { select: { sku: true, name: true } } },
          },
        },
      });
      if (!transfer) throw new TRPCError({ code: 'NOT_FOUND' });
      return transfer;
    }),

  // Origen crea la transferencia — queda PENDING.
  // Reserva stock en origen (reservedQuantity += qty).
  // No crea InventoryMovement — espeja el flujo PENDING_AUTHORIZATION de invoicing.
  create: managerProcedure
    .input(
      z.object({
        fromWarehouseId: z.string().cuid(),
        toWarehouseId: z.string().cuid(),
        lines: z
          .array(
            z.object({
              productId: z.string().cuid(),
              quantity: z.number().int().min(1),
            }),
          )
          .min(1),
        reason: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.fromWarehouseId === input.toWarehouseId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Origen y destino no pueden ser el mismo almacén.',
        });
      }

      return ctx.db.$transaction(async (tx) => {
        const transferNumber = await generateTransferNumber(tx);

        // Pessimistic lock on all origin locations (ordered by id to prevent deadlocks)
        const productIds = input.lines.map((l) => l.productId);
        const originLocs = await tx.$queryRaw<LocationRow[]>`
          SELECT pl.id, pl."productId", pl."quantityOnHand", pl."reservedQuantity", pl."warehouseId"
          FROM product_locations pl
          WHERE pl."productId" = ANY(${productIds}::text[])
            AND pl."warehouseId" = ${input.fromWarehouseId}
          ORDER BY pl.id ASC
          FOR UPDATE
        `;

        // Validate stock — same calculateAvailableStock helper used by invoicing.create
        const shortages: Array<{ productId: string; requested: number; available: number }> = [];
        for (const line of input.lines) {
          const loc = originLocs.find((l) => l.productId === line.productId);
          if (!loc) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: `Producto ${line.productId} no tiene ubicación en el almacén origen. Configura la ubicación antes de transferir.`,
            });
          }
          const available = calculateAvailableStock(loc);
          if (available < line.quantity) {
            shortages.push({ productId: line.productId, requested: line.quantity, available });
          }
        }

        if (shortages.length > 0) {
          const detail = shortages
            .map((s) => `productId=${s.productId}: solicitado ${s.requested}, disponible ${s.available}`)
            .join('; ');
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Stock insuficiente en almacén origen. ${detail}`,
          });
        }

        // Reserve stock in origin: reservedQuantity += qty, quantityOnHand untouched
        for (const line of input.lines) {
          const loc = originLocs.find((l) => l.productId === line.productId)!;
          await tx.productLocation.update({
            where: { id: loc.id },
            data: { reservedQuantity: { increment: line.quantity } },
          });
        }

        const transfer = await tx.transfer.create({
          data: {
            transferNumber,
            fromWarehouseId: input.fromWarehouseId,
            toWarehouseId: input.toWarehouseId,
            createdById: ctx.session!.user!.id!,
            reason: input.reason,
            lines: {
              create: input.lines.map((l) => ({
                productId: l.productId,
                quantity: l.quantity,
              })),
            },
          },
          include: {
            lines: { include: { product: { select: { sku: true, name: true } } } },
            fromWarehouse: { select: { name: true } },
            toWarehouse: { select: { name: true } },
          },
        });

        await tx.auditLog.create({
          data: {
            userId: ctx.session!.user!.id!,
            action: 'TRANSFER_CREATED',
            entityType: 'Transfer',
            entityId: transfer.id,
            newValues: {
              transferNumber,
              fromWarehouseId: input.fromWarehouseId,
              toWarehouseId: input.toWarehouseId,
              lineCount: input.lines.length,
              lines: input.lines,
              reason: input.reason ?? null,
            } as Prisma.InputJsonValue,
            ipAddress: ctx.req.headers.get('x-forwarded-for') ?? undefined,
          },
        });

        return transfer;
      });
    }),

  // Destino confirma recepción — movimiento físico ocurre aquí.
  // Crea DOS InventoryMovement tipo TRANSFER ligados por transferNumber.
  // Espeja exactamente el patrón de stock.transferStock.
  confirm: managerProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.$transaction(async (tx) => {
        // Lock Transfer header inside transaction to guard against double-confirm
        const rows = await tx.$queryRaw<
          Array<{
            id: string;
            status: string;
            transferNumber: string;
            fromWarehouseId: string;
            toWarehouseId: string;
          }>
        >`
          SELECT id, status, "transferNumber", "fromWarehouseId", "toWarehouseId"
          FROM transfers
          WHERE id = ${input.id}
          FOR UPDATE
        `;

        const header = rows[0];
        if (!header) throw new TRPCError({ code: 'NOT_FOUND' });
        if (header.status !== 'PENDING') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Solo se pueden confirmar transferencias PENDING. Estado actual: ${header.status}`,
          });
        }

        const lines = await tx.transferLine.findMany({
          where: { transferId: input.id },
          include: { product: { select: { sku: true, name: true } } },
        });

        const productIds = lines.map((l) => l.productId);

        // Lock origin locations in id order (deadlock prevention)
        const originLocs = await tx.$queryRaw<LocationRow[]>`
          SELECT id, "productId", "quantityOnHand", "reservedQuantity", "warehouseId"
          FROM product_locations
          WHERE "productId" = ANY(${productIds}::text[])
            AND "warehouseId" = ${header.fromWarehouseId}
          ORDER BY id ASC
          FOR UPDATE
        `;

        for (const line of lines) {
          const originLoc = originLocs.find((l) => l.productId === line.productId);
          if (!originLoc) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: `Ubicación origen no encontrada para SKU ${line.product.sku}. No se puede confirmar.`,
            });
          }

          // Upsert destination ProductLocation.
          // NOTA: locationCode usa 'PRINCIPAL' por defecto — mismo valor que stock.transferStock.
          // Si la UI debe pedir el locationCode destino, cambiar antes de la primera transferencia real.
          const destLoc = await tx.productLocation.upsert({
            where: {
              productId_warehouseId: {
                productId: line.productId,
                warehouseId: header.toWarehouseId,
              },
            },
            update: {},
            create: {
              productId: line.productId,
              warehouseId: header.toWarehouseId,
              locationCode: 'PRINCIPAL',
              quantityOnHand: 0,
              reservedQuantity: 0,
            },
          });

          // Commit physical move: origin loses qty (both hand and reservation)
          await tx.productLocation.update({
            where: { id: originLoc.id },
            data: {
              quantityOnHand:   { decrement: line.quantity },
              reservedQuantity: { decrement: line.quantity },
            },
          });

          // Destination gains qty
          await tx.productLocation.update({
            where: { id: destLoc.id },
            data: { quantityOnHand: { increment: line.quantity } },
          });

          // Two TRANSFER movements linked by transferNumber — mirrors stock.transferStock exactly
          await tx.inventoryMovement.create({
            data: {
              productId:     line.productId,
              locationId:    originLoc.id,
              movementType:  'TRANSFER',
              quantity:      -line.quantity,
              referenceType: 'TRANSFER',
              referenceId:   header.transferNumber,
              userId:        ctx.session!.user!.id!,
              ipAddress:     ctx.req.headers.get('x-forwarded-for') ?? undefined,
            },
          });

          await tx.inventoryMovement.create({
            data: {
              productId:     line.productId,
              locationId:    destLoc.id,
              movementType:  'TRANSFER',
              quantity:      line.quantity,
              referenceType: 'TRANSFER',
              referenceId:   header.transferNumber,
              userId:        ctx.session!.user!.id!,
              ipAddress:     ctx.req.headers.get('x-forwarded-for') ?? undefined,
            },
          });
        }

        const confirmed = await tx.transfer.update({
          where: { id: input.id },
          data: {
            status:       'CONFIRMED',
            confirmedById: ctx.session!.user!.id!,
            confirmedAt:  new Date(),
          },
          include: {
            fromWarehouse: { select: { name: true } },
            toWarehouse:   { select: { name: true } },
            lines: { include: { product: { select: { sku: true, name: true } } } },
          },
        });

        await tx.auditLog.create({
          data: {
            userId: ctx.session!.user!.id!,
            action: 'TRANSFER_CONFIRMED',
            entityType: 'Transfer',
            entityId: input.id,
            newValues: {
              transferNumber: header.transferNumber,
              confirmedById:  ctx.session!.user!.id!,
              lineCount:      lines.length,
            } as Prisma.InputJsonValue,
            ipAddress: ctx.req.headers.get('x-forwarded-for') ?? undefined,
          },
        });

        return confirmed;
      });
    }),

  // Anula la transferencia antes de confirmarla.
  // Libera las reservas de origen. Ningún InventoryMovement creado.
  cancel: managerProcedure
    .input(
      z.object({
        id:     z.string().cuid(),
        reason: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<
          Array<{ id: string; status: string; transferNumber: string; fromWarehouseId: string }>
        >`
          SELECT id, status, "transferNumber", "fromWarehouseId"
          FROM transfers
          WHERE id = ${input.id}
          FOR UPDATE
        `;

        const header = rows[0];
        if (!header) throw new TRPCError({ code: 'NOT_FOUND' });
        if (header.status !== 'PENDING') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Solo se pueden cancelar transferencias PENDING. Estado actual: ${header.status}`,
          });
        }

        const lines = await tx.transferLine.findMany({ where: { transferId: input.id } });
        const productIds = lines.map((l) => l.productId);

        // Lock origin locations before releasing reservations (same pattern as create)
        const originLocs = await tx.$queryRaw<LocationRow[]>`
          SELECT id, "productId", "quantityOnHand", "reservedQuantity"
          FROM product_locations
          WHERE "productId" = ANY(${productIds}::text[])
            AND "warehouseId" = ${header.fromWarehouseId}
          ORDER BY id ASC
          FOR UPDATE
        `;

        // Release reservations only — quantityOnHand was never touched
        for (const line of lines) {
          const originLoc = originLocs.find((l) => l.productId === line.productId);
          if (originLoc) {
            await tx.productLocation.update({
              where: { id: originLoc.id },
              data: { reservedQuantity: { decrement: line.quantity } },
            });
          }
        }

        const cancelled = await tx.transfer.update({
          where: { id: input.id },
          data: {
            status:        'CANCELLED',
            cancelledById:  ctx.session!.user!.id!,
            cancelledAt:   new Date(),
            reason:        input.reason,
          },
        });

        await tx.auditLog.create({
          data: {
            userId: ctx.session!.user!.id!,
            action: 'TRANSFER_CANCELLED',
            entityType: 'Transfer',
            entityId: input.id,
            newValues: {
              transferNumber: header.transferNumber,
              cancelledById:  ctx.session!.user!.id!,
              reason:         input.reason,
            } as Prisma.InputJsonValue,
            ipAddress: ctx.req.headers.get('x-forwarded-for') ?? undefined,
          },
        });

        return cancelled;
      });
    }),
});
