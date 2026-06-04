import { auth } from '@/server/auth';
import { db } from '@/server/db';
import { InvoicingClient } from './invoicing-client';

export const metadata = { title: 'Facturación — The Builder\'s House' };

export default async function InvoicingPage() {
  const session = await auth();
  // El rol no se persiste en el JWT — leerlo fresco del DB es la fuente de verdad
  const dbUser = session?.user?.id
    ? await db.user.findUnique({ where: { id: session.user.id }, select: { role: true } })
    : null;
  const role = dbUser?.role ?? 'VENDOR';
  return <InvoicingClient role={role} />;
}
