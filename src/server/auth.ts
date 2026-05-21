import NextAuth from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import Credentials from 'next-auth/providers/credentials';
import { db } from '@/server/db';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

// In-memory rate limiting: max 5 attempts per 15 minutes per email.
// Sufficient for 4-10 users; reset on successful login.
const loginAttempts = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

function isRateLimited(email: string): boolean {
  const now = Date.now();
  const record = loginAttempts.get(email);
  if (!record || now - record.windowStart > RATE_LIMIT_WINDOW_MS) {
    return false;
  }
  return record.count >= RATE_LIMIT_MAX;
}

function recordFailedAttempt(email: string) {
  const now = Date.now();
  const record = loginAttempts.get(email);
  if (!record || now - record.windowStart > RATE_LIMIT_WINDOW_MS) {
    loginAttempts.set(email, { count: 1, windowStart: now });
  } else {
    record.count += 1;
  }
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
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const email = parsed.data.email;

        if (isRateLimited(email)) return null;

        const user = await db.user.findUnique({
          where: { email },
        });

        if (!user || !user.isActive) {
          recordFailedAttempt(email);
          return null;
        }

        const { compare } = await import('bcryptjs');
        const valid = await compare(parsed.data.password, user.passwordHash ?? '');
        if (!valid) {
          recordFailedAttempt(email);
          return null;
        }

        // Reset rate limit and update lastLoginAt on success
        loginAttempts.delete(email);
        await db.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

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
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role;
      }
      return token;
    },
    session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        (session.user as { role?: string }).role = token.role as string;
      }
      return session;
    },
  },
});
