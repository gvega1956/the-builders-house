import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';
import type { Prisma } from '@prisma/client';

// G-3: safe Decimal-to-display conversion — avoids float precision loss on large values
function toNum(d: Prisma.Decimal | null | undefined): number {
  if (!d) return 0;
  return parseFloat(d.toFixed(2));
}

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

      // G-1: SQL aggregation for inventoryValue and totalUnits — no full table scan in JS
      // G-2: SQL aggregation for costToday — no full itemCosts fetch in JS
      const [invoicesToday, unitsSold, inventoryAgg, costAgg, recentMovements, adjustmentsWithoutPhoto] =
        await Promise.all([
          ctx.db.invoice.aggregate({
            _sum: { total: true },
            _count: { id: true },
            where: {
              type: 'INVOICE',
              status: { in: ['PAID', 'PARTIAL', 'ISSUED'] },
              createdAt: { gte: from, lte: to },
            },
          }),
          ctx.db.invoiceItem.aggregate({
            _sum: { quantity: true },
            where: {
              invoice: {
                type: 'INVOICE',
                status: { in: ['PAID', 'PARTIAL', 'ISSUED'] },
                createdAt: { gte: from, lte: to },
              },
            },
          }),
          // G-1: aggregate inventoryValue and totalUnits directly in SQL
          ctx.db.$queryRaw<[{ inventoryValue: number; totalUnits: number }]>`
            SELECT
              COALESCE(SUM(pl."quantityOnHand"::numeric * p."unitCost"), 0)::float8 AS "inventoryValue",
              COALESCE(SUM(pl."quantityOnHand"), 0)::int                            AS "totalUnits"
            FROM product_locations pl
            JOIN products p ON p.id = pl."productId" AND p."isActive" = true
          `,
          // G-1/G-2: cost of goods sold aggregated in SQL — no itemCosts findMany
          ctx.db.$queryRaw<[{ costToday: number }]>`
            SELECT COALESCE(SUM(ii.quantity::numeric * p."unitCost"), 0)::float8 AS "costToday"
            FROM invoice_items ii
            JOIN invoices inv ON inv.id = ii."invoiceId"
            JOIN products p ON p.id = ii."productId"
            WHERE inv.type = 'INVOICE'
              AND inv.status IN ('PAID', 'PARTIAL', 'ISSUED')
              AND inv."createdAt" >= ${from}
              AND inv."createdAt" <= ${to}
          `,
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

      const { inventoryValue, totalUnits } = inventoryAgg[0]!;
      const costToday = costAgg[0]!.costToday;

      // G-3: use toNum() for monetary values to avoid float precision loss
      const salesToday = toNum(invoicesToday._sum.total);

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

  // G-2: SQL GROUP BY DATE — no JS grouping over a full invoice fetch
  salesByDay: protectedProcedure
    .input(
      z
        .object({ days: z.number().int().min(1).max(90).default(7) })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const days = input?.days ?? 7;
      const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const rows = await ctx.db.$queryRaw<Array<{ day: Date; total: number }>>`
        SELECT
          DATE("createdAt") AS day,
          SUM(total)::float8 AS total
        FROM invoices
        WHERE type = 'INVOICE'
          AND status IN ('PAID', 'PARTIAL', 'ISSUED')
          AND "createdAt" >= ${from}
        GROUP BY DATE("createdAt")
        ORDER BY day ASC
      `;

      return rows.map((r) => ({
        day: r.day.toISOString().split('T')[0]!,
        total: r.total,
      }));
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
               COALESCE(SUM(i.total), 0)::float8 AS "totalSales"
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
      (sum, inv) => sum + toNum(inv.total) - toNum(inv.paidAmount),
      0,
    );

    return {
      totalRevenue: toNum(revenueAgg._sum.total),
      totalPaid: toNum(revenueAgg._sum.paidAmount),
      pendingBalance,
      invoicesByStatus: byStatus.map((g) => ({
        status: g.status,
        count: g._count.id,
        total: toNum(g._sum.total),
      })),
      topCustomers,
    };
  }),

  inventoryByCategory: protectedProcedure.query(async ({ ctx }) => {
    const result = await ctx.db.$queryRaw<Array<{ name: string; units: number }>>`
      SELECT c.name, COALESCE(SUM(pl."quantityOnHand"), 0)::int AS units
      FROM categories c
      LEFT JOIN products p ON p."categoryId" = c.id AND p."isActive" = true
      LEFT JOIN product_locations pl ON pl."productId" = p.id
      GROUP BY c.id, c.name
      ORDER BY units DESC
    `;
    return result;
  }),

  // Alertas de stock: solo productos que alguna vez tuvieron inventario real.
  // Excluye productos de catálogo que nunca fueron recibidos (sin movimientos IN).
  stockAlerts: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.$queryRaw<Array<{
      id: string;
      sku: string;
      name: string;
      minStock: number;
      totalStock: number;
      level: string;
      warehouses: string;
    }>>`
      SELECT
        p.id,
        p.sku,
        p.name,
        p."minStock"::int,
        COALESCE(SUM(pl."quantityOnHand"), 0)::int AS "totalStock",
        CASE
          WHEN COALESCE(SUM(pl."quantityOnHand"), 0) = 0 THEN 'OUT'
          ELSE 'LOW'
        END AS level,
        STRING_AGG(DISTINCT w.name, ', ' ORDER BY w.name) FILTER (WHERE pl.id IS NOT NULL) AS warehouses
      FROM products p
      LEFT JOIN product_locations pl ON pl."productId" = p.id
      LEFT JOIN warehouses w ON w.id = pl."warehouseId"
      WHERE p."isActive" = true
        AND (
          -- Producto sin stock pero que tuvo entradas reales (no solo catálogo)
          (
            COALESCE((SELECT SUM(pl2."quantityOnHand") FROM product_locations pl2 WHERE pl2."productId" = p.id), 0) = 0
            AND EXISTS (
              SELECT 1 FROM inventory_movements im
              WHERE im."productId" = p.id AND im."movementType" = 'IN'
            )
          )
          OR
          -- Producto con stock bajo el mínimo configurado
          (
            p."minStock" > 0
            AND COALESCE((SELECT SUM(pl2."quantityOnHand") FROM product_locations pl2 WHERE pl2."productId" = p.id), 0) > 0
            AND COALESCE((SELECT SUM(pl2."quantityOnHand") FROM product_locations pl2 WHERE pl2."productId" = p.id), 0) <= p."minStock"
          )
        )
      GROUP BY p.id, p.sku, p.name, p."minStock"
      ORDER BY "totalStock" ASC, p.name ASC
      LIMIT 100
    `;

    const zeroStock = rows.filter((r) => r.level === 'OUT');
    const lowStock  = rows.filter((r) => r.level === 'LOW');

    return {
      items: rows,
      zeroStockCount: zeroStock.length,
      lowStockCount: lowStock.length,
      totalAlerts: rows.length,
    };
  }),
});
