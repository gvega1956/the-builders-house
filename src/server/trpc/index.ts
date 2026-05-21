import { initTRPC, TRPCError } from '@trpc/server';
import { ZodError } from 'zod';
import superjson from 'superjson';
import { type Context } from './context';

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;
export const publicProcedure = t.procedure;

const enforceUserIsAuthed = t.middleware(async ({ ctx, next }) => {
  if (!ctx.session || !ctx.session.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  const dbUser = await ctx.db.user.findUnique({
    where: { id: ctx.session.user.id },
    select: { isActive: true },
  });
  if (!dbUser?.isActive) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Usuario desactivado' });
  }
  return next({
    ctx: {
      session: { ...ctx.session, user: ctx.session.user },
    },
  });
});

export const protectedProcedure = t.procedure.use(enforceUserIsAuthed);

const enforceUserIsAdmin = t.middleware(({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  const role = (ctx.session.user as { role?: string }).role;
  if (role !== 'ADMIN') {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return next({ ctx: { session: ctx.session } });
});

export const adminProcedure = t.procedure.use(enforceUserIsAdmin);

const enforceUserIsManagerOrAdmin = t.middleware(({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  const role = (ctx.session.user as { role?: string }).role;
  if (role !== 'ADMIN' && role !== 'MANAGER') {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return next({ ctx: { session: ctx.session } });
});

export const managerProcedure = t.procedure.use(enforceUserIsManagerOrAdmin);
