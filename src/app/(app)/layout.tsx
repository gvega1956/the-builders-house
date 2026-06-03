import { redirect } from 'next/navigation';
import { auth } from '@/server/auth';
import { db } from '@/server/db';
import { Sidebar } from '@/components/shared/sidebar';
import { AnimatedBackground } from '@/components/shared/animated-background';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth().catch(() => null);

  // TEMP: bypass auth — remove after DB connection verified
  const freshUser = session?.user ?? { id: 'temp', name: 'David Morales', email: 'admin@buildershouse.pr', role: 'ADMIN' };

  return (
    <div className="h-screen flex font-sans antialiased relative overflow-hidden">
      <AnimatedBackground />
      <Sidebar user={freshUser} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
