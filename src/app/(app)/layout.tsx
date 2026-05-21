import { redirect } from 'next/navigation';
import { auth } from '@/server/auth';
import { Sidebar } from '@/components/shared/sidebar';
import { AnimatedBackground } from '@/components/shared/animated-background';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  return (
    <div className="h-screen flex font-sans antialiased relative overflow-hidden">
      <AnimatedBackground />
      <Sidebar user={session.user} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
