import { type NextRequest, NextResponse } from 'next/server';
import React from 'react';
import { auth } from '@/server/auth';
import { db } from '@/server/db';
import { renderToBuffer } from '@react-pdf/renderer';
import { InvoicePdf } from './pdf-template';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const invoice = await db.invoice.findUnique({
    where: { id: params.id },
    include: {
      customer: true,
      items: { include: { product: { select: { name: true, sku: true } } } },
    },
  });

  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element = React.createElement(InvoicePdf as any, { invoice }) as any;
  const buffer = await renderToBuffer(element as Parameters<typeof renderToBuffer>[0]);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${invoice.invoiceNumber}.pdf"`,
    },
  });
}
