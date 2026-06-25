import { Resend } from 'resend';

export type InvoiceEmailData = {
  to: string;
  customerName: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string;
  branchName?: string;
  items: Array<{
    name: string;
    sku: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    lineTotal: number;
  }>;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  paymentTerms: string;
  notes?: string;
};

function formatUSD(amount: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function invoiceHtml(d: InvoiceEmailData): string {
  const taxLabel = d.taxRate > 0 ? `IVU (${(d.taxRate * 100).toFixed(1)}%)` : 'IVU';
  const rows = d.items.map((item) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">
        <strong style="color:#0f1f3a;font-size:13px;">${item.name}</strong>
        <div style="color:#94a3b8;font-family:monospace;font-size:11px;">${item.sku}</div>
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:center;color:#334155;">${item.quantity}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;color:#334155;">${formatUSD(item.unitPrice)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;color:#334155;">${item.discount > 0 ? item.discount + '%' : '—'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600;color:#0f1f3a;">${formatUSD(item.lineTotal)}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:680px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background:#0a1628;padding:28px 32px;display:flex;align-items:center;justify-content:space-between;">
      <div>
        <div style="color:#fff;font-size:20px;font-weight:700;letter-spacing:.5px;">THE BUILDER'S HOUSE</div>
        <div style="color:#94a3b8;font-size:12px;margin-top:2px;">Puerto Rico${d.branchName ? ' · ' + d.branchName : ''}</div>
      </div>
      <div style="background:#ec6326;color:#fff;padding:6px 14px;border-radius:20px;font-size:13px;font-weight:700;">FACTURA</div>
    </div>

    <!-- Invoice meta -->
    <div style="padding:24px 32px;background:#fef3ec;display:flex;justify-content:space-between;align-items:flex-start;">
      <div>
        <div style="color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:.8px;">Para</div>
        <div style="color:#0f1f3a;font-size:16px;font-weight:600;margin-top:4px;">${d.customerName}</div>
      </div>
      <div style="text-align:right;">
        <div style="color:#0f1f3a;font-size:22px;font-weight:800;">${d.invoiceNumber}</div>
        <div style="color:#64748b;font-size:12px;margin-top:2px;">Fecha: ${d.invoiceDate}</div>
        ${d.dueDate ? `<div style="color:#64748b;font-size:12px;">Vence: ${d.dueDate}</div>` : ''}
      </div>
    </div>

    <!-- Items table -->
    <div style="padding:0 32px;">
      <table style="width:100%;border-collapse:collapse;margin-top:16px;">
        <thead>
          <tr style="background:#f1f5f9;">
            <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.6px;">Producto</th>
            <th style="padding:10px 12px;text-align:center;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.6px;">Cant.</th>
            <th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.6px;">Precio</th>
            <th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.6px;">Desc.</th>
            <th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.6px;">Total</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

    <!-- Totals -->
    <div style="padding:16px 32px;display:flex;justify-content:flex-end;">
      <table style="border-collapse:collapse;min-width:240px;">
        <tr>
          <td style="padding:5px 12px;color:#64748b;font-size:13px;">Subtotal</td>
          <td style="padding:5px 12px;text-align:right;color:#0f1f3a;font-size:13px;">${formatUSD(d.subtotal)}</td>
        </tr>
        ${d.taxRate > 0 ? `<tr>
          <td style="padding:5px 12px;color:#64748b;font-size:13px;">${taxLabel}</td>
          <td style="padding:5px 12px;text-align:right;color:#0f1f3a;font-size:13px;">${formatUSD(d.taxAmount)}</td>
        </tr>` : ''}
        <tr style="background:#0a1628;border-radius:8px;">
          <td style="padding:10px 12px;color:#fff;font-size:15px;font-weight:700;">TOTAL</td>
          <td style="padding:10px 12px;text-align:right;color:#ec6326;font-size:15px;font-weight:800;">${formatUSD(d.total)}</td>
        </tr>
      </table>
    </div>

    ${d.notes ? `<div style="margin:0 32px 16px;padding:12px;background:#f8fafc;border-radius:8px;border-left:3px solid #ec6326;">
      <div style="font-size:11px;color:#94a3b8;font-weight:600;text-transform:uppercase;margin-bottom:4px;">Notas</div>
      <div style="color:#334155;font-size:13px;">${d.notes}</div>
    </div>` : ''}

    <!-- Footer -->
    <div style="padding:20px 32px;background:#f1f5f9;text-align:center;border-top:1px solid #e2e8f0;">
      <div style="color:#94a3b8;font-size:11px;">The Builder's House Puerto Rico · buildershouse.pr</div>
      <div style="color:#94a3b8;font-size:11px;margin-top:2px;">Gracias por su preferencia</div>
    </div>
  </div>
</body>
</html>`;
}

export async function sendInvoiceEmail(data: InvoiceEmailData): Promise<{ success: boolean; error?: string }> {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[email] RESEND_API_KEY not set — invoice email skipped');
    return { success: false, error: 'Email service not configured' };
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: process.env.EMAIL_FROM ?? 'facturas@buildershouse.pr',
      to: data.to,
      subject: `Factura ${data.invoiceNumber} · The Builder's House`,
      html: invoiceHtml(data),
    });
    return { success: true };
  } catch (err) {
    console.error('[email] Failed to send invoice email:', err);
    return { success: false, error: String(err) };
  }
}
