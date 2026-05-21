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
          },
          orderBy: { scheduledDate: 'desc' },
          skip,
          take: pageSize,
        }),
        ctx.db.cycleCount.count({ where }),
      ]);

      return { counts, total, page, pageSize };
    }),

  assign: managerProcedure
    .input(
      z.object({
        productId: z.string().cuid(),
        assignedUserId: z.string().cuid(),
        scheduledDate: z.date(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const locations = await ctx.db.productLocation.findMany({
        where: { productId: input.productId },
        select: { quantityOnHand: true },
      });
      const systemQuantity = locations.reduce((sum, l) => sum + l.quantityOnHand, 0);

      const count = await ctx.db.cycleCount.create({
        data: {
          productId: input.productId,
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
            assignedUserId: input.assignedUserId,
            scheduledDate: input.scheduledDate.toISOString(),
            systemQuantity,
          } as Prisma.InputJsonValue,
        },
      });

      return count;
    }),

  complete: protectedProcedure
    .input(
      z.object({
        id: z.string().cuid(),
        countedQuantity: z.number().int().min(0),
        locationId: z.string().cuid(),
        notes: z.string().optional(),
        photoUrl: z.string().url().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const count = await ctx.db.cycleCount.findUnique({
        where: { id: input.id },
        include: { product: { select: { name: true, sku: true } } },
      });
      if (!count) throw new TRPCError({ code: 'NOT_FOUND' });
      if (count.completedAt)
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Este conteo ya fue completado' });

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
          await tx.inventoryMovement.create({
            data: {
              productId: count.productId,
              locationId: input.locationId,
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
            where: { id: input.locationId },
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
