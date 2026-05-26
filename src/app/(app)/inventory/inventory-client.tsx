'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { brand } from '@/lib/brand';
import { formatCurrency } from '@/lib/utils';
import {
  Plus, Search, AlertTriangle, Package, X, ChevronLeft, ChevronRight,
  Edit2, Filter, PackagePlus, ArrowLeftRight, Printer, ChevronDown,
} from 'lucide-react';

const glass = {
  backgroundColor: 'rgba(255,255,255,0.72)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: '1px solid rgba(255,255,255,0.85)',
  boxShadow: '0 4px 24px rgba(10,22,40,0.07)',
} as React.CSSProperties;

type ProductForm = {
  sku: string; name: string; categoryId: string; unitCost: string;
  retailPrice: string; wholesalePrice: string; minStock: string;
  description: string; color: string; model: string; type: string;
};

const emptyForm: ProductForm = {
  sku: '', name: '', categoryId: '', unitCost: '', retailPrice: '',
  wholesalePrice: '', minStock: '0', description: '', color: '', model: '', type: '',
};

export function InventoryClient() {
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [lowStock, setLowStock] = useState(false);
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<'none' | 'create' | 'edit' | 'stock'>('none');
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [error, setError] = useState('');
  const [showPrintMenu, setShowPrintMenu] = useState(false);
  const [printing, setPrinting] = useState(false);

  // Stock entry / adjustment state
  const [stockProduct, setStockProduct] = useState<{ id: string; sku: string; name: string; locationId: string; currentStock: number } | null>(null);
  const [stockMode, setStockMode] = useState<'IN' | 'ADJUSTMENT'>('IN');
  const [stockQty, setStockQty] = useState('');
  const [stockNotes, setStockNotes] = useState('');

  const { data, isLoading, refetch } = trpc.products.list.useQuery({
    search: search || undefined,
    categoryId: categoryId || undefined,
    lowStock: lowStock || undefined,
    page,
    pageSize: 20,
  });

  const { data: cats } = trpc.settings.categories.useQuery();
  const utils = trpc.useUtils();

  const create = trpc.products.create.useMutation({
    onSuccess: () => { refetch(); closeModal(); },
    onError: (e) => setError(e.message),
  });

  const update = trpc.products.update.useMutation({
    onSuccess: () => { refetch(); closeModal(); },
    onError: (e) => setError(e.message),
  });

  const stockIn = trpc.movements.create.useMutation({
    onSuccess: () => { refetch(); closeModal(); },
    onError: (e) => setError(e.message),
  });

  async function printInventory(filterCatId?: string) {
    setShowPrintMenu(false);
    setPrinting(true);
    try {
      const result = await utils.products.list.fetch({ categoryId: filterCatId || undefined, pageSize: 1000 });
      const prods = result.products;
      const catName = filterCatId ? (cats?.find(c => c.id === filterCatId)?.name ?? 'Categoría') : 'Todo el Inventario';
      const date = new Date().toLocaleDateString('es-PR', { year: 'numeric', month: 'long', day: 'numeric' });
      const totalRetail = prods.reduce((s, p) => s + Number(p.retailPrice) * p.totalStock, 0);
      const lowCount = prods.filter(p => p.totalStock > 0 && p.totalStock <= p.minStock).length;
      const zeroCount = prods.filter(p => p.totalStock === 0).length;

      const rows = prods.map(p => {
        const st = p.totalStock === 0 ? 'crit' : p.totalStock <= p.minStock ? 'low' : 'ok';
        const label = st === 'ok' ? 'OK' : st === 'low' ? 'Stock Bajo' : 'Sin Stock';
        return `<tr>
          <td class="sku">${p.sku}</td>
          <td>${p.name}${p.color ? ` <em>${p.color}</em>` : ''}</td>
          <td>${p.category.name}</td>
          <td class="num st-${st}">${p.totalStock}</td>
          <td><span class="badge badge-${st}">${label}</span></td>
          <td class="num">$${Number(p.retailPrice).toFixed(2)}</td>
          <td class="num">$${Number(p.wholesalePrice).toFixed(2)}</td>
          <td class="num muted">$${Number(p.unitCost).toFixed(2)}</td>
        </tr>`;
      }).join('');

      const html = `<!DOCTYPE html><html><head>
        <meta charset="utf-8">
        <title>Inventario — ${catName}</title>
        <style>
          *{margin:0;padding:0;box-sizing:border-box}
          body{font-family:Arial,sans-serif;font-size:10.5px;color:#1e293b;padding:16px 20px}
          .hdr{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #0A1628;padding-bottom:10px;margin-bottom:12px}
          .hdr h1{font-size:17px;font-weight:700;color:#0A1628;letter-spacing:-0.5px}
          .hdr .sub{font-size:9.5px;color:#64748B;margin-top:3px}
          .hdr .right{text-align:right;font-size:9.5px;color:#64748B}
          table{width:100%;border-collapse:collapse}
          th{background:#0A1628;color:#fff;padding:5px 8px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.5px;font-weight:600}
          th.num,td.num{text-align:right}
          td{padding:4.5px 8px;border-bottom:1px solid #e2e8f0;vertical-align:middle}
          tr:nth-child(even) td{background:#f8fafc}
          .sku{font-family:monospace;font-size:9.5px;color:#475569}
          em{color:#94A3B8;font-style:normal;font-size:9px;margin-left:4px}
          .muted{color:#94A3B8}
          .st-ok{color:#166534;font-weight:700}
          .st-low{color:#854D0E;font-weight:700}
          .st-crit{color:#991B1B;font-weight:700}
          .badge{padding:1px 7px;border-radius:20px;font-size:8.5px;font-weight:600}
          .badge-ok{background:#F0FDF4;color:#166534}
          .badge-low{background:#FEF9C3;color:#854D0E}
          .badge-crit{background:#FEF2F2;color:#991B1B}
          .totals{margin-top:14px;padding:10px 14px;background:#f1f5f9;border-radius:6px;display:flex;gap:28px;align-items:center}
          .totals .item{font-size:9.5px;color:#64748B}
          .totals .val{font-size:14px;font-weight:700;color:#0A1628;display:block}
          .totals .label{font-size:9px;color:#94A3B8}
          @media print{body{padding:10px 12px}th{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
        </style>
      </head><body>
        <div class="hdr">
          <div>
            <h1>THE BUILDER'S HOUSE · Puerto Rico</h1>
            <div class="sub">Reporte de Inventario · ${catName}</div>
          </div>
          <div class="right">
            Generado: ${date}<br>
            ${prods.length} producto(s)
          </div>
        </div>
        <table>
          <thead><tr>
            <th>SKU</th><th>Producto</th><th>Categoría</th>
            <th class="num">Stock</th><th>Estado</th>
            <th class="num">Precio Retail</th><th class="num">Precio Mayor</th><th class="num">Costo</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="totals">
          <div class="item"><span class="val">${prods.length}</span><span class="label">Total Productos</span></div>
          <div class="item"><span class="val" style="color:#854D0E">${lowCount}</span><span class="label">Stock Bajo</span></div>
          <div class="item"><span class="val" style="color:#991B1B">${zeroCount}</span><span class="label">Sin Stock</span></div>
          <div class="item" style="margin-left:auto"><span class="val">$${totalRetail.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span><span class="label">Valor Inventario (Retail)</span></div>
        </div>
        <script>window.onload=()=>window.print()<\/script>
      </body></html>`;

      const win = window.open('', '_blank', 'width=1100,height=700');
      if (win) { win.document.write(html); win.document.close(); }
    } finally {
      setPrinting(false);
    }
  }

  function closeModal() {
    setModal('none');
    setEditId(null);
    setForm(emptyForm);
    setError('');
    setStockProduct(null);
    setStockMode('IN');
    setStockQty('');
    setStockNotes('');
  }

  function openStockModal(p: NonNullable<typeof data>['products'][0], mode: 'IN' | 'ADJUSTMENT' = 'IN') {
    if (!p.locations[0]) return;
    setStockProduct({ id: p.id, sku: p.sku, name: p.name, locationId: p.locations[0].id, currentStock: p.totalStock });
    setStockMode(mode);
    setStockQty('');
    setStockNotes('');
    setError('');
    setModal('stock');
  }

  function handleStockSubmit() {
    if (!stockProduct) return;
    const raw = parseInt(stockQty);
    if (!raw || raw === 0) { setError('Ingresa una cantidad distinta de 0'); return; }

    if (stockMode === 'IN') {
      if (raw < 0) { setError('Para entradas usa cantidad positiva. Para correcciones usa el botón de ajuste.'); return; }
      stockIn.mutate({
        productId: stockProduct.id,
        locationId: stockProduct.locationId,
        movementType: 'IN',
        quantity: raw,
        referenceType: 'PURCHASE_ORDER',
        notes: stockNotes || undefined,
      });
    } else {
      // ADJUSTMENT — acepta positivo (corrección hacia arriba) o negativo (corrección hacia abajo)
      stockIn.mutate({
        productId: stockProduct.id,
        locationId: stockProduct.locationId,
        movementType: 'ADJUSTMENT',
        quantity: raw,
        referenceType: 'ADJUSTMENT',
        notes: stockNotes || 'Ajuste manual',
      });
    }
  }

  function openEdit(p: NonNullable<typeof data>['products'][0]) {
    setForm({
      sku: p.sku,
      name: p.name,
      categoryId: p.categoryId,
      unitCost: String(p.unitCost),
      retailPrice: String(p.retailPrice),
      wholesalePrice: String(p.wholesalePrice),
      minStock: String(p.minStock),
      description: p.description ?? '',
      color: p.color ?? '',
      model: p.model ?? '',
      type: p.type ?? '',
    });
    setEditId(p.id);
    setModal('edit');
    setError('');
  }

  function handleSubmit() {
    setError('');
    const payload = {
      sku: form.sku,
      name: form.name,
      categoryId: form.categoryId,
      unitCost: parseFloat(form.unitCost),
      retailPrice: parseFloat(form.retailPrice),
      wholesalePrice: parseFloat(form.wholesalePrice),
      minStock: parseInt(form.minStock),
      description: form.description || undefined,
      color: form.color || undefined,
      model: form.model || undefined,
      type: form.type || undefined,
    };
    if (!payload.sku || !payload.name || !payload.categoryId) {
      setError('SKU, Nombre y Categoría son requeridos');
      return;
    }
    if (modal === 'create') create.mutate(payload);
    else if (editId) update.mutate({ id: editId, data: payload });
  }

  const products = data?.products ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  const statusColors: Record<string, { bg: string; text: string; label: string }> = {
    ok: { bg: '#F0FDF4', text: '#166534', label: 'OK' },
    low: { bg: '#FEF9C3', text: '#854D0E', label: 'Stock Bajo' },
    critical: { bg: '#FEF2F2', text: '#991B1B', label: 'Crítico' },
  };

  function stockStatus(p: { totalStock: number; minStock: number }) {
    if (p.totalStock === 0) return statusColors.critical!;
    if (p.totalStock <= p.minStock) return statusColors.low!;
    return statusColors.ok!;
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: brand.navy[950] }}>
            Inventario
          </h1>
          <p className="text-sm mt-0.5" style={{ color: '#64748B' }}>
            {total} productos · {data?.products.filter((p) => p.totalStock <= p.minStock).length ?? 0} con stock bajo
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Print button */}
          <div className="relative">
            <button
              onClick={() => setShowPrintMenu(m => !m)}
              disabled={printing}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border hover:bg-slate-50 transition-colors disabled:opacity-50"
              style={{ color: brand.navy[800], borderColor: '#E2E8F0', backgroundColor: 'white' }}
            >
              <Printer size={15} />
              {printing ? 'Generando...' : 'Imprimir'}
              <ChevronDown size={13} />
            </button>

            {showPrintMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowPrintMenu(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-xl w-52 overflow-hidden">
                  <div className="px-3 py-2 text-xs font-semibold text-slate-400 border-b border-slate-100 uppercase tracking-wide">
                    Imprimir Inventario
                  </div>
                  <button
                    onClick={() => void printInventory()}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-slate-50 text-left font-medium"
                    style={{ color: brand.navy[950] }}>
                    <Printer size={13} style={{ color: brand.orange[500] }} />
                    Todo el Inventario
                  </button>
                  {cats && cats.length > 0 && (
                    <>
                      <div className="px-3 py-1.5 text-xs text-slate-400 border-t border-slate-100">Por categoría</div>
                      {cats.map(c => (
                        <button key={c.id}
                          onClick={() => void printInventory(c.id)}
                          className="w-full px-4 py-2 text-sm hover:bg-slate-50 text-left"
                          style={{ color: brand.navy[800] }}>
                          {c.name}
                        </button>
                      ))}
                    </>
                  )}
                </div>
              </>
            )}
          </div>

          <button
            onClick={() => { setModal('create'); setError(''); }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ background: `linear-gradient(135deg, ${brand.orange[500]}, ${brand.orange[600]})` }}
          >
            <Plus size={16} /> Nuevo Producto
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={glass} className="rounded-2xl p-4 flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2 flex-1 min-w-48 bg-white/60 rounded-xl px-3 py-2 border border-white/80">
          <Search size={15} style={{ color: '#94A3B8' }} />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Buscar por nombre, SKU, código..."
            className="flex-1 text-sm bg-transparent outline-none"
            style={{ color: brand.navy[950] }}
          />
        </div>
        <select
          value={categoryId}
          onChange={(e) => { setCategoryId(e.target.value); setPage(1); }}
          className="text-sm px-3 py-2 rounded-xl border bg-white/60 outline-none"
          style={{ color: brand.navy[800] }}
        >
          <option value="">Todas las categorías</option>
          {cats?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: brand.navy[800] }}>
          <input
            type="checkbox"
            checked={lowStock}
            onChange={(e) => { setLowStock(e.target.checked); setPage(1); }}
            className="rounded"
          />
          <Filter size={14} />
          Solo stock bajo
        </label>
      </div>

      {/* Table */}
      <div style={glass} className="rounded-2xl overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-slate-400 text-sm">
            Cargando inventario...
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Package size={40} style={{ color: '#CBD5E1' }} />
            <p className="text-slate-400 text-sm">No se encontraron productos</p>
            <button
              onClick={() => setModal('create')}
              className="text-sm font-medium"
              style={{ color: brand.orange[500] }}
            >
              + Crear primer producto
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(10,22,40,0.08)' }}>
                  {['SKU', 'Producto', 'Categoría', 'Stock', 'Precio Retail', 'Precio Mayor', 'Costo', 'Estado', ''].map((h) => (
                    <th
                      key={h}
                      className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide"
                      style={{ color: '#94A3B8' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {products.map((p, i) => {
                  const st = stockStatus(p);
                  return (
                    <tr
                      key={p.id}
                      style={{
                        borderBottom: i < products.length - 1 ? '1px solid rgba(10,22,40,0.05)' : 'none',
                        backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(10,22,40,0.015)',
                      }}
                    >
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: brand.navy[700] }}>
                        {p.sku}
                      </td>
                      <td className="px-4 py-3 font-medium" style={{ color: brand.navy[950] }}>
                        {p.name}
                        {p.color && <span className="ml-2 text-xs text-slate-400">{p.color}</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{p.category.name}</td>
                      <td className="px-4 py-3 font-semibold" style={{ color: p.totalStock === 0 ? '#DC2626' : brand.navy[900] }}>
                        {p.totalStock}
                        {p.totalStock <= p.minStock && p.totalStock > 0 && (
                          <AlertTriangle size={13} className="inline ml-1 text-amber-500" />
                        )}
                      </td>
                      <td className="px-4 py-3" style={{ color: brand.navy[800] }}>
                        {formatCurrency(Number(p.retailPrice))}
                      </td>
                      <td className="px-4 py-3" style={{ color: brand.navy[800] }}>
                        {formatCurrency(Number(p.wholesalePrice))}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {formatCurrency(Number(p.unitCost))}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="px-2 py-0.5 rounded-full text-xs font-semibold"
                          style={{ backgroundColor: st.bg, color: st.text }}
                        >
                          {st.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openStockModal(p, 'IN')}
                            className="p-1.5 rounded-lg hover:bg-green-50 transition-colors"
                            title="Entrada de stock"
                          >
                            <PackagePlus size={14} style={{ color: '#16A34A' }} />
                          </button>
                          <button
                            onClick={() => openStockModal(p, 'ADJUSTMENT')}
                            className="p-1.5 rounded-lg hover:bg-amber-50 transition-colors"
                            title="Ajuste / corrección de stock"
                          >
                            <ArrowLeftRight size={14} style={{ color: '#D97706' }} />
                          </button>
                          <button
                            onClick={() => openEdit(p)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                            title="Editar producto"
                          >
                            <Edit2 size={14} style={{ color: brand.navy[600] }} />
                          </button>
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
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 rounded-lg border disabled:opacity-40"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="px-3 py-1 rounded-lg bg-white/60 border">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1.5 rounded-lg border disabled:opacity-40"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Modal — Entrada de Stock / Ajuste */}
      {modal === 'stock' && stockProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" style={{ backdropFilter: 'blur(4px)' }} onClick={closeModal} />
          <div className="relative w-full max-w-sm mx-4 rounded-2xl p-6"
            style={{ background: 'rgba(255,255,255,0.97)', boxShadow: '0 24px 64px rgba(10,22,40,0.18)' }}>

            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                {stockMode === 'IN'
                  ? <PackagePlus size={18} style={{ color: '#16A34A' }} />
                  : <ArrowLeftRight size={18} style={{ color: '#D97706' }} />}
                <h2 className="text-base font-bold" style={{ color: brand.navy[950] }}>
                  {stockMode === 'IN' ? 'Entrada de Stock' : 'Ajuste de Stock'}
                </h2>
              </div>
              <button onClick={closeModal} className="p-1 rounded-lg hover:bg-slate-100">
                <X size={18} style={{ color: '#64748B' }} />
              </button>
            </div>

            <div className="mb-4 px-3 py-2 rounded-xl text-sm" style={{ backgroundColor: 'rgba(10,22,40,0.04)' }}>
              <div className="font-mono text-xs font-bold" style={{ color: brand.orange[500] }}>{stockProduct.sku}</div>
              <div className="font-medium mt-0.5" style={{ color: brand.navy[900] }}>{stockProduct.name}</div>
              <div className="text-xs mt-1" style={{ color: '#64748B' }}>
                Stock actual: <span className="font-semibold" style={{ color: brand.navy[800] }}>{stockProduct.currentStock}</span> unidades
              </div>
            </div>

            {stockMode === 'ADJUSTMENT' && (
              <div className="mb-3 px-3 py-2 rounded-xl text-xs" style={{ backgroundColor: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E' }}>
                Usa número <strong>negativo</strong> para restar unidades (ej: -3 para corregir una entrada errónea).<br />
                Usa número <strong>positivo</strong> para sumar sin registrar una compra formal.
              </div>
            )}

            {error && (
              <div className="mb-3 px-3 py-2 rounded-xl text-sm text-red-700 bg-red-50 border border-red-200">{error}</div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>
                  {stockMode === 'IN' ? 'Cantidad a ingresar *' : 'Ajuste (+ sumar · − restar) *'}
                </label>
                <input
                  type="number"
                  value={stockQty}
                  onChange={(e) => setStockQty(e.target.value)}
                  placeholder={stockMode === 'IN' ? '10' : '-1'}
                  autoFocus
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 outline-none text-center font-bold text-lg"
                  style={{ color: brand.navy[900] }}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>
                  Motivo {stockMode === 'ADJUSTMENT' ? '*' : '(opcional)'}
                </label>
                <input
                  type="text"
                  value={stockNotes}
                  onChange={(e) => setStockNotes(e.target.value)}
                  placeholder={stockMode === 'IN' ? 'Ej: Recepción PO-001...' : 'Ej: Corrección entrada errónea...'}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none"
                  style={{ color: brand.navy[900] }}
                />
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button onClick={closeModal}
                className="flex-1 py-2 rounded-xl text-sm border hover:bg-slate-50"
                style={{ color: '#64748B' }}>
                Cancelar
              </button>
              <button
                onClick={handleStockSubmit}
                disabled={stockIn.isPending || !stockQty}
                className="flex-1 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-60"
                style={{ background: stockMode === 'IN'
                  ? 'linear-gradient(135deg, #16A34A, #15803D)'
                  : 'linear-gradient(135deg, #D97706, #B45309)' }}>
                {stockIn.isPending ? 'Guardando...' : stockMode === 'IN' ? 'Registrar Entrada' : 'Aplicar Ajuste'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal — Crear / Editar Producto */}
      {modal !== 'none' && modal !== 'stock' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/30"
            style={{ backdropFilter: 'blur(4px)' }}
            onClick={closeModal}
          />
          <div
            className="relative w-full max-w-2xl mx-4 rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
            style={{
              background: 'rgba(255,255,255,0.97)',
              boxShadow: '0 24px 64px rgba(10,22,40,0.18)',
            }}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold" style={{ color: brand.navy[950] }}>
                {modal === 'create' ? 'Nuevo Producto' : 'Editar Producto'}
              </h2>
              <button onClick={closeModal} className="p-1 rounded-lg hover:bg-slate-100">
                <X size={18} style={{ color: '#64748B' }} />
              </button>
            </div>

            {error && (
              <div className="mb-4 px-3 py-2 rounded-xl text-sm text-red-700 bg-red-50 border border-red-200">
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <Field label="SKU *" value={form.sku} onChange={(v) => setForm(f => ({ ...f, sku: v }))} placeholder="VEN-CR-3624-AL" mono />
              <Field label="Nombre *" value={form.name} onChange={(v) => setForm(f => ({ ...f, name: v }))} placeholder="Ventana Corrediza 36x24 Aluminio" span2={false} />
              <div className="col-span-2">
                <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>
                  Categoría *
                </label>
                <select
                  value={form.categoryId}
                  onChange={(e) => setForm(f => ({ ...f, categoryId: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none"
                  style={{ color: brand.navy[900] }}
                >
                  <option value="">Seleccionar categoría</option>
                  {cats?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <Field label="Costo Unitario *" value={form.unitCost} onChange={(v) => setForm(f => ({ ...f, unitCost: v }))} type="number" placeholder="0.00" />
              <Field label="Precio Retail *" value={form.retailPrice} onChange={(v) => setForm(f => ({ ...f, retailPrice: v }))} type="number" placeholder="0.00" />
              <Field label="Precio Mayoreo *" value={form.wholesalePrice} onChange={(v) => setForm(f => ({ ...f, wholesalePrice: v }))} type="number" placeholder="0.00" />
              <Field label="Stock Mínimo" value={form.minStock} onChange={(v) => setForm(f => ({ ...f, minStock: v }))} type="number" placeholder="0" />
              <Field label="Color" value={form.color} onChange={(v) => setForm(f => ({ ...f, color: v }))} placeholder="Aluminio Natural" />
              <Field label="Modelo" value={form.model} onChange={(v) => setForm(f => ({ ...f, model: v }))} placeholder="Corrediza" />
              <Field label="Tipo" value={form.type} onChange={(v) => setForm(f => ({ ...f, type: v }))} placeholder="corrediza / batiente / proyectante" />
              <div className="col-span-2">
                <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>
                  Descripción
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={2}
                  placeholder="Descripción opcional del producto..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none resize-none"
                  style={{ color: brand.navy[900] }}
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6 justify-end">
              <button
                onClick={closeModal}
                className="px-4 py-2 rounded-xl text-sm font-medium border border-slate-200 hover:bg-slate-50"
                style={{ color: '#64748B' }}
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                disabled={create.isPending || update.isPending}
                className="px-5 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-60 transition-opacity hover:opacity-90"
                style={{ background: `linear-gradient(135deg, ${brand.orange[500]}, ${brand.orange[600]})` }}
              >
                {create.isPending || update.isPending ? 'Guardando...' : modal === 'create' ? 'Crear Producto' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label, value, onChange, type = 'text', placeholder = '', mono = false, span2 = false,
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; mono?: boolean; span2?: boolean;
}) {
  return (
    <div className={span2 ? 'col-span-2' : ''}>
      <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none ${mono ? 'font-mono' : ''}`}
        style={{ color: brand.navy[900] }}
      />
    </div>
  );
}
