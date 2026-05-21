'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { trpc } from '@/lib/trpc';
import { brand } from '@/lib/brand';
import { formatDate } from '@/lib/utils';
import { glass } from '@/lib/ui';
import { ClipboardCheck, Plus, X, CheckCircle, AlertTriangle } from 'lucide-react';

const STATUS_COLORS = {
  pending: { bg: '#FFF7ED', text: '#C2410C', label: 'Pendiente' },
  completed: { bg: '#F0FDF4', text: '#166534', label: 'Completado' },
  overdue: { bg: '#FEF2F2', text: '#991B1B', label: 'Vencido' },
};

function getCountStatus(count: { completedAt: Date | null; scheduledDate: Date }) {
  if (count.completedAt) return 'completed';
  if (new Date(count.scheduledDate) < new Date()) return 'overdue';
  return 'pending';
}

export function CycleCountsClient() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string })?.role ?? 'VENDOR';
  const canAssign = role === 'ADMIN' || role === 'MANAGER';

  const [showCompleted, setShowCompleted] = useState(false);
  const [modal, setModal] = useState('');
  const [error, setError] = useState('');

  // Assign form
  const [aProductId, setAProductId] = useState('');
  const [aUserId, setAUserId] = useState('');
  const [aDate, setADate] = useState('');
  const [aNotes, setANotes] = useState('');

  // Complete form
  const [selectedCount, setSelectedCount] = useState<{ id: string; systemQuantity: number; productSku: string } | null>(null);
  const [cQuantity, setCQuantity] = useState(0);
  const [cLocationId, setCLocationId] = useState('');
  const [cNotes, setCNotes] = useState('');

  const { data: counts, refetch } = trpc.cycleCounts.list.useQuery({ completed: showCompleted ? undefined : false });
  const { data: products } = trpc.products.list.useQuery({ pageSize: 500 });
  const { data: users } = trpc.settings.users.useQuery(undefined, { enabled: canAssign });
  const { data: warehouses } = trpc.settings.warehouses.useQuery(undefined, { enabled: modal === 'complete' });

  const assignMutation = trpc.cycleCounts.assign.useMutation({
    onSuccess: () => { refetch(); closeModal(); },
    onError: (e) => setError(e.message),
  });

  const completeMutation = trpc.cycleCounts.complete.useMutation({
    onSuccess: () => { refetch(); closeModal(); },
    onError: (e) => setError(e.message),
  });

  function closeModal() {
    setModal(''); setError('');
    setAProductId(''); setAUserId(''); setADate(''); setANotes('');
    setCQuantity(0); setCLocationId(''); setCNotes('');
    setSelectedCount(null);
  }

  function openComplete(count: { id: string; systemQuantity: number; product: { sku: string } }) {
    setSelectedCount({ id: count.id, systemQuantity: count.systemQuantity, productSku: count.product.sku });
    setCQuantity(count.systemQuantity);
    setModal('complete');
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: brand.navy[950] }}>Conteos Cíclicos</h1>
          <p className="text-sm mt-0.5" style={{ color: '#64748B' }}>Control anti-robo · Verificación física de inventario</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: '#64748B' }}>
            <input type="checkbox" checked={showCompleted} onChange={(e) => setShowCompleted(e.target.checked)}
              className="rounded" />
            Mostrar completados
          </label>
          {canAssign && (
            <button onClick={() => setModal('assign')}
              className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-xl text-white"
              style={{ background: `linear-gradient(135deg, ${brand.orange[500]}, ${brand.orange[600]})` }}>
              <Plus size={14} /> Asignar Conteo
            </button>
          )}
        </div>
      </div>

      <div style={glass} className="rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(10,22,40,0.08)' }}>
              {['Producto', 'Asignado a', 'Fecha', 'Stock Sistema', 'Contado', 'Varianza', 'Estado', ''].map((h) => (
                <th key={h} className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: '#94A3B8' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {counts?.counts.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-12 text-center text-sm" style={{ color: '#94A3B8' }}>
                  <ClipboardCheck size={32} className="mx-auto mb-2" style={{ color: '#CBD5E1' }} />
                  No hay conteos {showCompleted ? '' : 'pendientes'}
                </td>
              </tr>
            )}
            {counts?.counts.map((c, i) => {
              const status = getCountStatus(c);
              const colors = STATUS_COLORS[status];
              const variance = c.variance;
              return (
                <tr key={c.id} style={{
                  borderBottom: i < (counts.counts.length - 1) ? '1px solid rgba(10,22,40,0.05)' : 'none',
                  backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(10,22,40,0.015)',
                }}>
                  <td className="px-5 py-3">
                    <div className="font-medium" style={{ color: brand.navy[950] }}>{c.product.name}</div>
                    <div className="text-xs font-mono text-slate-400">{c.product.sku}</div>
                  </td>
                  <td className="px-5 py-3 text-slate-500">{c.assignedUser.name}</td>
                  <td className="px-5 py-3 text-slate-500 text-xs">{formatDate(c.scheduledDate)}</td>
                  <td className="px-5 py-3 font-mono text-center" style={{ color: brand.navy[800] }}>{c.systemQuantity}</td>
                  <td className="px-5 py-3 font-mono text-center" style={{ color: brand.navy[800] }}>
                    {c.countedQuantity ?? '—'}
                  </td>
                  <td className="px-5 py-3 font-mono text-center font-semibold">
                    {variance === null || variance === undefined ? '—' : (
                      <span style={{ color: variance === 0 ? '#16A34A' : variance > 0 ? '#1D4ED8' : '#DC2626' }}>
                        {variance > 0 ? '+' : ''}{variance}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                      style={{ backgroundColor: colors.bg, color: colors.text }}>
                      {status === 'overdue' && <AlertTriangle size={10} className="inline mr-1" />}
                      {colors.label}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    {!c.completedAt && (
                      <button onClick={() => openComplete(c)}
                        className="text-xs px-2 py-1 rounded-lg border hover:bg-slate-50 flex items-center gap-1"
                        style={{ color: '#16A34A', borderColor: '#BBF7D0' }}>
                        <CheckCircle size={11} /> Completar
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Modals ── */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" style={{ backdropFilter: 'blur(4px)' }} onClick={closeModal} />
          <div className="relative w-full max-w-md mx-4 rounded-2xl p-6"
            style={{ background: 'rgba(255,255,255,0.97)', boxShadow: '0 24px 64px rgba(10,22,40,0.18)' }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-bold" style={{ color: brand.navy[950] }}>
                {modal === 'assign' ? 'Asignar Conteo Cíclico' : 'Completar Conteo'}
              </h2>
              <button onClick={closeModal}><X size={18} style={{ color: '#64748B' }} /></button>
            </div>
            {error && <div className="mb-4 px-3 py-2 rounded-xl text-sm text-red-700 bg-red-50 border border-red-200">{error}</div>}

            {modal === 'assign' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>Producto *</label>
                  <select value={aProductId} onChange={(e) => setAProductId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none">
                    <option value="">Seleccionar...</option>
                    {products?.products.map((p) => (
                      <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>Asignar a *</label>
                  <select value={aUserId} onChange={(e) => setAUserId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none">
                    <option value="">Seleccionar usuario...</option>
                    {users?.map((u) => (
                      <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>Fecha Programada *</label>
                  <input type="date" value={aDate} onChange={(e) => setADate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>Notas</label>
                  <textarea value={aNotes} onChange={(e) => setANotes(e.target.value)} rows={2}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none resize-none" />
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={closeModal} className="flex-1 py-2 rounded-xl text-sm border hover:bg-slate-50" style={{ color: '#64748B' }}>Cancelar</button>
                  <button
                    onClick={() => assignMutation.mutate({ productId: aProductId, assignedUserId: aUserId, scheduledDate: new Date(aDate), notes: aNotes || undefined })}
                    disabled={assignMutation.isPending || !aProductId || !aUserId || !aDate}
                    className="flex-1 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-60"
                    style={{ background: `linear-gradient(135deg, ${brand.orange[500]}, ${brand.orange[600]})` }}>
                    {assignMutation.isPending ? 'Asignando...' : 'Asignar'}
                  </button>
                </div>
              </div>
            )}

            {modal === 'complete' && selectedCount && (
              <div className="space-y-3">
                <div className="px-3 py-2 rounded-xl text-sm" style={{ backgroundColor: 'rgba(10,22,40,0.04)' }}>
                  <div className="font-medium" style={{ color: brand.navy[900] }}>{selectedCount.productSku}</div>
                  <div className="text-xs text-slate-500">Stock en sistema: <strong>{selectedCount.systemQuantity}</strong> unidades</div>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>Cantidad Contada *</label>
                  <input type="number" min="0" value={cQuantity} onChange={(e) => setCQuantity(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none" />
                  {cQuantity !== selectedCount.systemQuantity && (
                    <div className="text-xs mt-1 font-semibold"
                      style={{ color: cQuantity > selectedCount.systemQuantity ? '#1D4ED8' : '#DC2626' }}>
                      Varianza: {cQuantity > selectedCount.systemQuantity ? '+' : ''}{cQuantity - selectedCount.systemQuantity} unidades
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>Ubicación para Ajuste</label>
                  <select value={cLocationId} onChange={(e) => setCLocationId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none">
                    <option value="">Seleccionar ubicación...</option>
                    {warehouses?.flatMap((w) =>
                      w.locations.map((l) => (
                        <option key={l.id} value={l.id}>{w.name} — {l.locationCode}</option>
                      ))
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>Notas</label>
                  <textarea value={cNotes} onChange={(e) => setCNotes(e.target.value)} rows={2}
                    placeholder="Observaciones del conteo..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none resize-none" />
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={closeModal} className="flex-1 py-2 rounded-xl text-sm border hover:bg-slate-50" style={{ color: '#64748B' }}>Cancelar</button>
                  <button
                    onClick={() => completeMutation.mutate({ id: selectedCount.id, countedQuantity: cQuantity, locationId: cLocationId, notes: cNotes || undefined })}
                    disabled={completeMutation.isPending || !cLocationId}
                    className="flex-1 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-60"
                    style={{ background: `linear-gradient(135deg, ${brand.orange[500]}, ${brand.orange[600]})` }}>
                    {completeMutation.isPending ? 'Guardando...' : 'Confirmar Conteo'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
