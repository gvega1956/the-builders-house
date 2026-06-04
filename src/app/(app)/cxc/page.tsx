import { auth } from '@/server/auth';
import { db } from '@/server/db';
import { CxcClient } from './cxc-client';

export const metadata = { title: 'Cuentas por Cobrar — The Builder\'s House' };

export default async function CxcPage() {
  const session = await auth();
  const dbUser = session?.user?.id
    ? await db.user.findUnique({ where: { id: session.user.id }, select: { role: true } })
    : null;
  const role = dbUser?.role ?? 'VENDOR';
  return <CxcClient role={role} />;
}
