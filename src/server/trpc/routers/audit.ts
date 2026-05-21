import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';

export const auditRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        userId: z.string().optional(),
        entityType: z.string().optional(),
        action: z.string().optional(),
        from: z.date().optional(),
        to: z.date().optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(1000).default(50),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const { userId, entityType, action, from, to, page = 1, pageSize = 50 } = input ?? {};
      const skip = (page - 1) * pageSize;

      const where = {
        ...(userId && { userId }),
        ...(entityType && { entityType }),
        ...(action && { action }),
        ...(from || to
          ? { createdAt: { ...(from && { gte: from }), ...(to && { lte: to }) } }
          : {}),
      };

      const [logs, total] = await Promise.all([
        ctx.db.auditLog.findMany({
          where,
          include: {
            user: { select: { name: true, email: true, role: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: pageSize,
        }),
        ctx.db.auditLog.count({ where }),
      ]);

      return { logs, total, page, pageSize };
    }),
});
