import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';
import { TRPCError } from '@trpc/server';
import type { Prisma } from '@prisma/client';

const productCreateSchema = z.object({
  sku: z.string().min(1).max(50),
  barcode: z.string().optional(),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  categoryId: z.string().cuid(),
  supplierId: z.string().cuid().optional(),
  dimensions: z
    .object({
      width: z.number(),
      height: z.number(),
      depth: z.number().optional(),
      unit: z.enum(['cm', 'in', 'mm']),
    })
    .optional(),
  color: z.string().optional(),
  model: z.string().optional(),
  type: z.string().optional(),
  unitCost: z.number().positive(),
  retailPrice: z.number().positive(),
  wholesalePrice: z.number().positive(),
  minStock: z.number().int().min(0).default(0),
});

export const productsRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        categoryId: z.string().optional(),
        lowStock: z.boolean().optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(50),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const { search, categoryId, lowStock, page = 1, pageSize = 50 } = input ?? {};
      const skip = (page - 1) * pageSize;

      const where = {
        isActive: true,
        ...(search && {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { sku: { contains: search, mode: 'insensitive' as const } },
            { barcode: { contains: search, mode: 'insensitive' as const } },
          ],
        }),
        ...(categoryId && { categoryId }),
      };

      const [products, total] = await Promise.all([
        ctx.db.product.findMany({
          where,
          include: {
            category: true,
            locations: {
              include: { warehouse: true },
            },
          },
          orderBy: { name: 'asc' },
          skip,
          take: pageSize,
        }),
        ctx.db.product.count({ where }),
      ]);

      const withStock = products.map((p) => ({
        ...p,
        totalStock: p.locations.reduce((sum: number, loc) => sum + loc.quantityOnHand, 0),
      }));

      const filtered = lowStock
        ? withStock.filter((p) => p.totalStock <= p.minStock)
        : withStock;

      return { products: filtered, total, page, pageSize };
    }),

  byId: protectedProcedure
    .input(z.string().cuid())
    .query(async ({ ctx, input }) => {
      const product = await ctx.db.product.findUnique({
        where: { id: input },
        include: {
          category: true,
          supplier: true,
          locations: { include: { warehouse: true } },
          movements: {
            orderBy: { createdAt: 'desc' },
            take: 20,
            include: { user: { select: { name: true, email: true } } },
          },
        },
      });

      if (!product) throw new TRPCError({ code: 'NOT_FOUND' });
      return product;
    }),

  bySku: protectedProcedure
    .input(z.string())
    .query(async ({ ctx, input }) => {
      const product = await ctx.db.product.findUnique({
        where: { sku: input },
        include: {
          category: true,
          locations: { include: { warehouse: true } },
        },
      });
      if (!product) throw new TRPCError({ code: 'NOT_FOUND' });
      return product;
    }),

  create: protectedProcedure
    .input(productCreateSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.product.findUnique({ where: { sku: input.sku } });
      if (existing) throw new TRPCError({ code: 'CONFLICT', message: 'SKU ya existe' });

      const product = await ctx.db.product.create({
        data: {
          ...input,
          unitCost: input.unitCost,
          retailPrice: input.retailPrice,
          wholesalePrice: input.wholesalePrice,
        },
      });

      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session!.user!.id!,
          action: 'CREATE',
          entityType: 'Product',
          entityId: product.id,
          newValues: product as unknown as Prisma.InputJsonValue,
          ipAddress: ctx.req.headers.get('x-forwarded-for') ?? undefined,
        },
      });

      return product;
    }),

  update: protectedProcedure
    .input(z.object({ id: z.string().cuid(), data: productCreateSchema.partial() }))
    .mutation(async ({ ctx, input }) => {
      const before = await ctx.db.product.findUnique({ where: { id: input.id } });
      if (!before) throw new TRPCError({ code: 'NOT_FOUND' });

      const updated = await ctx.db.product.update({
        where: { id: input.id },
        data: input.data,
      });

      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session!.user!.id!,
          action: 'UPDATE',
          entityType: 'Product',
          entityId: updated.id,
          oldValues: before as unknown as Prisma.InputJsonValue,
          newValues: updated as unknown as Prisma.InputJsonValue,
          ipAddress: ctx.req.headers.get('x-forwarded-for') ?? undefined,
        },
      });

      return updated;
    }),
});
