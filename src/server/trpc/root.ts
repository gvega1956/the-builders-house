import { createTRPCRouter } from '@/server/trpc';
import { productsRouter } from './routers/products';
import { movementsRouter } from './routers/movements';
import { dashboardRouter } from './routers/dashboard';

export const appRouter = createTRPCRouter({
  products: productsRouter,
  movements: movementsRouter,
  dashboard: dashboardRouter,
});

export type AppRouter = typeof appRouter;
