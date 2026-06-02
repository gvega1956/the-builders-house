'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { brand } from '@/lib/brand';
import { glass } from '@/lib/ui';
import { calculateAvailableStock } from '@/lib/inventory';
import {
  ArrowLeftRight, Plus, Trash2, Send, Clock,
  CheckCircle, AlertCircle, Package, X, ChevronRight,
  Truck, XCircle, History,
} from 'lucide-react';

const inputCls =
  'w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none ' +
  'focus:ring-2 focus:ring-orange-400 focus:border-transparent transition-all bg-white/80';

type Tab  = 'create' | 'pending';
type Line = { productId: string; quantity: string };

const BLANK_LINE: Line = { productId: '', quantity: '1' };

const STATUS_BADGE = {
  PENDING:   { bg: '#FEF9C3', text: '#854D0E',  label: 'Pendiente'  },
  CONFIRMED: { bg: '#F0FDF4', text: '#166534',  label: 'Confirmada' },
  CANCELLED: { bg: '#F8FAFC', text: '#94A3B8',  label: 'Cancelada'  },
} as const;

export function TransfersClient() {
  // ── Tabs ─────────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<Tab>('create');

  // ── Vista 1: Crear ───────────────────────────────────────────────────────
  const [fromWhId,      setFromWhId]      = useState('');
  const [toWhId,        setToWhId]        = useState('');
  const [lines,         setLines]         = useState<Line[]>([{ ...BLANK_LINE }]);
  const [reason,        setReason]        = useState('');
  const [createError,   setCreateError]   = useState('');
  const [createSuccess, setCreateSuccess] = useState('');

  // ── Vista 2: Pendientes ──────────────────────────────────────────────────
  const [viewWhId,      setViewWhId]      = useState('');
  const [confirmingId,  setConfirmingId]  = useState<string | null>(null);
  const [cancellingId,  setCancellingId]  = useState<string | null>(null);
  const [cancelReason,  setCancelReason]  = useState('');
  const [actionError,   setActionError]   = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: warehouses }    = trpc.stock.warehousesSummary.useQuery();
  const { data: allWarehouses } = trpc.settings.warehouses.useQuery();
  const { data: productsData }  = trpc.products.list.useQuery({ pageSize: 500 });

  // Pending list — filtered in client by warehouse (v1: low volume, 2 warehouses)
  const { data: pendingData } = trpc.transfers.list.useQuery(
    { status: 'PENDING', pageSize: 100 },
  );
  // History (last 20, all statuses) — filtered in client by warehouse
  const { data: historyData } = trpc.transfers.list.useQuery({ pageSize: 20 });

  const utils = trpc.useUtils();

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createMut = trpc.transfers.create.useMutation({
    onSuccess: (t) => {
      setCreateSuccess(
        `Transferencia ${t.transferNumber} creada. En tránsito hasta que ${t.toWarehouse.name} confirme la recepción.`,
      );
      setCreateError('');
      setFromWhId('');
      setToWhId('');
      setLines([{ ...BLANK_LINE }]);
      setReason('');
      void utils.transfers.list.invalidate();
    },
    onError: (e) => { setCreateError(e.message); setCreateSuccess(''); },
  });

  const confirmMut = trpc.transfers.confirm.useMutation({
    onSuccess: (t) => {
      setActionSuccess(`Transferencia ${t.transferNumber} confirmada. Stock físico actualizado.`);
      setActionError('');
      setConfirmingId(null);
      void utils.transfers.list.invalidate();
    },
    onError: (e) => { setActionError(e.message); setActionSuccess(''); },
  });

  const cancelMut = trpc.transfers.cancel.useMutation({
    onSuccess: () => {
      setActionSuccess('Transferencia cancelada. Reserva de stock liberada en el almacén origen.');
      setActionError('');
      setCancellingId(null);
      setCancelReason('');
      void utils.transfers.list.invalidate();
    },
    onError: (e) => { setActionError(e.message); setActionSuccess(''); },
  });

  // ── Helpers ───────────────────────────────────────────────────────────────
  const productsList  = productsData?.products ?? [];

  // Default to first warehouse (mirrors /warehouse page pattern)
  const effectiveViewWhId = viewWhId || (warehouses?.[0]?.id ?? '');
  const selectedWhName    = warehouses?.find((w) => w.id === effectiveViewWhId)?.name ?? '';

  // Returns { quantityOnHand, reservedQuantity } for a product at the selected origin warehouse.
  // settings.warehouses uses `include: { locations: ... }` — Prisma returns ALL scalar fields,
  // including reservedQuantity. The cast here just makes that explicit.
  function stockAtOrigin(productId: string): { quantityOnHand: number; reservedQuantity: number } | null {
    if (!fromWhId || !allWarehouses) return null;
    const wh = allWarehouses.find((w) => w.id === fromWhId);
    if (!wh) return null;
    const locs = wh.locations as unknown as Array<{
      productId: string;
      quantityOnHand: number;
      reservedQuantity: number;
    }>;
    const loc = locs.find((l) => l.productId === productId);
    if (!loc) return null;
    return { quantityOnHand: loc.quantityOnHand, reservedQuantity: loc.reservedQuantity };
  }

  // Line management
  function addLine()                                          { setLines((p) => [...p, { ...BLANK_LINE }]); }
  function removeLine(idx: number)                            { setLines((p) => p.filter((_, i) => i !== idx)); }
  function updateLine(idx: number, k: keyof Line, v: string) { setLines((p) => p.map((l, i) => i === idx ? { ...l, [k]: v } : l)); }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError('');
    if (!fromWhId || !toWhId)       { setCreateError('Selecciona almacén origen y destino.'); return; }
    if (fromWhId === toWhId)         { setCreateError('Origen y destino no pueden ser el mismo almacén.'); return; }
    const valid = lines.filter((l) => l.productId && parseInt(l.quantity) > 0);
    if (valid.length === 0)          { setCreateError('Agrega al menos una línea con producto y cantidad.'); return; }
    createMut.mutate({
      fromWarehouseId: fromWhId,
      toWarehouseId:   toWhId,
      lines: valid.map((l) => ({ productId: l.productId, quantity: parseInt(l.quantity) })),
      reason: reason || undefined,
    });
  }

  function switchTab(t: Tab) {
    setTab(t);
    setCreateError(''); setCreateSuccess('');
    setActionError(''); setActionSuccess('');
    setConfirmingId(null); setCancellingId(null); setCancelReason('');
  }

  // Vista 2 — client-side filtering by selected warehouse
  const allPending    = pendingData?.transfers ?? [];
  const incoming      = allPending.filter((t) => t.toWarehouseId   === effectiveViewWhId);
  const outgoing      = allPending.filter((t) => t.fromWarehouseId === effectiveViewWhId);
  const recentHistory = (historyData?.transfers ?? [])
    .filter((t) => t.status !== 'PENDING' && (t.fromWarehouseId === effectiveViewWhId || t.toWarehouseId === effectiveViewWhId))
    .slice(0, 8);

  const anyMutPending = confirmMut.isPending || cancelMut.isPending;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: brand.navy[950] }}>Transferencias</h1>
        <p className="text-sm mt-0.5" style={{ color: '#64748B' }}>
          Traslado de stock en dos fases · El almacén destino confirma la recepción física
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ backgroundColor: 'rgba(10,22,40,0.06)' }}>
        {([
          { key: 'create',  label: 'Crear transferencia' },
          { key: 'pending', label: 'Pendientes de confirmar' },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => switchTab(key)}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={
              tab === key
                ? { backgroundColor: '#fff', color: brand.navy[950], boxShadow: '0 1px 4px rgba(10,22,40,0.10)' }
                : { color: '#64748B' }
            }
          >
            {label}
            {key === 'pending' && allPending.length > 0 && (
              <span
                className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                style={{ backgroundColor: brand.orange[500], color: '#fff' }}
              >
                {allPending.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════
          VISTA 1 — CREAR TRANSFERENCIA
          ════════════════════════════════════════════════════════════ */}
      {tab === 'create' && (
        <div className="grid grid-cols-12 gap-5">

          {/* Form */}
          <div className="col-span-12 lg:col-span-7">
            <div style={glass} className="rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: brand.orange[50] }}>
                  <ArrowLeftRight size={18} style={{ color: brand.orange[500] }} />
                </div>
                <div>
                  <h2 className="text-sm font-semibold" style={{ color: brand.navy[950] }}>Nueva Transferencia</h2>
                  <p className="text-xs" style={{ color: '#94A3B8' }}>
                    Queda PENDIENTE — el stock se mueve cuando el destino confirma la recepción
                  </p>
                </div>
              </div>

              <form onSubmit={handleCreate} className="space-y-5">

                {/* Origen → Destino */}
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-medium mb-1.5" style={{ color: '#475569' }}>
                      Almacén Origen
                    </label>
                    <select
                      value={fromWhId}
                      onChange={(e) => { setFromWhId(e.target.value); setCreateError(''); }}
                      className={inputCls}
                      required
                    >
                      <option value="">Seleccionar...</option>
                      {warehouses?.map((w) => (
                        <option key={w.id} value={w.id} disabled={w.id === toWhId}>
                          {w.name} ({w.totalUnits} u.)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="mb-3 shrink-0">
                    <ChevronRight size={18} style={{ color: '#CBD5E1' }} />
                  </div>

                  <div className="flex-1">
                    <label className="block text-xs font-medium mb-1.5" style={{ color: '#475569' }}>
                      Almacén Destino
                    </label>
                    <select
                      value={toWhId}
                      onChange={(e) => { setToWhId(e.target.value); setCreateError(''); }}
                      className={inputCls}
                      required
                    >
                      <option value="">Seleccionar...</option>
                      {warehouses?.map((w) => (
                        <option key={w.id} value={w.id} disabled={w.id === fromWhId}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Líneas de producto */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold" style={{ color: brand.navy[700] }}>
                      Productos a transferir
                    </label>
                    <button
                      type="button"
                      onClick={addLine}
                      className="flex items-center gap-1 text-xs font-medium transition-colors"
                      style={{ color: brand.orange[500] }}
                    >
                      <Plus size={13} /> Agregar línea
                    </button>
                  </div>

                  <div className="space-y-2">
                    {lines.map((line, idx) => {
                      const locData    = line.productId ? stockAtOrigin(line.productId) : null;
                      const available  = locData !== null ? calculateAvailableStock(locData) : null;
                      const qty        = parseInt(line.quantity) || 0;
                      const overStock  = fromWhId && available !== null && qty > available;
                      const noLocation = fromWhId && line.productId && locData === null;

                      return (
                        <div
                          key={idx}
                          className="flex items-start gap-2 p-3 rounded-xl"
                          style={{ backgroundColor: 'rgba(248,250,252,0.8)', border: '1px solid #E2E8F0' }}
                        >
                          <div className="flex-1">
                            <select
                              value={line.productId}
                              onChange={(e) => updateLine(idx, 'productId', e.target.value)}
                              className={inputCls}
                              required
                            >
                              <option value="">Seleccionar producto...</option>
                              {productsList.map((p) => (
                                <option
                                  key={p.id}
                                  value={p.id}
                                  disabled={lines.some((l, i) => i !== idx && l.productId === p.id)}
                                >
                                  {p.sku} — {p.name}
                                </option>
                              ))}
                            </select>

                            {/* Stock hint */}
                            {fromWhId && line.productId && (
                              <p className="text-[11px] mt-1" style={{
                                color: overStock ? brand.semantic.danger : noLocation ? brand.semantic.warning : '#64748B',
                              }}>
                                {noLocation
                                  ? '⚠ Este producto no tiene ubicación en el almacén origen'
                                  : overStock
                                    ? `⚠ Excede el disponible en origen (${available} u. disponibles, ${locData?.quantityOnHand} en inventario)`
                                    : `Disponible en origen: ${available} u.`}
                              </p>
                            )}
                          </div>

                          {/* Cantidad */}
                          <div style={{ width: 80 }}>
                            <input
                              type="number"
                              min="1"
                              value={line.quantity}
                              onChange={(e) => updateLine(idx, 'quantity', e.target.value)}
                              className={inputCls}
                              style={overStock ? { borderColor: brand.semantic.danger } : {}}
                              required
                            />
                          </div>

                          {lines.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeLine(idx)}
                              className="mt-1 p-1.5 rounded-lg transition-colors"
                              style={{ color: '#CBD5E1' }}
                              onMouseEnter={(e) => { e.currentTarget.style.color = brand.semantic.danger; }}
                              onMouseLeave={(e) => { e.currentTarget.style.color = '#CBD5E1'; }}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Motivo */}
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: '#475569' }}>
                    Motivo <span style={{ color: '#94A3B8' }}>(opcional)</span>
                  </label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Ej: reposición por demanda, reorganización de stock..."
                    rows={2}
                    maxLength={500}
                    className={inputCls}
                  />
                </div>

                {/* Feedback */}
                {createError && (
                  <div className="flex items-start gap-2 p-3 rounded-lg text-xs" style={{ backgroundColor: '#FEF2F2', color: brand.semantic.danger }}>
                    <AlertCircle size={14} className="shrink-0 mt-0.5" /> <span>{createError}</span>
                  </div>
                )}
                {createSuccess && (
                  <div className="flex items-start gap-2 p-3 rounded-lg text-xs" style={{ backgroundColor: '#F0FDF4', color: brand.semantic.success }}>
                    <CheckCircle size={14} className="shrink-0 mt-0.5" /> <span>{createSuccess}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={
                    createMut.isPending ||
                    !fromWhId || !toWhId || fromWhId === toWhId ||
                    lines.every((l) => !l.productId)
                  }
                  className="w-full py-2.5 px-4 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ backgroundColor: brand.orange[500] }}
                  onMouseEnter={(e) => { if (!createMut.isPending) e.currentTarget.style.backgroundColor = brand.orange[600]; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = brand.orange[500]; }}
                >
                  <Send size={14} />
                  {createMut.isPending ? 'Creando...' : 'Crear transferencia'}
                </button>
              </form>
            </div>
          </div>

          {/* Info sidebar */}
          <div className="col-span-12 lg:col-span-5">
            <div style={glass} className="rounded-2xl p-5">
              <h3 className="text-xs font-semibold mb-4" style={{ color: brand.navy[700] }}>Flujo de transferencia</h3>
              <div className="space-y-4">
                {[
                  {
                    Icon: Send,
                    step: '1. Crear',
                    desc: 'El origen crea la orden. El stock queda reservado pero no sale físicamente del almacén.',
                  },
                  {
                    Icon: Truck,
                    step: '2. En tránsito',
                    desc: 'La transferencia queda PENDIENTE. El destino la ve en "Pendientes de confirmar".',
                  },
                  {
                    Icon: CheckCircle,
                    step: '3. Confirmar',
                    desc: 'Solo el almacén destino confirma la llegada. El stock físico se mueve en ese momento.',
                  },
                ].map(({ Icon, step, desc }) => (
                  <div key={step} className="flex gap-3">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: brand.orange[50] }}>
                      <Icon size={14} style={{ color: brand.orange[500] }} />
                    </div>
                    <div>
                      <p className="text-xs font-semibold" style={{ color: brand.navy[900] }}>{step}</p>
                      <p className="text-[11px] mt-0.5" style={{ color: '#64748B' }}>{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          VISTA 2 — PENDIENTES DE CONFIRMAR
          ════════════════════════════════════════════════════════════ */}
      {tab === 'pending' && (
        <div className="space-y-5">

          {/* Selector de almacén */}
          <div style={glass} className="rounded-2xl p-4 flex flex-wrap items-center gap-3">
            <Truck size={15} style={{ color: brand.navy[700], flexShrink: 0 }} />
            <span className="text-sm font-medium" style={{ color: brand.navy[800] }}>
              Confirmando llegadas a:
            </span>
            <select
              value={effectiveViewWhId}
              onChange={(e) => {
                setViewWhId(e.target.value);
                setConfirmingId(null);
                setCancellingId(null);
                setActionError('');
                setActionSuccess('');
              }}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-orange-400 bg-white/80"
              style={{ minWidth: 180 }}
            >
              {warehouses?.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
            {incoming.length > 0 && (
              <span
                className="px-2.5 py-0.5 rounded-full text-xs font-bold"
                style={{ backgroundColor: brand.orange[500], color: '#fff' }}
              >
                {incoming.length} pendiente{incoming.length > 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Action feedback banner */}
          {actionError && (
            <div className="flex items-start gap-2 p-3 rounded-xl text-xs" style={{ backgroundColor: '#FEF2F2', color: brand.semantic.danger }}>
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <span className="flex-1">{actionError}</span>
              <button onClick={() => setActionError('')}><X size={12} /></button>
            </div>
          )}
          {actionSuccess && (
            <div className="flex items-start gap-2 p-3 rounded-xl text-xs" style={{ backgroundColor: '#F0FDF4', color: brand.semantic.success }}>
              <CheckCircle size={14} className="shrink-0 mt-0.5" />
              <span className="flex-1">{actionSuccess}</span>
              <button onClick={() => setActionSuccess('')}><X size={12} /></button>
            </div>
          )}

          {/* ── Entrantes (accionables) ── */}
          <div>
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: brand.navy[900] }}>
              <Package size={15} style={{ color: brand.orange[500] }} />
              Entrantes — pendientes de confirmación
            </h2>

            {incoming.length === 0 ? (
              <div style={glass} className="rounded-2xl flex flex-col items-center justify-center py-10 gap-2">
                <Package size={32} style={{ color: '#CBD5E1' }} />
                <p className="text-sm" style={{ color: '#94A3B8' }}>
                  No hay transferencias entrantes para {selectedWhName || 'este almacén'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {incoming.map((t) => (
                  <div key={t.id} style={glass} className="rounded-2xl p-5">

                    {/* Transfer header */}
                    <div className="mb-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-xs font-bold" style={{ color: brand.navy[700] }}>
                          {t.transferNumber}
                        </span>
                        <span
                          className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                          style={{ backgroundColor: STATUS_BADGE.PENDING.bg, color: STATUS_BADGE.PENDING.text }}
                        >
                          {STATUS_BADGE.PENDING.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="font-medium" style={{ color: brand.navy[800] }}>{t.fromWarehouse.name}</span>
                        <ChevronRight size={11} style={{ color: '#CBD5E1' }} />
                        <span className="font-medium" style={{ color: brand.orange[500] }}>{t.toWarehouse.name}</span>
                      </div>
                      <p className="text-[11px] mt-0.5" style={{ color: '#94A3B8' }}>
                        Creada por {t.createdBy.name ?? '—'} ·{' '}
                        {new Date(t.createdAt).toLocaleDateString('es-PR', {
                          day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                        })}
                      </p>
                      {t.reason && (
                        <p className="text-[11px] mt-0.5 italic" style={{ color: '#64748B' }}>"{t.reason}"</p>
                      )}
                    </div>

                    {/* Lines */}
                    <div className="space-y-1.5 mb-4">
                      {t.lines.map((l) => (
                        <div
                          key={l.id}
                          className="flex items-center justify-between px-3 py-2 rounded-lg"
                          style={{ backgroundColor: 'rgba(248,250,252,0.8)' }}
                        >
                          <div>
                            <span className="text-xs font-medium" style={{ color: brand.navy[900] }}>
                              {l.product.name}
                            </span>
                            <span
                              className="ml-2 text-[10px] font-mono"
                              style={{ color: '#94A3B8' }}
                            >
                              {l.product.sku}
                            </span>
                          </div>
                          <span
                            className="text-xs font-bold px-2 py-0.5 rounded-md"
                            style={{ backgroundColor: brand.orange[50], color: brand.orange[600] }}
                          >
                            {l.quantity} u.
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Inline confirm panel */}
                    {confirmingId === t.id ? (
                      <div
                        className="p-4 rounded-xl"
                        style={{ border: `1px solid ${brand.orange[400]}`, backgroundColor: brand.orange[50] }}
                      >
                        <p className="text-xs font-medium mb-3" style={{ color: brand.navy[900] }}>
                          ¿Confirmar recepción de {t.lines.length} línea{t.lines.length > 1 ? 's' : ''} en{' '}
                          <strong>{t.toWarehouse.name}</strong>?
                          <br />
                          <span style={{ color: '#64748B', fontWeight: 400 }}>
                            El stock físico se moverá en este momento. Esta acción no se puede deshacer.
                          </span>
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => confirmMut.mutate({ id: t.id })}
                            disabled={confirmMut.isPending}
                            className="flex-1 py-2 px-3 rounded-lg text-xs font-semibold text-white flex items-center justify-center gap-1.5 disabled:opacity-50 transition-colors"
                            style={{ backgroundColor: brand.semantic.success }}
                          >
                            <CheckCircle size={13} />
                            {confirmMut.isPending ? 'Confirmando...' : 'Sí, confirmar recepción'}
                          </button>
                          <button
                            onClick={() => setConfirmingId(null)}
                            disabled={confirmMut.isPending}
                            className="px-4 py-2 rounded-lg text-xs font-medium transition-colors"
                            style={{ backgroundColor: '#F1F5F9', color: '#475569' }}
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : cancellingId === t.id ? (
                      /* Inline cancel/reject panel */
                      <div
                        className="p-4 rounded-xl"
                        style={{ border: '1px solid #FECACA', backgroundColor: '#FEF2F2' }}
                      >
                        <p className="text-xs font-medium mb-2" style={{ color: brand.navy[900] }}>
                          Motivo del rechazo / cancelación:
                        </p>
                        <textarea
                          value={cancelReason}
                          onChange={(e) => setCancelReason(e.target.value)}
                          placeholder="Ej: mercancía no llegó, error en la orden, cantidad incorrecta..."
                          rows={2}
                          className={`${inputCls} mb-3`}
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              if (!cancelReason.trim()) {
                                setActionError('El motivo es obligatorio para cancelar.');
                                return;
                              }
                              cancelMut.mutate({ id: t.id, reason: cancelReason });
                            }}
                            disabled={cancelMut.isPending || !cancelReason.trim()}
                            className="flex-1 py-2 px-3 rounded-lg text-xs font-semibold text-white flex items-center justify-center gap-1.5 disabled:opacity-50 transition-colors"
                            style={{ backgroundColor: brand.semantic.danger }}
                          >
                            <XCircle size={13} />
                            {cancelMut.isPending ? 'Cancelando...' : 'Cancelar transferencia'}
                          </button>
                          <button
                            onClick={() => { setCancellingId(null); setCancelReason(''); }}
                            disabled={cancelMut.isPending}
                            className="px-4 py-2 rounded-lg text-xs font-medium"
                            style={{ backgroundColor: '#F1F5F9', color: '#475569' }}
                          >
                            Volver
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Default action buttons */
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setConfirmingId(t.id);
                            setCancellingId(null);
                            setActionError('');
                          }}
                          disabled={anyMutPending}
                          className="flex-1 py-2 px-3 rounded-lg text-xs font-semibold text-white flex items-center justify-center gap-1.5 disabled:opacity-50 transition-colors"
                          style={{ backgroundColor: brand.semantic.success }}
                          onMouseEnter={(e) => { if (!anyMutPending) e.currentTarget.style.backgroundColor = '#047857'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = brand.semantic.success; }}
                        >
                          <CheckCircle size={13} /> Confirmar recepción
                        </button>
                        <button
                          onClick={() => {
                            setCancellingId(t.id);
                            setConfirmingId(null);
                            setCancelReason('');
                            setActionError('');
                          }}
                          disabled={anyMutPending}
                          className="px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50 transition-colors"
                          style={{ backgroundColor: '#FEF2F2', color: brand.semantic.danger }}
                          onMouseEnter={(e) => { if (!anyMutPending) e.currentTarget.style.backgroundColor = '#FEE2E2'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#FEF2F2'; }}
                        >
                          <XCircle size={13} /> Rechazar
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Salientes (solo lectura) ── */}
          {outgoing.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: brand.navy[900] }}>
                <Truck size={15} style={{ color: brand.navy[600] }} />
                En tránsito — esperando confirmación del destino
              </h2>
              <div className="space-y-2">
                {outgoing.map((t) => (
                  <div
                    key={t.id}
                    style={glass}
                    className="rounded-2xl p-4 flex items-center gap-4"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-mono text-xs font-bold" style={{ color: brand.navy[700] }}>
                          {t.transferNumber}
                        </span>
                        <ChevronRight size={11} style={{ color: '#CBD5E1' }} />
                        <span className="text-xs font-medium" style={{ color: brand.navy[700] }}>
                          {t.toWarehouse.name}
                        </span>
                      </div>
                      <p className="text-[11px] truncate" style={{ color: '#94A3B8' }}>
                        {t.lines.length} línea{t.lines.length > 1 ? 's' : ''} ·{' '}
                        {t.lines.map((l) => `${l.quantity} ${l.product.sku}`).join(', ')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Clock size={13} style={{ color: '#94A3B8' }} />
                      <span
                        className="px-2.5 py-1 rounded-full text-[10px] font-semibold"
                        style={{ backgroundColor: '#FEF9C3', color: '#854D0E' }}
                      >
                        Pendiente
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[11px] mt-2 ml-1" style={{ color: '#94A3B8' }}>
                Solo el almacén destino puede confirmar o rechazar estas transferencias.
              </p>
            </div>
          )}

          {/* ── Historial reciente ── */}
          {recentHistory.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: brand.navy[900] }}>
                <History size={15} style={{ color: '#94A3B8' }} />
                Historial reciente de {selectedWhName}
              </h2>
              <div style={glass} className="rounded-2xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ borderBottom: '1px solid #E2E8F0', backgroundColor: 'rgba(248,250,252,0.6)' }}>
                      {['Número', 'Rol', 'Contraparte', 'Líneas', 'Estado', 'Fecha'].map((h) => (
                        <th key={h} className="text-left py-2.5 px-4 font-semibold" style={{ color: '#64748B' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {recentHistory.map((t) => {
                      const isFrom     = t.fromWarehouseId === effectiveViewWhId;
                      const badge      = STATUS_BADGE[t.status as keyof typeof STATUS_BADGE];
                      const counterpart = isFrom ? t.toWarehouse.name : t.fromWarehouse.name;
                      return (
                        <tr
                          key={t.id}
                          className="hover:bg-slate-50/60 transition-colors"
                          style={{ borderBottom: '1px solid #F1F5F9' }}
                        >
                          <td className="py-2.5 px-4 font-mono font-bold" style={{ color: brand.navy[800] }}>
                            {t.transferNumber}
                          </td>
                          <td className="py-2.5 px-4" style={{ color: '#64748B' }}>
                            {isFrom ? 'Origen' : 'Destino'}
                          </td>
                          <td className="py-2.5 px-4" style={{ color: '#64748B' }}>
                            {counterpart}
                          </td>
                          <td className="py-2.5 px-4 text-center" style={{ color: '#64748B' }}>
                            {t.lines.length}
                          </td>
                          <td className="py-2.5 px-4">
                            <span
                              className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                              style={{ backgroundColor: badge?.bg, color: badge?.text }}
                            >
                              {badge?.label ?? t.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-4" style={{ color: '#94A3B8' }}>
                            {new Date(t.createdAt).toLocaleDateString('es-PR', {
                              day: 'numeric', month: 'short',
                            })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
