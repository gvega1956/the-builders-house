'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { brand } from '@/lib/brand';
import { formatCurrency, formatDate } from '@/lib/utils';
import { glass } from '@/lib/ui';
import {
  Plus, Search, Receipt, X, ChevronLeft, ChevronRight,
  Eye, Trash2, DollarSign, ShieldCheck, Printer,
} from 'lucide-react';

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  DRAFT:                  { bg: '#F1F5F9', text: '#475569', label: 'Borrador' },
  ISSUED:                 { bg: '#EFF6FF', text: '#1D4ED8', label: 'Emitida' },
  PAID:                   { bg: '#F0FDF4', text: '#166534', label: 'Pagada' },
  PARTIAL:                { bg: '#FEF9C3', text: '#854D0E', label: 'Pago Parcial' },
  VOIDED:                 { bg: '#FEF2F2', text: '#991B1B', label: 'Anulada' },
  PENDING_AUTHORIZATION:  { bg: '#FFF7ED', text: '#C2410C', label: 'Pend. Autorización' },
  CONVERTED:              { bg: '#F0F9FF', text: '#0369A1', label: 'Convertida' },
};

type LineItem = {
  productId: string;
  productName: string;
  quantity: string;
  unitPrice: string;
  discountPercent: string;
  locationId: string;
};

