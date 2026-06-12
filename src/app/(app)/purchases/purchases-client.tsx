'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { brand } from '@/lib/brand';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Plus, Truck, X, Eye, ChevronRight, ChevronLeft, Package, Pencil } from 'lucide-react';
import { glass } from '@/lib/ui';

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  DRAFT:      { bg: '#F1F5F9', text: '#475569', label: 'Borrador' },
  SENT:       { bg: '#EFF6FF', text: '#1D4ED8', label: 'Enviada' },
  IN_TRANSIT: { bg: '#FEF9C3', text: '#854D0E', label: 'En Tránsito' },
  RECEIVED:   { bg: '#F0FDF4', text: '#166534', label: 'Recibida' },
  CLOSED:     { bg: '#F8FAFC', text: '#94A3B8', label: 'Cerrada' },
};

const STATUS_ORDER: Record<string, string> = {
  DRAFT: 'SENT', SENT: 'IN_TRANSIT', IN_TRANSIT: 'RECEIVED', RECEIVED: 'CLOSED',
};

type POLine = { productId: string; quantityOrdered: string; unitCostUsd: string };

export function PurchasesClient() {
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<'none' | 'create' | 'edit' | 'detail' | 'confirm' | 'receive'>('none');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [confirmAction, setConfirmAction] = useState<{ id: string; currentStatus: string; nextStatus: string } | null>(null);

  // Create / Edit form
  const [editPOId, setEditPOId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [lines, setLines] = useState<POLine[]>([{ productId: '', quantityOrdered: '1', unitCostUsd: '0' }]);
  const [freight, setFreight] = useState('0');
  const [customs, setCustoms] = useState('0');
  const [exchangeRate, setExchangeRate] = useState('');
  const [notes, setNotes] = useState('');

  // Receive form
  const [receiveItems, setReceiveItems] = useState<Record<string, { qty: string; locationId: string }>>({});

  const { data, isLoading, refetch } = trpc.purchases.list.useQuery({
    status: statusFilter as 'DRAFT' | 'SENT' | 'IN_TRANSIT' | 'RECEIVED' | 'CLOSED' | undefined || undefined,
    page,
    pageSize: 20,
  });

  const { data: detail, refetch: refetchDetail } = trpc.purchases.byId.useQuery(
    selectedId ?? '',
    { enabled: !!selectedId && (modal === 'detail' || modal === 'receive') }
  );

  const { data: suppliers } = trpc.settings.suppliers.useQuery();
  const { data: products } = trpc.products.list.useQuery({ pageSize: 500 });
  const { data: warehouses } = trpc.settings.warehouses.useQuery();

  const createMutation = trpc.purchases.create.useMutation({
    onSuccess: () => { refetch(); closeModal(); },
    onError: (e) => setError(e.message),
  });

  const statusMutation = trpc.purchases.updateStatus.useMutation({
    onSuccess: () => { refetch(); refetchDetail(); },
    onError: (e) => setError(e.message),
  });

  const updatePOMutation = trpc.purchases.update.useMutation({
    onSuccess: () => { refetch(); closeModal(); },
    onError: (e) => setError(e.message),
  });

  const receiveMutation = trpc.purchases.receive.useMutation({
    onSuccess: () => { refetch(); refetchDetail(); closeModal(); },
    onError: (e) => setError(e.message),
  });

  function closeModal() {
    setModal('none'); setSelectedId(null); setError(''); setConfirmAction(null);
    setEditPOId('');
    setSupplierId(''); setLines([{ productId: '', quantityOrdered: '1', unitCostUsd: '0' }]);
    setFreight('0'); setCustoms('0'); setExchangeRate(''); setNotes('');
    setReceiveItems({});
  }

  function openReceive(id: string) {
    setSelectedId(id);
    setReceiveItems({});
    setModal('receive');
    setError('');
  }

  function openEditPO(o: typeof orders[0]) {
    setEditPOId(o.id);
    setSelectedId(o.id);
    setSupplierId('');
    setFreight('0');
    setCustoms('0');
    setNotes('');
    setLines([{ productId: '', quantityOrdered: '1', unitCostUsd: '0' }]);
    setModal('edit');
    setError('');
  }

  function submitReceive() {
    if (!selectedId || !detail) return;
    const itemsToReceive = detail.items
      .map((item) => {
        const r = receiveItems[item.id];
        return { itemId: item.id, quantityReceived: parseInt(r?.qty ?? '0') || 0, locationId: r?.locationId ?? '' };
      })
      .filter((r) => r.quantityReceived > 0 && r.locationId);

    if (!itemsToReceive.length) { setError('Ingresa al menos un ítem con cantidad y ubicación'); return; }
    receiveMutation.mutate({ id: selectedId, items: itemsToReceive });
  }

  function submitEditPO() {
    setError('');
    const validLines = lines.filter((l) => l.productId && parseInt(l.quantityOrdered) > 0);
    if (!validLines.length) { setError('Agrega al menos un producto'); return; }
    updatePOMutation.mutate({
      id: editPOId,
      supplierId: supplierId || undefined,
      freightCost: parseFloat(freight) || 0,
      customsCost: parseFloat(customs) || 0,
      exchangeRate: exchangeRate ? parseFloat(exchangeRate) : undefined,
      notes: notes || undefined,
      items: validLines.map((l) => ({
        productId: l.productId,
        quantityOrdered: parseInt(l.quantityOrdered),
        unitCostUsd: parseFloat(l.unitCostUsd),
      })),
    });
  }

  function requestStatusChange(id: string, currentStatus: string, nextStatus: string) {
    setConfirmAction({ id, currentStatus, nextStatus });
    setModal('confirm');
    setError('');
  }

  function confirmStatusChange() {
    if (!confirmAction) return;
    statusMutation.mutate(
      { id: confirmAction.id, status: confirmAction.nextStatus as 'DRAFT' | 'SENT' | 'IN_TRANSIT' | 'RECEIVED' | 'CLOSED' },
      { onSuccess: closeModal }
    );
  }

  function addLine() { setLines(l => [...l, { productId: '', quantityOrdered: '1', unitCostUsd: '0' }]); }

  function updateLine(i: number, field: keyof POLine, value: string) {
    setLines(ls => ls.map((l, idx) => {
      if (idx !== i) return l;
      if (field === 'productId') {
        const p = products?.products.find((p) => p.id === value);
        return { ...l, productId: value, unitCostUsd: p ? String(p.unitCost) : '0' };
      }
      return { ...l, [field]: value };
    }));
  }

  const subtotal = lines.reduce((s, l) => s + (parseInt(l.quantityOrdered) || 0) * (parseFloat(l.unitCostUsd) || 0), 0);
  const landed = subtotal + (parseFloat(freight) || 0) + (parseFloat(customs) || 0);

  function submitCreate() {
    setError('');
    if (!supplierId) { setError('Selecciona un proveedor'); return; }
    const validLines = lines.filter((l) => l.productId && parseInt(l.quantityOrdered) > 0);
    if (!validLines.length) { setError('Agrega al menos un producto'); return; }

    createMutation.mutate({
      supplierId,
      freightCost: parseFloat(freight) || 0,
      customsCost: parseFloat(customs) || 0,
      exchangeRate: exchangeRate ? parseFloat(exchangeRate) : undefined,
      notes: notes || undefined,
      items: validLines.map((l) => ({
        productId: l.productId,
        quantityOrdered: parseInt(l.quantityOrdered),
        unitCostUsd: parseFloat(l.unitCostUsd),
      })),
    });
  }

  const orders = data?.orders ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: brand.navy[950] }}>Compras · RD</h1>
          <p className="text-sm mt-0.5" style={{ color: '#64748B' }}>
            Órdenes de compra República Dominicana → Puerto Rico
          </p>
        </div>
        <button onClick={() => setModal('create')}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90"
          style={{ background: `linear-gradient(135deg, ${brand.orange[500]}, ${brand.orange[600]})` }}>
          <Plus size={16} /> Nueva OC
        </button>
      </div>

      {/* Filters */}
      <div style={glass} className="rounded-2xl p-4 flex gap-3">
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="text-sm px-3 py-2 rounded-xl border bg-white/60 outline-none" style={{ color: brand.navy[800] }}>
          <option value="">Todos los estados</option>
          <option value="DRAFT">Borrador</option>
          <option value="SENT">Enviada</option>
          <option value="IN_TRANSIT">En Tránsito</option>
          <option value="RECEIVED">Recibida</option>
          <option value="CLOSED">Cerrada</option>
        </select>
      </div>

      {/* Table */}
      <div style={glass} className="rounded-2xl overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-slate-400 text-sm">Cargando órdenes...</div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Truck size={40} style={{ color: '#CBD5E1' }} />
            <p className="text-slate-400 text-sm">No se encontraron órdenes de compra</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(10,22,40,0.08)' }}>
                  {['OC #', 'Proveedor', 'País', 'Productos', 'Costo Landed', 'Estado', 'Fecha', ''].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: '#94A3B8' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map((o, i) => {
                  const st = STATUS_STYLES[o.status] ?? STATUS_STYLES.DRAFT!;
                  const next = STATUS_ORDER[o.status];
                  const totalOrdered   = (o.items as Array<{ quantityOrdered: number; quantityReceived: number }>)
                    .reduce((s, it) => s + it.quantityOrdered, 0);
                  const totalReceived  = (o.items as Array<{ quantityOrdered: number; quantityReceived: number }>)
                    .reduce((s, it) => s + it.quantityReceived, 0);
                  const hasPartial     = totalReceived > 0 && totalReceived < totalOrdered;
                  return (
                    <tr key={o.id} style={{
                      borderBottom: i < orders.length - 1 ? '1px solid rgba(10,22,40,0.05)' : 'none',
                      backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(10,22,40,0.015)',
                    }}>
                      <td className="px-4 py-3 font-mono text-xs font-semibold" style={{ color: brand.navy[700] }}>{o.poNumber}</td>
                      <td className="px-4 py-3 font-medium" style={{ color: brand.navy[950] }}>{o.supplier.name}</td>
                      <td className="px-4 py-3 text-slate-500">{o.supplier.country}</td>
                      <td className="px-4 py-3">
                        <div className="text-center" style={{ color: brand.navy[800] }}>{o._count.items}</div>
                        {hasPartial && (
                          <div className="text-[10px] text-center mt-0.5 font-semibold"
                            style={{ color: '#D97706' }}>
                            {totalReceived}/{totalOrdered} u. recibidas
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-semibold" style={{ color: brand.navy[950] }}>{formatCurrency(Number(o.totalLandedCost))}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                          style={{ backgroundColor: st.bg, color: st.text }}>{st.label}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{formatDate(o.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button onClick={() => { setSelectedId(o.id); setModal('detail'); }}
                            className="p-1.5 rounded-lg hover:bg-slate-100" title="Ver detalle">
                            <Eye size={14} style={{ color: brand.navy[600] }} />
                          </button>
                          {o.status === 'DRAFT' && (
                            <button onClick={() => openEditPO(o)}
                              className="p-1.5 rounded-lg hover:bg-blue-50" title="Editar OC">
                              <Pencil size={14} style={{ color: '#2563EB' }} />
                            </button>
                          )}
                          {o.status === 'IN_TRANSIT' && (
                            <button onClick={() => openReceive(o.id)}
                              className="p-1.5 rounded-lg hover:bg-green-50" title="Recibir mercancía">
                              <Package size={14} style={{ color: '#16A34A' }} />
                            </button>
                          )}
                          {next && (
                            <button
                              onClick={() => requestStatusChange(o.id, o.status, next)}
                              className="p-1.5 rounded-lg hover:bg-green-50 text-xs font-medium"
                              title={`Avanzar a ${STATUS_STYLES[next]?.label}`}
                              style={{ color: '#16A34A' }}
                            >
                              <ChevronRight size={14} />
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
          <span>Mostrando {(page - 1) * 20 + 1}–{Math.min(page * 20, total)} de {total}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded-lg border disabled:opacity-40"><ChevronLeft size={16} /></button>
            <span className="px-3 py-1 rounded-lg bg-white/60 border">{page} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1.5 rounded-lg border disabled:opacity-40"><ChevronRight size={16} /></button>
          </div>
        </div>
      )}

      {/* Status error banner */}
      {error && modal === 'none' && (
        <div className="px-4 py-3 rounded-xl text-sm text-red-700 bg-red-50 border border-red-200 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="ml-3 hover:opacity-70"><X size={14} /></button>
        </div>
      )}

      {/* Confirm Status Modal */}
      {modal === 'confirm' && confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" style={{ backdropFilter: 'blur(4px)' }} onClick={closeModal} />
          <div className="relative w-full max-w-sm mx-4 rounded-2xl p-6"
            style={{ background: 'rgba(255,255,255,0.97)', boxShadow: '0 24px 64px rgba(10,22,40,0.18)' }}>
            <h2 className="text-base font-bold mb-2" style={{ color: brand.navy[950] }}>Confirmar avance</h2>
            <p className="text-sm text-slate-500 mb-5">
              ¿Confirmar avance de <strong>{STATUS_STYLES[confirmAction.currentStatus]?.label}</strong> a{' '}
              <strong>{STATUS_STYLES[confirmAction.nextStatus]?.label}</strong>?
            </p>
            {error && <div className="mb-4 px-3 py-2 rounded-xl text-sm text-red-700 bg-red-50 border border-red-200">{error}</div>}
            <div className="flex gap-3">
              <button onClick={closeModal} className="flex-1 py-2 rounded-xl text-sm border hover:bg-slate-50" style={{ color: '#64748B' }}>Cancelar</button>
              <button onClick={confirmStatusChange} disabled={statusMutation.isPending}
                className="flex-1 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-60"
                style={{ background: `linear-gradient(135deg, ${brand.orange[500]}, ${brand.orange[600]})` }}>
                {statusMutation.isPending ? 'Procesando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {modal === 'create' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" style={{ backdropFilter: 'blur(4px)' }} onClick={closeModal} />
          <div className="relative w-full max-w-2xl mx-4 rounded-2xl p-6 max-h-[92vh] overflow-y-auto"
            style={{ background: 'rgba(255,255,255,0.97)', boxShadow: '0 24px 64px rgba(10,22,40,0.18)' }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold" style={{ color: brand.navy[950] }}>Nueva Orden de Compra</h2>
              <button onClick={closeModal}><X size={18} style={{ color: '#64748B' }} /></button>
            </div>
            {error && <div className="mb-4 px-3 py-2 rounded-xl text-sm text-red-700 bg-red-50 border border-red-200">{error}</div>}

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>Proveedor *</label>
                <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none" style={{ color: brand.navy[900] }}>
                  <option value="">Seleccionar proveedor...</option>
                  {suppliers?.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.country})</option>)}
                </select>
              </div>

              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-xs font-semibold" style={{ color: brand.navy[700] }}>Productos</label>
                  <button onClick={addLine} className="text-xs font-medium" style={{ color: brand.orange[500] }}>+ Agregar</button>
                </div>
                <div className="space-y-2">
                  {lines.map((line, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-6">
                        <select value={line.productId} onChange={(e) => updateLine(i, 'productId', e.target.value)}
                          className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-xs outline-none" style={{ color: brand.navy[900] }}>
                          <option value="">Seleccionar producto</option>
                          {products?.products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <input type="number" value={line.quantityOrdered} onChange={(e) => updateLine(i, 'quantityOrdered', e.target.value)}
                          placeholder="Cant." min="1"
                          className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-xs outline-none text-center" />
                      </div>
                      <div className="col-span-3">
                        <input type="number" value={line.unitCostUsd} onChange={(e) => updateLine(i, 'unitCostUsd', e.target.value)}
                          placeholder="Costo USD"
                          className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-xs outline-none" />
                      </div>
                      <div className="col-span-1 text-right">
                        <button onClick={() => setLines(ls => ls.filter((_, idx) => idx !== i))}
                          className="p-1 rounded hover:bg-red-50" disabled={lines.length === 1}>
                          <X size={12} style={{ color: '#DC2626' }} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>Flete USD</label>
                  <input type="number" value={freight} onChange={(e) => setFreight(e.target.value)} placeholder="0.00"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>Aduanas USD</label>
                  <input type="number" value={customs} onChange={(e) => setCustoms(e.target.value)} placeholder="0.00"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>Tasa DOP/USD</label>
                  <input type="number" value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)} placeholder="58.50"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none" />
                </div>
              </div>

              <div className="border-t pt-3 text-sm space-y-1">
                <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
                <div className="flex justify-between text-slate-500"><span>Flete + Aduanas</span><span>{formatCurrency((parseFloat(freight) || 0) + (parseFloat(customs) || 0))}</span></div>
                <div className="flex justify-between font-bold" style={{ color: brand.navy[950] }}><span>Total Landed</span><span>{formatCurrency(landed)}</span></div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>Notas</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none resize-none" />
              </div>
            </div>

            <div className="flex gap-3 mt-6 justify-end">
              <button onClick={closeModal} className="px-4 py-2 rounded-xl text-sm border hover:bg-slate-50" style={{ color: '#64748B' }}>Cancelar</button>
              <button onClick={submitCreate} disabled={createMutation.isPending}
                className="px-5 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-60"
                style={{ background: `linear-gradient(135deg, ${brand.orange[500]}, ${brand.orange[600]})` }}>
                {createMutation.isPending ? 'Creando...' : 'Crear Orden'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {modal === 'detail' && detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" style={{ backdropFilter: 'blur(4px)' }} onClick={closeModal} />
          <div className="relative w-full max-w-xl mx-4 rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
            style={{ background: 'rgba(255,255,255,0.97)', boxShadow: '0 24px 64px rgba(10,22,40,0.18)' }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold" style={{ color: brand.navy[950] }}>{detail.poNumber}</h2>
                <p className="text-sm text-slate-500">{detail.supplier.name} · {formatDate(detail.createdAt)}</p>
              </div>
              <button onClick={closeModal}><X size={18} style={{ color: '#64748B' }} /></button>
            </div>

            <div className="mb-3">
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                style={{ backgroundColor: (STATUS_STYLES[detail.status] ?? STATUS_STYLES.DRAFT)!.bg, color: (STATUS_STYLES[detail.status] ?? STATUS_STYLES.DRAFT)!.text }}>
                {STATUS_STYLES[detail.status]?.label ?? detail.status}
              </span>
            </div>

            {/* Partial receipt banner */}
            {detail.status === 'IN_TRANSIT' && detail.items.some((it) => it.quantityReceived > 0) && (
              <div className="mb-3 px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-2"
                style={{ backgroundColor: '#FEF9C3', color: '#854D0E' }}>
                <span>⚡</span>
                <span>
                  Recepción parcial en curso —{' '}
                  {detail.items.filter((it) => it.quantityReceived >= it.quantityOrdered).length} de {detail.items.length} ítems completos
                </span>
              </div>
            )}

            <table className="w-full text-sm mb-4">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(10,22,40,0.08)' }}>
                  <th className="text-left py-2 text-xs font-semibold text-slate-400">Producto</th>
                  <th className="text-right py-2 text-xs font-semibold text-slate-400">Ordenado</th>
                  <th className="text-right py-2 text-xs font-semibold text-slate-400">Recibido</th>
                  <th className="text-right py-2 text-xs font-semibold text-slate-400">Pendiente</th>
                  <th className="text-right py-2 text-xs font-semibold text-slate-400">Costo USD</th>
                </tr>
              </thead>
              <tbody>
                {detail.items.map((item) => {
                  const pending = item.quantityOrdered - item.quantityReceived;
                  return (
                    <tr key={item.id} style={{ borderBottom: '1px solid rgba(10,22,40,0.05)' }}>
                      <td className="py-2" style={{ color: brand.navy[900] }}>
                        {item.product.name}
                        <div className="text-xs text-slate-400 font-mono">{item.product.sku}</div>
                      </td>
                      <td className="py-2 text-right" style={{ color: brand.navy[800] }}>{item.quantityOrdered}</td>
                      <td className="py-2 text-right font-semibold"
                        style={{ color: item.quantityReceived < item.quantityOrdered ? '#D97706' : '#16A34A' }}>
                        {item.quantityReceived}
                      </td>
                      <td className="py-2 text-right font-semibold"
                        style={{ color: pending > 0 ? '#DC2626' : '#16A34A' }}>
                        {pending > 0 ? pending : '✓'}
                      </td>
                      <td className="py-2 text-right" style={{ color: brand.navy[800] }}>{formatCurrency(Number(item.unitCostUsd))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="border-t pt-3 text-sm space-y-1">
              <div className="flex justify-between text-slate-500"><span>Flete</span><span>{formatCurrency(Number(detail.freightCost))}</span></div>
              <div className="flex justify-between text-slate-500"><span>Aduanas</span><span>{formatCurrency(Number(detail.customsCost))}</span></div>
              <div className="flex justify-between font-bold" style={{ color: brand.navy[950] }}><span>Total Landed</span><span>{formatCurrency(Number(detail.totalLandedCost))}</span></div>
            </div>

            {detail.status === 'IN_TRANSIT' && (
              <button
                onClick={() => openReceive(detail.id)}
                className="w-full mt-3 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90 flex items-center justify-center gap-2"
                style={{ background: 'linear-gradient(135deg,#16A34A,#15803D)' }}>
                <Package size={14} /> Recibir Mercancía
              </button>
            )}
            {STATUS_ORDER[detail.status] && detail.status !== 'IN_TRANSIT' && (
              <button
                onClick={() => {
                  const next = STATUS_ORDER[detail.status];
                  if (next) requestStatusChange(detail.id, detail.status, next);
                }}
                className="w-full mt-4 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90"
                style={{ background: `linear-gradient(135deg, ${brand.orange[500]}, ${brand.orange[600]})` }}>
                Avanzar → {STATUS_STYLES[STATUS_ORDER[detail.status]!]?.label}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Receive Modal */}
      {modal === 'receive' && detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" style={{ backdropFilter: 'blur(4px)' }} onClick={closeModal} />
          <div className="relative w-full max-w-xl mx-4 rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
            style={{ background: 'rgba(255,255,255,0.97)', boxShadow: '0 24px 64px rgba(10,22,40,0.18)' }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold" style={{ color: brand.navy[950] }}>Recibir Mercancía</h2>
                <p className="text-sm text-slate-500">{detail.poNumber} · {detail.supplier.name}</p>
              </div>
              <button onClick={closeModal}><X size={18} style={{ color: '#64748B' }} /></button>
            </div>
            {error && <div className="mb-4 px-3 py-2 rounded-xl text-sm text-red-700 bg-red-50 border border-red-200">{error}</div>}
            <div className="space-y-3 mb-5">
              {detail.items.map((item) => {
                const pending = item.quantityOrdered - item.quantityReceived;
                const r = receiveItems[item.id] ?? { qty: '', locationId: '' };
                const allLocs = warehouses?.flatMap((w) =>
                  (w.locations as unknown as Array<{ id: string; locationCode: string }>).map((l) => ({
                    id: l.id, label: `${w.name} — ${l.locationCode}`,
                  }))
                ) ?? [];
                return (
                  <div key={item.id} className="p-3 rounded-xl border border-slate-200">
                    <div className="flex justify-between mb-2">
                      <div>
                        <div className="text-sm font-medium" style={{ color: brand.navy[900] }}>{item.product.name}</div>
                        <div className="text-xs text-slate-400 font-mono">{item.product.sku}</div>
                      </div>
                      <div className="text-right text-xs text-slate-500">
                        <div>Ordenado: <strong>{item.quantityOrdered}</strong></div>
                        <div>Recibido: <strong className="text-green-600">{item.quantityReceived}</strong></div>
                        <div>Pendiente: <strong style={{ color: pending > 0 ? '#D97706' : '#16A34A' }}>{pending}</strong></div>
                      </div>
                    </div>
                    {pending > 0 && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-slate-400 mb-1 block">Cantidad a recibir</label>
                          <input type="number" min="0" max={pending} value={r.qty}
                            onChange={(e) => setReceiveItems((prev) => ({ ...prev, [item.id]: { ...r, qty: e.target.value } }))}
                            placeholder={`máx ${pending}`}
                            className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-sm outline-none" />
                        </div>
                        <div>
                          <label className="text-xs text-slate-400 mb-1 block">Ubicación destino</label>
                          <select value={r.locationId}
                            onChange={(e) => setReceiveItems((prev) => ({ ...prev, [item.id]: { ...r, locationId: e.target.value } }))}
                            className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-xs outline-none">
                            <option value="">Seleccionar...</option>
                            {allLocs.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                          </select>
                        </div>
                      </div>
                    )}
                    {pending === 0 && (
                      <div className="text-xs font-medium text-green-600 text-center py-1">✓ Completamente recibido</div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex gap-3">
              <button onClick={closeModal} className="flex-1 py-2 rounded-xl text-sm border hover:bg-slate-50" style={{ color: '#64748B' }}>Cancelar</button>
              <button onClick={submitReceive} disabled={receiveMutation.isPending}
                className="flex-1 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2"
                style={{ background: 'linear-gradient(135deg,#16A34A,#15803D)' }}>
                <Package size={14} />{receiveMutation.isPending ? 'Registrando...' : 'Registrar Recepción'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit PO Modal (DRAFT only) */}
      {modal === 'edit' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" style={{ backdropFilter: 'blur(4px)' }} onClick={closeModal} />
          <div className="relative w-full max-w-2xl mx-4 rounded-2xl p-6 max-h-[92vh] overflow-y-auto"
            style={{ background: 'rgba(255,255,255,0.97)', boxShadow: '0 24px 64px rgba(10,22,40,0.18)' }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold" style={{ color: brand.navy[950] }}>Editar Orden de Compra</h2>
              <button onClick={closeModal}><X size={18} style={{ color: '#64748B' }} /></button>
            </div>
            {error && <div className="mb-4 px-3 py-2 rounded-xl text-sm text-red-700 bg-red-50 border border-red-200">{error}</div>}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>Proveedor</label>
                <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none" style={{ color: brand.navy[900] }}>
                  <option value="">Sin cambio de proveedor</option>
                  {suppliers?.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.country})</option>)}
                </select>
              </div>
              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-xs font-semibold" style={{ color: brand.navy[700] }}>Productos (reemplaza todos)</label>
                  <button onClick={addLine} className="text-xs font-medium" style={{ color: brand.orange[500] }}>+ Agregar</button>
                </div>
                <div className="space-y-2">
                  {lines.map((line, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-6">
                        <select value={line.productId} onChange={(e) => updateLine(i, 'productId', e.target.value)}
                          className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-xs outline-none" style={{ color: brand.navy[900] }}>
                          <option value="">Seleccionar producto</option>
                          {products?.products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <input type="number" value={line.quantityOrdered} onChange={(e) => updateLine(i, 'quantityOrdered', e.target.value)}
                          placeholder="Cant." min="1" className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-xs outline-none text-center" />
                      </div>
                      <div className="col-span-3">
                        <input type="number" value={line.unitCostUsd} onChange={(e) => updateLine(i, 'unitCostUsd', e.target.value)}
                          placeholder="Costo USD" className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-xs outline-none" />
                      </div>
                      <div className="col-span-1 text-right">
                        <button onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}
                          className="p-1 rounded hover:bg-red-50" disabled={lines.length === 1}>
                          <X size={12} style={{ color: '#DC2626' }} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>Flete USD</label>
                  <input type="number" value={freight} onChange={(e) => setFreight(e.target.value)} placeholder="0.00"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>Aduanas USD</label>
                  <input type="number" value={customs} onChange={(e) => setCustoms(e.target.value)} placeholder="0.00"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>Tasa DOP/USD</label>
                  <input type="number" value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)} placeholder="58.50"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>Notas</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none resize-none" />
              </div>
            </div>
            <div className="flex gap-3 mt-6 justify-end">
              <button onClick={closeModal} className="px-4 py-2 rounded-xl text-sm border hover:bg-slate-50" style={{ color: '#64748B' }}>Cancelar</button>
              <button onClick={submitEditPO} disabled={updatePOMutation.isPending}
                className="px-5 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-60"
                style={{ background: `linear-gradient(135deg, ${brand.orange[500]}, ${brand.orange[600]})` }}>
                {updatePOMutation.isPending ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

