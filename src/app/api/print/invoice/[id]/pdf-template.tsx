import {
  Document, Page, Text, View, StyleSheet,
  Svg, Rect, Circle, Line,
} from '@react-pdf/renderer';

// Brand tokens
const C = {
  navy950: '#0A1628',
  navy800: '#1A2D4F',
  navy600: '#3D5580',
  orange500: '#EC6326',
  orange100: '#FDE4D4',
  orange50: '#FEF3EC',
  slate700: '#334155',
  slate500: '#64748B',
  slate400: '#94A3B8',
  slate300: '#CBD5E1',
  slate200: '#E2E8F0',
  slate100: '#F1F5F9',
  slate50: '#F8FAFC',
  white: '#FFFFFF',
  green: '#16A34A',
  red: '#DC2626',
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Borrador',
  ISSUED: 'Emitida',
  PAID: 'Pagada',
  PARTIAL: 'Pago Parcial',
  VOIDED: 'Anulada',
  PENDING_AUTHORIZATION: 'Pend. Autorización',
  CONVERTED: 'Convertida',
};

const STATUS_COLOR: Record<string, string> = {
  PAID: '#16A34A',
  PARTIAL: '#D97706',
  VOIDED: '#DC2626',
  PENDING_AUTHORIZATION: '#D97706',
  ISSUED: '#0284C7',
  DRAFT: '#64748B',
  CONVERTED: '#64748B',
};

const s = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9, color: C.navy950, backgroundColor: C.white },

  // ── Header ──────────────────────────────────────────────────
  header: { backgroundColor: C.navy950, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: '22 40 22 40' },
  brandRow: { flexDirection: 'row', alignItems: 'center' },
  brandText: { marginLeft: 12 },
  brandName: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: C.white },
  brandSub: { fontSize: 7, color: C.orange500, marginTop: 3 },
  docType: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: C.orange500, textAlign: 'right' },
  docNum: { fontSize: 9, color: C.slate400, textAlign: 'right', marginTop: 4 },
  docDate: { fontSize: 8, color: C.slate400, textAlign: 'right', marginTop: 2 },

  // ── Stripe ───────────────────────────────────────────────────
  stripe: { height: 4, backgroundColor: C.orange500 },

  // ── Body ─────────────────────────────────────────────────────
  body: { padding: '22 40 20 40' },

  // ── Info section ─────────────────────────────────────────────
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18 },
  infoLabel: { fontSize: 7, color: C.slate400, textTransform: 'uppercase', marginBottom: 4 },
  infoName: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.navy950 },
  infoSub: { fontSize: 8, color: C.slate500, marginTop: 2 },

  // ── Divider ──────────────────────────────────────────────────
  divider: { height: 1, backgroundColor: C.slate200, marginBottom: 14 },

  // ── Table ────────────────────────────────────────────────────
  tableHead: { flexDirection: 'row', backgroundColor: C.navy800, padding: '7 8' },
  tableHeadCell: { fontSize: 7, color: C.white, textTransform: 'uppercase' },
  tableRowEven: { flexDirection: 'row', padding: '5 8', backgroundColor: C.white },
  tableRowOdd: { flexDirection: 'row', padding: '5 8', backgroundColor: C.slate50 },
  tableCell: { fontSize: 8 },
  tableDivider: { height: 1, backgroundColor: C.slate100 },

  // ── Totals ───────────────────────────────────────────────────
  totalsOuter: { alignItems: 'flex-end', marginTop: 18 },
  totalRow: { flexDirection: 'row', marginBottom: 4 },
  totalLabel: { fontSize: 8, color: C.slate500, width: 100, textAlign: 'right', marginRight: 16 },
  totalValue: { fontSize: 8, width: 80, textAlign: 'right' },
  totalDivider: { width: 196, height: 1, backgroundColor: C.slate200, marginBottom: 6 },
  grandBox: { backgroundColor: C.navy950, borderRadius: 4, padding: '7 12', flexDirection: 'row', marginBottom: 4 },
  grandLabel: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: C.white, width: 84, textAlign: 'right', marginRight: 16 },
  grandValue: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: C.orange500, width: 80, textAlign: 'right' },

  // ── Notes ────────────────────────────────────────────────────
  notesBox: { marginTop: 20, padding: '8 12', backgroundColor: C.slate50, borderLeft: `3 solid ${C.orange500}` },
  notesLabel: { fontSize: 7, color: C.slate400, textTransform: 'uppercase', marginBottom: 3 },
  notesText: { fontSize: 8, color: C.slate700 },

  // ── Footer ───────────────────────────────────────────────────
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  footerStripe: { height: 3, backgroundColor: C.orange500 },
  footerText: { fontSize: 7, color: C.slate400, textAlign: 'center', paddingTop: 6, paddingBottom: 14 },
});

