import { auth } from '@/server/auth';
import { redirect } from 'next/navigation';
import { ReturnsClient } from './returns-client';

export const metadata = { title: 'Devoluciones — The Builder\'s House' };

export default async function ReturnsPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  return <ReturnsClient />;
}
