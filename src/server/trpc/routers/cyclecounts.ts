import { z } from 'zod';
import { createTRPCRouter, protectedProcedure, managerProcedure } from '@/server/trpc';
import { TRPCError } from '@trpc/server';
import type { Prisma } from '@prisma/client';

export const cycleCountsRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z
        .object({
          completed: z.boolean().optional(),
          productId: z.string().cuid().optional(),
          page: z.number().int().min(1).default(1),
          pageSize: z.number().int().min(1).max(100).default(20),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const { completed, productId, page = 1, pageSize = 20 } = input ?? {};
      const skip = (page - 1) * pageSize;

      const where = {
        ...(completed !== undefined && {
          completedAt: completed ? { not: null as null } : null,
        }),
        ...(productId && { productId }),
      };

      const [counts, total] = await Promise.all([
        ctx.db.cycleCount.findMany({
          where,
          include: {
            product: { select: { sku: true, name: true, minStock: true } },
            assignedUser: { select: { name: true } },
            location: {
              include: { warehouse: { select: { name: true } } },
            },
          },
          orderBy: { scheduledDate: 'desc' },
          skip,
          take: pageSize,
        }),
        ctx.db.cycleCount.count({ where }),
      ]);

      return { counts, total, page, pageSize };
    }),

  // F-1 FIX: assign now requires a specific locationId.
  // systemQuantity is that location's stock — not the sum of all locations.
  assign: managerProcedure
    .input(
      z.object({
        productId: z.string().cuid(),
        locationId: z.string().cuid(),
        assignedUserId: z.string().cuid(),
        scheduledDate: z.date(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const location = await ctx.db.productLocation.findUnique({
        where: { id: input.locationId },
        select: { productId: true, quantityOnHand: true },
      });
      if (!location) throw new TRPCError({ code: 'NOT_FOUND', message: 'Ubicación no encontrada' });
      if (location.productId !== input.productId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'La ubicación no pertenece al producto indicado',
        });
      }

      // F-1: snapshot the specific location's stock, not a sum of all locations
      const systemQuantity = location.quantityOnHand;

      const count = await ctx.db.cycleCount.create({
        data: {
          productId: input.productId,
          locationId: input.locationId,
          assignedUserId: input.assignedUserId,
          scheduledDate: input.scheduledDate,
          systemQuantity,
          notes: input.notes,
        },
      });

      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session!.user!.id!,
          action: 'ASSIGN_CYCLE_COUNT',
          entityType: 'CycleCount',
          entityId: count.id,
          newValues: {
            productId: input.productId,
            locationId: input.locationId,
            assignedUserId: input.assignedUserId,
            scheduledDate: input.scheduledDate.toISOString(),
            systemQuantity,
          } as Prisma.InputJsonValue,
        },
      });

      return count;
    }),

  // F-2 FIX: locationId is no longer an input — it comes from count.locationId stored at assign time.
  //          This prevents adjustments from being applied to the wrong location.
  // F-3 FIX: requester must be the assignedUser, MANAGER, or ADMIN.
  complete: protectedProcedure
    .input(
      z.object({
        id: z.string().cuid(),
        countedQuantity: z.number().int().min(0),
        notes: z.string().optional(),
        photoUrl: z.string().url().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const count = await ctx.db.cycleCount.findUnique({
        where: { id: input.id },
        include: {
          product: { select: { name: true, sku: true } },
          location: { select: { productId: true } },
        },
      });
      if (!count) throw new TRPCError({ code: 'NOT_FOUND' });
      if (count.completedAt)
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Este conteo ya fue completado' });
      if (!count.locationId || !count.location) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Este conteo no tiene una ubicación asignada. Reasignar con locationId.',
        });
      }

      // F-3: only the assigned user, MANAGER, or ADMIN may complete the count
      const role = (ctx.session?.user as { role?: string })?.role;
      const isAuthorized =
        count.assignedUserId === ctx.session!.user!.id! ||
        role === 'ADMIN' ||
        role === 'MANAGER';
      if (!isAuthorized) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Solo el usuario asignado, MANAGER o ADMIN puede completar este conteo',
        });
      }

      // F-2: validate the stored location still belongs to the product (sanity check)
      if (count.location.productId !== count.productId) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Inconsistencia: la ubicación ya no pertenece a este producto',
        });
      }

      // variance = physical count - system snapshot taken at assign time
      const variance = input.countedQuantity - count.systemQuantity;

      return ctx.db.$transaction(async (tx) => {
        const updated = await tx.cycleCount.update({
          where: { id: input.id },
          data: {
            countedQuantity: input.countedQuantity,
            variance,
            completedAt: new Date(),
            notes: input.notes,
            photoUrl: input.photoUrl,
          },
        });

        if (variance !== 0) {
          // F-1/F-2: adjustment always goes to the location set at assign time
          await tx.inventoryMovement.create({
            data: {
              productId: count.productId,
              locationId: count.locationId!,
              movementType: 'ADJUSTMENT',
              quantity: variance,
              referenceType: 'CYCLE_COUNT',
              referenceId: count.id,
              userId: ctx.session!.user!.id!,
              photoUrl: input.photoUrl,
              notes: input.notes,
            },
          });

          await tx.productLocation.update({
            where: { id: count.locationId! },
            data: { quantityOnHand: { increment: variance } },
          });
        }

        await tx.auditLog.create({
          data: {
            userId: ctx.session!.user!.id!,
            action: 'COMPLETE_CYCLE_COUNT',
            entityType: 'CycleCount',
            entityId: input.id,
            newValues: {
              productSku: count.product.sku,
              locationId: count.locationId,
              systemQuantity: count.systemQuantity,
              countedQuantity: input.countedQuantity,
              variance,
              adjustmentCreated: variance !== 0,
            } as Prisma.InputJsonValue,
          },
        });

        return updated;
      });
    }),
});
