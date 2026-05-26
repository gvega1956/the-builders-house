'use client';

import { useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { brand } from '@/lib/brand';
import { formatCurrency, formatDate } from '@/lib/utils';
import { glass } from '@/lib/ui';
import {
  Plus, Search, Receipt, X, ChevronLeft, ChevronRight,
  Eye, Trash2, DollarSign, ShieldCheck, Printer,
  Building2, AlertCircle, CheckCircle2,
} from 'lucide-react';

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  DRAFT:                 { bg: '#F1F5F9', text: '#475569', label: 'Borrador' },
  ISSUED:                { bg: '#EFF6FF', text: '#1D4ED8', label: 'Emitida' },
  PAID:                  { bg: '#F0FDF4', text: '#166534', label: 'Pagada' },
  PARTIAL:               { bg: '#FEF9C3', text: '#854D0E', label: 'Pago Parcial' },
  VOIDED:                { bg: '#FEF2F2', text: '#991B1B', label: 'Anulada' },
  PENDING_AUTHORIZATION: { bg: '#FFF7ED', text: '#C2410C', label: 'Pend. Autorización' },
  CONVERTED:             { bg: '#F0F9FF', text: '#0369A1', label: 'Convertida' },
};

const TYPE_CFG = {
  INVOICE:     { label: 'Factura',          shortLabel: 'FAC', color: brand.orange[500] },
  QUOTE:       { label: 'Cotización',        shortLabel: 'COT', color: '#0284C7' },
  CREDIT_NOTE: { label: 'Nota de Crédito',  shortLabel: 'NC',  color: '#7C3AED' },
} as const;

type InvoiceType = keyof typeof TYPE_CFG;

type LineItem = {
  productId: string;
  productName: string;
  productSku: string;
  quantity: string;
  unitPrice: string;
  discountPercent: string;
  locationId: string;
  availableStock: number;
};

// ─── Live Preview ─────────────────────────────────────────────────────────────

