'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { brand } from '@/lib/brand';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Plus, Search, Users, X, Edit2, ChevronLeft, ChevronRight } from 'lucide-react';

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
                      <button onClick={() => openEdit(c)} className="p-1.5 rounded-lg hover:bg-slate-100">
                        <Edit2 size={14} style={{ color: brand.navy[600] }} />
                      </button>
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
