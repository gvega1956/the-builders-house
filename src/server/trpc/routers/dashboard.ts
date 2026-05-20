import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';
import type { Prisma } from '@prisma/client';

type LocationWithProduct = Prisma.ProductLocationGetPayload<{
  include: { product: { select: { unitCost: true } } };
}>;

type CategoryWithProducts = Prisma.CategoryGetPayload<{
  include: { products: { include: { locations: true } } };
}>;

type InvoiceForReduce = { total: Prisma.Decimal; createdAt: Date };

export const dashboardRouter = createTRPCRouter({
  kpis: protectedProcedure
    .input(
      z
        .object({
          from: z.date().optional(),
          to: z.date().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const from = input?.from ?? todayStart;
      const to = input?.to ?? now;

      const [invoicesToday, unitsSold, locations, recentMovements, adjustmentsWithoutPhoto] =
        await Promise.all([
          ctx.db.invoice.aggregate({
            _sum: { total: true },
            _count: { id: true },
            where: {
              status: { in: ['PAID', 'PARTIAL', 'ISSUED'] },
              createdAt: { gte: from, lte: to },
            },
          }),
          ctx.db.invoiceItem.aggregate({
            _sum: { quantity: true },
            where: {
              invoice: {
                status: { in: ['PAID', 'PARTIAL', 'ISSUED'] },
                createdAt: { gte: from, lte: to },
              },
            },
          }),
          ctx.db.productLocation.findMany({
            include: { product: { select: { unitCost: true } } },
          }) as Promise<LocationWithProduct[]>,
          ctx.db.inventoryMovement.findMany({
            orderBy: { createdAt: 'desc' },
            take: 10,
            include: {
              product: { select: { sku: true, name: true } },
              user: { select: { name: true } },
              location: { include: { warehouse: { select: { name: true } } } },
            },
          }),
          ctx.db.inventoryMovement.count({
            where: {
              movementType: { in: ['ADJUSTMENT', 'DAMAGE'] },
              photoUrl: null,
              createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
            },
          }),
        ]);

      const inventoryValue = locations.reduce(
        (sum: number, loc: LocationWithProduct) =>
          sum + loc.quantityOnHand * Number(loc.product.unitCost),
        0
      );

      const totalUnits = locations.reduce(
        (sum: number, loc: LocationWithProduct) => sum + loc.quantityOnHand,
        0
      );

      return {
        salesToday: Number(invoicesToday._sum.total ?? 0),
        invoiceCount: invoicesToday._count.id,
        unitsSold: unitsSold._sum.quantity ?? 0,
        inventoryValue,
        totalUnits,
        recentMovements,
        alerts: { adjustmentsWithoutPhoto },
      };
    }),

  salesByDay: protectedProcedure
    .input(
      z
        .object({ days: z.number().int().min(1).max(90).default(7) })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const days = input?.days ?? 7;
      const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const invoices = await ctx.db.invoice.findMany({
        where: {
          status: { in: ['PAID', 'PARTIAL', 'ISSUED'] },
          createdAt: { gte: from },
        },
        select: { total: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      });

      const byDay = (invoices as InvoiceForReduce[]).reduce(
        (acc: Record<string, number>, inv: InvoiceForReduce) => {
          const day = inv.createdAt.toISOString().split('T')[0]!;
          acc[day] = (acc[day] ?? 0) + Number(inv.total);
          return acc;
        },
        {}
      );

      return Object.entries(byDay).map(([day, total]) => ({ day, total }));
    }),

  inventoryByCategory: protectedProcedure.query(async ({ ctx }) => {
    const categories = (await ctx.db.category.findMany({
      include: { products: { include: { locations: true } } },
    })) as CategoryWithProducts[];

    return categories.map((cat: CategoryWithProducts) => ({
      name: cat.name,
      units: cat.products.reduce(
        (sum: number, p) =>
          sum + p.locations.reduce((s: number, loc) => s + loc.quantityOnHand, 0),
        0
      ),
    }));
  }),
});
