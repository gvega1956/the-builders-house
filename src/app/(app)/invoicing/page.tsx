import { auth } from '@/server/auth';
import { InvoicingClient } from './invoicing-client';

export const metadata = { title: 'Facturación — The Builder\'s House' };

export default async function InvoicingPage() {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role ?? 'VENDOR';
  return <InvoicingClient role={role} />;
}
