'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { brand } from '@/lib/brand';
import { formatDate } from '@/lib/utils';
import { glass } from '@/lib/ui';
import {
  PackagePlus, Search, CheckCircle, AlertCircle,
  History, ArrowDown, X, ChevronLeft, ChevronRight,
} from 'lucide-react';

const inputCls =
  'w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none ' +
  'focus:ring-2 focus:ring-orange-400 focus:border-transparent transition-all bg-white/80';

const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  IN: 'Entrada', OUT: 'Salida', TRANSFER: 'Transferencia',
  ADJUSTMENT: 'Ajuste', RETURN: 'Devolución', DAMAGE: 'Daño',
};

export function ReceiveClient() {
  // Form state
  const [productId, setProductId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // History pagination
  const [page, setPage] = useState(1);

  // Data
  const { data: products } = trpc.products.list.useQuery({ pageSize: 500 });
  const { data: warehouses } = trpc.settings.warehouses.useQuery();
  const { data: history, refetch: refetchHistory } = trpc.movements.list.useQuery({
    movementType: 'IN',
    page,
    pageSize: 20,
  });

  const receiveMutation = trpc.movements.create.useMutation({
    onSuccess: () => {
      const prod = products?.products.find((p) => p.id === productId);
      const loc = allLocations.find((l) => l.id === locationId);
      const wh = warehouses?.find((w) => w.id === warehouseId);
      setSuccess(
        `${quantity} unidades de ${prod?.name ?? '—'} recibidas en ${loc?.label ?? wh?.name ?? '—'}`,
      );
      setError(null);
      setProductId('');
      setLocationId('');
      setWarehouseId('');
      setQuantity('');
      setNotes('');
      void refetchHistory();
    },
    onError: (e) => { setError(e.message); setSuccess(null); },
  });

  // Flatten all locations across warehouses
  const allLocations = warehouses?.flatMap((w) =>
    (w.locations as unknown as Array<{
      id: string; locationCode: string; quantityOnHand: number; productId: string;
    }>).map((l) => ({
      id: l.id,
      label: `${w.name} — ${l.locationCode}`,
      warehouseName: w.name,
      productId: l.productId,
      quantityOnHand: l.quantityOnHand,
    }))
  ) ?? [];

  // Filter locations by selected product
  const availableLocations = productId
    ? allLocations.filter((l) => l.productId === productId)
    : [];

  const filteredProducts = (products?.products ?? []).filter((p) =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase())
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!productId || (!locationId && !warehouseId) || !quantity) return;
    receiveMutation.mutate({
      productId,
      ...(locationId ? { locationId } : { warehouseId }),
      movementType: 'IN',
      quantity: parseInt(quantity, 10),
      referenceType: 'DIRECT_RECEIPT',
      notes: notes || undefined,
    });
  }

  const movements = history?.movements ?? [];
  const totalPages = Math.ceil((history?.total ?? 0) / 20);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: brand.navy[950] }}>Recibir Mercancía</h1>
        <p className="text-sm mt-0.5" style={{ color: '#64748B' }}>
          Registra entradas de stock directas — con OC o sin OC (ej: muestra, ajuste de apertura, devolución de proveedor)
        </p>
      </div>

      <div className="grid grid-cols-12 gap-5">
        {/* ── Formulario ── */}
        <div className="col-span-12 lg:col-span-5">
          <div style={glass} className="rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: brand.orange[50] }}>
                <PackagePlus size={18} style={{ color: brand.orange[500] }} />
              </div>
              <div>
                <h2 className="text-sm font-semibold" style={{ color: brand.navy[950] }}>Nueva Entrada</h2>
                <p className="text-xs" style={{ color: '#94A3B8' }}>Entrada directa de mercancía al inventario</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Búsqueda de producto */}
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>
                  Buscar Producto
                </label>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#94A3B8' }} />
                  <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); setProductId(''); setLocationId(''); }}
                    placeholder="Nombre o SKU..." className={inputCls} style={{ paddingLeft: '2rem' }} />
                </div>
              </div>

              {/* Select producto */}
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>Producto *</label>
                <select value={productId} onChange={(e) => { setProductId(e.target.value); setLocationId(''); }}
                  className={inputCls} required>
                  <option value="">— Seleccionar producto —</option>
                  {filteredProducts.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                  ))}
                </select>
              </div>

              {/* Ubicación destino — muestra ubicaciones específicas si el producto ya tiene stock,
                  de lo contrario muestra almacenes (siempre activo para evitar dropdown bloqueado) */}
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>
                  {productId && availableLocations.length > 0 ? 'Ubicación Destino *' : 'Almacén Destino *'}
                </label>
                {productId && availableLocations.length > 0 ? (
                  <select value={locationId} onChange={(e) => { setLocationId(e.target.value); setWarehouseId(''); }}
                    className={inputCls} required>
                    <option value="">— Seleccionar ubicación —</option>
                    {availableLocations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.label} (actual: {l.quantityOnHand} u.)
                      </option>
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
                <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>Cantidad a Recibir *</label>
                <input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)}
                  placeholder="0" className={inputCls} required />
              </div>

              {/* Notas */}
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>
                  Referencia / Notas <span style={{ color: '#94A3B8' }}>(opcional)</span>
                </label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                  placeholder="Nº de factura del proveedor, motivo, referencia de OC..."
                  rows={2} className={inputCls} style={{ resize: 'none' }} />
              </div>

              {/* Feedback */}
              {error && (
                <div className="flex items-start gap-2 p-3 rounded-xl text-xs" style={{ backgroundColor: '#FEF2F2', color: '#DC2626' }}>
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  <span>{error}</span>
                  <button type="button" onClick={() => setError(null)} className="ml-auto shrink-0"><X size={12} /></button>
                </div>
              )}
              {success && (
                <div className="flex items-start gap-2 p-3 rounded-xl text-xs" style={{ backgroundColor: '#F0FDF4', color: '#16A34A' }}>
                  <CheckCircle size={14} className="shrink-0 mt-0.5" />
                  <span>{success}</span>
                </div>
              )}

              <button type="submit" disabled={receiveMutation.isPending || !productId || (!locationId && !warehouseId) || !quantity}
                className="w-full py-2.5 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 transition-all hover:opacity-90"
                style={{ background: `linear-gradient(135deg, ${brand.orange[500]}, ${brand.orange[600]})` }}>
                <ArrowDown size={14} />
                {receiveMutation.isPending ? 'Registrando...' : 'Registrar Entrada'}
              </button>
            </form>
          </div>
        </div>

        {/* ── Historial de entradas ── */}
        <div className="col-span-12 lg:col-span-7">
          <div style={glass} className="rounded-2xl overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: '1px solid rgba(10,22,40,0.08)' }}>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#F0FDF4' }}>
                <History size={15} style={{ color: '#16A34A' }} />
              </div>
              <div className="flex-1">
                <h2 className="text-sm font-semibold" style={{ color: brand.navy[950] }}>Entradas Registradas</h2>
                <p className="text-xs" style={{ color: '#94A3B8' }}>
                  {history?.total ?? 0} entradas totales
                </p>
              </div>
            </div>

            {movements.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <PackagePlus size={36} style={{ color: '#CBD5E1' }} />
                <p className="text-sm text-slate-400">No hay entradas registradas</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(10,22,40,0.08)' }}>
                        {['Producto', 'Cant.', 'Ubicación', 'Usuario', 'Fecha'].map((h) => (
                          <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: '#94A3B8' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {movements.map((m, i) => (
                        <tr key={m.id} style={{
                          borderBottom: i < movements.length - 1 ? '1px solid rgba(10,22,40,0.05)' : 'none',
                          backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(10,22,40,0.015)',
                        }}>
                          <td className="px-4 py-3">
                            <div className="font-medium text-xs" style={{ color: brand.navy[950] }}>{m.product.name}</div>
                            <div className="font-mono text-[10px]" style={{ color: '#94A3B8' }}>{m.product.sku}</div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="px-2 py-0.5 rounded-full text-xs font-bold"
                              style={{ backgroundColor: '#F0FDF4', color: '#16A34A' }}>
                              +{m.quantity}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs">
                            <div style={{ color: brand.navy[800] }}>{m.location.warehouse.name}</div>
                            <div style={{ color: '#94A3B8' }}>{m.location.locationCode}</div>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500">{m.user.name ?? m.user.email}</td>
                          <td className="px-4 py-3 text-xs text-slate-400">{formatDate(m.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-5 py-3" style={{ borderTop: '1px solid rgba(10,22,40,0.06)' }}>
                    <span className="text-xs text-slate-400">Página {page} / {totalPages}</span>
                    <div className="flex gap-2">
                      <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                        className="p-1.5 rounded-lg border disabled:opacity-40"><ChevronLeft size={14} /></button>
                      <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                        className="p-1.5 rounded-lg border disabled:opacity-40"><ChevronRight size={14} /></button>
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