export function InvoicingClient({ role }: { role: string }) {
  const canAuthorize = role === 'ADMIN' || role === 'MANAGER';

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<'none' | 'create' | 'detail' | 'payment' | 'void' | 'authorize'>('none');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Create invoice form
  const [customerId, setCustomerId] = useState('');
  const [lines, setLines] = useState<LineItem[]>([
    { productId: '', productName: '', quantity: '1', unitPrice: '0', discountPercent: '0', locationId: '' },
  ]);
  const [notes, setNotes] = useState('');

  // Payment form
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('CASH');
  const [payRef, setPayRef] = useState('');

  // Void form
  const [voidReason, setVoidReason] = useState('');

  // Authorize form
  const [authNotes, setAuthNotes] = useState('');

  const { data, isLoading, refetch } = trpc.invoicing.list.useQuery({
    search: search || undefined,
    status: status as 'DRAFT' | 'ISSUED' | 'PAID' | 'PARTIAL' | 'VOIDED' | 'PENDING_AUTHORIZATION' | 'CONVERTED' | undefined || undefined,
    page,
    pageSize: 20,
  });

  const { data: detail, refetch: refetchDetail } = trpc.invoicing.byId.useQuery(
    selectedId ?? '',
    { enabled: !!selectedId && (modal === 'detail' || modal === 'payment' || modal === 'void' || modal === 'authorize') }
  );

  const { data: customers } = trpc.customers.list.useQuery({ pageSize: 200 });
  const { data: products } = trpc.products.list.useQuery({ pageSize: 500 });
  const { data: warehouses } = trpc.settings.warehouses.useQuery();

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

  function closeModal() {
    setModal('none'); setSelectedId(null); setError('');
    setCustomerId('');
    setLines([{ productId: '', productName: '', quantity: '1', unitPrice: '0', discountPercent: '0', locationId: '' }]);
    setNotes(''); setPayAmount(''); setPayMethod('CASH'); setPayRef(''); setVoidReason(''); setAuthNotes('');
  }

  function addLine() {
    setLines(l => [...l, { productId: '', productName: '', quantity: '1', unitPrice: '0', discountPercent: '0', locationId: '' }]);
  }

  function updateLine(i: number, field: keyof LineItem, value: string) {
    setLines(ls => ls.map((l, idx) => {
      if (idx !== i) return l;
      if (field === 'productId') {
        const p = products?.products.find((p) => p.id === value);
        return { ...l, productId: value, productName: p?.name ?? '', unitPrice: p ? String(p.retailPrice) : '0', locationId: '' };
      }
      return { ...l, [field]: value };
    }));
  }

  function getLocationsForProduct(productId: string) {
    if (!productId || !warehouses) return [];
    return (warehouses ?? []).flatMap((wh) =>
      wh.locations
        .filter((loc) => (loc as { productId?: string }).productId === productId)
        .map((loc) => ({
          id: loc.id,
          label: `${wh.name} — ${loc.locationCode}`,
          available: loc.quantityOnHand - loc.reservedQuantity,
        }))
    );
  }

  function calcLine(line: LineItem) {
    const qty = parseInt(line.quantity) || 0;
    const price = parseFloat(line.unitPrice) || 0;
    const disc = parseFloat(line.discountPercent) || 0;
    return qty * price * (1 - disc / 100);
  }

  const subtotal = lines.reduce((s, l) => s + calcLine(l), 0);
  const taxAmount = subtotal * 0.115;
  const total = subtotal + taxAmount;

  function submitCreate() {
    setError('');
    if (!customerId) { setError('Selecciona un cliente'); return; }
    const validLines = lines.filter((l) => l.productId && parseInt(l.quantity) > 0);
    if (!validLines.length) { setError('Agrega al menos un producto'); return; }
    const missingLocation = validLines.find((l) => !l.locationId);
    if (missingLocation) { setError(`Selecciona la ubicación para "${missingLocation.productName}"`); return; }

    createMutation.mutate({
      customerId,
      type: 'INVOICE',
      taxRate: 0.115,
      notes: notes || undefined,
      items: validLines.map((l) => ({
        productId: l.productId,
        locationId: l.locationId,
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
  const total_ = data?.total ?? 0;
  const totalPages = Math.ceil(total_ / 20);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: brand.navy[950] }}>Facturación</h1>
          <p className="text-sm mt-0.5" style={{ color: '#64748B' }}>
            {total_} facturas · IVU 11.5% incluido
          </p>
        </div>
        <button
          onClick={() => setModal('create')}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90"
          style={{ background: `linear-gradient(135deg, ${brand.orange[500]}, ${brand.orange[600]})` }}
        >
          <Plus size={16} /> Nueva Factura
        </button>
      </div>

      {/* Filters */}
      <div style={glass} className="rounded-2xl p-4 flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2 flex-1 min-w-48 bg-white/60 rounded-xl px-3 py-2 border border-white/80">
          <Search size={15} style={{ color: '#94A3B8' }} />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Número de factura o cliente..." className="flex-1 text-sm bg-transparent outline-none" style={{ color: brand.navy[950] }} />
        </div>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}
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

      {/* Table */}
      <div style={glass} className="rounded-2xl overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-slate-400 text-sm">Cargando facturas...</div>
        ) : invoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Receipt size={40} style={{ color: '#CBD5E1' }} />
            <p className="text-slate-400 text-sm">No se encontraron facturas</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(10,22,40,0.08)' }}>
                  {['#Factura', 'Cliente', 'Fecha', 'Items', 'Subtotal', 'IVU', 'Total', 'Pagado', 'Estado', ''].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: '#94A3B8' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv, i) => {
                  const st = STATUS_STYLES[inv.status] ?? STATUS_STYLES.DRAFT!;
                  const balance = Number(inv.total) - Number(inv.paidAmount);
                  return (
                    <tr key={inv.id} style={{
                      borderBottom: i < invoices.length - 1 ? '1px solid rgba(10,22,40,0.05)' : 'none',
                      backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(10,22,40,0.015)',
                    }}>
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
                            className="p-1.5 rounded-lg hover:bg-slate-100 inline-flex items-center" title="Imprimir PDF">
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm" style={{ color: '#64748B' }}>
          <span>Mostrando {(page - 1) * 20 + 1}–{Math.min(page * 20, total_)} de {total_}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded-lg border disabled:opacity-40"><ChevronLeft size={16} /></button>
            <span className="px-3 py-1 rounded-lg bg-white/60 border">{page} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1.5 rounded-lg border disabled:opacity-40"><ChevronRight size={16} /></button>
          </div>
        </div>
      )}

      {/* ── Create Invoice Modal ── */}
      {modal === 'create' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" style={{ backdropFilter: 'blur(4px)' }} onClick={closeModal} />
          <div className="relative w-full max-w-3xl mx-4 rounded-2xl p-6 max-h-[92vh] overflow-y-auto"
            style={{ background: 'rgba(255,255,255,0.97)', boxShadow: '0 24px 64px rgba(10,22,40,0.18)' }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold" style={{ color: brand.navy[950] }}>Nueva Factura</h2>
              <button onClick={closeModal} className="p-1 rounded-lg hover:bg-slate-100"><X size={18} style={{ color: '#64748B' }} /></button>
            </div>
            {error && <div className="mb-4 px-3 py-2 rounded-xl text-sm text-red-700 bg-red-50 border border-red-200">{error}</div>}

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>Cliente *</label>
                <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none" style={{ color: brand.navy[900] }}>
                  <option value="">Seleccionar cliente...</option>
                  {customers?.customers.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
                </select>
              </div>

              {/* Line Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold" style={{ color: brand.navy[700] }}>Productos</label>
                  <button onClick={addLine} className="text-xs font-medium" style={{ color: brand.orange[500] }}>+ Agregar línea</button>
                </div>
                <div className="space-y-3">
                  {lines.map((line, i) => {
                    const locationOptions = getLocationsForProduct(line.productId);
                    return (
                      <div key={i} className="space-y-1.5 p-3 rounded-xl border border-slate-100 bg-slate-50/50">
                        <div className="grid grid-cols-12 gap-2 items-center">
                          <div className="col-span-5">
                            <select value={line.productId} onChange={(e) => updateLine(i, 'productId', e.target.value)}
                              className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-xs outline-none" style={{ color: brand.navy[900] }}>
                              <option value="">Seleccionar producto</option>
                              {products?.products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                            </select>
                          </div>
                          <div className="col-span-2">
                            <input type="number" value={line.quantity} onChange={(e) => updateLine(i, 'quantity', e.target.value)}
                              placeholder="Cant." min="1"
                              className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-xs outline-none text-center" style={{ color: brand.navy[900] }} />
                          </div>
                          <div className="col-span-2">
                            <input type="number" value={line.unitPrice} onChange={(e) => updateLine(i, 'unitPrice', e.target.value)}
                              placeholder="Precio"
                              className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-xs outline-none" style={{ color: brand.navy[900] }} />
                          </div>
                          <div className="col-span-2">
                            <input type="number" value={line.discountPercent} onChange={(e) => updateLine(i, 'discountPercent', e.target.value)}
                              placeholder="Desc%"
                              className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-xs outline-none" style={{ color: brand.navy[900] }} />
                          </div>
                          <div className="col-span-1 text-right">
                            <button onClick={() => setLines(ls => ls.filter((_, idx) => idx !== i))}
                              className="p-1 rounded hover:bg-red-50" disabled={lines.length === 1}>
                              <X size={12} style={{ color: '#DC2626' }} />
                            </button>
                          </div>
                        </div>
                        {line.productId && (
                          <div>
                            <select value={line.locationId} onChange={(e) => updateLine(i, 'locationId', e.target.value)}
                              className="w-full px-2 py-1.5 rounded-lg border text-xs outline-none"
                              style={{ color: brand.navy[900], borderColor: !line.locationId ? '#FCA5A5' : '#E2E8F0' }}>
                              <option value="">Seleccionar ubicación *</option>
                              {locationOptions.length === 0 ? (
                                <option disabled value="">Sin ubicaciones para este producto</option>
                              ) : locationOptions.map((loc) => (
                                <option key={loc.id} value={loc.id}>
                                  {loc.label} ({loc.available} disponibles)
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Totals */}
              <div className="border-t pt-4 space-y-1.5 text-sm">
                <div className="flex justify-between" style={{ color: '#64748B' }}>
                  <span>Subtotal</span><span>{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex justify-between" style={{ color: '#64748B' }}>
                  <span>IVU (11.5%)</span><span>{formatCurrency(taxAmount)}</span>
                </div>
                <div className="flex justify-between font-bold text-base" style={{ color: brand.navy[950] }}>
                  <span>Total</span><span>{formatCurrency(total)}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>Notas</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none resize-none" style={{ color: brand.navy[900] }} />
              </div>
            </div>

            <div className="flex gap-3 mt-6 justify-end">
              <button onClick={closeModal} className="px-4 py-2 rounded-xl text-sm font-medium border border-slate-200 hover:bg-slate-50" style={{ color: '#64748B' }}>Cancelar</button>
              <button onClick={submitCreate} disabled={createMutation.isPending}
                className="px-5 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-60 hover:opacity-90"
                style={{ background: `linear-gradient(135deg, ${brand.orange[500]}, ${brand.orange[600]})` }}>
                {createMutation.isPending ? 'Emitiendo...' : 'Emitir Factura'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Detail Modal ── */}
      {modal === 'detail' && detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" style={{ backdropFilter: 'blur(4px)' }} onClick={closeModal} />
          <div className="relative w-full max-w-2xl mx-4 rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
            style={{ background: 'rgba(255,255,255,0.97)', boxShadow: '0 24px 64px rgba(10,22,40,0.18)' }}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-bold" style={{ color: brand.navy[950] }}>{detail.invoiceNumber}</h2>
                <p className="text-sm text-slate-500">{detail.customer.name} · {formatDate(detail.createdAt)}</p>
              </div>
              <button onClick={closeModal} className="p-1 rounded-lg hover:bg-slate-100"><X size={18} style={{ color: '#64748B' }} /></button>
            </div>

            <table className="w-full text-sm mb-4">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(10,22,40,0.08)' }}>
                  <th className="text-left py-2 text-xs font-semibold text-slate-400">Producto</th>
                  <th className="text-right py-2 text-xs font-semibold text-slate-400">Cant.</th>
                  <th className="text-right py-2 text-xs font-semibold text-slate-400">Precio</th>
                  <th className="text-right py-2 text-xs font-semibold text-slate-400">Total</th>
                </tr>
              </thead>
              <tbody>
                {detail.items.map((item) => (
                  <tr key={item.id} style={{ borderBottom: '1px solid rgba(10,22,40,0.05)' }}>
                    <td className="py-2" style={{ color: brand.navy[900] }}>{item.product.name}</td>
                    <td className="py-2 text-right text-slate-600">{item.quantity}</td>
                    <td className="py-2 text-right text-slate-600">{formatCurrency(Number(item.unitPrice))}</td>
                    <td className="py-2 text-right font-medium" style={{ color: brand.navy[900] }}>{formatCurrency(Number(item.lineTotal))}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="space-y-1 text-sm border-t pt-3 mb-4">
              <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{formatCurrency(Number(detail.subtotal))}</span></div>
              <div className="flex justify-between text-slate-500"><span>IVU 11.5%</span><span>{formatCurrency(Number(detail.taxAmount))}</span></div>
              <div className="flex justify-between font-bold" style={{ color: brand.navy[950] }}><span>Total</span><span>{formatCurrency(Number(detail.total))}</span></div>
              <div className="flex justify-between" style={{ color: '#16A34A' }}><span>Pagado</span><span>{formatCurrency(Number(detail.paidAmount))}</span></div>
              {Number(detail.total) - Number(detail.paidAmount) > 0 && (
                <div className="flex justify-between font-semibold" style={{ color: '#DC2626' }}>
                  <span>Balance</span><span>{formatCurrency(Number(detail.total) - Number(detail.paidAmount))}</span>
                </div>
              )}
            </div>

            {detail.payments.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-slate-400 mb-2">PAGOS RECIBIDOS</p>
                {detail.payments.map((p) => (
                  <div key={p.id} className="flex justify-between text-sm py-1" style={{ color: brand.navy[800] }}>
                    <span>{p.method} {p.reference ? `· ${p.reference}` : ''}</span>
                    <span>{formatCurrency(Number(p.amount))}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
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
                  style={{ background: `linear-gradient(135deg, #059669, #047857)` }}>
                  Autorizar Backorder
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Payment Modal ── */}
      {modal === 'payment' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" style={{ backdropFilter: 'blur(4px)' }} onClick={closeModal} />
          <div className="relative w-full max-w-sm mx-4 rounded-2xl p-6"
            style={{ background: 'rgba(255,255,255,0.97)', boxShadow: '0 24px 64px rgba(10,22,40,0.18)' }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold" style={{ color: brand.navy[950] }}>Registrar Pago</h2>
              <button onClick={closeModal}><X size={18} style={{ color: '#64748B' }} /></button>
            </div>
            {error && <div className="mb-4 px-3 py-2 rounded-xl text-sm text-red-700 bg-red-50 border border-red-200">{error}</div>}
            {detail && (
              <p className="text-sm mb-4 text-slate-500">
                Balance: <span className="font-semibold" style={{ color: brand.navy[900] }}>
                  {formatCurrency(Number(detail.total) - Number(detail.paidAmount))}
                </span>
              </p>
            )}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>Monto *</label>
                <input type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder="0.00"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none" style={{ color: brand.navy[900] }} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>Método</label>
                <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none" style={{ color: brand.navy[900] }}>
                  <option value="CASH">Efectivo</option>
                  <option value="CHECK">Cheque</option>
                  <option value="TRANSFER">Transferencia</option>
                  <option value="CARD">Tarjeta</option>
                  <option value="CREDIT">Crédito</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>Referencia</label>
                <input value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="#cheque, confirmación..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none" style={{ color: brand.navy[900] }} />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={closeModal} className="flex-1 py-2 rounded-xl text-sm border hover:bg-slate-50" style={{ color: '#64748B' }}>Cancelar</button>
              <button onClick={submitPayment} disabled={paymentMutation.isPending}
                className="flex-1 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-60"
                style={{ background: `linear-gradient(135deg, ${brand.orange[500]}, ${brand.orange[600]})` }}>
                {paymentMutation.isPending ? 'Guardando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Authorize Modal ── */}
      {modal === 'authorize' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" style={{ backdropFilter: 'blur(4px)' }} onClick={closeModal} />
          <div className="relative w-full max-w-sm mx-4 rounded-2xl p-6"
            style={{ background: 'rgba(255,255,255,0.97)', boxShadow: '0 24px 64px rgba(10,22,40,0.18)' }}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold" style={{ color: '#059669' }}>Autorizar Backorder</h2>
              <button onClick={closeModal}><X size={18} style={{ color: '#64748B' }} /></button>
            </div>
            <p className="text-sm text-slate-500 mb-4">
              Al autorizar, el stock se descontará aunque quede en negativo. Esta acción queda registrada en auditoría.
            </p>
            {error && <div className="mb-4 px-3 py-2 rounded-xl text-sm text-red-700 bg-red-50 border border-red-200">{error}</div>}
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>Justificación *</label>
              <textarea value={authNotes} onChange={(e) => setAuthNotes(e.target.value)} rows={3}
                placeholder="Motivo de autorización del backorder..."
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none resize-none" style={{ color: brand.navy[900] }} />
            </div>
            <div className="flex gap-3 mt-5">
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

      {/* ── Void Modal ── */}
      {modal === 'void' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" style={{ backdropFilter: 'blur(4px)' }} onClick={closeModal} />
          <div className="relative w-full max-w-sm mx-4 rounded-2xl p-6"
            style={{ background: 'rgba(255,255,255,0.97)', boxShadow: '0 24px 64px rgba(10,22,40,0.18)' }}>
            <h2 className="text-lg font-bold mb-2" style={{ color: '#DC2626' }}>Anular Factura</h2>
            <p className="text-sm text-slate-500 mb-4">Esta acción es irreversible. Ingresa el motivo de anulación.</p>
            {error && <div className="mb-4 px-3 py-2 rounded-xl text-sm text-red-700 bg-red-50 border border-red-200">{error}</div>}
            <textarea value={voidReason} onChange={(e) => setVoidReason(e.target.value)} rows={3}
              placeholder="Motivo de anulación..."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none resize-none mb-4" style={{ color: brand.navy[900] }} />
            <div className="flex gap-3">
              <button onClick={closeModal} className="flex-1 py-2 rounded-xl text-sm border hover:bg-slate-50" style={{ color: '#64748B' }}>Cancelar</button>
              <button onClick={() => selectedId && voidMutation.mutate({ id: selectedId, reason: voidReason })}
                disabled={!voidReason.trim() || voidMutation.isPending}
                className="flex-1 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-60"
                style={{ background: '#DC2626' }}>
                {voidMutation.isPending ? 'Anulando...' : 'Anular'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
