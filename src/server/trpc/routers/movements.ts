import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';
import { TRPCError } from '@trpc/server';

const movementCreateSchema = z.object({
  productId: z.string().cuid(),
  locationId: z.string().cuid(),
  movementType: z.enum(['IN', 'OUT', 'TRANSFER', 'ADJUSTMENT', 'RETURN', 'DAMAGE']),
  quantity: z.number().int().nonzero(),
  referenceType: z.enum(['INVOICE', 'PURCHASE_ORDER', 'ADJUSTMENT', 'TRANSFER', 'DAMAGE_REPORT', 'CYCLE_COUNT']),
  referenceId: z.string().optional(),
  photoUrl: z.string().url().optional(),
  notes: z.string().max(1000).optional(),
  gpsLat: z.number().optional(),
  gpsLng: z.number().optional(),
});

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
        pageSize: z.number().int().min(1).max(100).default(50),
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

      // Validar foto obligatoria para salidas, daños y ajustes
      const requiresPhoto = ['OUT', 'DAMAGE', 'ADJUSTMENT'].includes(movementType);
      if (requiresPhoto && !photoUrl) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Los movimientos de tipo ${movementType} requieren foto obligatoria`,
        });
      }

      // Verificar que la location existe y obtener stock actual
      const location = await ctx.db.productLocation.findUnique({
        where: { id: input.locationId },
        include: { product: true },
      });

      if (!location) throw new TRPCError({ code: 'NOT_FOUND', message: 'Ubicación no encontrada' });

      // Para salidas, verificar stock suficiente
      const isSalida = ['OUT', 'DAMAGE', 'TRANSFER'].includes(movementType);
      if (isSalida && location.quantityOnHand < Math.abs(input.quantity)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Stock insuficiente. Disponible: ${location.quantityOnHand}`,
        });
      }

      // Crear movimiento (APPEND-ONLY — nunca se modifica)
      const movement = await ctx.db.inventoryMovement.create({
        data: {
          ...input,
          userId: ctx.session!.user!.id!,
          ipAddress: ctx.req.headers.get('x-forwarded-for') ?? undefined,
        },
      });

      // Actualizar stock en location
      await ctx.db.productLocation.update({
        where: { id: input.locationId },
        data: {
          quantityOnHand: {
            increment: input.quantity,
          },
        },
      });

      return movement;
    }),
});
