'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { brand } from '@/lib/brand';
import { formatDate } from '@/lib/utils';
import { glass } from '@/lib/ui';
import {
  SlidersHorizontal, CheckCircle, AlertCircle, History,
  X, ChevronLeft, ChevronRight, Search,
} from 'lucide-react';

const inputCls =
  'w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none ' +
  'focus:ring-2 focus:ring-orange-400 focus:border-transparent transition-all bg-white/80';

const ADJ_TYPES = [
  { value: 'ADJUSTMENT', label: 'Ajuste de conteo', description: 'Corrección por diferencia en conteo físico', sign: '±', ref: 'ADJUSTMENT' },
  { value: 'DAMAGE', label: 'Producto dañado', description: 'Descarte por daño — reduce inventario', sign: '−', ref: 'DAMAGE_REPORT' },
] as const;

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  ADJUSTMENT: { bg: '#EFF6FF', text: '#1D4ED8' },
  DAMAGE:     { bg: '#FEF2F2', text: '#DC2626' },
};

export function AdjustmentsClient() {
  const [productId, setProductId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [movementType, setMovementType] = useState<'ADJUSTMENT' | 'DAMAGE'>('ADJUSTMENT');
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const { data: products } = trpc.products.list.useQuery({ pageSize: 500 });
  const { data: warehouses } = trpc.settings.warehouses.useQuery();
  const { data: history, refetch: refetchHistory } = trpc.movements.list.useQuery({
    movementType: movementType,
    warehouseId: warehouseId || undefined,
    page,
    pageSize: 20,
  });

  const adjustMutation = trpc.movements.create.useMutation({
    onSuccess: () => {
      const prod = products?.products.find((p) => p.id === productId);
      const loc = availableLocations.find((l) => l.id === locationId);
      const wh = warehouses?.find((w) => w.id === warehouseId);
      setSuccess(`Ajuste registrado: ${quantity} u. de ${prod?.name ?? '—'} en ${loc?.label ?? wh?.name ?? '—'}`);
      setError(null);
      setProductId(''); setLocationId(''); setWarehouseId(''); setQuantity(''); setNotes('');
      void refetchHistory();
    },
    onError: (e) => { setError(e.message); setSuccess(null); },
  });

  const allLocations = warehouses?.flatMap((w) =>
    (w.locations as unknown as Array<{ id: string; locationCode: string; quantityOnHand: number; productId: string }>)
      .map((l) => ({ id: l.id, label: `${w.name} — ${l.locationCode}`, productId: l.productId, quantityOnHand: l.quantityOnHand }))
  ) ?? [];

  const availableLocations = productId ? allLocations.filter((l) => l.productId === productId) : [];

  const filteredProducts = (products?.products ?? []).filter((p) =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase())
  );

  const selectedAdj = ADJ_TYPES.find((t) => t.value === movementType)!;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!productId || (!locationId && !warehouseId) || !quantity) return;
    const qty = parseInt(quantity, 10);
    const finalQty = movementType === 'DAMAGE' ? -Math.abs(qty) : qty;
    adjustMutation.mutate({
      productId,
      ...(locationId ? { locationId } : { warehouseId }),
      movementType,
      quantity: finalQty,
      referenceType: selectedAdj.ref,
      notes: notes || undefined,
    });
  }

  const movements = history?.movements ?? [];
  const totalPages = Math.ceil((history?.total ?? 0) / 20);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: brand.navy[950] }}>Ajustes de Inventario</h1>
        <p className="text-sm mt-0.5" style={{ color: '#64748B' }}>
          Correcciones de conteo físico y descarte por daño. Cada ajuste genera un movimiento auditable.
        </p>
      </div>

      <div className="grid grid-cols-12 gap-5">
        {/* ── Formulario ── */}
        <div className="col-span-12 lg:col-span-5">
          <div style={glass} className="rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: brand.orange[50] }}>
                <SlidersHorizontal size={18} style={{ color: brand.orange[500] }} />
              </div>
              <div>
                <h2 className="text-sm font-semibold" style={{ color: brand.navy[950] }}>Nuevo Ajuste</h2>
                <p className="text-xs" style={{ color: '#94A3B8' }}>Solo MANAGER o ADMIN pueden ejecutar ajustes</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Tipo de ajuste */}
              <div>
                <label className="block text-xs font-semibold mb-2" style={{ color: brand.navy[700] }}>Tipo de Ajuste</label>
                <div className="grid grid-cols-2 gap-2">
                  {ADJ_TYPES.map((t) => (
                    <button key={t.value} type="button"
                      onClick={() => { setMovementType(t.value); setPage(1); }}
                      className="p-3 rounded-xl border text-left transition-all"
                      style={movementType === t.value
                        ? { borderColor: brand.orange[400], backgroundColor: `${brand.orange[500]}12` }
                        : { borderColor: '#E2E8F0', backgroundColor: 'transparent' }
                      }>
                      <div className="text-xs font-bold mb-1" style={{ color: movementType === t.value ? brand.orange[600] : brand.navy[800] }}>
                        {t.sign} {t.label}
                      </div>
                      <div className="text-[10px]" style={{ color: '#94A3B8' }}>{t.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Buscar producto */}
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>Buscar Producto</label>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#94A3B8' }} />
                  <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); setProductId(''); setLocationId(''); setWarehouseId(''); }}
                    placeholder="Nombre o SKU..." className={inputCls} style={{ paddingLeft: '2rem' }} />
                </div>
              </div>

              {/* Producto */}
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>Producto *</label>
                <select value={productId} onChange={(e) => { setProductId(e.target.value); setLocationId(''); setWarehouseId(''); }}
                  className={inputCls} required>
                  <option value="">— Seleccionar —</option>
                  {filteredProducts.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                  ))}
                </select>
              </div>

              {/* Ubicación */}
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>
                  {productId && availableLocations.length > 0 ? 'Ubicación *' : 'Almacén *'}
                </label>
                {productId && availableLocations.length > 0 ? (
                  <select value={locationId} onChange={(e) => { setLocationId(e.target.value); setWarehouseId(''); }}
                    className={inputCls} required>
                    <option value="">— Seleccionar —</option>
                    {availableLocations.map((l) => (
                      <option key={l.id} value={l.id}>{l.label} (actual: {l.quantityOnHand} u.)</option>
                    ))}
                  </select>
                ) : (
                  <select value={warehouseId} onChange={(e) => { setWarehouseId(e.target.value); setLocationId(''); }}
                    className={inputCls} required>
                    <option value="">— Seleccionar almacén —</option>
                    {warehouses?.map((w) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Cantidad */}
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>
                  Cantidad {movementType === 'DAMAGE' ? '(unidades a descartar)' : '(positivo = agregar, negativo = reducir)'}
                </label>
                <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)}
                  placeholder={movementType === 'DAMAGE' ? 'Ej: 3' : 'Ej: 5 ó -5'}
                  className={inputCls}
                  min={movementType === 'DAMAGE' ? '1' : undefined} required />
              </div>

              {/* Notas */}
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>
                  Motivo / Notas *
                </label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                  placeholder={movementType === 'DAMAGE' ? 'Describe el daño...' : 'Razón del ajuste...'}
                  rows={2} className={inputCls} style={{ resize: 'none' }} required />
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 rounded-xl text-xs" style={{ backgroundColor: '#FEF2F2', color: '#DC2626' }}>
                  <AlertCircle size={14} className="shrink-0 mt-0.5" /><span>{error}</span>
                  <button type="button" onClick={() => setError(null)} className="ml-auto"><X size={12} /></button>
                </div>
              )}
              {success && (
                <div className="flex items-start gap-2 p-3 rounded-xl text-xs" style={{ backgroundColor: '#F0FDF4', color: '#16A34A' }}>
                  <CheckCircle size={14} className="shrink-0 mt-0.5" /><span>{success}</span>
                </div>
              )}

              <button type="submit" disabled={adjustMutation.isPending || !productId || (!locationId && !warehouseId) || !quantity || !notes}
                className="w-full py-2.5 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 hover:opacity-90"
                style={{ background: `linear-gradient(135deg, ${brand.orange[500]}, ${brand.orange[600]})` }}>
                <SlidersHorizontal size={14} />
                {adjustMutation.isPending ? 'Registrando...' : 'Registrar Ajuste'}
              </button>
            </form>
          </div>
        </div>

        {/* ── Historial ── */}
        <div className="col-span-12 lg:col-span-7">
          <div style={glass} className="rounded-2xl overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: '1px solid rgba(10,22,40,0.08)' }}>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#EFF6FF' }}>
                <History size={15} style={{ color: '#1D4ED8' }} />
              </div>
              <div className="flex-1">
                <h2 className="text-sm font-semibold" style={{ color: brand.navy[950] }}>Historial de Ajustes</h2>
                <p className="text-xs" style={{ color: '#94A3B8' }}>{history?.total ?? 0} registros · tipo: {selectedAdj.label}</p>
              </div>
            </div>

            {movements.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <SlidersHorizontal size={36} style={{ color: '#CBD5E1' }} />
                <p className="text-sm text-slate-400">No hay ajustes registrados</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(10,22,40,0.08)' }}>
                        {['Producto', 'Tipo', 'Cant.', 'Ubicación', 'Usuario', 'Fecha'].map((h) => (
                          <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: '#94A3B8' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {movements.map((m, i) => {
                        const col = TYPE_COLORS[m.movementType] ?? { bg: '#F1F5F9', text: '#475569' };
                        return (
                          <tr key={m.id} style={{
                            borderBottom: i < movements.length - 1 ? '1px solid rgba(10,22,40,0.05)' : 'none',
                            backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(10,22,40,0.015)',
                          }}>
                            <td className="px-4 py-3">
                              <div className="text-xs font-medium" style={{ color: brand.navy[950] }}>{m.product.name}</div>
                              <div className="font-mono text-[10px]" style={{ color: '#94A3B8' }}>{m.product.sku}</div>
                            </td>
                            <td className="px-4 py-3">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ backgroundColor: col.bg, color: col.text }}>
                                {m.movementType}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-bold`}
                                style={m.quantity >= 0 ? { backgroundColor: '#F0FDF4', color: '#16A34A' } : { backgroundColor: '#FEF2F2', color: '#DC2626' }}>
                                {m.quantity >= 0 ? '+' : ''}{m.quantity}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs">
                              <div style={{ color: brand.navy[800] }}>{m.location.warehouse.name}</div>
                              <div style={{ color: '#94A3B8' }}>{m.location.locationCode}</div>
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-500">{m.user.name ?? m.user.email}</td>
                            <td className="px-4 py-3 text-xs text-slate-400">{formatDate(m.createdAt)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-5 py-3" style={{ borderTop: '1px solid rgba(10,22,40,0.06)' }}>
                    <span className="text-xs text-slate-400">Página {page} / {totalPages}</span>
                    <div className="flex gap-2">
                      <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded-lg border disabled:opacity-40"><ChevronLeft size={14} /></button>
                      <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1.5 rounded-lg border disabled:opacity-40"><ChevronRight size={14} /></button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
