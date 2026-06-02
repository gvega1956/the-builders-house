'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { brand } from '@/lib/brand';
import {
  ArrowLeftRight, Package, Send, Clock,
  CheckCircle, AlertCircle, ChevronRight,
} from 'lucide-react';

const glass = {
  backgroundColor: 'rgba(255,255,255,0.72)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: '1px solid rgba(255,255,255,0.85)',
  boxShadow: '0 4px 24px rgba(10,22,40,0.07)',
} as React.CSSProperties;

const inputBase =
  'w-full px-3 py-2.5 rounded-lg text-sm border border-slate-200 bg-white/80 ' +
  'focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent transition-all';

export function TransfersClient() {
  const [sku, setSku] = useState('');
  const [fromWarehouse, setFromWarehouse] = useState('');
  const [toWarehouse, setToWarehouse] = useState('');
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: warehouses } = trpc.stock.warehousesSummary.useQuery();
  const { data: history, refetch: refetchHistory } = trpc.movements.list.useQuery({
    movementType: 'TRANSFER',
    pageSize: 30,
  });

  const transfer = trpc.stock.transferStock.useMutation({
    onSuccess: (result) => {
      setSuccess(
        `${result.quantity} unidades de ${result.sku} transferidas: ${result.from} → ${result.to} (Ref: ${result.referenceId})`,
      );
      setError(null);
      setSku('');
      setFromWarehouse('');
      setToWarehouse('');
      setQuantity('');
      setNotes('');
      void refetchHistory();
    },
    onError: (err) => {
      setError(err.message);
      setSuccess(null);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!sku || !fromWarehouse || !toWarehouse || !quantity) return;
    transfer.mutate({
      sku: sku.trim().toUpperCase(),
      fromWarehouseName: fromWarehouse,
      toWarehouseName: toWarehouse,
      quantity: parseInt(quantity, 10),
      notes: notes || undefined,
    });
  }

  // Show only half the transfer movements (OUT side, negative qty) to avoid
  // duplicates — the pair is already implied by the referenceId.
  const transfers = history?.movements.filter((m) => m.quantity < 0) ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: brand.navy[950] }}>
          Transferencias
        </h1>
        <p className="text-sm mt-0.5" style={{ color: '#64748B' }}>
          Mover stock entre almacenes · Cada transferencia registra dos movimientos atómicos en auditoría
        </p>
      </div>

      <div className="grid grid-cols-12 gap-5">

        {/* ── Formulario ── */}
        <div className="col-span-12 lg:col-span-5">
          <div style={glass} className="rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-5">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: brand.orange[50] }}
              >
                <ArrowLeftRight size={18} style={{ color: brand.orange[500] }} />
              </div>
              <div>
                <h2 className="text-sm font-semibold" style={{ color: brand.navy[950] }}>
                  Nueva Transferencia
                </h2>
                <p className="text-xs" style={{ color: '#94A3B8' }}>
                  Solo managers pueden ejecutar transferencias
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* SKU */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#475569' }}>
                  SKU del Producto
                </label>
                <input
                  type="text"
                  value={sku}
                  onChange={(e) => setSku(e.target.value.toUpperCase())}
                  placeholder="VS-L3-4X50-AE"
                  className={inputBase}
                  required
                />
              </div>

              {/* Origen → Destino */}
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="block text-xs font-medium mb-1.5" style={{ color: '#475569' }}>
                    Origen
                  </label>
                  <select
                    value={fromWarehouse}
                    onChange={(e) => setFromWarehouse(e.target.value)}
                    className={inputBase}
                    required
                  >
                    <option value="">Seleccionar...</option>
                    {warehouses?.map((wh) => (
                      <option key={wh.id} value={wh.name} disabled={wh.name === toWarehouse}>
                        {wh.name} ({wh.totalUnits} u.)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mb-1.5 shrink-0">
                  <ChevronRight size={18} style={{ color: '#CBD5E1' }} />
                </div>

                <div className="flex-1">
                  <label className="block text-xs font-medium mb-1.5" style={{ color: '#475569' }}>
                    Destino
                  </label>
                  <select
                    value={toWarehouse}
                    onChange={(e) => setToWarehouse(e.target.value)}
                    className={inputBase}
                    required
                  >
                    <option value="">Seleccionar...</option>
                    {warehouses?.map((wh) => (
                      <option key={wh.id} value={wh.name} disabled={wh.name === fromWarehouse}>
                        {wh.name} ({wh.totalUnits} u.)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Cantidad */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#475569' }}>
                  Cantidad
                </label>
                <input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="0"
                  className={inputBase}
                  required
                />
              </div>

              {/* Notas */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#475569' }}>
                  Notas <span style={{ color: '#94A3B8' }}>(opcional)</span>
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Motivo del traslado..."
                  rows={2}
                  maxLength={500}
                  className={inputBase}
                />
              </div>

              {/* Feedback */}
              {error && (
                <div
                  className="flex items-start gap-2 p-3 rounded-lg text-xs"
                  style={{ backgroundColor: '#FEF2F2', color: brand.semantic.danger }}
                >
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
              {success && (
                <div
                  className="flex items-start gap-2 p-3 rounded-lg text-xs"
                  style={{ backgroundColor: '#F0FDF4', color: brand.semantic.success }}
                >
                  <CheckCircle size={14} className="shrink-0 mt-0.5" />
                  <span>{success}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={
                  transfer.isPending ||
                  !sku || !fromWarehouse || !toWarehouse || !quantity ||
                  fromWarehouse === toWarehouse
                }
                className="w-full py-2.5 px-4 rounded-lg text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: brand.orange[500] }}
                onMouseEnter={(e) => {
                  if (!transfer.isPending) e.currentTarget.style.backgroundColor = brand.orange[600];
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = brand.orange[500];
                }}
              >
                <Send size={14} />
                {transfer.isPending ? 'Procesando...' : 'Ejecutar Transferencia'}
              </button>

              {fromWarehouse && toWarehouse && fromWarehouse === toWarehouse && (
                <p className="text-xs text-center" style={{ color: brand.semantic.warning }}>
                  El origen y destino no pueden ser el mismo almacén
                </p>
              )}
            </form>
          </div>
        </div>

        {/* ── Historial ── */}
        <div className="col-span-12 lg:col-span-7">
          <div style={glass} className="rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-5">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: '#F1F5F9' }}
              >
                <Clock size={18} style={{ color: brand.navy[700] }} />
              </div>
              <div>
                <h2 className="text-sm font-semibold" style={{ color: brand.navy[950] }}>
                  Historial de Transferencias
                </h2>
                <p className="text-xs" style={{ color: '#94A3B8' }}>
                  Últimas 30 transferencias · {transfers.length} registradas
                </p>
              </div>
            </div>

            {transfers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <Package size={36} style={{ color: '#CBD5E1' }} />
                <p className="text-sm" style={{ color: '#94A3B8' }}>
                  No hay transferencias registradas
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                      <th className="text-left py-2 px-2 font-semibold" style={{ color: '#64748B' }}>Producto</th>
                      <th className="text-center py-2 px-2 font-semibold" style={{ color: '#64748B' }}>Cant.</th>
                      <th className="text-left py-2 px-2 font-semibold" style={{ color: '#64748B' }}>Origen</th>
                      <th className="text-left py-2 px-2 font-semibold" style={{ color: '#64748B' }}>Referencia</th>
                      <th className="text-left py-2 px-2 font-semibold" style={{ color: '#64748B' }}>Usuario</th>
                      <th className="text-left py-2 px-2 font-semibold" style={{ color: '#64748B' }}>Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transfers.map((m) => (
                      <tr
                        key={m.id}
                        className="hover:bg-slate-50/60 transition-colors"
                        style={{ borderBottom: '1px solid #F1F5F9' }}
                      >
                        <td className="py-2.5 px-2">
                          <div className="font-medium" style={{ color: brand.navy[950] }}>
                            {m.product.name}
                          </div>
                          <div style={{ color: '#94A3B8', fontFamily: 'monospace', fontSize: '10px' }}>
                            {m.product.sku}
                          </div>
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <span
                            className="px-2 py-0.5 rounded-md font-bold"
                            style={{
                              backgroundColor: '#FEF2F2',
                              color: brand.semantic.danger,
                            }}
                          >
                            {m.quantity}
                          </span>
                        </td>
                        <td className="py-2.5 px-2">
                          <div style={{ color: brand.navy[800] }}>{m.location.warehouse.name}</div>
                          <div style={{ color: '#94A3B8' }}>{m.location.locationCode}</div>
                        </td>
                        <td className="py-2.5 px-2">
                          <span
                            className="px-1.5 py-0.5 rounded text-[10px] font-mono"
                            style={{ backgroundColor: '#F1F5F9', color: '#475569' }}
                          >
                            {m.referenceId ?? '—'}
                          </span>
                        </td>
                        <td className="py-2.5 px-2" style={{ color: '#64748B' }}>
                          {m.user.name ?? m.user.email}
                        </td>
                        <td className="py-2.5 px-2" style={{ color: '#94A3B8' }}>
                          {new Date(m.createdAt).toLocaleDateString('es-PR', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
