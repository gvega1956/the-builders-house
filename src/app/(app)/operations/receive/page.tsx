import { auth } from '@/server/auth';
import { redirect } from 'next/navigation';
import { ReceiveClient } from './receive-client';

export default async function ReceivePage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  return <ReceiveClient />;
}
