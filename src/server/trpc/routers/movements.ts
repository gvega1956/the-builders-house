import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';
import { TRPCError } from '@trpc/server';

const movementCreateSchema = z
  .object({
    productId: z.string().cuid(),
    locationId: z.string().cuid(),
    movementType: z.enum(['IN', 'OUT', 'TRANSFER', 'ADJUSTMENT', 'RETURN', 'DAMAGE']),
    quantity: z.number().int().refine((n) => n !== 0, 'La cantidad no puede ser cero'),
    referenceType: z.enum(['INVOICE', 'PURCHASE_ORDER', 'ADJUSTMENT', 'TRANSFER', 'DAMAGE_REPORT', 'CYCLE_COUNT']),
    referenceId: z.string().optional(),
    photoUrl: z.string().url().optional(),
    notes: z.string().max(1000).optional(),
    gpsLat: z.number().optional(),
    gpsLng: z.number().optional(),
  })
  .superRefine(({ movementType, quantity }, ctx) => {
    const mustBePositive = ['IN', 'RETURN'];
    const mustBeNegative = ['OUT', 'DAMAGE'];

    if (mustBePositive.includes(movementType) && quantity < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['quantity'],
        message: `Los movimientos de tipo ${movementType} deben tener cantidad positiva (entrada de stock)`,
      });
    }

    if (mustBeNegative.includes(movementType) && quantity > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['quantity'],
        message: `Los movimientos de tipo ${movementType} deben tener cantidad negativa (salida de stock)`,
      });
    }
  });

type LocationRow = { id: string; productId: string; quantityOnHand: number };

export const movementsRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        productId: z.string().optional(),
        userId: z.string().optional(),
        movementType: z.enum(['IN', 'OUT', 'TRANSFER', 'ADJUSTMENT', 'RETURN', 'DAMAGE']).optional(),
        from: z.date().optional(),
        to: z.date().optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(1000).default(50),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const { productId, userId, movementType, from, to, page = 1, pageSize = 50 } = input ?? {};
      const skip = (page - 1) * pageSize;

      const where = {
        ...(productId && { productId }),
        ...(userId && { userId }),
        ...(movementType && { movementType }),
        ...(from || to
          ? {
              createdAt: {
                ...(from && { gte: from }),
                ...(to && { lte: to }),
              },
            }
          : {}),
      };

      const [movements, total] = await Promise.all([
        ctx.db.inventoryMovement.findMany({
          where,
          include: {
            product: { select: { sku: true, name: true } },
            user: { select: { name: true, email: true } },
            location: { include: { warehouse: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: pageSize,
        }),
        ctx.db.inventoryMovement.count({ where }),
      ]);

      return { movements, total, page, pageSize };
    }),

  create: protectedProcedure
    .input(movementCreateSchema)
    .mutation(async ({ ctx, input }) => {
      const { movementType, photoUrl } = input;

      // Photo validation — no DB needed, stays outside transaction
      const requiresPhoto = ['OUT', 'DAMAGE', 'ADJUSTMENT'].includes(movementType);
      if (requiresPhoto && !photoUrl) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Los movimientos de tipo ${movementType} requieren foto obligatoria`,
        });
      }

      const movement = await ctx.db.$transaction(async (tx) => {
        // Pessimistic lock — adquiere lock exclusivo ANTES de leer el stock.
        // Transacciones concurrentes sobre la misma fila esperan hasta que ésta
        // haga COMMIT o ROLLBACK (serializa el acceso al stock).
        const rows = await tx.$queryRaw<LocationRow[]>`
          SELECT id, "productId", "quantityOnHand"
          FROM product_locations
          WHERE id = ${input.locationId}
          FOR UPDATE
        `;

        if (rows.length === 0) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Ubicación no encontrada' });
        }

        const location = rows[0]!;

        // Bug 1.4: validate locationId belongs to productId
        if (location.productId !== input.productId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'La ubicación no pertenece al producto indicado',
          });
        }

        // Stock check — seguro: el FOR UPDATE impide que otro UPDATE cambie
        // quantityOnHand entre este SELECT y el UPDATE siguiente.
        const isSalida = ['OUT', 'DAMAGE', 'TRANSFER'].includes(movementType);
        if (isSalida && location.quantityOnHand < Math.abs(input.quantity)) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Stock insuficiente. Disponible: ${location.quantityOnHand}`,
          });
        }

        // Crear movimiento (APPEND-ONLY — nunca se modifica)
        const created = await tx.inventoryMovement.create({
          data: {
            ...input,
            userId: ctx.session!.user!.id!,
            ipAddress: ctx.req.headers.get('x-forwarded-for') ?? undefined,
          },
        });

        // Actualizar stock — atómico dentro de la misma transacción
        await tx.productLocation.update({
          where: { id: input.locationId },
          data: { quantityOnHand: { increment: input.quantity } },
        });

        return created;
      });

      return movement;
    }),
});
