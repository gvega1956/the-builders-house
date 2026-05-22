import { auth } from '@/server/auth';
import { db } from '@/server/db';
import { DashboardClient } from './dashboard-client';

export const metadata = { title: 'Dashboard — The Builder\'s House' };

export default async function DashboardPage() {
  const session = await auth();
  const dbUser = session?.user?.id
    ? await db.user.findUnique({ where: { id: session.user.id }, select: { name: true } })
    : null;
  const userName = dbUser?.name ?? session?.user?.name ?? 'equipo';
  return <DashboardClient userName={userName} />;
}
