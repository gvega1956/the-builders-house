import { z } from 'zod';
import { createTRPCRouter, protectedProcedure, managerProcedure } from '@/server/trpc';
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
        includeInactive: z.boolean().optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(1000).default(50),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const { search, categoryId, lowStock, includeInactive, page = 1, pageSize = 50 } = input ?? {};
      const skip = (page - 1) * pageSize;

      const where = {
        // Only filter by isActive when not explicitly showing all
        ...(includeInactive ? {} : { isActive: true }),
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

  // Lookup by SKU or barcode — used by the scan module
  scan: protectedProcedure
    .input(z.string().min(1))
    .query(async ({ ctx, input }) => {
      const product = await ctx.db.product.findFirst({
        where: {
          isActive: true,
          OR: [{ sku: input }, { barcode: input }],
        },
        include: {
          category: true,
          locations: { include: { warehouse: true } },
        },
      });
      if (!product) throw new TRPCError({ code: 'NOT_FOUND' });
      return product;
    }),

  // Assign barcode + qrCode to a product (both set to the same value)
  setBarcode: managerProcedure
    .input(
      z.object({
        productId: z.string().cuid(),
        barcode: z.string().min(1).max(100),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const conflict = await ctx.db.product.findFirst({
        where: { barcode: input.barcode, id: { not: input.productId } },
        select: { sku: true, name: true },
      });
      if (conflict) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Código ya asignado a: ${conflict.sku} — ${conflict.name}`,
        });
      }

      const updated = await ctx.db.product.update({
        where: { id: input.productId },
        data: { barcode: input.barcode, qrCode: input.barcode },
      });

      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session!.user!.id!,
          action: 'UPDATE',
          entityType: 'Product',
          entityId: input.productId,
          newValues: { barcode: input.barcode } as Prisma.InputJsonValue,
          ipAddress: ctx.req.headers.get('x-forwarded-for') ?? undefined,
        },
      });

      return updated;
    }),

  create: protectedProcedure
    .input(productCreateSchema)
    .mutation(async ({ ctx, input }) => {
      if (input.retailPrice < input.unitCost) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'El precio retail no puede ser menor al costo unitario' });
      }
      if (input.wholesalePrice < input.unitCost) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'El precio mayoreo no puede ser menor al costo unitario' });
      }
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

  lowStock: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.$queryRaw<Array<{
      id: string;
      sku: string;
      name: string;
      minStock: number;
      totalStock: number;
    }>>`
      SELECT p.id, p.sku, p.name, p."minStock",
             COALESCE(SUM(pl."quantityOnHand"), 0)::int AS "totalStock"
      FROM products p
      LEFT JOIN product_locations pl ON pl."productId" = p.id
      WHERE p."isActive" = true
      GROUP BY p.id, p.sku, p.name, p."minStock"
      HAVING COALESCE(SUM(pl."quantityOnHand"), 0) <= p."minStock"
      ORDER BY "totalStock" ASC
    `;
  }),

  update: protectedProcedure
    .input(z.object({ id: z.string().cuid(), data: productCreateSchema.partial() }))
    .mutation(async ({ ctx, input }) => {
      const before = await ctx.db.product.findUnique({ where: { id: input.id } });
      if (!before) throw new TRPCError({ code: 'NOT_FOUND' });

      const unitCost = input.data.unitCost ?? Number(before.unitCost);
      if (input.data.retailPrice !== undefined && input.data.retailPrice < unitCost) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'El precio retail no puede ser menor al costo unitario' });
      }
      if (input.data.wholesalePrice !== undefined && input.data.wholesalePrice < unitCost) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'El precio mayoreo no puede ser menor al costo unitario' });
      }

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

  // Soft-delete: marks product as inactive. Requires MANAGER or ADMIN.
  deactivate: managerProcedure
    .input(z.string().cuid())
    .mutation(async ({ ctx, input }) => {
      const product = await ctx.db.product.findUnique({
        where: { id: input },
        select: { sku: true, name: true, isActive: true },
      });
      if (!product) throw new TRPCError({ code: 'NOT_FOUND' });
      if (!product.isActive) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'El producto ya está inactivo' });
      }

      const updated = await ctx.db.product.update({
        where: { id: input },
        data: { isActive: false },
      });

      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session!.user!.id!,
          action: 'DEACTIVATE',
          entityType: 'Product',
          entityId: input,
          newValues: { sku: product.sku, name: product.name, isActive: false } as Prisma.InputJsonValue,
          ipAddress: ctx.req.headers.get('x-forwarded-for') ?? undefined,
        },
      });

      return updated;
    }),
});
