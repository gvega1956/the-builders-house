import { redirect } from 'next/navigation';
import { auth } from '@/server/auth';
import { db } from '@/server/db';
import { Sidebar } from '@/components/shared/sidebar';
import { AnimatedBackground } from '@/components/shared/animated-background';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  // JWT caches name at login — fetch fresh name so renames are reflected immediately.
  const dbUser = await db.user.findUnique({
    where: { id: session.user.id },
    select: { name: true },
  }).catch(() => null);
  const freshUser = { ...session.user, name: dbUser?.name ?? session.user.name };

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
