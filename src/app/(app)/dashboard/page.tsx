import { auth } from '@/server/auth';
import { DashboardClient } from './dashboard-client';

export const metadata = { title: 'Dashboard — The Builder\'s House' };

export default async function DashboardPage() {
  const session = await auth();
  const userName = session?.user?.name ?? 'equipo';
  return <DashboardClient userName={userName} />;
}
