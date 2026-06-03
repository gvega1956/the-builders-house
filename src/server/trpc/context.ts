import { type NextRequest } from 'next/server';
import { auth } from '@/server/auth';
import { db } from '@/server/db';

export async function createTRPCContext(opts: { req: NextRequest }) {
  const session = await auth().catch(() => null);

  // TEMP: bypass auth — inject mock session if none exists
  const effectiveSession = session ?? {
    user: { id: 'temp-bypass', name: 'David Morales', email: 'admin@buildershouse.pr', role: 'ADMIN' as const },
    expires: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
  };

  return {
    db,
    session: effectiveSession,
    req: opts.req,
  };
}

export type Context = Awaited<ReturnType<typeof createTRPCContext>>;

export function getClientIp(req: import('next/server').NextRequest): string | undefined {
  const forwarded = req.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim();
}