function InvoicePreview({
  invoiceType, customerName, customerCode, customerType,
  dueDate, lines, notes, taxRate,
}: {
  invoiceType: InvoiceType;
  customerName: string;
  customerCode: string;
  customerType: string;
  dueDate: string;
  lines: LineItem[];
  notes: string;
  taxRate: number;
}) {
  const today = new Date().toLocaleDateString('es-PR', { year: 'numeric', month: 'long', day: 'numeric' });
  const cfg = TYPE_CFG[invoiceType];

  const calcLine = (l: LineItem) => {
    const qty = parseInt(l.quantity) || 0;
    const price = parseFloat(l.unitPrice) || 0;
    const disc = parseFloat(l.discountPercent) || 0;
    return qty * price * (1 - disc / 100);
  };

  const filled = lines.filter((l) => l.productId && parseInt(l.quantity) > 0);
  const subtotal = filled.reduce((s, l) => s + calcLine(l), 0);
  const taxAmt = subtotal * taxRate;
  const total = subtotal + taxAmt;

  return (
    <div className="relative bg-white rounded-xl overflow-hidden"
      style={{ minHeight: 580, border: '1px solid rgba(10,22,40,0.1)', boxShadow: '0 2px 12px rgba(10,22,40,0.06)' }}>
      {/* watermark */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 0 }}>
        <span className="text-8xl font-black tracking-widest uppercase select-none"
          style={{ color: 'rgba(10,22,40,0.035)', transform: 'rotate(-30deg)' }}>BORRADOR</span>
      </div>

      <div className="relative z-10 p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: brand.orange[500] }}>
                <Building2 size={15} className="text-white" />
              </div>
              <div>
                <div className="font-black text-sm leading-none" style={{ color: brand.navy[950] }}>THE BUILDER&apos;S HOUSE</div>
                <div className="text-xs text-slate-400">Puerto Rico</div>
              </div>
            </div>
            <div className="text-xs text-slate-400 mt-2 leading-relaxed">
              info@thebuildershouse.pr<br />(787) 000-0000
            </div>
          </div>
          <div className="text-right">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide mb-2"
              style={{ background: cfg.color + '18', color: cfg.color }}>{cfg.label}</span>
            <div className="text-xs font-mono text-slate-400">#— {new Date().getFullYear()}</div>
            <div className="text-xs text-slate-400 mt-0.5">{today}</div>
            {dueDate && (
              <div className="text-xs text-slate-500 mt-0.5">
                Vence: {new Date(dueDate + 'T12:00:00').toLocaleDateString('es-PR')}
              </div>
            )}
          </div>
        </div>

        {/* Bill-to */}
        <div className="mb-5 p-3 rounded-lg" style={{ background: 'rgba(10,22,40,0.03)' }}>
          {customerName ? (
            <>
              <div className="text-xs font-semibold text-slate-400 mb-1">FACTURAR A</div>
              <div className="font-semibold text-sm" style={{ color: brand.navy[900] }}>{customerName}</div>
              {customerCode && (
                <div className="text-xs text-slate-400">
                  {customerCode} · {customerType === 'WHOLESALE' ? 'Mayorista' : 'Detallista'}
                </div>
              )}
            </>
          ) : (
            <div className="text-xs text-slate-300 italic">Selecciona un cliente...</div>
          )}
        </div>

        {/* Line items */}
        <table className="w-full text-xs mb-4">
          <thead>
            <tr style={{ borderBottom: `2px solid ${brand.navy[950]}` }}>
              <th className="text-left py-1.5 font-semibold" style={{ color: brand.navy[900] }}>Descripción</th>
              <th className="text-right py-1.5 font-semibold w-10" style={{ color: brand.navy[900] }}>Cant.</th>
              <th className="text-right py-1.5 font-semibold w-16" style={{ color: brand.navy[900] }}>Precio</th>
              <th className="text-right py-1.5 font-semibold w-16" style={{ color: brand.navy[900] }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {filled.length === 0 ? (
              <tr><td colSpan={4} className="py-8 text-center text-slate-300 italic">Agrega productos...</td></tr>
            ) : filled.map((line, i) => {
              const disc = parseFloat(line.discountPercent) || 0;
              return (
                <tr key={i} style={{ borderBottom: '1px solid rgba(10,22,40,0.06)' }}>
                  <td className="py-1.5" style={{ color: brand.navy[900] }}>
                    {line.productName}
                    {line.productSku && <div className="text-slate-400 font-mono">{line.productSku}</div>}
                    {disc > 0 && <div style={{ color: brand.orange[500] }}>Desc. {disc}%</div>}
                  </td>
                  <td className="py-1.5 text-right" style={{ color: brand.navy[800] }}>{line.quantity}</td>
                  <td className="py-1.5 text-right" style={{ color: brand.navy[800] }}>{formatCurrency(parseFloat(line.unitPrice) || 0)}</td>
                  <td className="py-1.5 text-right font-semibold" style={{ color: brand.navy[950] }}>{formatCurrency(calcLine(line))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Totals */}
        <div className="ml-auto w-44 space-y-1 text-xs">
          <div className="flex justify-between" style={{ color: '#64748B' }}>
            <span>Subtotal</span><span>{formatCurrency(subtotal)}</span>
          </div>
          <div className="flex justify-between" style={{ color: '#64748B' }}>
            <span>IVU ({(taxRate * 100).toFixed(1)}%)</span><span>{formatCurrency(taxAmt)}</span>
          </div>
          <div className="flex justify-between font-bold text-sm pt-1"
            style={{ borderTop: `2px solid ${brand.navy[950]}`, color: brand.navy[950] }}>
            <span>TOTAL</span><span>{formatCurrency(total)}</span>
          </div>
        </div>

        {notes && (
          <div className="mt-5 pt-3 border-t border-dashed border-slate-200">
            <div className="text-xs font-semibold text-slate-400 mb-1">NOTAS</div>
            <p className="text-xs text-slate-500">{notes}</p>
          </div>
        )}

        <div className="mt-6 pt-3 border-t border-slate-100 text-center">
          <p className="text-xs text-slate-300">Gracias por su preferencia · The Builder&apos;s House Puerto Rico</p>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function InvoicingClient({ role }: { role: string }) {
  const canAuthorize = role === 'ADMIN' || role === 'MANAGER';

  // List state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(1);

  // Modal state
  const [modal, setModal] = useState<'none' | 'create' | 'detail' | 'payment' | 'void' | 'authorize'>('none');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Create form
  const [invoiceType, setInvoiceType] = useState<InvoiceType>('INVOICE');
  const [customerId, setCustomerId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [applyIvu, setApplyIvu] = useState(true);
  const [lines, setLines] = useState<LineItem[]>([
    { productId: '', productName: '', productSku: '', quantity: '1', unitPrice: '0', discountPercent: '0', locationId: '', availableStock: 0 },
  ]);
  const [notes, setNotes] = useState('');

  // Payment form
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('CASH');
  const [payRef, setPayRef] = useState('');

  // Void / Authorize
  const [voidReason, setVoidReason] = useState('');
  const [authNotes, setAuthNotes] = useState('');

  // Queries
  const { data, isLoading, refetch } = trpc.invoicing.list.useQuery({
    search: search || undefined,
    status: (statusFilter || undefined) as 'DRAFT' | 'ISSUED' | 'PAID' | 'PARTIAL' | 'VOIDED' | 'PENDING_AUTHORIZATION' | 'CONVERTED' | undefined,
    type: (typeFilter as InvoiceType) || undefined,
    page,
    pageSize: 20,
  });

  const { data: detail, refetch: refetchDetail } = trpc.invoicing.byId.useQuery(
    selectedId ?? '',
    { enabled: !!selectedId && modal !== 'create' && modal !== 'none' },
  );

  const { data: customers } = trpc.customers.list.useQuery({ pageSize: 200 });
  const { data: products } = trpc.products.list.useQuery({ pageSize: 500 });
  const { data: warehouses } = trpc.settings.warehouses.useQuery();
  const { data: sysConfig } = trpc.settings.getSystemConfig.useQuery();

  const taxRate = sysConfig?.ivu_rate ? parseFloat(sysConfig.ivu_rate) : 0.115;

  // Mutations
  const createMutation = trpc.invoicing.create.useMutation({
    onSuccess: () => { refetch(); closeModal(); },
    onError: (e) => setError(e.message),
  });
  const paymentMutation = trpc.invoicing.addPayment.useMutation({
    onSuccess: () => { refetch(); refetchDetail(); setModal('detail'); },
    onError: (e) => setError(e.message),
  });
  const voidMutation = trpc.invoicing.void.useMutation({
    onSuccess: () => { refetch(); closeModal(); },
    onError: (e) => setError(e.message),
  });
  const authorizeMutation = trpc.invoicing.authorizeBackorder.useMutation({
    onSuccess: () => { refetch(); closeModal(); },
    onError: (e) => setError(e.message),
  });

  const selectedCustomer = useMemo(
    () => customers?.customers.find((c) => c.id === customerId),
    [customers, customerId],
  );

  function closeModal() {
    setModal('none'); setSelectedId(null); setError('');
    setInvoiceType('INVOICE'); setCustomerId(''); setDueDate('');
    setLines([{ productId: '', productName: '', productSku: '', quantity: '1', unitPrice: '0', discountPercent: '0', locationId: '', availableStock: 0 }]);
    setApplyIvu(true);
    setNotes(''); setPayAmount(''); setPayMethod('CASH'); setPayRef('');
    setVoidReason(''); setAuthNotes('');
  }

  function addLine() {
    setLines((l) => [...l, { productId: '', productName: '', productSku: '', quantity: '1', unitPrice: '0', discountPercent: '0', locationId: '', availableStock: 0 }]);
  }

  function updateLine(i: number, field: keyof LineItem, value: string) {
    setLines((ls) => ls.map((l, idx) => {
      if (idx !== i) return l;
      if (field === 'productId') {
        const p = products?.products.find((p) => p.id === value);
        const isWholesale = selectedCustomer?.type === 'WHOLESALE';
        const price = p ? (isWholesale ? Number(p.wholesalePrice) : Number(p.retailPrice)) : 0;
        const totalAvail = p?.locations?.reduce(
          (s: number, loc: { quantityOnHand: number; reservedQuantity: number }) =>
            s + loc.quantityOnHand - loc.reservedQuantity,
          0,
        ) ?? 0;
        return { ...l, productId: value, productName: p?.name ?? '', productSku: p?.sku ?? '', unitPrice: String(price), locationId: '', availableStock: totalAvail };
      }
      return { ...l, [field]: value };
    }));
  }

  function getLocationsForProduct(productId: string) {
    if (!productId || !warehouses) return [];
    return (warehouses ?? []).flatMap((wh) =>
      wh.locations
        .filter((loc) => (loc as unknown as { productId: string }).productId === productId)
        .map((loc) => ({
          id: loc.id,
          label: `${wh.name} — ${loc.locationCode}`,
          available: loc.quantityOnHand - loc.reservedQuantity,
        })),
    );
  }

  function calcLine(line: LineItem) {
    const qty = parseInt(line.quantity) || 0;
    const price = parseFloat(line.unitPrice) || 0;
    const disc = parseFloat(line.discountPercent) || 0;
    return qty * price * (1 - disc / 100);
  }

  const subtotal = lines.reduce((s, l) => s + calcLine(l), 0);
  const effectiveTaxRate = applyIvu ? taxRate : 0;
  const taxAmount = subtotal * effectiveTaxRate;
  const totalAmount = subtotal + taxAmount;

  function submitCreate() {
    setError('');
    if (!customerId) { setError('Selecciona un cliente'); return; }
    const validLines = lines.filter((l) => l.productId && parseInt(l.quantity) > 0);
    if (!validLines.length) { setError('Agrega al menos un producto'); return; }
    if (invoiceType !== 'QUOTE') {
      const missing = validLines.find((l) => !l.locationId);
      if (missing) { setError(`Selecciona la ubicación para "${missing.productName}"`); return; }
    }
    createMutation.mutate({
      customerId,
      type: invoiceType,
      taxRate: effectiveTaxRate,
      notes: notes || undefined,
      items: validLines.map((l) => ({
        productId: l.productId,
        locationId: l.locationId || undefined,
        quantity: parseInt(l.quantity),
        unitPrice: parseFloat(l.unitPrice),
        discountPercent: parseFloat(l.discountPercent) || 0,
      })),
    });
  }

  function submitPayment() {
    if (!selectedId) return;
    setError('');
    const amount = parseFloat(payAmount);
    if (!amount || amount <= 0) { setError('Monto inválido'); return; }
    paymentMutation.mutate({
      invoiceId: selectedId,
      amount,
      method: payMethod as 'CASH' | 'CHECK' | 'TRANSFER' | 'CARD' | 'CREDIT',
      reference: payRef || undefined,
    });
  }

  const invoices = data?.invoices ?? [];
  const totalCount = data?.total ?? 0;
  const totalPages = Math.ceil(totalCount / 20);

  return (
    <div className="space-y-5">

      {/* ── Page Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: brand.navy[950] }}>Facturación</h1>
          <p className="text-sm mt-0.5" style={{ color: '#64748B' }}>
            {totalCount} documentos · IVU {(taxRate * 100).toFixed(1)}%
          </p>
        </div>
        <button
          onClick={() => setModal('create')}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity"
          style={{ background: `linear-gradient(135deg, ${brand.orange[500]}, ${brand.orange[600]})` }}
        >
          <Plus size={16} /> Nueva Factura
        </button>
      </div>

      {/* ── Filters ── */}
      <div style={glass} className="rounded-2xl p-4 flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2 flex-1 min-w-48 bg-white/60 rounded-xl px-3 py-2 border border-white/80">
          <Search size={15} style={{ color: '#94A3B8' }} />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Número o cliente..." className="flex-1 text-sm bg-transparent outline-none" style={{ color: brand.navy[950] }} />
        </div>
        <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
          className="text-sm px-3 py-2 rounded-xl border bg-white/60 outline-none" style={{ color: brand.navy[800] }}>
          <option value="">Todos los tipos</option>
          <option value="INVOICE">Facturas</option>
          <option value="QUOTE">Cotizaciones</option>
          <option value="CREDIT_NOTE">Notas de Crédito</option>
        </select>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="text-sm px-3 py-2 rounded-xl border bg-white/60 outline-none" style={{ color: brand.navy[800] }}>
          <option value="">Todos los estados</option>
          <option value="ISSUED">Emitidas</option>
          <option value="PAID">Pagadas</option>
          <option value="PARTIAL">Pago Parcial</option>
          <option value="PENDING_AUTHORIZATION">Pend. Autorización</option>
          <option value="DRAFT">Borrador</option>
          <option value="VOIDED">Anuladas</option>
          <option value="CONVERTED">Convertidas</option>
        </select>
      </div>

      {/* ── Invoice Table ── */}
      <div style={glass} className="rounded-2xl overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-slate-400 text-sm">Cargando...</div>
        ) : invoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Receipt size={40} style={{ color: '#CBD5E1' }} />
            <p className="text-slate-400 text-sm">No se encontraron documentos</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(10,22,40,0.08)' }}>
                  {['Tipo', '#Doc.', 'Cliente', 'Fecha', 'Items', 'Subtotal', 'IVU', 'Total', 'Pagado', 'Estado', ''].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: '#94A3B8' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv, i) => {
                  const st = STATUS_STYLES[inv.status] ?? STATUS_STYLES.DRAFT!;
                  const tc = TYPE_CFG[(inv as unknown as { type: InvoiceType }).type] ?? TYPE_CFG.INVOICE;
                  const balance = Number(inv.total) - Number(inv.paidAmount);
                  return (
                    <tr key={inv.id} style={{
                      borderBottom: i < invoices.length - 1 ? '1px solid rgba(10,22,40,0.05)' : 'none',
                      backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(10,22,40,0.015)',
                    }}>
                      <td className="px-4 py-3">
                        <span className="px-1.5 py-0.5 rounded text-xs font-bold"
                          style={{ background: tc.color + '18', color: tc.color }}>{tc.shortLabel}</span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs font-semibold" style={{ color: brand.navy[700] }}>{inv.invoiceNumber}</td>
                      <td className="px-4 py-3 font-medium" style={{ color: brand.navy[950] }}>
                        {inv.customer.name}
                        <div className="text-xs text-slate-400">{inv.customer.type === 'WHOLESALE' ? 'Mayorista' : 'Detallista'}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{formatDate(inv.createdAt)}</td>
                      <td className="px-4 py-3 text-center" style={{ color: brand.navy[800] }}>{inv._count.items}</td>
                      <td className="px-4 py-3" style={{ color: brand.navy[800] }}>{formatCurrency(Number(inv.subtotal))}</td>
                      <td className="px-4 py-3 text-slate-500">{formatCurrency(Number(inv.taxAmount))}</td>
                      <td className="px-4 py-3 font-semibold" style={{ color: brand.navy[950] }}>{formatCurrency(Number(inv.total))}</td>
                      <td className="px-4 py-3" style={{ color: balance > 0 && inv.status !== 'VOIDED' ? '#DC2626' : '#16A34A' }}>
                        {formatCurrency(Number(inv.paidAmount))}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                          style={{ backgroundColor: st.bg, color: st.text }}>{st.label}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button onClick={() => { setSelectedId(inv.id); setModal('detail'); }}
                            className="p-1.5 rounded-lg hover:bg-slate-100" title="Ver detalle">
                            <Eye size={14} style={{ color: brand.navy[600] }} />
                          </button>
                          {(inv.status === 'ISSUED' || inv.status === 'PARTIAL') && (
                            <button onClick={() => { setSelectedId(inv.id); setModal('payment'); setPayAmount(''); }}
                              className="p-1.5 rounded-lg hover:bg-green-50" title="Registrar pago">
                              <DollarSign size={14} style={{ color: '#16A34A' }} />
                            </button>
                          )}
                          {inv.status === 'PENDING_AUTHORIZATION' && canAuthorize && (
                            <button onClick={() => { setSelectedId(inv.id); setModal('authorize'); setAuthNotes(''); }}
                              className="p-1.5 rounded-lg hover:bg-orange-50" title="Autorizar backorder">
                              <ShieldCheck size={14} style={{ color: brand.orange[500] }} />
                            </button>
                          )}
                          <a href={`/api/print/invoice/${inv.id}`} target="_blank" rel="noreferrer"
                            className="p-1.5 rounded-lg hover:bg-slate-100 inline-flex items-center" title="PDF">
                            <Printer size={14} style={{ color: '#64748B' }} />
                          </a>
                          {inv.status !== 'PAID' && inv.status !== 'VOIDED' && inv.status !== 'CONVERTED' && (
                            <button onClick={() => { setSelectedId(inv.id); setModal('void'); setVoidReason(''); }}
                              className="p-1.5 rounded-lg hover:bg-red-50" title="Anular">
                              <Trash2 size={14} style={{ color: '#DC2626' }} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm" style={{ color: '#64748B' }}>
          <span>Mostrando {(page - 1) * 20 + 1}–{Math.min(page * 20, totalCount)} de {totalCount}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded-lg border disabled:opacity-40"><ChevronLeft size={16} /></button>
            <span className="px-3 py-1 rounded-lg bg-white/60 border">{page} / {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1.5 rounded-lg border disabled:opacity-40"><ChevronRight size={16} /></button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          CREATE MODAL — Full-screen split panel
      ══════════════════════════════════════════════════════════ */}
      {modal === 'create' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" style={{ backdropFilter: 'blur(6px)' }} onClick={closeModal} />
          <div className="relative w-full max-w-6xl rounded-2xl overflow-hidden flex flex-col"
            style={{ height: '92vh', background: 'rgba(255,255,255,0.98)', boxShadow: '0 32px 80px rgba(10,22,40,0.28)' }}>

            {/* Modal top bar */}
            <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ background: brand.navy[950] }}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: brand.orange[500] }}>
                  <Receipt size={15} className="text-white" />
                </div>
                <div>
                  <div className="text-base font-bold text-white">Nuevo Documento</div>
                  <div className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>The Builder&apos;s House · Puerto Rico</div>
                </div>
              </div>
              <button onClick={closeModal} className="p-1.5 rounded-lg hover:bg-white/10">
                <X size={18} className="text-white/70" />
              </button>
            </div>

            {/* Body: form (left) + preview (right) */}
            <div className="flex flex-1 min-h-0">

              {/* ── LEFT: FORM ── */}
              <div className="flex flex-col w-[56%] border-r border-slate-100 min-h-0">
                <div className="flex-1 overflow-y-auto p-6 space-y-5">

                  {error && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-red-700 bg-red-50 border border-red-200">
                      <AlertCircle size={14} />{error}
                    </div>
                  )}

                  {/* Document type */}
                  <div>
                    <label className="block text-xs font-semibold mb-2" style={{ color: brand.navy[700] }}>Tipo de documento</label>
                    <div className="flex gap-2">
                      {(Object.entries(TYPE_CFG) as [InvoiceType, typeof TYPE_CFG[InvoiceType]][]).map(([type, cfg]) => (
                        <button key={type} onClick={() => setInvoiceType(type)}
                          className="flex-1 py-2 px-2 rounded-xl text-xs font-semibold transition-all"
                          style={{
                            background: invoiceType === type ? cfg.color : 'transparent',
                            color: invoiceType === type ? 'white' : cfg.color,
                            border: `2px solid ${cfg.color}`,
                          }}>
                          {cfg.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Customer + Due date */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>Cliente *</label>
                      <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none" style={{ color: brand.navy[900] }}>
                        <option value="">Seleccionar cliente...</option>
                        {customers?.customers.map((c) => (
                          <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
                        ))}
                      </select>
                      {selectedCustomer && (
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                            style={{
                              background: selectedCustomer.type === 'WHOLESALE' ? '#EFF6FF' : '#F0FDF4',
                              color: selectedCustomer.type === 'WHOLESALE' ? '#1D4ED8' : '#166534',
                            }}>
                            {selectedCustomer.type === 'WHOLESALE' ? 'Mayorista' : 'Detallista'}
                          </span>
                          <span className="text-xs text-slate-400">
                            · Precios {selectedCustomer.type === 'WHOLESALE' ? 'mayorista' : 'retail'} aplicados
                          </span>
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>Fecha de vencimiento</label>
                      <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none" style={{ color: brand.navy[900] }} />
                    </div>
                  </div>

                  {/* Line items */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-xs font-semibold" style={{ color: brand.navy[700] }}>Productos</label>
                      <button onClick={addLine}
                        className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg"
                        style={{ color: brand.orange[500], background: brand.orange[50] }}>
                        <Plus size={11} /> Agregar línea
                      </button>
                    </div>

                    {/* Column headers */}
                    <div className="grid text-xs font-semibold px-3 mb-1"
                      style={{ gridTemplateColumns: '1fr 58px 76px 56px 26px', color: '#94A3B8' }}>
                      <span>Producto</span>
                      <span className="text-center">Cant.</span>
                      <span className="text-right">Precio</span>
                      <span className="text-right">Desc%</span>
                      <span />
                    </div>

                    <div className="space-y-2">
                      {lines.map((line, i) => {
                        const locOptions = getLocationsForProduct(line.productId);
                        const lineTotal = calcLine(line);
                        const locAvail = line.locationId
                          ? (locOptions.find((l) => l.id === line.locationId)?.available ?? null)
                          : null;
                        const qty = parseInt(line.quantity) || 0;
                        const overstock = locAvail !== null && qty > locAvail;

                        return (
                          <div key={i} className="rounded-xl border overflow-hidden"
                            style={{ borderColor: overstock ? '#FCA5A5' : '#E2E8F0' }}>
                            <div className="grid items-center gap-1.5 p-2 bg-slate-50/60"
                              style={{ gridTemplateColumns: '1fr 58px 76px 56px 26px' }}>
                              <div>
                                <select value={line.productId} onChange={(e) => updateLine(i, 'productId', e.target.value)}
                                  className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-xs outline-none bg-white"
                                  style={{ color: brand.navy[900] }}>
                                  <option value="">Seleccionar producto</option>
                                  {products?.products.map((p) => (
                                    <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                                  ))}
                                </select>
                                {line.productSku && (
                                  <div className="flex items-center gap-2 mt-1">
                                    <span className="font-mono text-xs px-1.5 py-0.5 rounded"
                                      style={{ background: brand.navy[950] + '10', color: brand.navy[700] }}>
                                      {line.productSku}
                                    </span>
                                    {!line.locationId && line.availableStock > 0 && (
                                      <span className="text-xs text-slate-400">{line.availableStock} disp.</span>
                                    )}
                                  </div>
                                )}
                              </div>
                              <input type="number" value={line.quantity} onChange={(e) => updateLine(i, 'quantity', e.target.value)}
                                min="1" className="w-full px-1.5 py-1.5 rounded-lg border border-slate-200 text-xs text-center outline-none bg-white"
                                style={{ color: brand.navy[900] }} />
                              <input type="number" value={line.unitPrice} onChange={(e) => updateLine(i, 'unitPrice', e.target.value)}
                                step="0.01" className="w-full px-1.5 py-1.5 rounded-lg border border-slate-200 text-xs text-right outline-none bg-white"
                                style={{ color: brand.navy[900] }} />
                              <input type="number" value={line.discountPercent} onChange={(e) => updateLine(i, 'discountPercent', e.target.value)}
                                min="0" max="100" className="w-full px-1.5 py-1.5 rounded-lg border border-slate-200 text-xs text-right outline-none bg-white"
                                style={{ color: brand.navy[900] }} />
                              <button onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}
                                className="flex items-center justify-center p-1 rounded-lg hover:bg-red-50"
                                disabled={lines.length === 1}>
                                <X size={11} style={{ color: lines.length === 1 ? '#CBD5E1' : '#DC2626' }} />
                              </button>
                            </div>

                            {line.productId && (
                              <div className="px-2 pb-2 bg-white flex items-center gap-2">
                                {invoiceType !== 'QUOTE' && (
                                  <select value={line.locationId} onChange={(e) => updateLine(i, 'locationId', e.target.value)}
                                    className="flex-1 px-2 py-1 rounded-lg border text-xs outline-none"
                                    style={{ color: brand.navy[900], borderColor: !line.locationId ? '#FCA5A5' : '#E2E8F0' }}>
                                    <option value="">Seleccionar ubicación *</option>
                                    {locOptions.length === 0
                                      ? <option disabled>Sin stock en sistema</option>
                                      : locOptions.map((loc) => (
                                        <option key={loc.id} value={loc.id}>{loc.label} ({loc.available} disp.)</option>
                                      ))}
                                  </select>
                                )}
                                {overstock && (
                                  <span className="flex items-center gap-1 text-xs font-semibold shrink-0" style={{ color: '#DC2626' }}>
                                    <AlertCircle size={11} /> Excede stock
                                  </span>
                                )}
                                <span className="ml-auto text-xs font-bold shrink-0" style={{ color: brand.navy[950] }}>
                                  {formatCurrency(lineTotal)}
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Totals summary */}
                  <div className="rounded-xl p-4 space-y-2" style={{ background: `${brand.navy[950]}08` }}>
                    <div className="flex justify-between text-sm text-slate-500">
                      <span>Subtotal</span><span className="font-medium">{formatCurrency(subtotal)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <button
                        type="button"
                        onClick={() => setApplyIvu((v) => !v)}
                        className="flex items-center gap-2 group"
                      >
                        {/* Toggle pill */}
                        <span
                          className="relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-200"
                          style={{ background: applyIvu ? brand.orange[500] : '#CBD5E1' }}
                        >
                          <span
                            className="pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 mt-0.5"
                            style={{ transform: applyIvu ? 'translateX(18px)' : 'translateX(2px)' }}
                          />
                        </span>
                        <span className="text-sm" style={{ color: applyIvu ? '#64748B' : '#94A3B8' }}>
                          IVU ({(taxRate * 100).toFixed(1)}%)
                        </span>
                      </button>
                      <span className="font-medium" style={{ color: applyIvu ? '#64748B' : '#94A3B8' }}>
                        {applyIvu ? formatCurrency(taxAmount) : 'Exento'}
                      </span>
                    </div>
                    <div className="flex justify-between text-base font-bold pt-2 border-t border-slate-200" style={{ color: brand.navy[950] }}>
                      <span>Total</span><span>{formatCurrency(totalAmount)}</span>
                    </div>
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>Notas / Condiciones</label>
                    <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                      placeholder="Condiciones de pago, instrucciones de entrega..."
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none resize-none"
                      style={{ color: brand.navy[900] }} />
                  </div>
                </div>

                {/* Action bar */}
                <div className="px-6 py-4 border-t border-slate-100 flex gap-3 shrink-0" style={{ background: 'rgba(255,255,255,0.95)' }}>
                  <button onClick={closeModal}
                    className="px-4 py-2 rounded-xl text-sm font-medium border border-slate-200 hover:bg-slate-50"
                    style={{ color: '#64748B' }}>
                    Cancelar
                  </button>
                  <div className="flex-1" />
                  <button onClick={submitCreate} disabled={createMutation.isPending}
                    className="px-6 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-60 hover:opacity-90 transition-opacity"
                    style={{ background: `linear-gradient(135deg, ${brand.orange[500]}, ${brand.orange[600]})` }}>
                    {createMutation.isPending ? 'Emitiendo...' :
                      invoiceType === 'QUOTE' ? 'Emitir Cotización' :
                      invoiceType === 'CREDIT_NOTE' ? 'Emitir Nota de Crédito' :
                      'Emitir Factura'}
                  </button>
                </div>
              </div>

              {/* ── RIGHT: LIVE PREVIEW ── */}
              <div className="flex-1 overflow-y-auto p-6" style={{ background: '#F8FAFC' }}>
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#94A3B8' }}>
                    Vista previa
                  </span>
                  <span className="text-xs text-slate-400">Se actualiza en tiempo real</span>
                </div>
                <InvoicePreview
                  invoiceType={invoiceType}
                  customerName={selectedCustomer?.name ?? ''}
                  customerCode={selectedCustomer?.code ?? ''}
                  customerType={selectedCustomer?.type ?? 'RETAIL'}
                  dueDate={dueDate}
                  lines={lines}
                  notes={notes}
                  taxRate={effectiveTaxRate}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          DETAIL MODAL
      ══════════════════════════════════════════════════════════ */}
      {modal === 'detail' && detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" style={{ backdropFilter: 'blur(4px)' }} onClick={closeModal} />
          <div className="relative w-full max-w-2xl rounded-2xl overflow-hidden flex flex-col max-h-[90vh]"
            style={{ background: 'rgba(255,255,255,0.98)', boxShadow: '0 24px 64px rgba(10,22,40,0.18)' }}>

            {/* Detail header */}
            <div className="px-6 py-4 flex items-start justify-between shrink-0" style={{ background: brand.navy[950] }}>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  {(() => {
                    const tc = TYPE_CFG[(detail as unknown as { type: InvoiceType }).type] ?? TYPE_CFG.INVOICE;
                    return <span className="px-2 py-0.5 rounded text-xs font-bold" style={{ background: tc.color + '30', color: tc.color }}>{tc.shortLabel}</span>;
                  })()}
                  <h2 className="text-lg font-bold text-white">{detail.invoiceNumber}</h2>
                  {(() => {
                    const st = STATUS_STYLES[detail.status] ?? STATUS_STYLES.DRAFT!;
                    return <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ backgroundColor: st.bg, color: st.text }}>{st.label}</span>;
                  })()}
                </div>
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  {detail.customer.name} · {formatDate(detail.createdAt)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a href={`/api/print/invoice/${detail.id}`} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={{ color: 'rgba(255,255,255,0.8)', border: '1px solid rgba(255,255,255,0.2)' }}>
                  <Printer size={13} /> PDF
                </a>
                <button onClick={closeModal} className="p-1.5 rounded-lg hover:bg-white/10">
                  <X size={18} className="text-white/70" />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto p-6 space-y-5">
              {/* Items */}
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '2px solid rgba(10,22,40,0.1)' }}>
                    <th className="text-left pb-2 text-xs font-semibold text-slate-400">Producto</th>
                    <th className="text-right pb-2 text-xs font-semibold text-slate-400 w-12">Cant.</th>
                    <th className="text-right pb-2 text-xs font-semibold text-slate-400 w-20">Precio</th>
                    <th className="text-right pb-2 text-xs font-semibold text-slate-400 w-20">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.items.map((item) => (
                    <tr key={item.id} style={{ borderBottom: '1px solid rgba(10,22,40,0.05)' }}>
                      <td className="py-2.5" style={{ color: brand.navy[900] }}>
                        {item.product.name}
                        {Number(item.discountPercent) > 0 && (
                          <div className="text-xs" style={{ color: brand.orange[500] }}>Desc. {Number(item.discountPercent)}%</div>
                        )}
                      </td>
                      <td className="py-2.5 text-right text-slate-600">{item.quantity}</td>
                      <td className="py-2.5 text-right text-slate-600">{formatCurrency(Number(item.unitPrice))}</td>
                      <td className="py-2.5 text-right font-semibold" style={{ color: brand.navy[950] }}>{formatCurrency(Number(item.lineTotal))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Totals */}
              <div className="ml-auto w-56 p-4 rounded-xl space-y-1.5 text-sm" style={{ background: '#F8FAFC' }}>
                <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{formatCurrency(Number(detail.subtotal))}</span></div>
                <div className="flex justify-between text-slate-500">
                  <span>IVU ({(Number(detail.taxRate) * 100).toFixed(1)}%)</span>
                  <span>{formatCurrency(Number(detail.taxAmount))}</span>
                </div>
                <div className="flex justify-between font-bold text-base pt-1.5 border-t border-slate-200" style={{ color: brand.navy[950] }}>
                  <span>Total</span><span>{formatCurrency(Number(detail.total))}</span>
                </div>
                <div className="flex justify-between" style={{ color: '#16A34A' }}>
                  <span>Pagado</span><span>{formatCurrency(Number(detail.paidAmount))}</span>
                </div>
                {Number(detail.total) - Number(detail.paidAmount) > 0.001 && (
                  <div className="flex justify-between font-semibold" style={{ color: '#DC2626' }}>
                    <span>Balance</span><span>{formatCurrency(Number(detail.total) - Number(detail.paidAmount))}</span>
                  </div>
                )}
              </div>

              {/* Payment history */}
              {detail.payments.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#94A3B8' }}>Pagos recibidos</p>
                  <div className="space-y-2">
                    {detail.payments.map((p) => (
                      <div key={p.id} className="flex items-center justify-between text-sm py-2 px-3 rounded-lg"
                        style={{ background: '#F0FDF4', border: '1px solid #BBF7D0' }}>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 size={14} style={{ color: '#16A34A' }} />
                          <span style={{ color: brand.navy[800] }}>{p.method}</span>
                          {p.reference && <span className="text-xs text-slate-400">· {p.reference}</span>}
                        </div>
                        <span className="font-semibold" style={{ color: '#166534' }}>{formatCurrency(Number(p.amount))}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Detail actions */}
            {(detail.status === 'ISSUED' || detail.status === 'PARTIAL' || detail.status === 'PENDING_AUTHORIZATION') && (
              <div className="px-6 py-4 border-t border-slate-100 flex gap-2 shrink-0">
                {(detail.status === 'ISSUED' || detail.status === 'PARTIAL') && (
                  <button onClick={() => setModal('payment')}
                    className="flex-1 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90"
                    style={{ background: `linear-gradient(135deg, ${brand.orange[500]}, ${brand.orange[600]})` }}>
                    Registrar Pago
                  </button>
                )}
                {detail.status === 'PENDING_AUTHORIZATION' && canAuthorize && (
                  <button onClick={() => setModal('authorize')}
                    className="flex-1 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90"
                    style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}>
                    Autorizar Backorder
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          PAYMENT MODAL
      ══════════════════════════════════════════════════════════ */}
      {modal === 'payment' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" style={{ backdropFilter: 'blur(4px)' }} onClick={closeModal} />
          <div className="relative w-full max-w-sm rounded-2xl overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.98)', boxShadow: '0 24px 64px rgba(10,22,40,0.18)' }}>
            <div className="px-6 py-4 flex items-center justify-between" style={{ background: brand.navy[950] }}>
              <h2 className="text-base font-bold text-white">Registrar Pago</h2>
              <button onClick={closeModal} className="p-1 rounded-lg hover:bg-white/10"><X size={18} className="text-white/70" /></button>
            </div>
            <div className="p-6 space-y-4">
              {error && <div className="px-3 py-2 rounded-xl text-sm text-red-700 bg-red-50 border border-red-200">{error}</div>}
              {detail && (
                <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: '#FFF7ED' }}>
                  <span className="text-sm text-slate-600">Balance pendiente</span>
                  <span className="font-bold text-lg" style={{ color: brand.orange[500] }}>
                    {formatCurrency(Number(detail.total) - Number(detail.paidAmount))}
                  </span>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>Monto *</label>
                <input type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder="0.00"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none" style={{ color: brand.navy[900] }} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-2" style={{ color: brand.navy[700] }}>Método de pago</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['CASH', 'CHECK', 'TRANSFER', 'CARD', 'CREDIT'] as const).map((m) => (
                    <button key={m} onClick={() => setPayMethod(m)}
                      className="py-2 rounded-xl text-xs font-semibold transition-all"
                      style={{
                        background: payMethod === m ? brand.navy[950] : 'transparent',
                        color: payMethod === m ? 'white' : brand.navy[700],
                        border: `2px solid ${payMethod === m ? brand.navy[950] : '#E2E8F0'}`,
                      }}>
                      {m === 'CASH' ? 'Efectivo' : m === 'CHECK' ? 'Cheque' : m === 'TRANSFER' ? 'Transf.' : m === 'CARD' ? 'Tarjeta' : 'Crédito'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>Referencia</label>
                <input value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="#cheque, confirmación..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none" style={{ color: brand.navy[900] }} />
              </div>
            </div>
            <div className="px-6 pb-5 flex gap-3">
              <button onClick={closeModal} className="flex-1 py-2 rounded-xl text-sm border hover:bg-slate-50" style={{ color: '#64748B' }}>Cancelar</button>
              <button onClick={submitPayment} disabled={paymentMutation.isPending}
                className="flex-1 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-60"
                style={{ background: `linear-gradient(135deg, ${brand.orange[500]}, ${brand.orange[600]})` }}>
                {paymentMutation.isPending ? 'Guardando...' : 'Confirmar Pago'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          AUTHORIZE MODAL
      ══════════════════════════════════════════════════════════ */}
      {modal === 'authorize' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" style={{ backdropFilter: 'blur(4px)' }} onClick={closeModal} />
          <div className="relative w-full max-w-sm rounded-2xl overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.98)', boxShadow: '0 24px 64px rgba(10,22,40,0.18)' }}>
            <div className="px-6 py-4" style={{ background: '#059669' }}>
              <h2 className="text-base font-bold text-white">Autorizar Backorder</h2>
              <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.7)' }}>
                El stock se descontará aunque quede negativo. Queda en auditoría.
              </p>
            </div>
            <div className="p-6 space-y-4">
              {error && <div className="px-3 py-2 rounded-xl text-sm text-red-700 bg-red-50 border border-red-200">{error}</div>}
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>Justificación *</label>
                <textarea value={authNotes} onChange={(e) => setAuthNotes(e.target.value)} rows={4}
                  placeholder="Motivo de autorización..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none resize-none" style={{ color: brand.navy[900] }} />
              </div>
            </div>
            <div className="px-6 pb-5 flex gap-3">
              <button onClick={closeModal} className="flex-1 py-2 rounded-xl text-sm border hover:bg-slate-50" style={{ color: '#64748B' }}>Cancelar</button>
              <button
                onClick={() => selectedId && authorizeMutation.mutate({ id: selectedId, authorizationNotes: authNotes })}
                disabled={!authNotes.trim() || authorizeMutation.isPending}
                className="flex-1 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-60"
                style={{ background: '#059669' }}>
                {authorizeMutation.isPending ? 'Autorizando...' : 'Autorizar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          VOID MODAL
      ══════════════════════════════════════════════════════════ */}
      {modal === 'void' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" style={{ backdropFilter: 'blur(4px)' }} onClick={closeModal} />
          <div className="relative w-full max-w-sm rounded-2xl overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.98)', boxShadow: '0 24px 64px rgba(10,22,40,0.18)' }}>
            <div className="px-6 py-4" style={{ background: '#DC2626' }}>
              <h2 className="text-base font-bold text-white">Anular Documento</h2>
              <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.7)' }}>Esta acción es irreversible. El stock será restaurado.</p>
            </div>
            <div className="p-6 space-y-4">
              {error && <div className="px-3 py-2 rounded-xl text-sm text-red-700 bg-red-50 border border-red-200">{error}</div>}
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>Motivo de anulación *</label>
                <textarea value={voidReason} onChange={(e) => setVoidReason(e.target.value)} rows={4}
                  placeholder="Describe el motivo..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none resize-none" style={{ color: brand.navy[900] }} />
              </div>
            </div>
            <div className="px-6 pb-5 flex gap-3">
              <button onClick={closeModal} className="flex-1 py-2 rounded-xl text-sm border hover:bg-slate-50" style={{ color: '#64748B' }}>Cancelar</button>
              <button onClick={() => selectedId && voidMutation.mutate({ id: selectedId, reason: voidReason })}
                disabled={!voidReason.trim() || voidMutation.isPending}
                className="flex-1 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-60"
                style={{ background: '#DC2626' }}>
                {voidMutation.isPending ? 'Anulando...' : 'Confirmar Anulación'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
