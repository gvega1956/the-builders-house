'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { brand } from '@/lib/brand';
import { glass } from '@/lib/ui';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  RotateCcw, Search, CheckCircle, AlertCircle, X,
  ChevronRight, FileText, Package,
} from 'lucide-react';

const inputCls =
  'w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none ' +
  'focus:ring-2 focus:ring-orange-400 focus:border-transparent transition-all bg-white/80';

const STATUS_LABEL: Record<string, { label: string; bg: string; text: string }> = {
  ISSUED:  { label: 'Emitida',  bg: '#EFF6FF', text: '#1D4ED8' },
  PARTIAL: { label: 'Parcial',  bg: '#FEF9C3', text: '#854D0E' },
  PAID:    { label: 'Pagada',   bg: '#F0FDF4', text: '#166534' },
};

// Items selected for return: quantity per invoice item id
type ReturnLine = { selected: boolean; quantity: string };

export function ReturnsClient() {
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerId,      setCustomerId]     = useState('');
  const [invoiceId,       setInvoiceId]      = useState('');
  const [returnLines,     setReturnLines]    = useState<Record<string, ReturnLine>>({});
  const [notes,           setNotes]          = useState('');
  const [error,           setError]          = useState('');
  const [success,         setSuccess]        = useState('');

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: customersData } = trpc.customers.list.useQuery({
    search: customerSearch || undefined,
    pageSize: 200,
  });

  // All invoices for the selected customer — filter to returnable statuses in client
  const { data: invoicesData } = trpc.invoicing.list.useQuery(
    { customerId, pageSize: 100 },
    { enabled: !!customerId },
  );

  const { data: invoice } = trpc.invoicing.byId.useQuery(
    invoiceId,
    { enabled: !!invoiceId },
  );

  const utils = trpc.useUtils();

  // ── Mutation ──────────────────────────────────────────────────────────────
  const createNC = trpc.invoicing.create.useMutation({
    onSuccess: (nc) => {
      setSuccess(`Nota de Crédito ${nc.invoiceNumber} generada. Stock reintegrado y balance del cliente actualizado.`);
      setError('');
      setInvoiceId('');
      setReturnLines({});
      setNotes('');
      void utils.invoicing.list.invalidate();
      void utils.customers.list.invalidate();
    },
    onError: (e) => { setError(e.message); setSuccess(''); },
  });

  // ── Helpers ───────────────────────────────────────────────────────────────
  const customers      = customersData?.customers ?? [];
  const selectedCustomer = customers.find((c) => c.id === customerId);

  // Only ISSUED, PARTIAL, PAID can be returned
  const returnableInvoices = (invoicesData?.invoices ?? []).filter(
    (inv) => inv.type === 'INVOICE' && ['ISSUED', 'PARTIAL', 'PAID'].includes(inv.status),
  );

  const selectedInvoice = returnableInvoices.find((i) => i.id === invoiceId) ?? null;

  function selectCustomer(id: string) {
    setCustomerId(id);
    setInvoiceId('');
    setReturnLines({});
    setError('');
    setSuccess('');
  }

  function selectInvoice(id: string) {
    setInvoiceId(id);
    setReturnLines({});
    setError('');
  }

  function toggleLine(itemId: string, maxQty: number) {
    setReturnLines((prev) => {
      const cur = prev[itemId];
      if (cur?.selected) {
        const { [itemId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [itemId]: { selected: true, quantity: String(maxQty) } };
    });
  }

  function setQty(itemId: string, value: string) {
    setReturnLines((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId]!, quantity: value },
    }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!invoice) return;

    const selectedItems = invoice.items
      .filter((item) => returnLines[item.id]?.selected)
      .map((item) => {
        const qty = parseInt(returnLines[item.id]!.quantity) || 0;
        return { item, qty };
      })
      .filter(({ item, qty }) => qty > 0 && item.locationId);

    if (selectedItems.length === 0) {
      setError('Seleccioná al menos un producto con cantidad mayor a 0.');
      return;
    }

    const overQty = selectedItems.find(
      ({ item, qty }) => qty > item.quantity,
    );
    if (overQty) {
      setError(`La cantidad a devolver de "${overQty.item.product.name}" excede la cantidad original (${overQty.item.quantity}).`);
      return;
    }

    createNC.mutate({
      customerId: invoice.customerId,
      type: 'CREDIT_NOTE',
      sourceInvoiceId: invoice.id,
      taxRate: Number(invoice.taxRate),
      items: selectedItems.map(({ item, qty }) => ({
        productId:      item.productId,
        locationId:     item.locationId!,
        quantity:       qty,
        unitPrice:      Number(item.unitPrice),
        discountPercent: 0,
      })),
      notes: notes || undefined,
    });
  }

  const anySelected = Object.values(returnLines).some((l) => l.selected);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: brand.navy[950] }}>Devoluciones</h1>
        <p className="text-sm mt-0.5" style={{ color: '#64748B' }}>
          Genera una Nota de Crédito sobre una factura emitida · Reintegra stock y reduce el balance del cliente
        </p>
      </div>

      <div className="grid grid-cols-12 gap-5">

        {/* ── Columna izquierda: selección progresiva ── */}
        <div className="col-span-12 lg:col-span-5 space-y-4">

          {/* Paso 1 — Cliente */}
          <div style={glass} className="rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                style={{ backgroundColor: customerId ? brand.semantic.success : brand.orange[500] }}
              >
                {customerId ? '✓' : '1'}
              </div>
              <span className="text-sm font-semibold" style={{ color: brand.navy[950] }}>
                Seleccionar cliente
              </span>
            </div>

            <div className="relative mb-3">
              <Search size={14} className="absolute left-3 top-3" style={{ color: '#94A3B8' }} />
              <input
                type="text"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                placeholder="Buscar por nombre o código..."
                className={inputCls}
                style={{ paddingLeft: '2rem' }}
              />
            </div>

            <div className="space-y-1 max-h-48 overflow-y-auto">
              {customers.length === 0 && (
                <p className="text-xs text-center py-4" style={{ color: '#94A3B8' }}>
                  {customerSearch ? 'Sin resultados' : 'Cargando clientes...'}
                </p>
              )}
              {customers.map((c) => (
                <button
                  key={c.id}
                  onClick={() => selectCustomer(c.id)}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm transition-all"
                  style={{
                    backgroundColor: customerId === c.id ? brand.navy[950] : 'transparent',
                    color:           customerId === c.id ? '#FFFFFF' : brand.navy[800],
                  }}
                  onMouseEnter={(e) => {
                    if (customerId !== c.id) e.currentTarget.style.backgroundColor = '#F8FAFC';
                  }}
                  onMouseLeave={(e) => {
                    if (customerId !== c.id) e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <span className="font-medium">{c.name}</span>
                  <span className="ml-2 text-[11px]" style={{ color: customerId === c.id ? '#CBD5E1' : '#94A3B8' }}>
                    {c.code}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Paso 2 — Factura */}
          {customerId && (
            <div style={glass} className="rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                  style={{ backgroundColor: invoiceId ? brand.semantic.success : brand.orange[500] }}
                >
                  {invoiceId ? '✓' : '2'}
                </div>
                <span className="text-sm font-semibold" style={{ color: brand.navy[950] }}>
                  Seleccionar factura a devolver
                </span>
              </div>

              {returnableInvoices.length === 0 ? (
                <p className="text-xs py-2" style={{ color: '#94A3B8' }}>
                  {selectedCustomer?.name} no tiene facturas emitidas, parciales o pagadas.
                </p>
              ) : (
                <div className="space-y-2">
                  {returnableInvoices.map((inv) => {
                    const st = STATUS_LABEL[inv.status];
                    return (
                      <button
                        key={inv.id}
                        onClick={() => selectInvoice(inv.id)}
                        className="w-full text-left p-3 rounded-xl border transition-all"
                        style={{
                          borderColor:       invoiceId === inv.id ? brand.orange[400] : '#E2E8F0',
                          backgroundColor:   invoiceId === inv.id ? brand.orange[50] : 'rgba(255,255,255,0.6)',
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs font-bold" style={{ color: brand.navy[800] }}>
                            {inv.invoiceNumber}
                          </span>
                          {st && (
                            <span
                              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                              style={{ backgroundColor: st.bg, color: st.text }}
                            >
                              {st.label}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-[11px]" style={{ color: '#64748B' }}>
                            {inv._count.items} productos
                          </span>
                          <span className="text-xs font-semibold" style={{ color: brand.navy[900] }}>
                            {formatCurrency(Number(inv.total))}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Columna derecha: ítems a devolver ── */}
        <div className="col-span-12 lg:col-span-7">
          {!invoiceId ? (
            <div style={glass} className="rounded-2xl flex flex-col items-center justify-center py-20 gap-3">
              <RotateCcw size={36} style={{ color: '#CBD5E1' }} />
              <p className="text-sm" style={{ color: '#94A3B8' }}>
                Seleccioná un cliente y una factura para ver los productos
              </p>
            </div>
          ) : !invoice ? (
            <div style={glass} className="rounded-2xl flex items-center justify-center py-20">
              <p className="text-sm" style={{ color: '#94A3B8' }}>Cargando factura...</p>
            </div>
          ) : (
            <div style={glass} className="rounded-2xl p-5">
              {/* Invoice header */}
              <div className="flex items-start gap-3 mb-5 pb-4" style={{ borderBottom: '1px solid #E2E8F0' }}>
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: brand.orange[50] }}
                >
                  <FileText size={17} style={{ color: brand.orange[500] }} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold" style={{ color: brand.navy[800] }}>
                      {invoice.invoiceNumber}
                    </span>
                    <ChevronRight size={13} style={{ color: '#CBD5E1' }} />
                    <span className="text-xs" style={{ color: '#64748B' }}>
                      Nota de Crédito
                    </span>
                  </div>
                  <p className="text-[11px] mt-0.5" style={{ color: '#94A3B8' }}>
                    {invoice.customer.name} · {invoice.items.length} productos · Total {formatCurrency(Number(invoice.total))}
                  </p>
                </div>
              </div>

              {/* Paso 3 — Items */}
              <div className="mb-1">
                <div className="flex items-center gap-2 mb-3">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                    style={{ backgroundColor: anySelected ? brand.semantic.success : brand.orange[500] }}
                  >
                    {anySelected ? '✓' : '3'}
                  </div>
                  <span className="text-sm font-semibold" style={{ color: brand.navy[950] }}>
                    Seleccionar productos a devolver
                  </span>
                </div>

                <div className="space-y-2">
                  {invoice.items.map((item) => {
                    const line     = returnLines[item.id];
                    const selected = !!line?.selected;
                    const noLoc    = !item.locationId;

                    return (
                      <div
                        key={item.id}
                        className="flex items-center gap-3 p-3 rounded-xl border transition-all"
                        style={{
                          borderColor:     selected ? brand.orange[400] : '#E2E8F0',
                          backgroundColor: selected ? brand.orange[50]  : 'rgba(248,250,252,0.8)',
                          opacity:         noLoc ? 0.5 : 1,
                        }}
                      >
                        {/* Checkbox */}
                        <button
                          type="button"
                          onClick={() => !noLoc && toggleLine(item.id, item.quantity)}
                          disabled={noLoc}
                          className="w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all"
                          style={{
                            borderColor:     selected ? brand.orange[500] : '#CBD5E1',
                            backgroundColor: selected ? brand.orange[500] : 'transparent',
                          }}
                        >
                          {selected && <span className="text-white text-[10px] font-bold">✓</span>}
                        </button>

                        {/* Product info */}
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium truncate" style={{ color: brand.navy[900] }}>
                            {item.product.name}
                          </div>
                          <div className="text-[10px] font-mono" style={{ color: '#94A3B8' }}>
                            {item.product.sku} · {item.quantity} u. originales · {formatCurrency(Number(item.unitPrice))} c/u
                          </div>
                          {noLoc && (
                            <div className="text-[10px] mt-0.5" style={{ color: brand.semantic.warning }}>
                              Sin ubicación — no se puede devolver
                            </div>
                          )}
                        </div>

                        {/* Quantity input */}
                        {selected && (
                          <div style={{ width: 72 }}>
                            <input
                              type="number"
                              min="1"
                              max={item.quantity}
                              value={line?.quantity ?? ''}
                              onChange={(e) => setQty(item.id, e.target.value)}
                              className={inputCls}
                              style={{ textAlign: 'center', padding: '0.4rem 0.5rem' }}
                            />
                            <p className="text-[9px] text-center mt-0.5" style={{ color: '#94A3B8' }}>
                              máx {item.quantity}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Notes */}
              <div className="mt-4">
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#475569' }}>
                  Motivo de devolución <span style={{ color: '#94A3B8' }}>(opcional)</span>
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ej: producto defectuoso, error de pedido, cambio de cliente..."
                  rows={2}
                  maxLength={500}
                  className={inputCls}
                />
              </div>

              {/* Feedback */}
              {error && (
                <div className="flex items-start gap-2 p-3 rounded-xl mt-4 text-xs"
                  style={{ backgroundColor: '#FEF2F2', color: brand.semantic.danger }}>
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  <span className="flex-1">{error}</span>
                  <button onClick={() => setError('')}><X size={12} /></button>
                </div>
              )}
              {success && (
                <div className="flex items-start gap-2 p-3 rounded-xl mt-4 text-xs"
                  style={{ backgroundColor: '#F0FDF4', color: brand.semantic.success }}>
                  <CheckCircle size={14} className="shrink-0 mt-0.5" />
                  <span className="flex-1">{success}</span>
                  <button onClick={() => setSuccess('')}><X size={12} /></button>
                </div>
              )}

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={createNC.isPending || !anySelected}
                className="w-full mt-4 py-2.5 px-4 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: brand.orange[500] }}
                onMouseEnter={(e) => { if (!createNC.isPending && anySelected) e.currentTarget.style.backgroundColor = brand.orange[600]; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = brand.orange[500]; }}
              >
                <RotateCcw size={14} />
                {createNC.isPending ? 'Procesando...' : 'Generar Nota de Crédito'}
              </button>

              <p className="text-[11px] text-center mt-2" style={{ color: '#94A3B8' }}>
                Esto reintegrará el stock en origen y reducirá el balance del cliente
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
