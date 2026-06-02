import { auth } from '@/server/auth';
import { redirect } from 'next/navigation';
import { AdjustmentsClient } from './adjustments-client';

export default async function AdjustmentsPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  return <AdjustmentsClient />;
}
