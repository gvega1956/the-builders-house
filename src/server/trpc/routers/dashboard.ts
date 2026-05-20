import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';

export const dashboardRouter = createTRPCRouter({
  kpis: protectedProcedure
    .input(
      z.object({
        from: z.date().optional(),
        to: z.date().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const from = input?.from ?? todayStart;
      const to = input?.to ?? now;

      // Ventas del período
      const invoicesToday = await ctx.db.invoice.aggregate({
        _sum: { total: true },
        _count: { id: true },
        where: {
          status: { in: ['PAID', 'PARTIAL', 'ISSUED'] },
          createdAt: { gte: from, lte: to },
        },
      });

      // Unidades vendidas
      const unitsSold = await ctx.db.invoiceItem.aggregate({
        _sum: { quantity: true },
        where: {
          invoice: {
            status: { in: ['PAID', 'PARTIAL', 'ISSUED'] },
            createdAt: { gte: from, lte: to },
          },
        },
      });

      // Valor de inventario (suma de cost * stock)
      const locations = await ctx.db.productLocation.findMany({
        include: { product: { select: { unitCost: true } } },
      });
      const inventoryValue = locations.reduce(
        (sum, loc) => sum + loc.quantityOnHand * Number(loc.product.unitCost),
        0
      );

      // Total unidades en stock
      const totalUnits = locations.reduce((sum, loc) => sum + loc.quantityOnHand, 0);

      // Movimientos recientes
      const recentMovements = await ctx.db.inventoryMovement.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          product: { select: { sku: true, name: true } },
          user: { select: { name: true } },
          location: { include: { warehouse: { select: { name: true } } } },
        },
      });

      // Alertas de seguridad
      const adjustmentsWithoutPhoto = await ctx.db.inventoryMovement.count({
        where: {
          movementType: { in: ['ADJUSTMENT', 'DAMAGE'] },
          photoUrl: null,
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      });

      const lowStockCount = await ctx.db.productLocation.count({
        where: {
          quantityOnHand: { lte: ctx.db.productLocation.fields.product?.minStock ?? 0 },
        },
      });

      return {
        salesToday: Number(invoicesToday._sum.total ?? 0),
        invoiceCount: invoicesToday._count.id,
        unitsSold: unitsSold._sum.quantity ?? 0,
        inventoryValue,
        totalUnits,
        recentMovements,
        alerts: {
          adjustmentsWithoutPhoto,
          lowStockCount,
        },
      };
    }),

  salesByDay: protectedProcedure
    .input(
      z.object({
        days: z.number().int().min(1).max(90).default(7),
      }).optional()
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

      // Group by day
      const byDay = invoices.reduce(
        (acc, inv) => {
          const day = inv.createdAt.toISOString().split('T')[0]!;
          acc[day] = (acc[day] ?? 0) + Number(inv.total);
          return acc;
        },
        {} as Record<string, number>
      );

      return Object.entries(byDay).map(([day, total]) => ({ day, total }));
    }),

  inventoryByCategory: protectedProcedure.query(async ({ ctx }) => {
    const categories = await ctx.db.category.findMany({
      include: {
        products: {
          include: { locations: true },
        },
      },
    });

    return categories.map((cat) => ({
      name: cat.name,
      units: cat.products.reduce(
        (sum, p) =>
          sum + p.locations.reduce((s, loc) => s + loc.quantityOnHand, 0),
        0
      ),
    }));
  }),
});
