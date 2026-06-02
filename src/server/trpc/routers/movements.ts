import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';
import { TRPCError } from '@trpc/server';

// C-2: valid referenceType values per movementType
const VALID_REFERENCE_TYPES: Record<string, string[]> = {
  IN:         ['PURCHASE_ORDER', 'ADJUSTMENT', 'DIRECT_RECEIPT'],
  OUT:        ['INVOICE'],
  RETURN:     ['INVOICE'],
  DAMAGE:     ['DAMAGE_REPORT'],
  TRANSFER:   ['TRANSFER'],
  ADJUSTMENT: ['ADJUSTMENT', 'CYCLE_COUNT'],
};

const movementCreateSchema = z
  .object({
    productId: z.string().cuid(),
    locationId: z.string().cuid(),
    destinationLocationId: z.string().cuid().optional(),
    movementType: z.enum(['IN', 'OUT', 'TRANSFER', 'ADJUSTMENT', 'RETURN', 'DAMAGE']),
    quantity: z.number().int().refine((n) => n !== 0, 'La cantidad no puede ser cero'),
    referenceType: z.enum(['INVOICE', 'PURCHASE_ORDER', 'ADJUSTMENT', 'TRANSFER', 'DAMAGE_REPORT', 'CYCLE_COUNT', 'DIRECT_RECEIPT']),
    referenceId: z.string().optional(),
    photoUrl: z.string().url().optional(),
    notes: z.string().max(1000).optional(),
    gpsLat: z.number().optional(),
    gpsLng: z.number().optional(),
  })
  .superRefine(({ movementType, quantity, referenceType, destinationLocationId, locationId }, ctx) => {
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

    if (movementType === 'TRANSFER' && !destinationLocationId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['destinationLocationId'],
        message: 'TRANSFER requiere destinationLocationId (ubicación destino)',
      });
    }

    if (movementType === 'TRANSFER' && destinationLocationId && destinationLocationId === locationId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['destinationLocationId'],
        message: 'La ubicación destino debe ser diferente a la ubicación origen',
      });
    }

    // C-2: cross-validate movementType / referenceType
    const allowed = VALID_REFERENCE_TYPES[movementType];
    if (allowed && !allowed.includes(referenceType)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['referenceType'],
        message: `Movimiento ${movementType} solo acepta referenceType: ${allowed.join(', ')}. Recibido: ${referenceType}`,
      });
    }
  });

// C-1: include reservedQuantity so available stock = quantityOnHand - reservedQuantity
type LocationRow = { id: string; productId: string; quantityOnHand: number; reservedQuantity: number };

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
      const { movementType, photoUrl, destinationLocationId } = input;

      // Photo validation deshabilitada temporalmente — re-habilitar en Sprint 3 (sistema anti-robo)
      // const requiresPhoto = ['OUT', 'DAMAGE', 'ADJUSTMENT'].includes(movementType);
      // if (requiresPhoto && !photoUrl) { throw new TRPCError(...) }

      // TRANSFER: dos movimientos atómicos (OUT en origen, IN en destino) con el mismo referenceId
      if (movementType === 'TRANSFER') {
        const { id: createdId } = await ctx.db.$transaction(async (tx) => {
          // Lock ambas ubicaciones en orden ascendente para prevenir deadlocks
          const [first, second] = [input.locationId, destinationLocationId!].sort();
          // C-1: fetch reservedQuantity alongside quantityOnHand
          const locRows = await tx.$queryRaw<LocationRow[]>`
            SELECT id, "productId", "quantityOnHand", "reservedQuantity"
            FROM product_locations
            WHERE id IN (${first}, ${second})
            ORDER BY id ASC
            FOR UPDATE
          `;

          const originRow = locRows.find((r) => r.id === input.locationId);
          const destRow = locRows.find((r) => r.id === destinationLocationId);

          if (!originRow) throw new TRPCError({ code: 'NOT_FOUND', message: 'Ubicación origen no encontrada' });
          if (!destRow) throw new TRPCError({ code: 'NOT_FOUND', message: 'Ubicación destino no encontrada' });

          if (originRow.productId !== input.productId) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'La ubicación origen no pertenece al producto indicado' });
          }
          if (destRow.productId !== input.productId) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'La ubicación destino no pertenece al mismo producto' });
          }

          const qty = Math.abs(input.quantity);
          // C-1: use available stock (quantityOnHand - reservedQuantity) for the check
          const availableOrigin = originRow.quantityOnHand - originRow.reservedQuantity;
          if (availableOrigin < qty) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `Stock disponible insuficiente en origen. Disponible: ${availableOrigin} (en mano: ${originRow.quantityOnHand}, reservado: ${originRow.reservedQuantity})`,
            });
          }

          const transferRef = input.referenceId ?? `TRF-${Date.now()}`;
          const commonData = {
            productId: input.productId,
            movementType: 'TRANSFER' as const,
            referenceType: input.referenceType,
            referenceId: transferRef,
            photoUrl: input.photoUrl,
            notes: input.notes,
            gpsLat: input.gpsLat,
            gpsLng: input.gpsLng,
            userId: ctx.session!.user!.id!,
            ipAddress: ctx.req.headers.get('x-forwarded-for') ?? undefined,
          };

          // OUT en origen (cantidad negativa)
          const outMovement = await tx.inventoryMovement.create({
            data: { ...commonData, locationId: input.locationId, quantity: -qty },
          });

          // IN en destino (cantidad positiva)
          await tx.inventoryMovement.create({
            data: { ...commonData, locationId: destinationLocationId!, quantity: qty },
          });

          await tx.productLocation.update({
            where: { id: input.locationId },
            data: { quantityOnHand: { decrement: qty } },
          });

          await tx.productLocation.update({
            where: { id: destinationLocationId! },
            data: { quantityOnHand: { increment: qty } },
          });

          return outMovement;
        });

        return ctx.db.inventoryMovement.findUnique({ where: { id: createdId } });
      }

      const movement = await ctx.db.$transaction(async (tx) => {
        // Pessimistic lock — adquiere lock exclusivo ANTES de leer el stock
        // C-1: fetch reservedQuantity for accurate available-stock check
        const rows = await tx.$queryRaw<LocationRow[]>`
          SELECT id, "productId", "quantityOnHand", "reservedQuantity"
          FROM product_locations
          WHERE id = ${input.locationId}
          FOR UPDATE
        `;

        if (rows.length === 0) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Ubicación no encontrada' });
        }

        const location = rows[0]!;

        if (location.productId !== input.productId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'La ubicación no pertenece al producto indicado',
          });
        }

        // C-1: available = quantityOnHand - reservedQuantity (stock not already committed)
        const isSalida = ['OUT', 'DAMAGE'].includes(movementType);
        const available = location.quantityOnHand - location.reservedQuantity;
        if (isSalida && available < Math.abs(input.quantity)) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Stock disponible insuficiente. Disponible: ${available} (en mano: ${location.quantityOnHand}, reservado: ${location.reservedQuantity})`,
          });
        }

        const { destinationLocationId: _dest, ...inputWithoutDest } = input;
        const created = await tx.inventoryMovement.create({
          data: {
            ...inputWithoutDest,
            userId: ctx.session!.user!.id!,
            ipAddress: ctx.req.headers.get('x-forwarded-for') ?? undefined,
          },
        });

        await tx.productLocation.update({
          where: { id: input.locationId },
          data: { quantityOnHand: { increment: input.quantity } },
        });

        return created;
      });

      return movement;
    }),
});
