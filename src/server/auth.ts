import NextAuth from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import Credentials from 'next-auth/providers/credentials';
import { db } from '@/server/db';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutos

// Rate limiting persistente usando PostgreSQL (LoginAttempt).
// Sobrevive reinicios del servidor y funciona en multi-instancia.
async function isRateLimited(email: string): Promise<boolean> {
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
  const count = await db.loginAttempt.count({
    where: {
      email,
      success: false,
      createdAt: { gte: windowStart },
    },
  });
  return count >= RATE_LIMIT_MAX;
}

async function recordLoginAttempt(
  email: string,
  success: boolean,
  ipAddress?: string,
  userAgent?: string,
) {
  await db.loginAttempt.create({
    data: { email, success, ipAddress, userAgent },
  });
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(db),
  session: { strategy: 'jwt', maxAge: 8 * 60 * 60 }, // 8 horas
  pages: {
    signIn: '/login',
    error: '/login',
  },
  providers: [
    Credentials({
      name: 'Credenciales',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Contraseña', type: 'password' },
      },
      async authorize(credentials, req) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const email = parsed.data.email;
        const ipAddress =
          (req as { headers?: { get?: (k: string) => string | null } })
            ?.headers?.get?.('x-forwarded-for') ?? undefined;
        const userAgent =
          (req as { headers?: { get?: (k: string) => string | null } })
            ?.headers?.get?.('user-agent') ?? undefined;

        if (await isRateLimited(email)) {
          await recordLoginAttempt(email, false, ipAddress, userAgent);
          return null;
        }

        const user = await db.user.findUnique({ where: { email } });

        if (!user || !user.isActive) {
          await recordLoginAttempt(email, false, ipAddress, userAgent);
          return null;
        }

        const { compare } = await import('bcryptjs');
        const valid = await compare(parsed.data.password, user.passwordHash ?? '');
        if (!valid) {
          await recordLoginAttempt(email, false, ipAddress, userAgent);
          return null;
        }

        // Login exitoso: registrar el intento, actualizar lastLoginAt y crear audit log.
        await Promise.all([
          recordLoginAttempt(email, true, ipAddress, userAgent),
          db.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
          }),
          db.auditLog.create({
            data: {
              userId: user.id,
              action: 'LOGIN',
              entityType: 'User',
              entityId: user.id,
              newValues: { email, role: user.role },
              ipAddress,
              userAgent,
            },
          }),
        ]);

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      // Solo en el login inicial: inyecta id en el token.
      // El rol NO se persiste en el token; se lee fresco del DB en el
      // middleware enforceUserIsAuthed para evitar el stale-role bug.
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
});
