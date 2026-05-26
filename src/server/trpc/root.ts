import { createTRPCRouter } from '@/server/trpc';
import { productsRouter } from './routers/products';
import { movementsRouter } from './routers/movements';
import { dashboardRouter } from './routers/dashboard';
import { customersRouter } from './routers/customers';
import { invoicingRouter } from './routers/invoicing';
import { purchasesRouter } from './routers/purchases';
import { auditRouter } from './routers/audit';
import { settingsRouter } from './routers/settings';
import { cycleCountsRouter } from './routers/cyclecounts';
import { stockRouter } from './routers/stock';

export const appRouter = createTRPCRouter({
  products: productsRouter,
  movements: movementsRouter,
  dashboard: dashboardRouter,
  customers: customersRouter,
  invoicing: invoicingRouter,
  purchases: purchasesRouter,
  audit: auditRouter,
  settings: settingsRouter,
  cycleCounts: cycleCountsRouter,
  stock: stockRouter,
});

export type AppRouter = typeof appRouter;
