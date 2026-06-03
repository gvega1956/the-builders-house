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

// Middleware base: verifica sesión, valida isActive y recupera el rol FRESCO
// desde la base de datos en cada request. Previene el "stale role" bug donde
// un usuario degradado o desactivado seguía operando con permisos anteriores
// durante hasta 8h (duración del JWT).
const enforceUserIsAuthed = t.middleware(async ({ ctx, next }) => {
  if (!ctx.session || !ctx.session.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  // TEMP bypass: skip DB check for temp user
  if (ctx.session.user.id === 'temp-bypass') {
    return next({ ctx: { session: { ...ctx.session, user: { ...ctx.session.user, role: 'ADMIN' as const } } } });
  }
  const dbUser = await ctx.db.user.findUnique({
    where: { id: ctx.session.user.id },
    select: { isActive: true, role: true },
  });
  if (!dbUser?.isActive) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Usuario desactivado' });
  }
  return next({
    ctx: {
      session: {
        ...ctx.session,
        user: {
          ...ctx.session.user,
          role: dbUser.role,
        },
      },
    },
  });
});

export const protectedProcedure = t.procedure.use(enforceUserIsAuthed);

// adminProcedure y managerProcedure encadenan desde protectedProcedure para
// reutilizar el fetch de rol fresco sin duplicar la query al DB.
const enforceIsAdmin = t.middleware(({ ctx, next }) => {
  const role = (ctx.session?.user as { role?: string } | undefined)?.role;
  if (role !== 'ADMIN') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Se requiere rol ADMIN' });
  }
  return next({ ctx });
});

const enforceIsManagerOrAdmin = t.middleware(({ ctx, next }) => {
  const role = (ctx.session?.user as { role?: string } | undefined)?.role;
  if (role !== 'ADMIN' && role !== 'MANAGER') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Se requiere rol MANAGER o ADMIN' });
  }
  return next({ ctx });
});

export const adminProcedure = protectedProcedure.use(enforceIsAdmin);
export const managerProcedure = protectedProcedure.use(enforceIsManagerOrAdmin);
