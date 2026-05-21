import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: 'Helvetica', fontSize: 9, color: '#1E293B' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  brand: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: '#0A1628' },
  subtitle: { fontSize: 9, color: '#64748B', marginTop: 2 },
  docTitle: { fontSize: 14, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  docMeta: { fontSize: 8, color: '#64748B', textAlign: 'right', marginTop: 2 },
  label: { fontSize: 7, color: '#94A3B8', textTransform: 'uppercase', marginBottom: 2 },
  value: { fontSize: 9 },
  divider: { borderBottom: '1 solid #E2E8F0', marginVertical: 12 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#F1F5F9', padding: '6 8', marginBottom: 1 },
  tableHeaderCell: { fontSize: 7, color: '#64748B', textTransform: 'uppercase' },
  tableRow: { flexDirection: 'row', padding: '5 8', borderBottom: '1 solid #F1F5F9' },
  tableCell: { fontSize: 8 },
  totalRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 24, marginBottom: 4 },
  totalLabel: { fontSize: 8, color: '#64748B', width: 80, textAlign: 'right' },
  totalValue: { fontSize: 8, width: 72, textAlign: 'right' },
  footer: { position: 'absolute', bottom: 30, left: 40, right: 40 },
  footerText: { fontSize: 7, color: '#94A3B8', textAlign: 'center' },
});

function fmt(n: number | string | { toString(): string }) {
  return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type InvoiceData = {
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

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>The Builder's House</Text>
            <Text style={styles.subtitle}>Puerto Rico · buildershouse.pr</Text>
          </View>
          <View>
            <Text style={styles.docTitle}>{typeLabel}</Text>
            <Text style={styles.docMeta}>{invoice.invoiceNumber}</Text>
            <Text style={styles.docMeta}>{new Date(invoice.createdAt).toLocaleDateString('es-PR')}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Customer */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
          <View>
            <Text style={styles.label}>Cliente</Text>
            <Text style={{ ...styles.value, fontFamily: 'Helvetica-Bold' }}>{invoice.customer.name}</Text>
            <Text style={{ ...styles.value, color: '#64748B' }}>{invoice.customer.code}</Text>
            {invoice.customer.address && (
              <Text style={{ ...styles.value, color: '#64748B' }}>{invoice.customer.address}</Text>
            )}
          </View>
          <View>
            <Text style={styles.label}>Estado</Text>
            <Text style={styles.value}>{invoice.status}</Text>
            {invoice.dueDate && (
              <>
                <Text style={{ ...styles.label, marginTop: 8 }}>Vencimiento</Text>
                <Text style={styles.value}>{new Date(invoice.dueDate).toLocaleDateString('es-PR')}</Text>
              </>
            )}
          </View>
        </View>

        <View style={styles.divider} />

        {/* Table header */}
        <View style={styles.tableHeader}>
          <Text style={{ ...styles.tableHeaderCell, width: '40%' }}>Producto</Text>
          <Text style={{ ...styles.tableHeaderCell, width: '12%' }}>SKU</Text>
          <Text style={{ ...styles.tableHeaderCell, width: '10%', textAlign: 'right' }}>Cant.</Text>
          <Text style={{ ...styles.tableHeaderCell, width: '16%', textAlign: 'right' }}>Precio</Text>
          <Text style={{ ...styles.tableHeaderCell, width: '10%', textAlign: 'right' }}>Desc.</Text>
          <Text style={{ ...styles.tableHeaderCell, width: '12%', textAlign: 'right' }}>Total</Text>
        </View>

        {invoice.items.map((item) => (
          <View key={item.id} style={styles.tableRow}>
            <Text style={{ ...styles.tableCell, width: '40%' }}>{item.product.name}</Text>
            <Text style={{ ...styles.tableCell, width: '12%', color: '#64748B' }}>{item.product.sku}</Text>
            <Text style={{ ...styles.tableCell, width: '10%', textAlign: 'right' }}>{item.quantity}</Text>
            <Text style={{ ...styles.tableCell, width: '16%', textAlign: 'right' }}>{fmt(item.unitPrice)}</Text>
            <Text style={{ ...styles.tableCell, width: '10%', textAlign: 'right', color: '#64748B' }}>
              {Number(item.discountPercent) > 0 ? `${item.discountPercent}%` : '—'}
            </Text>
            <Text style={{ ...styles.tableCell, width: '12%', textAlign: 'right' }}>{fmt(item.lineTotal)}</Text>
          </View>
        ))}

        {/* Totals */}
        <View style={{ alignItems: 'flex-end', marginTop: 16 }}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>{fmt(invoice.subtotal)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>IVU ({(Number(invoice.taxRate) * 100).toFixed(1)}%)</Text>
            <Text style={styles.totalValue}>{fmt(invoice.taxAmount)}</Text>
          </View>
          <View style={{ ...styles.divider, width: 160 }} />
          <View style={styles.totalRow}>
            <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', width: 80, textAlign: 'right' }}>Total</Text>
            <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', width: 72, textAlign: 'right', color: '#0A1628' }}>
              {fmt(invoice.total)}
            </Text>
          </View>
          {Number(invoice.paidAmount) > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Pagado</Text>
              <Text style={{ ...styles.totalValue, color: '#16A34A' }}>{fmt(invoice.paidAmount)}</Text>
            </View>
          )}
          {pending > 0 && (
            <View style={styles.totalRow}>
              <Text style={{ ...styles.totalLabel, color: '#DC2626' }}>Balance Pendiente</Text>
              <Text style={{ ...styles.totalValue, color: '#DC2626' }}>{fmt(pending)}</Text>
            </View>
          )}
        </View>

        {invoice.notes && (
          <View style={{ marginTop: 16 }}>
            <Text style={styles.label}>Notas</Text>
            <Text style={{ ...styles.value, color: '#64748B' }}>{invoice.notes}</Text>
          </View>
        )}

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            The Builder's House · Puerto Rico · {invoice.invoiceNumber} · Generado {new Date().toLocaleDateString('es-PR')}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
