'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { brand } from '@/lib/brand';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Plus, Search, Users, X, Edit2, ChevronLeft, ChevronRight, Archive, RefreshCw, Receipt } from 'lucide-react';

const glass = {
  backgroundColor: 'rgba(255,255,255,0.72)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: '1px solid rgba(255,255,255,0.85)',
  boxShadow: '0 4px 24px rgba(10,22,40,0.07)',
} as React.CSSProperties;

type CForm = {
  name: string; type: 'RETAIL' | 'WHOLESALE'; taxId: string; phone: string;
  email: string; address: string; municipality: string; creditLimit: string; notes: string;
};

const empty: CForm = {
  name: '', type: 'RETAIL', taxId: '', phone: '', email: '',
  address: '', municipality: '', creditLimit: '0', notes: '',
};

const MUNICIPALITIES = [
  'Aguadilla', 'Arecibo', 'Bayamón', 'Caguas', 'Carolina', 'Dorado', 'Guaynabo',
  'Humacao', 'Manatí', 'Mayagüez', 'Ponce', 'San Juan', 'Toa Baja', 'Vega Alta', 'Otro',
];

export function CustomersClient() {
  const [search, setSearch] = useState('');
  const [type, setType] = useState<'RETAIL' | 'WHOLESALE' | ''>('');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<'none' | 'create' | 'edit'>('none');
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<CForm>(empty);
  const [error, setError] = useState('');
  const [deactivateTarget, setDeactivateTarget] = useState<{ id: string; name: string } | null>(null);
  const [reconcileTarget, setReconcileTarget] = useState<{ id: string; name: string } | null>(null);
  const [reconcileSuccess, setReconcileSuccess] = useState<string | null>(null);

  const { data, isLoading, refetch } = trpc.customers.list.useQuery({
    search: search || undefined,
    type: type || undefined,
    page,
    pageSize: 20,
  });

  const create = trpc.customers.create.useMutation({
    onSuccess: () => { refetch(); close_(); },
    onError: (e) => setError(e.message),
  });

  const update = trpc.customers.update.useMutation({
    onSuccess: () => { refetch(); close_(); },
    onError: (e) => setError(e.message),
  });

  const deactivate = trpc.customers.deactivate.useMutation({
    onSuccess: () => { setDeactivateTarget(null); void refetch(); },
    onError: (e) => setError(e.message),
  });

  const reconcile = trpc.customers.reconcileBalance.useMutation({
    onSuccess: (result) => {
      setReconcileTarget(null);
      setReconcileSuccess(`Balance recalculado: ${formatCurrency(Number(result.currentBalance))}`);
      void refetch();
      setTimeout(() => setReconcileSuccess(null), 4000);
    },
    onError: (e) => setError(e.message),
  });

  function close_() {
    setModal('none'); setEditId(null); setForm(empty); setError('');
  }

  function openEdit(c: NonNullable<typeof data>['customers'][0]) {
    setForm({
      name: c.name, type: c.type,
      taxId: c.taxId ?? '', phone: c.phone ?? '', email: c.email ?? '',
      address: c.address ?? '', municipality: c.municipality ?? '',
      creditLimit: String(c.creditLimit), notes: c.notes ?? '',
    });
    setEditId(c.id); setModal('edit'); setError('');
  }

  function submit() {
    setError('');
    if (!form.name.trim()) { setError('Nombre es requerido'); return; }
    const payload = {
      name: form.name, type: form.type,
      taxId: form.taxId || undefined, phone: form.phone || undefined,
      email: form.email || undefined, address: form.address || undefined,
      municipality: form.municipality || undefined,
      creditLimit: parseFloat(form.creditLimit) || 0,
      notes: form.notes || undefined,
    };
    if (modal === 'create') create.mutate(payload);
    else if (editId) update.mutate({ id: editId, data: payload });
  }

  const customers = data?.customers ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  // Facturas por cliente
  const [invoiceCustomerId, setInvoiceCustomerId] = useState<string | null>(null);
  const { data: customerInvoices } = trpc.invoicing.list.useQuery(
    { customerId: invoiceCustomerId ?? '', pageSize: 50 },
    { enabled: !!invoiceCustomerId },
  );

  const INV_STATUS: Record<string, { label: string; bg: string; text: string }> = {
    ISSUED:  { label: 'Emitida', bg: '#EFF6FF', text: '#1D4ED8' },
    PAID:    { label: 'Pagada', bg: '#F0FDF4', text: '#166534' },
    PARTIAL: { label: 'Parcial', bg: '#FEF9C3', text: '#854D0E' },
    VOIDED:  { label: 'Anulada', bg: '#FEF2F2', text: '#991B1B' },
    CONVERTED: { label: 'Convertida', bg: '#F1F5F9', text: '#475569' },
    DRAFT:   { label: 'Borrador', bg: '#F1F5F9', text: '#475569' },
    PENDING_AUTHORIZATION: { label: 'Pend. Aut.', bg: '#FFF7ED', text: '#C2410C' },
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: brand.navy[950] }}>Clientes</h1>
          <p className="text-sm mt-0.5" style={{ color: '#64748B' }}>
            {total} clientes activos
          </p>
        </div>
        <button
          onClick={() => { setModal('create'); setForm(empty); setError(''); }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90"
          style={{ background: `linear-gradient(135deg, ${brand.orange[500]}, ${brand.orange[600]})` }}
        >
          <Plus size={16} /> Nuevo Cliente
        </button>
      </div>

      {/* Filters */}
      <div style={glass} className="rounded-2xl p-4 flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2 flex-1 min-w-48 bg-white/60 rounded-xl px-3 py-2 border border-white/80">
          <Search size={15} style={{ color: '#94A3B8' }} />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Buscar por nombre, código, teléfono..."
            className="flex-1 text-sm bg-transparent outline-none"
            style={{ color: brand.navy[950] }}
          />
        </div>
        <select
          value={type}
          onChange={(e) => { setType(e.target.value as 'RETAIL' | 'WHOLESALE' | ''); setPage(1); }}
          className="text-sm px-3 py-2 rounded-xl border bg-white/60 outline-none"
          style={{ color: brand.navy[800] }}
        >
          <option value="">Todos los tipos</option>
          <option value="RETAIL">Detallista</option>
          <option value="WHOLESALE">Mayorista</option>
        </select>
      </div>

      {/* Table */}
      <div style={glass} className="rounded-2xl overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-slate-400 text-sm">Cargando clientes...</div>
        ) : customers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Users size={40} style={{ color: '#CBD5E1' }} />
            <p className="text-slate-400 text-sm">No se encontraron clientes</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(10,22,40,0.08)' }}>
                  {['Código', 'Cliente', 'Tipo', 'Municipio', 'Teléfono', 'Facturas', 'Crédito', 'Balance', ''].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: '#94A3B8' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {customers.map((c, i) => (
                  <tr
                    key={c.id}
                    style={{
                      borderBottom: i < customers.length - 1 ? '1px solid rgba(10,22,40,0.05)' : 'none',
                      backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(10,22,40,0.015)',
                    }}
                  >
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: brand.navy[700] }}>{c.code}</td>
                    <td className="px-4 py-3 font-medium" style={{ color: brand.navy[950] }}>
                      {c.name}
                      {c.email && <div className="text-xs text-slate-400">{c.email}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="px-2 py-0.5 rounded-full text-xs font-semibold"
                        style={c.type === 'WHOLESALE'
                          ? { backgroundColor: brand.orange[50], color: brand.orange[600] }
                          : { backgroundColor: '#EFF6FF', color: '#1D4ED8' }
                        }
                      >
                        {c.type === 'WHOLESALE' ? 'Mayorista' : 'Detallista'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{c.municipality ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{c.phone ?? '—'}</td>
                    <td className="px-4 py-3 font-medium" style={{ color: brand.navy[900] }}>
                      {c._count.invoices}
                    </td>
                    <td className="px-4 py-3" style={{ color: brand.navy[800] }}>
                      {Number(c.creditLimit) > 0 ? formatCurrency(Number(c.creditLimit)) : '—'}
                    </td>
                    <td className="px-4 py-3" style={{ color: Number(c.currentBalance) > 0 ? '#DC2626' : '#16A34A' }}>
                      {formatCurrency(Number(c.currentBalance))}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEdit(c)}
                          className="p-1.5 rounded-lg hover:bg-slate-100"
                          title="Editar cliente"
                        >
                          <Edit2 size={14} style={{ color: brand.navy[600] }} />
                        </button>
                        <button
                          onClick={() => setInvoiceCustomerId(c.id)}
                          className="p-1.5 rounded-lg hover:bg-orange-50"
                          title="Ver facturas del cliente"
                        >
                          <Receipt size={14} style={{ color: brand.orange[500] }} />
                        </button>
                        <button
                          onClick={() => setReconcileTarget({ id: c.id, name: c.name })}
                          className="p-1.5 rounded-lg hover:bg-blue-50"
                          title="Recalcular balance (Admin)"
                        >
                          <RefreshCw size={14} style={{ color: '#0284C7' }} />
                        </button>
                        <button
                          onClick={() => setDeactivateTarget({ id: c.id, name: c.name })}
                          className="p-1.5 rounded-lg hover:bg-red-50"
                          title="Archivar cliente"
                        >
                          <Archive size={14} style={{ color: '#DC2626' }} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm" style={{ color: '#64748B' }}>
          <span>Mostrando {(page - 1) * 20 + 1}–{Math.min(page * 20, total)} de {total}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded-lg border disabled:opacity-40">
              <ChevronLeft size={16} />
            </button>
            <span className="px-3 py-1 rounded-lg bg-white/60 border">{page} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1.5 rounded-lg border disabled:opacity-40">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Banner de éxito de reconciliación */}
      {reconcileSuccess && (
        <div
          className="fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium shadow-lg"
          style={{ backgroundColor: '#F0FDF4', color: '#166534', border: '1px solid #BBF7D0' }}
        >
          <RefreshCw size={14} />
          {reconcileSuccess}
        </div>
      )}

      {/* Modal — Confirmar Desactivación */}
      {deactivateTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/30"
            style={{ backdropFilter: 'blur(4px)' }}
            onClick={() => setDeactivateTarget(null)}
          />
          <div
            className="relative w-full max-w-sm mx-4 rounded-2xl p-6"
            style={{ background: 'rgba(255,255,255,0.97)', boxShadow: '0 24px 64px rgba(10,22,40,0.18)' }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#FEF2F2' }}>
                <Archive size={20} style={{ color: '#DC2626' }} />
              </div>
              <div>
                <h2 className="text-base font-bold" style={{ color: brand.navy[950] }}>Archivar Cliente</h2>
                <p className="text-xs" style={{ color: '#94A3B8' }}>El cliente no aparecerá en búsquedas activas</p>
              </div>
            </div>
            <p className="text-sm mb-5" style={{ color: '#475569' }}>
              ¿Marcar como inactivo{' '}
              <span className="font-semibold" style={{ color: brand.navy[950] }}>{deactivateTarget.name}</span>?
              {' '}Sus facturas e historial se preservan.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeactivateTarget(null)}
                className="flex-1 py-2.5 rounded-xl text-sm border hover:bg-slate-50"
                style={{ color: '#64748B' }}
              >
                Cancelar
              </button>
              <button
                onClick={() => deactivate.mutate(deactivateTarget.id)}
                disabled={deactivate.isPending}
                className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-60"
                style={{ backgroundColor: '#DC2626' }}
              >
                {deactivate.isPending ? 'Archivando...' : 'Sí, Archivar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal — Confirmar Reconciliación de Balance */}
      {reconcileTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/30"
            style={{ backdropFilter: 'blur(4px)' }}
            onClick={() => setReconcileTarget(null)}
          />
          <div
            className="relative w-full max-w-sm mx-4 rounded-2xl p-6"
            style={{ background: 'rgba(255,255,255,0.97)', boxShadow: '0 24px 64px rgba(10,22,40,0.18)' }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#EFF6FF' }}>
                <RefreshCw size={20} style={{ color: '#0284C7' }} />
              </div>
              <div>
                <h2 className="text-base font-bold" style={{ color: brand.navy[950] }}>Recalcular Balance</h2>
                <p className="text-xs" style={{ color: '#94A3B8' }}>Requiere rol Administrador</p>
              </div>
            </div>
            <p className="text-sm mb-5" style={{ color: '#475569' }}>
              Recalcular el balance de{' '}
              <span className="font-semibold" style={{ color: brand.navy[950] }}>{reconcileTarget.name}</span>{' '}
              sumando todas las facturas ISSUED y PARTIAL no pagadas completamente.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setReconcileTarget(null)}
                className="flex-1 py-2.5 rounded-xl text-sm border hover:bg-slate-50"
                style={{ color: '#64748B' }}
              >
                Cancelar
              </button>
              <button
                onClick={() => reconcile.mutate(reconcileTarget.id)}
                disabled={reconcile.isPending}
                className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-60"
                style={{ backgroundColor: '#0284C7' }}
              >
                {reconcile.isPending ? 'Recalculando...' : 'Recalcular'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      {modal !== 'none' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" style={{ backdropFilter: 'blur(4px)' }} onClick={close_} />
          <div className="relative w-full max-w-xl mx-4 rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
            style={{ background: 'rgba(255,255,255,0.97)', boxShadow: '0 24px 64px rgba(10,22,40,0.18)' }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold" style={{ color: brand.navy[950] }}>
                {modal === 'create' ? 'Nuevo Cliente' : 'Editar Cliente'}
              </h2>
              <button onClick={close_} className="p-1 rounded-lg hover:bg-slate-100">
                <X size={18} style={{ color: '#64748B' }} />
              </button>
            </div>
            {error && <div className="mb-4 px-3 py-2 rounded-xl text-sm text-red-700 bg-red-50 border border-red-200">{error}</div>}

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <FLabel>Nombre del Cliente *</FLabel>
                <FInput value={form.name} onChange={(v) => setForm(f => ({ ...f, name: v }))} placeholder="Nombre completo o empresa" />
              </div>
              <div>
                <FLabel>Tipo</FLabel>
                <select value={form.type} onChange={(e) => setForm(f => ({ ...f, type: e.target.value as 'RETAIL' | 'WHOLESALE' }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none" style={{ color: brand.navy[900] }}>
                  <option value="RETAIL">Detallista</option>
                  <option value="WHOLESALE">Mayorista</option>
                </select>
              </div>
              <div>
                <FLabel>Tax ID / EIN</FLabel>
                <FInput value={form.taxId} onChange={(v) => setForm(f => ({ ...f, taxId: v }))} placeholder="XX-XXXXXXX" />
              </div>
              <div>
                <FLabel>Teléfono</FLabel>
                <FInput value={form.phone} onChange={(v) => setForm(f => ({ ...f, phone: v }))} placeholder="(787) 000-0000" />
              </div>
              <div>
                <FLabel>Email</FLabel>
                <FInput value={form.email} onChange={(v) => setForm(f => ({ ...f, email: v }))} placeholder="cliente@email.com" type="email" />
              </div>
              <div className="col-span-2">
                <FLabel>Dirección</FLabel>
                <FInput value={form.address} onChange={(v) => setForm(f => ({ ...f, address: v }))} placeholder="Calle, número, urbanización..." />
              </div>
              <div>
                <FLabel>Municipio</FLabel>
                <select value={form.municipality} onChange={(e) => setForm(f => ({ ...f, municipality: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none" style={{ color: brand.navy[900] }}>
                  <option value="">Seleccionar...</option>
                  {MUNICIPALITIES.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <FLabel>Límite de Crédito</FLabel>
                <FInput value={form.creditLimit} onChange={(v) => setForm(f => ({ ...f, creditLimit: v }))} placeholder="0.00" type="number" />
              </div>
              <div className="col-span-2">
                <FLabel>Notas</FLabel>
                <textarea value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                  placeholder="Notas internas sobre el cliente..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none resize-none" style={{ color: brand.navy[900] }} />
              </div>
            </div>

            <div className="flex gap-3 mt-6 justify-end">
              <button onClick={close_} className="px-4 py-2 rounded-xl text-sm font-medium border border-slate-200 hover:bg-slate-50" style={{ color: '#64748B' }}>
                Cancelar
              </button>
              <button onClick={submit} disabled={create.isPending || update.isPending}
                className="px-5 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-60 hover:opacity-90"
                style={{ background: `linear-gradient(135deg, ${brand.orange[500]}, ${brand.orange[600]})` }}>
                {create.isPending || update.isPending ? 'Guardando...' : modal === 'create' ? 'Crear Cliente' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DRAWER: Facturas del Cliente ── */}
      {invoiceCustomerId && (
        <div className="fixed inset-0 z-50 flex items-end justify-end">
          <div className="absolute inset-0 bg-black/30" style={{ backdropFilter: 'blur(4px)' }} onClick={() => setInvoiceCustomerId(null)} />
          <div className="relative w-full max-w-2xl h-screen flex flex-col"
            style={{ background: 'rgba(255,255,255,0.98)', boxShadow: '-8px 0 40px rgba(10,22,40,0.15)' }}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold" style={{ color: brand.navy[950] }}>
                  Facturas del Cliente
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {customers.find((c) => c.id === invoiceCustomerId)?.name ?? '—'}
                </p>
              </div>
              <button onClick={() => setInvoiceCustomerId(null)}
                className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
                <X size={16} style={{ color: '#94A3B8' }} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {!customerInvoices ? (
                <div className="flex items-center justify-center py-20 text-slate-400 text-sm">Cargando...</div>
              ) : customerInvoices.invoices.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <Receipt size={40} style={{ color: '#CBD5E1' }} />
                  <p className="text-slate-400 text-sm">No hay facturas para este cliente</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {customerInvoices.invoices.map((inv) => {
                    const st = INV_STATUS[inv.status] ?? { label: inv.status, bg: '#F1F5F9', text: '#475569' };
                    const invAny = inv as unknown as { type: string };
                    return (
                      <div key={inv.id} className="rounded-xl border border-slate-100 p-4 hover:border-slate-200 transition-colors">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-mono text-xs font-bold" style={{ color: brand.orange[600] }}>{inv.invoiceNumber}</span>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ backgroundColor: st.bg, color: st.text }}>{st.label}</span>
                              <span className="text-[10px] text-slate-400">{invAny.type === 'QUOTE' ? 'Cotización' : invAny.type === 'CREDIT_NOTE' ? 'Nota de Crédito' : 'Factura'}</span>
                            </div>
                            <div className="text-xs text-slate-400">{formatDate(inv.createdAt)}</div>
                          </div>
                          <div className="text-right">
                            <div className="font-bold text-sm" style={{ color: brand.navy[950] }}>{formatCurrency(Number(inv.total))}</div>
                            {Number(inv.paidAmount) > 0 && (
                              <div className="text-xs" style={{ color: '#16A34A' }}>
                                Pagado: {formatCurrency(Number(inv.paidAmount))}
                              </div>
                            )}
                            {Number(inv.total) - Number(inv.paidAmount) > 0.01 && inv.status !== 'VOIDED' && (
                              <div className="text-xs" style={{ color: '#DC2626' }}>
                                Pendiente: {formatCurrency(Number(inv.total) - Number(inv.paidAmount))}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-50">
                          <span className="text-xs text-slate-400">
                            {(inv as unknown as { _count: { items: number } })._count.items} ítem(s)
                          </span>
                          <a href={`/api/print/invoice/${inv.id}`} target="_blank" rel="noreferrer"
                            className="text-xs font-medium flex items-center gap-1" style={{ color: brand.orange[500] }}>
                            <Receipt size={11} /> Ver PDF
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            {customerInvoices && customerInvoices.total > 0 && (
              <div className="px-6 py-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-slate-400">{customerInvoices.total} documentos en total</span>
                <span className="text-xs font-semibold" style={{ color: brand.navy[950] }}>
                  Total facturado: {formatCurrency(
                    customerInvoices.invoices.reduce((s, inv) => s + Number(inv.total), 0)
                  )}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>{children}</label>;
}

function FInput({ value, onChange, placeholder = '', type = 'text' }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none" style={{ color: brand.navy[900] }} />
  );
}