// Logo SVG reproducido desde src/components/brand/logo.tsx
function LogoPdf({ size = 38 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Rect width="64" height="64" rx="12" fill={C.navy950} />
      {/* Puerta */}
      <Rect x="12" y="14" width="16" height="38" rx="1.5" fill={C.orange500} />
      {/* Manija */}
      <Circle cx="24.5" cy="33" r="1.2" fill={C.navy950} />
      {/* Ventana superior 4 paneles */}
      <Rect x="32" y="14" width="20" height="20" rx="1.5" stroke={C.orange500} strokeWidth="2.5" fill="none" />
      <Line x1="42" y1="14" x2="42" y2="34" stroke={C.orange500} strokeWidth="2.5" />
      <Line x1="32" y1="24" x2="52" y2="24" stroke={C.orange500} strokeWidth="2.5" />
      {/* Ventana inferior */}
      <Rect x="32" y="36" width="20" height="16" rx="1.5" stroke={C.orange500} strokeWidth="2.5" fill="none" />
      <Line x1="42" y1="36" x2="42" y2="52" stroke={C.orange500} strokeWidth="2.5" />
    </Svg>
  );
}

function fmt(n: number | string | { toString(): string }) {
  return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export type InvoiceData = {
  invoiceNumber: string;
  type: string;
  status: string;
  createdAt: Date;
  dueDate: Date | null;
  subtotal: { toString(): string };
  taxRate: { toString(): string };
  taxAmount: { toString(): string };
  total: { toString(): string };
  paidAmount: { toString(): string };
  notes: string | null;
  customer: { name: string; code: string; address: string | null };
  items: Array<{
    id: string;
    quantity: number;
    unitPrice: { toString(): string };
    discountPercent: { toString(): string };
    lineTotal: { toString(): string };
    product: { name: string; sku: string };
  }>;
};

export function InvoicePdf({ invoice }: { invoice: InvoiceData }) {
  const typeLabel =
    invoice.type === 'CREDIT_NOTE' ? 'NOTA DE CRÉDITO'
    : invoice.type === 'QUOTE' ? 'COTIZACIÓN'
    : 'FACTURA';

  const pending = Number(invoice.total) - Number(invoice.paidAmount);
  const statusLabel = STATUS_LABEL[invoice.status] ?? invoice.status;
  const statusColor = STATUS_COLOR[invoice.status] ?? C.slate500;

  return (
    <Document>
      <Page size="LETTER" style={[s.page, { paddingBottom: 48 }]}>

        {/* ── Header ─────────────────────────────────────── */}
        <View style={s.header}>
          <View style={s.brandRow}>
            <LogoPdf size={44} />
            <View style={s.brandText}>
              <Text style={s.brandName}>THE BUILDER&apos;S HOUSE</Text>
              <Text style={s.brandSub}>PUERTO RICO · THEBUILDERSHOUSE.PR</Text>
            </View>
          </View>
          <View>
            <Text style={s.docType}>{typeLabel}</Text>
            <Text style={s.docNum}>{invoice.invoiceNumber}</Text>
            <Text style={s.docDate}>{new Date(invoice.createdAt).toLocaleDateString('es-PR', { day: '2-digit', month: 'long', year: 'numeric' })}</Text>
          </View>
        </View>

        {/* ── Orange stripe ───────────────────────────────── */}
        <View style={s.stripe} />

        {/* ── Body ────────────────────────────────────────── */}
        <View style={s.body}>

          {/* Info: Customer + Status */}
          <View style={s.infoRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.infoLabel}>Facturar a</Text>
              <Text style={s.infoName}>{invoice.customer.name}</Text>
              <Text style={s.infoSub}>{invoice.customer.code}</Text>
              {invoice.customer.address ? (
                <Text style={s.infoSub}>{invoice.customer.address}</Text>
              ) : null}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={s.infoLabel}>Estado</Text>
              <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: statusColor }}>
                {statusLabel}
              </Text>
              {invoice.dueDate ? (
                <View style={{ marginTop: 10 }}>
                  <Text style={[s.infoLabel, { textAlign: 'right' }]}>Vencimiento</Text>
                  <Text style={{ fontSize: 9, color: C.slate700, textAlign: 'right' }}>
                    {new Date(invoice.dueDate).toLocaleDateString('es-PR', { day: '2-digit', month: 'long', year: 'numeric' })}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          <View style={s.divider} />

          {/* ── Items table ─────────────────────────────── */}
          <View style={s.tableHead}>
            <Text style={[s.tableHeadCell, { width: '38%' }]}>Producto</Text>
            <Text style={[s.tableHeadCell, { width: '14%' }]}>SKU</Text>
            <Text style={[s.tableHeadCell, { width: '10%', textAlign: 'right' }]}>Cant.</Text>
            <Text style={[s.tableHeadCell, { width: '16%', textAlign: 'right' }]}>Precio Unit.</Text>
            <Text style={[s.tableHeadCell, { width: '10%', textAlign: 'right' }]}>Desc.</Text>
            <Text style={[s.tableHeadCell, { width: '12%', textAlign: 'right' }]}>Total</Text>
          </View>

          {invoice.items.map((item, i) => (
            <View key={item.id} style={i % 2 === 0 ? s.tableRowEven : s.tableRowOdd}>
              <Text style={[s.tableCell, { width: '38%', color: C.navy950 }]}>{item.product.name}</Text>
              <Text style={[s.tableCell, { width: '14%', color: C.slate500, fontFamily: 'Helvetica' }]}>{item.product.sku}</Text>
              <Text style={[s.tableCell, { width: '10%', textAlign: 'right' }]}>{item.quantity}</Text>
              <Text style={[s.tableCell, { width: '16%', textAlign: 'right' }]}>{fmt(item.unitPrice)}</Text>
              <Text style={[s.tableCell, { width: '10%', textAlign: 'right', color: C.slate500 }]}>
                {Number(item.discountPercent) > 0 ? `${item.discountPercent}%` : '—'}
              </Text>
              <Text style={[s.tableCell, { width: '12%', textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>
                {fmt(item.lineTotal)}
              </Text>
            </View>
          ))}

          {/* ── Totals ──────────────────────────────────── */}
          <View style={s.totalsOuter}>
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Subtotal</Text>
              <Text style={s.totalValue}>{fmt(invoice.subtotal)}</Text>
            </View>
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>IVU ({(Number(invoice.taxRate) * 100).toFixed(1)}%)</Text>
              <Text style={s.totalValue}>{fmt(invoice.taxAmount)}</Text>
            </View>
            <View style={s.totalDivider} />
            <View style={s.grandBox}>
              <Text style={s.grandLabel}>TOTAL</Text>
              <Text style={s.grandValue}>{fmt(invoice.total)}</Text>
            </View>
            {Number(invoice.paidAmount) > 0 ? (
              <View style={s.totalRow}>
                <Text style={[s.totalLabel, { color: C.green }]}>Pagado</Text>
                <Text style={[s.totalValue, { color: C.green, fontFamily: 'Helvetica-Bold' }]}>{fmt(invoice.paidAmount)}</Text>
              </View>
            ) : null}
            {pending > 0.005 ? (
              <View style={[s.totalRow, { marginTop: 2 }]}>
                <Text style={[s.totalLabel, { color: C.red, fontFamily: 'Helvetica-Bold' }]}>Balance Pendiente</Text>
                <Text style={[s.totalValue, { color: C.red, fontFamily: 'Helvetica-Bold' }]}>{fmt(pending)}</Text>
              </View>
            ) : null}
          </View>

          {/* ── Notes ───────────────────────────────────── */}
          {invoice.notes ? (
            <View style={s.notesBox}>
              <Text style={s.notesLabel}>Notas</Text>
              <Text style={s.notesText}>{invoice.notes}</Text>
            </View>
          ) : null}

        </View>

        {/* ── Footer ──────────────────────────────────────── */}
        <View style={s.footer} fixed>
          <View style={s.footerStripe} />
          <Text style={s.footerText}>
            The Builder&apos;s House · Puerto Rico · thebuildershouse.pr · {invoice.invoiceNumber} · Generado el {new Date().toLocaleDateString('es-PR')}
          </Text>
        </View>

      </Page>
    </Document>
  );
}
