import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';
import type { Prisma } from '@prisma/client';

type LocationWithProduct = Prisma.ProductLocationGetPayload<{
  include: { product: { select: { unitCost: true } } };
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

      const [invoicesToday, unitsSold, locations, itemCosts, recentMovements, adjustmentsWithoutPhoto] =
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
          ctx.db.invoiceItem.findMany({
            where: {
              invoice: {
                status: { in: ['PAID', 'PARTIAL', 'ISSUED'] },
                createdAt: { gte: from, lte: to },
              },
            },
            select: {
              quantity: true,
              product: { select: { unitCost: true } },
            },
          }),
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

      const costToday = itemCosts.reduce(
        (sum, item) => sum + item.quantity * Number(item.product.unitCost),
        0
      );

      const salesToday = Number(invoicesToday._sum.total ?? 0);

      return {
        salesToday,
        costToday,
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

  reportSummary: protectedProcedure.query(async ({ ctx }) => {
    const [revenueAgg, openInvoices, byStatus, topCustomers] = await Promise.all([
      ctx.db.invoice.aggregate({
        _sum: { total: true, paidAmount: true },
        where: { status: { notIn: ['VOIDED'] }, type: 'INVOICE' },
      }),
      ctx.db.invoice.findMany({
        where: { status: { in: ['ISSUED', 'PARTIAL'] }, type: 'INVOICE' },
        select: { total: true, paidAmount: true },
      }),
      ctx.db.invoice.groupBy({
        by: ['status'],
        _count: { id: true },
        _sum: { total: true },
        where: { type: 'INVOICE' },
      }),
      ctx.db.$queryRaw<Array<{ id: string; name: string; code: string; totalSales: number }>>`
        SELECT c.id, c.name, c.code,
               COALESCE(SUM(i.total), 0)::float as "totalSales"
        FROM customers c
        LEFT JOIN invoices i ON i."customerId" = c.id
          AND i.status != 'VOIDED' AND i.type = 'INVOICE'
        WHERE c."isActive" = true
        GROUP BY c.id, c.name, c.code
        ORDER BY "totalSales" DESC
        LIMIT 10
      `,
    ]);

    const pendingBalance = openInvoices.reduce(
      (sum, inv) => sum + Number(inv.total) - Number(inv.paidAmount),
      0,
    );

    return {
      totalRevenue: Number(revenueAgg._sum.total ?? 0),
      totalPaid: Number(revenueAgg._sum.paidAmount ?? 0),
      pendingBalance,
      invoicesByStatus: byStatus.map((g) => ({
        status: g.status,
        count: g._count.id,
        total: Number(g._sum.total ?? 0),
      })),
      topCustomers,
    };
  }),

  inventoryByCategory: protectedProcedure.query(async ({ ctx }) => {
    const result = await ctx.db.$queryRaw<Array<{ name: string; units: number }>>`
      SELECT c.name, COALESCE(SUM(pl."quantityOnHand"), 0)::int as units
      FROM categories c
      LEFT JOIN products p ON p."categoryId" = c.id AND p."isActive" = true
      LEFT JOIN product_locations pl ON pl."productId" = p.id
      GROUP BY c.id, c.name
      ORDER BY units DESC
    `;
    return result;
  }),
});
