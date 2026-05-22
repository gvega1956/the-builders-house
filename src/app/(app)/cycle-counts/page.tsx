import { auth } from '@/server/auth';
import { CycleCountsClient } from './cycle-counts-client';

export const metadata = { title: 'Conteos Cíclicos — The Builder\'s House' };

export default async function CycleCountsPage() {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role ?? 'VENDOR';
  return <CycleCountsClient role={role} />;
}
