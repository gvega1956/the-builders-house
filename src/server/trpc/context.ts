import { type NextRequest } from 'next/server';
import { auth } from '@/server/auth';
import { db } from '@/server/db';

export async function createTRPCContext(opts: { req: NextRequest }) {
  const session = await auth();

  return {
    db,
    session,
    req: opts.req,
  };
}

export type Context = Awaited<ReturnType<typeof createTRPCContext>>;

export function getClientIp(req: import('next/server').NextRequest): string | undefined {
  const forwarded = req.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim();
}
