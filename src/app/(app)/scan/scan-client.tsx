'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { trpc } from '@/lib/trpc';
import { brand } from '@/lib/brand';
import { formatCurrency } from '@/lib/utils';
import {
  ScanLine, Package, Search, Plus, Minus,
  CheckCircle2, AlertCircle, Barcode, QrCode,
  Printer, Wand2, Save, X, Trash2, Layers,
  ChevronDown,
} from 'lucide-react';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';

const glass = {
  backgroundColor: 'rgba(255,255,255,0.72)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: '1px solid rgba(255,255,255,0.85)',
  boxShadow: '0 4px 24px rgba(10,22,40,0.07)',
} as React.CSSProperties;

type MovementResult = { success: boolean; message: string };
type ActiveTab = 'scan' | 'config';
type ConfigMode = 'individual' | 'masa';

type BulkItem = {
  productId: string;
  name: string;
  sku: string;
  barcode: string;
  originalBarcode: string | null;
  retailPrice: number;
  quantity: number;
};

export function ScanClient() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('scan');

  // ── Scan tab ──
  const [scanInput, setScanInput] = useState('');
  const [sku, setSku] = useState('');
  const [movementType, setMovementType] = useState<'IN' | 'OUT' | 'ADJUSTMENT'>('OUT');
  const [quantity, setQuantity] = useState('1');
  const [notes, setNotes] = useState('');
  const [result, setResult] = useState<MovementResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Config tab ──
  const [configMode, setConfigMode] = useState<ConfigMode>('individual');

  // Individual
  const [configSearch, setConfigSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const barcodeRef = useRef<SVGSVGElement>(null);
  const [configResult, setConfigResult] = useState<MovementResult | null>(null);

  // Bulk
  const [bulkItems, setBulkItems] = useState<BulkItem[]>([]);
  const [bulkSearch, setBulkSearch] = useState('');
  const [bulkDebouncedSearch, setBulkDebouncedSearch] = useState('');
  const [showBulkDropdown, setShowBulkDropdown] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkResult, setBulkResult] = useState<MovementResult | null>(null);

  // Dropdown portal positioning (backdrop-filter creates stacking context, portals escape it)
  const individualInputRef = useRef<HTMLDivElement>(null);
  const bulkInputRef = useRef<HTMLDivElement>(null);
  const [individualPos, setIndividualPos] = useState({ top: 0, left: 0, width: 0 });
  const [bulkPos, setBulkPos] = useState({ top: 0, left: 0, width: 0 });

  function openIndividualDropdown() {
    if (individualInputRef.current) {
      const r = individualInputRef.current.getBoundingClientRect();
      setIndividualPos({ top: r.bottom + 4, left: r.left, width: r.width });
    }
    setShowDropdown(true);
  }

  function openBulkDropdown() {
    if (bulkInputRef.current) {
      const r = bulkInputRef.current.getBoundingClientRect();
      setBulkPos({ top: r.bottom + 4, left: r.left, width: r.width });
    }
    setShowBulkDropdown(true);
  }

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(configSearch), 350);
    return () => clearTimeout(t);
  }, [configSearch]);

  useEffect(() => {
    const t = setTimeout(() => setBulkDebouncedSearch(bulkSearch), 350);
    return () => clearTimeout(t);
  }, [bulkSearch]);

  // ── Queries ──
  const { data: product, isLoading: searchLoading } = trpc.products.scan.useQuery(
    sku, { enabled: sku.length > 0, retry: false }
  );

  const { data: productList } = trpc.products.list.useQuery(
    { search: debouncedSearch || undefined, pageSize: 40 },
    { enabled: showDropdown }
  );

  const { data: bulkSearchResults } = trpc.products.list.useQuery(
    { search: bulkDebouncedSearch || undefined, pageSize: 20 },
    { enabled: showBulkDropdown }
  );

  const { data: selectedProduct, refetch: refetchSelected } = trpc.products.byId.useQuery(
    selectedProductId!, { enabled: !!selectedProductId }
  );

  const utils = trpc.useUtils();

  // ── Mutations ──
  const createMovement = trpc.movements.create.useMutation({
    onSuccess: () => {
      setResult({ success: true, message: 'Movimiento registrado correctamente' });
      setScanInput(''); setSku(''); setQuantity('1'); setNotes('');
      setTimeout(() => setResult(null), 3000);
    },
    onError: (e) => setResult({ success: false, message: e.message }),
  });

  const setBarcodeM = trpc.products.setBarcode.useMutation({
    onSuccess: () => {
      setConfigResult({ success: true, message: 'Código asignado correctamente' });
      void refetchSelected();
      void utils.products.list.invalidate();
      setTimeout(() => setConfigResult(null), 3000);
    },
    onError: (e) => setConfigResult({ success: false, message: e.message }),
  });

  // JsBarcode preview
  useEffect(() => {
    if (!barcodeRef.current) return;
    if (!barcodeInput) {
      while (barcodeRef.current.firstChild) barcodeRef.current.removeChild(barcodeRef.current.firstChild);
      barcodeRef.current.removeAttribute('width');
      barcodeRef.current.removeAttribute('height');
      return;
    }
    try {
      JsBarcode(barcodeRef.current, barcodeInput, {
        format: 'CODE128', width: 2, height: 60,
        displayValue: true, fontSize: 13, margin: 8,
        background: '#ffffff', lineColor: '#0A1628',
      });
    } catch { /* invalid */ }
  }, [barcodeInput]);

  // QR preview
  useEffect(() => {
    if (!barcodeInput) { setQrDataUrl(''); return; }
    QRCode.toDataURL(barcodeInput, {
      width: 150, margin: 1, color: { dark: '#0A1628', light: '#ffffff' },
    }).then(setQrDataUrl).catch(() => setQrDataUrl(''));
  }, [barcodeInput]);

  // ── Helpers ──
  function generateBarcodeDataUrl(value: string): string {
    try {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      document.body.appendChild(svg);
      JsBarcode(svg, value, {
        format: 'CODE128', width: 1.5, height: 40,
        displayValue: true, fontSize: 10, margin: 5,
        background: '#ffffff', lineColor: '#0A1628',
      });
      const s = new XMLSerializer().serializeToString(svg);
      document.body.removeChild(svg);
      return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(s)));
    } catch { return ''; }
  }

  function handleScan(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = scanInput.trim();
    if (trimmed) { setSku(trimmed); setResult(null); }
  }

  function submitMovement() {
    if (!product?.locations[0]) return;
    const qty = parseInt(quantity);
    if (!qty || qty <= 0) return;
    createMovement.mutate({
      productId: product.id,
      locationId: product.locations[0].id,
      movementType,
      quantity: movementType === 'OUT' ? -qty : qty,
      referenceType: movementType === 'IN' ? 'PURCHASE_ORDER' : movementType === 'OUT' ? 'INVOICE' : 'ADJUSTMENT',
      notes: notes || undefined,
    });
  }

  function addToBatch(p: { id: string; name: string; sku: string; barcode: string | null; retailPrice: unknown }) {
    if (bulkItems.some(i => i.productId === p.id)) return;
    setBulkItems(prev => [...prev, {
      productId: p.id,
      name: p.name,
      sku: p.sku,
      barcode: p.barcode ?? p.sku,
      originalBarcode: p.barcode,
      retailPrice: Number(p.retailPrice),
      quantity: 1,
    }]);
    setBulkSearch('');
    setBulkDebouncedSearch('');
    setShowBulkDropdown(false);
  }

  function autoGenerateAll() {
    setBulkItems(prev => prev.map(i => i.originalBarcode ? i : { ...i, barcode: i.sku }));
  }

  async function saveAllBarcodes() {
    const dirty = bulkItems.filter(i => i.barcode.trim() && i.barcode !== i.originalBarcode);
    if (!dirty.length) {
      setBulkResult({ success: false, message: 'No hay códigos nuevos para guardar' });
      setTimeout(() => setBulkResult(null), 3000);
      return;
    }
    setBulkSaving(true);
    setBulkResult(null);
    let saved = 0, failed = 0;
    for (const item of dirty) {
      try {
        await setBarcodeM.mutateAsync({ productId: item.productId, barcode: item.barcode.trim() });
        setBulkItems(prev => prev.map(i => i.productId === item.productId ? { ...i, originalBarcode: item.barcode } : i));
        saved++;
      } catch { failed++; }
    }
    setBulkSaving(false);
    void utils.products.list.invalidate();
    setBulkResult({
      success: failed === 0,
      message: failed === 0
        ? `${saved} código(s) guardado(s) correctamente`
        : `${saved} guardados · ${failed} con error`,
    });
    setTimeout(() => setBulkResult(null), 4000);
  }

  async function printAll() {
    if (!bulkItems.length) return;
    const qrUrls = await Promise.all(
      bulkItems.map(item =>
        QRCode.toDataURL(item.barcode, { width: 100, margin: 1, color: { dark: '#0A1628', light: '#ffffff' } }).catch(() => '')
      )
    );
    const barcodeUrls = bulkItems.map(item => generateBarcodeDataUrl(item.barcode));

    let labelsHtml = '';
    bulkItems.forEach((item, idx) => {
      for (let q = 0; q < item.quantity; q++) {
        labelsHtml += `
          <div class="label">
            <div class="co">THE BUILDER'S HOUSE · PR</div>
            <div class="sku">${item.sku}</div>
            ${qrUrls[idx] ? `<img src="${qrUrls[idx]}" width="72" style="display:block;margin:3px auto">` : ''}
            ${barcodeUrls[idx] ? `<img src="${barcodeUrls[idx]}" style="max-width:100%;display:block;margin:0 auto">` : ''}
            <div class="nm">${item.name}</div>
            <div class="price">$${item.retailPrice.toFixed(2)}</div>
          </div>`;
      }
    });

    const total = bulkItems.reduce((s, i) => s + i.quantity, 0);
    const win = window.open('', '_blank', 'width=900,height=650');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head>
      <title>Etiquetas (${total})</title>
      <style>
        body{margin:0;font-family:'Courier New',monospace;background:#f8fafc}
        .grid{display:flex;flex-wrap:wrap;gap:6px;padding:10px}
        .label{width:175px;border:1px dashed #cbd5e1;border-radius:6px;padding:8px;text-align:center;background:#fff;page-break-inside:avoid}
        .co{font-size:7px;font-weight:700;color:#0A1628;letter-spacing:.5px;text-transform:uppercase}
        .sku{font-size:9px;color:#64748B;margin-bottom:3px}
        .nm{font-size:9px;margin:3px 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#1e293b}
        .price{font-size:15px;font-weight:700;color:#0A1628;margin-top:2px}
        @media print{body{background:#fff}.grid{gap:3px;padding:4px}.label{border:1px solid #94a3b8}}
      </style>
    </head><body>
      <div class="grid">${labelsHtml}</div>
      <script>window.onload=()=>window.print()<\/script>
    </body></html>`);
    win.document.close();
  }

  function handlePrintSingle() {
    if (!selectedProduct || !barcodeInput) return;
    const svgHtml = barcodeRef.current?.outerHTML ?? '';
    const qrImg = qrDataUrl ? `<img src="${qrDataUrl}" width="100" style="display:block;margin:0 auto 10px">` : '';
    const win = window.open('', '_blank', 'width=420,height=320');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head>
      <title>Etiqueta: ${selectedProduct.sku}</title>
      <style>
        body{font-family:'Courier New',monospace;text-align:center;padding:20px;color:#0A1628}
        h3{margin:0 0 2px;font-size:14px;font-weight:700}
        .sku{font-size:11px;color:#64748B;margin-bottom:12px}
        .nm{font-size:11px;margin-top:6px;max-width:200px;margin-inline:auto}
        .price{font-size:18px;font-weight:700;margin-top:8px}
        svg{max-width:100%}
      </style>
    </head><body>
      <h3>THE BUILDER'S HOUSE</h3>
      <div class="sku">${selectedProduct.sku}</div>
      ${qrImg}
      ${svgHtml}
      <div class="nm">${selectedProduct.name}</div>
      <div class="price">$${Number(selectedProduct.retailPrice).toFixed(2)}</div>
      <script>window.onload=()=>window.print()<\/script>
    </body></html>`);
    win.document.close();
  }

  const location = product?.locations[0];
  const currentStock = location?.quantityOnHand ?? 0;
  const totalLabels = bulkItems.reduce((s, i) => s + i.quantity, 0);
  const dirtyCount = bulkItems.filter(i => i.barcode.trim() && i.barcode !== i.originalBarcode).length;

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: brand.navy[950] }}>Módulo de Escaneo</h1>
        <p className="text-sm mt-0.5" style={{ color: '#64748B' }}>
          Escaneo rápido y gestión de códigos de barras
        </p>
      </div>

      {/* Main tabs */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ backgroundColor: 'rgba(10,22,40,0.06)' }}>
        {([
          { id: 'scan' as ActiveTab, label: 'Escaneo Rápido', Icon: ScanLine },
          { id: 'config' as ActiveTab, label: 'Configurar Códigos', Icon: Barcode },
        ] as const).map(({ id, label, Icon }) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all"
            style={activeTab === id
              ? { backgroundColor: 'white', color: brand.navy[950], boxShadow: '0 1px 4px rgba(0,0,0,0.10)' }
              : { color: '#64748B' }}>
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {/* ─── SCAN TAB ─── */}
      {activeTab === 'scan' && (
        <>
          <div style={glass} className="rounded-2xl p-6">
            <form onSubmit={handleScan} className="flex gap-3">
              <div className="flex items-center gap-3 flex-1 bg-white/80 rounded-xl px-4 py-3 border border-white/80">
                <ScanLine size={20} style={{ color: brand.orange[500] }} />
                <input
                  ref={inputRef}
                  value={scanInput}
                  onChange={(e) => setScanInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleScan(e as unknown as React.FormEvent); }}
                  placeholder="Escanea código de barras o ingresa SKU..."
                  className="flex-1 text-base bg-transparent outline-none font-mono"
                  style={{ color: brand.navy[950] }}
                  autoFocus
                />
              </div>
              <button type="submit"
                className="px-5 py-3 rounded-xl text-white font-semibold hover:opacity-90"
                style={{ background: `linear-gradient(135deg, ${brand.orange[500]}, ${brand.orange[600]})` }}>
                <Search size={18} />
              </button>
            </form>
            <p className="text-xs text-slate-400 mt-3 text-center">
              Compatible con lector USB · acepta SKU y códigos de barras asignados
            </p>
          </div>

          {result && (
            <div className={`rounded-2xl p-4 flex items-center gap-3 ${result.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              {result.success ? <CheckCircle2 size={20} style={{ color: '#16A34A' }} /> : <AlertCircle size={20} style={{ color: '#DC2626' }} />}
              <span className="text-sm font-medium" style={{ color: result.success ? '#166534' : '#991B1B' }}>{result.message}</span>
            </div>
          )}

          {searchLoading && sku && (
            <div style={glass} className="rounded-2xl p-6 text-center text-slate-400 text-sm">Buscando...</div>
          )}

          {product && !searchLoading && (
            <>
              <div style={glass} className="rounded-2xl p-5">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: `linear-gradient(135deg, ${brand.orange[50]}, ${brand.orange[100]})` }}>
                    <Package size={22} style={{ color: brand.orange[500] }} />
                  </div>
                  <div className="flex-1">
                    <h2 className="font-bold text-base" style={{ color: brand.navy[950] }}>{product.name}</h2>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="font-mono text-sm" style={{ color: brand.navy[600] }}>{product.sku}</span>
                      {product.barcode && <span className="text-xs font-mono text-slate-400">· {product.barcode}</span>}
                    </div>
                    <div className="flex gap-4 mt-2">
                      <div>
                        <div className="text-xs text-slate-400">Categoría</div>
                        <div className="text-sm font-medium" style={{ color: brand.navy[800] }}>{product.category.name}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-400">Precio Retail</div>
                        <div className="text-sm font-medium" style={{ color: brand.navy[800] }}>{formatCurrency(Number(product.retailPrice))}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-400">Stock Actual</div>
                        <div className="text-lg font-bold" style={{ color: currentStock === 0 ? '#DC2626' : brand.navy[900] }}>
                          {currentStock} uds
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div style={glass} className="rounded-2xl p-5 space-y-4">
                <h3 className="font-bold text-sm" style={{ color: brand.navy[950] }}>Registrar Movimiento</h3>
                <div className="grid grid-cols-3 gap-2">
                  {(['OUT', 'IN', 'ADJUSTMENT'] as const).map((t) => {
                    const meta = { OUT: { label: 'Salida', color: '#DC2626' }, IN: { label: 'Entrada', color: '#059669' }, ADJUSTMENT: { label: 'Ajuste', color: '#D97706' } }[t];
                    return (
                      <button key={t} onClick={() => setMovementType(t)}
                        className="py-2.5 rounded-xl text-sm font-semibold transition-all"
                        style={movementType === t ? { backgroundColor: meta.color, color: '#fff' } : { backgroundColor: 'rgba(0,0,0,0.04)', color: meta.color, border: `1px solid ${meta.color}30` }}>
                        {meta.label}
                      </button>
                    );
                  })}
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-2" style={{ color: brand.navy[700] }}>Cantidad</label>
                  <div className="flex items-center gap-3">
                    <button onClick={() => setQuantity(q => String(Math.max(1, parseInt(q) - 1)))}
                      className="w-10 h-10 rounded-xl flex items-center justify-center border hover:bg-slate-50">
                      <Minus size={16} style={{ color: brand.navy[600] }} />
                    </button>
                    <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} min="1"
                      className="flex-1 text-center text-xl font-bold px-3 py-2 rounded-xl border border-slate-200 outline-none"
                      style={{ color: brand.navy[950] }} />
                    <button onClick={() => setQuantity(q => String(parseInt(q) + 1))}
                      className="w-10 h-10 rounded-xl flex items-center justify-center border hover:bg-slate-50">
                      <Plus size={16} style={{ color: brand.navy[600] }} />
                    </button>
                  </div>
                </div>

                <div className="flex justify-between text-sm p-3 rounded-xl" style={{ backgroundColor: 'rgba(10,22,40,0.04)' }}>
                  <span style={{ color: '#64748B' }}>Stock después del movimiento:</span>
                  <span className="font-bold" style={{
                    color: (() => {
                      const qty = parseInt(quantity) || 0;
                      const ns = movementType === 'IN' ? currentStock + qty : currentStock - qty;
                      return ns < 0 ? '#DC2626' : ns === 0 ? '#D97706' : '#059669';
                    })(),
                  }}>
                    {(() => { const qty = parseInt(quantity) || 0; return movementType === 'IN' ? currentStock + qty : currentStock - qty; })()} uds
                  </span>
                </div>

                {movementType === 'OUT' && currentStock < (parseInt(quantity) || 0) && (
                  <div className="px-3 py-2 rounded-xl text-sm text-red-700 bg-red-50 border border-red-200">
                    Stock insuficiente. Disponible: {currentStock} unidades.
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>Notas (opcional)</label>
                  <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="# orden, observación..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none" style={{ color: brand.navy[900] }} />
                </div>

                <button onClick={submitMovement}
                  disabled={createMovement.isPending || (movementType === 'OUT' && currentStock < (parseInt(quantity) || 0))}
                  className="w-full py-3 rounded-xl text-white font-semibold disabled:opacity-50 hover:opacity-90"
                  style={{ background: `linear-gradient(135deg, ${brand.orange[500]}, ${brand.orange[600]})` }}>
                  {createMovement.isPending ? 'Registrando...' : `Confirmar ${movementType === 'OUT' ? 'Salida' : movementType === 'IN' ? 'Entrada' : 'Ajuste'}`}
                </button>
              </div>
            </>
          )}

          {sku && !product && !searchLoading && (
            <div style={glass} className="rounded-2xl p-8 flex flex-col items-center gap-3">
              <Package size={40} style={{ color: '#CBD5E1' }} />
              <p className="text-slate-500 font-medium">Producto no encontrado</p>
              <p className="text-slate-400 text-sm">Código: <span className="font-mono">{sku}</span></p>
              <button
                onClick={() => { setActiveTab('config'); setConfigMode('individual'); }}
                className="text-sm font-medium px-4 py-2 rounded-xl"
                style={{ color: brand.orange[500], border: `1px solid ${brand.orange[100]}`, backgroundColor: brand.orange[50] }}>
                Asignar código de barras a un producto
              </button>
            </div>
          )}
        </>
      )}

      {/* ─── CONFIG TAB ─── */}
      {activeTab === 'config' && (
        <div className="space-y-4">
          {/* Config mode toggle */}
          <div className="flex gap-1 p-1 rounded-xl" style={{ backgroundColor: 'rgba(10,22,40,0.06)' }}>
            {([
              { id: 'individual' as ConfigMode, label: 'Individual', Icon: Barcode },
              { id: 'masa' as ConfigMode, label: 'Impresión en Masa', Icon: Layers },
            ] as const).map(({ id, label, Icon }) => (
              <button key={id} onClick={() => setConfigMode(id)}
                className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all"
                style={configMode === id
                  ? { backgroundColor: 'white', color: brand.navy[950], boxShadow: '0 1px 4px rgba(0,0,0,0.10)' }
                  : { color: '#64748B' }}>
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>

          {/* ── INDIVIDUAL MODE ── */}
          {configMode === 'individual' && (
            <>
              {/* Step 1: Product select dropdown */}
              <div style={glass} className="rounded-2xl p-5">
                <h3 className="font-bold text-sm mb-3" style={{ color: brand.navy[950] }}>
                  1. Seleccionar Producto
                </h3>
                <div
                  ref={individualInputRef}
                  className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 border border-slate-200 cursor-text"
                  onClick={openIndividualDropdown}>
                  <Search size={15} style={{ color: '#94A3B8' }} />
                  <input
                    value={configSearch}
                    onChange={(e) => { setConfigSearch(e.target.value); openIndividualDropdown(); }}
                    onFocus={openIndividualDropdown}
                    onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                    placeholder="Seleccionar producto del inventario..."
                    className="flex-1 text-sm bg-transparent outline-none"
                    style={{ color: brand.navy[950] }}
                  />
                  {configSearch
                    ? <button onMouseDown={(e) => { e.preventDefault(); setConfigSearch(''); setDebouncedSearch(''); setSelectedProductId(null); setBarcodeInput(''); setShowDropdown(false); }}><X size={14} className="text-slate-400" /></button>
                    : <ChevronDown size={14} className="text-slate-400 shrink-0" />
                  }
                </div>

                {showDropdown && typeof document !== 'undefined' && createPortal(
                  <div
                    style={{ position: 'fixed', top: individualPos.top, left: individualPos.left, width: individualPos.width, zIndex: 9999 }}
                    className="bg-white border border-slate-200 rounded-xl shadow-2xl max-h-64 overflow-y-auto">
                    {!productList ? (
                      <div className="px-4 py-3 text-sm text-slate-400">Cargando productos...</div>
                    ) : productList.products.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-slate-400">Sin resultados</div>
                    ) : (
                      <>
                        {!debouncedSearch && (
                          <div className="px-4 py-2 text-xs text-slate-400 border-b border-slate-100">
                            {productList.total} productos — escribe para filtrar
                          </div>
                        )}
                        {productList.products.map((p) => (
                          <button key={p.id}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setSelectedProductId(p.id);
                              setConfigSearch(p.name);
                              setShowDropdown(false);
                              setBarcodeInput(p.barcode ?? p.sku);
                              setConfigResult(null);
                            }}
                            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 text-left border-b border-slate-50 last:border-0"
                            style={selectedProductId === p.id ? { backgroundColor: brand.orange[50] } : {}}>
                            <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                              style={{ backgroundColor: brand.orange[100] }}>
                              <Package size={11} style={{ color: brand.orange[500] }} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate" style={{ color: brand.navy[950] }}>{p.name}</div>
                              <div className="text-xs font-mono" style={{ color: '#94A3B8' }}>{p.sku}</div>
                            </div>
                            <span className="shrink-0 text-xs px-2 py-0.5 rounded-full"
                              style={p.barcode ? { backgroundColor: '#DCFCE7', color: '#166534' } : { backgroundColor: '#FEF3C7', color: '#92400E' }}>
                              {p.barcode ? 'Asignado' : 'Sin código'}
                            </span>
                          </button>
                        ))}
                      </>
                    )}
                  </div>,
                  document.body
                )}
              </div>

              {/* Step 2: Configure barcode */}
              {selectedProductId && (
                <>
                  {selectedProduct && (
                    <div style={glass} className="rounded-2xl p-4 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: `linear-gradient(135deg, ${brand.orange[50]}, ${brand.orange[100]})` }}>
                        <Package size={18} style={{ color: brand.orange[500] }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm" style={{ color: brand.navy[950] }}>{selectedProduct.name}</div>
                        <div className="text-xs font-mono" style={{ color: brand.navy[600] }}>{selectedProduct.sku}</div>
                        {selectedProduct.barcode && (
                          <div className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>
                            Actual: <span className="font-mono">{selectedProduct.barcode}</span>
                          </div>
                        )}
                      </div>
                      <span className="shrink-0 text-xs px-2 py-1 rounded-full font-medium"
                        style={selectedProduct.barcode ? { backgroundColor: '#DCFCE7', color: '#166534' } : { backgroundColor: '#FEF3C7', color: '#92400E' }}>
                        {selectedProduct.barcode ? 'Asignado' : 'Sin código'}
                      </span>
                    </div>
                  )}

                  <div style={glass} className="rounded-2xl p-5 space-y-4">
                    <h3 className="font-bold text-sm" style={{ color: brand.navy[950] }}>
                      2. Configurar Código de Barras / QR
                    </h3>
                    <div className="flex gap-2">
                      <div className="flex-1 flex items-center gap-2 bg-white/80 rounded-xl px-4 py-3 border border-slate-200">
                        <Barcode size={15} style={{ color: '#94A3B8' }} />
                        <input
                          value={barcodeInput}
                          onChange={(e) => setBarcodeInput(e.target.value)}
                          placeholder="Ingresa o escanea el código de barras..."
                          className="flex-1 text-sm bg-transparent outline-none font-mono"
                          style={{ color: brand.navy[950] }}
                        />
                      </div>
                      <button
                        onClick={() => selectedProduct && setBarcodeInput(selectedProduct.sku)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold hover:opacity-80 shrink-0"
                        style={{ backgroundColor: brand.navy[950], color: 'white' }}>
                        <Wand2 size={13} />
                        Desde SKU
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="rounded-xl border border-slate-200 p-3 bg-white">
                        <div className="text-xs font-semibold text-center mb-2" style={{ color: '#64748B' }}>Código de Barras (Code128)</div>
                        <div className="min-h-[90px] flex items-center justify-center">
                          {barcodeInput ? (
                            <svg ref={barcodeRef} className="w-full" />
                          ) : (
                            <div className="text-center">
                              <Barcode size={32} style={{ color: '#CBD5E1', margin: '0 auto' }} />
                              <p className="text-xs text-slate-300 mt-1">Vista previa</p>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-200 p-3 bg-white">
                        <div className="text-xs font-semibold text-center mb-2" style={{ color: '#64748B' }}>Código QR</div>
                        <div className="min-h-[90px] flex items-center justify-center">
                          {qrDataUrl ? (
                            <img src={qrDataUrl} alt="QR" className="mx-auto" style={{ width: 110, height: 110 }} />
                          ) : (
                            <div className="text-center">
                              <QrCode size={32} style={{ color: '#CBD5E1', margin: '0 auto' }} />
                              <p className="text-xs text-slate-300 mt-1">Vista previa</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {configResult && (
                      <div className={`rounded-xl p-3 flex items-center gap-2 ${configResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                        {configResult.success ? <CheckCircle2 size={16} style={{ color: '#16A34A' }} /> : <AlertCircle size={16} style={{ color: '#DC2626' }} />}
                        <span className="text-sm" style={{ color: configResult.success ? '#166534' : '#991B1B' }}>{configResult.message}</span>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button
                        onClick={() => { if (selectedProductId && barcodeInput.trim()) setBarcodeM.mutate({ productId: selectedProductId, barcode: barcodeInput.trim() }); }}
                        disabled={!barcodeInput.trim() || setBarcodeM.isPending}
                        className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-white font-semibold disabled:opacity-50 hover:opacity-90"
                        style={{ background: `linear-gradient(135deg, ${brand.orange[500]}, ${brand.orange[600]})` }}>
                        <Save size={15} />
                        {setBarcodeM.isPending ? 'Guardando...' : 'Guardar Código'}
                      </button>
                      <button
                        onClick={handlePrintSingle}
                        disabled={!barcodeInput || !selectedProduct}
                        className="flex items-center gap-2 px-4 py-3 rounded-xl font-semibold text-sm hover:opacity-80 disabled:opacity-40"
                        style={{ backgroundColor: brand.navy[950], color: 'white' }}>
                        <Printer size={15} />
                        Imprimir
                      </button>
                    </div>
                  </div>
                </>
              )}

              {!selectedProductId && (
                <div style={glass} className="rounded-2xl p-8 text-center">
                  <Barcode size={40} style={{ color: '#CBD5E1', margin: '0 auto 12px' }} />
                  <p className="text-slate-400 text-sm">Selecciona un producto del dropdown para configurar su código</p>
                </div>
              )}
            </>
          )}

          {/* ── BULK MODE ── */}
          {configMode === 'masa' && (
            <>
              {/* Add product to batch */}
              <div style={glass} className="rounded-2xl p-5">
                <h3 className="font-bold text-sm mb-3" style={{ color: brand.navy[950] }}>
                  Agregar productos al lote
                </h3>
                <div
                  ref={bulkInputRef}
                  className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 border border-slate-200 cursor-text"
                  onClick={openBulkDropdown}>
                  <Search size={15} style={{ color: '#94A3B8' }} />
                  <input
                    value={bulkSearch}
                    onChange={(e) => { setBulkSearch(e.target.value); openBulkDropdown(); }}
                    onFocus={openBulkDropdown}
                    onBlur={() => setTimeout(() => setShowBulkDropdown(false), 200)}
                    placeholder="Buscar producto para agregar al lote..."
                    className="flex-1 text-sm bg-transparent outline-none"
                    style={{ color: brand.navy[950] }}
                  />
                  <ChevronDown size={14} className="text-slate-400 shrink-0" />
                </div>

                {showBulkDropdown && typeof document !== 'undefined' && createPortal(
                  <div
                    style={{ position: 'fixed', top: bulkPos.top, left: bulkPos.left, width: bulkPos.width, zIndex: 9999 }}
                    className="bg-white border border-slate-200 rounded-xl shadow-2xl max-h-56 overflow-y-auto">
                    {!bulkSearchResults ? (
                      <div className="px-4 py-3 text-sm text-slate-400">Cargando productos...</div>
                    ) : bulkSearchResults.products.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-slate-400">Sin resultados</div>
                    ) : (
                      <>
                        {!bulkDebouncedSearch && (
                          <div className="px-4 py-2 text-xs text-slate-400 border-b border-slate-100">
                            {bulkSearchResults.total} productos — escribe para filtrar
                          </div>
                        )}
                        {bulkSearchResults.products.map((p) => {
                          const already = bulkItems.some(i => i.productId === p.id);
                          return (
                            <button key={p.id}
                              onMouseDown={(e) => { e.preventDefault(); if (!already) addToBatch(p); }}
                              disabled={already}
                              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 text-left border-b border-slate-50 last:border-0 disabled:opacity-40">
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium truncate" style={{ color: brand.navy[950] }}>{p.name}</div>
                                <div className="text-xs font-mono" style={{ color: '#94A3B8' }}>{p.sku}</div>
                              </div>
                              <span className="shrink-0 text-xs px-2 py-0.5 rounded-full"
                                style={already
                                  ? { backgroundColor: '#F1F5F9', color: '#94A3B8' }
                                  : p.barcode
                                    ? { backgroundColor: '#DCFCE7', color: '#166534' }
                                    : { backgroundColor: '#FEF3C7', color: '#92400E' }}>
                                {already ? 'Agregado' : p.barcode ? 'Con código' : 'Sin código'}
                              </span>
                            </button>
                          );
                        })}
                      </>
                    )}
                  </div>,
                  document.body
                )}
              </div>

              {/* Batch table */}
              {bulkItems.length > 0 ? (
                <div style={glass} className="rounded-2xl overflow-hidden">
                  {/* Header */}
                  <div className="grid px-4 py-2.5 text-xs font-semibold border-b border-slate-200/60"
                    style={{ color: '#94A3B8', gridTemplateColumns: '1fr 180px 90px 36px' }}>
                    <span>Producto / SKU</span>
                    <span>Código de Barras</span>
                    <span className="text-center">Etiquetas</span>
                    <span />
                  </div>

                  {/* Rows */}
                  <div className="divide-y divide-slate-100/60">
                    {bulkItems.map((item) => {
                      const dirty = item.barcode.trim() && item.barcode !== item.originalBarcode;
                      return (
                        <div key={item.productId}
                          className="grid items-center px-4 py-3 gap-3"
                          style={{ gridTemplateColumns: '1fr 180px 90px 36px' }}>
                          {/* Product info */}
                          <div className="min-w-0">
                            <div className="text-sm font-semibold truncate" style={{ color: brand.navy[950] }}>{item.name}</div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs font-mono" style={{ color: brand.navy[600] }}>{item.sku}</span>
                              {dirty && (
                                <span className="text-xs px-1.5 py-0.5 rounded-full"
                                  style={{ backgroundColor: '#FEF3C7', color: '#92400E' }}>
                                  Sin guardar
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Barcode input */}
                          <input
                            value={item.barcode}
                            onChange={(e) => setBulkItems(prev => prev.map(i => i.productId === item.productId ? { ...i, barcode: e.target.value } : i))}
                            className="text-xs font-mono px-2.5 py-1.5 rounded-lg border border-slate-200 outline-none w-full"
                            style={{ color: brand.navy[950] }}
                          />

                          {/* Quantity stepper */}
                          <div className="flex items-center gap-1 justify-center">
                            <button onClick={() => setBulkItems(prev => prev.map(i => i.productId === item.productId ? { ...i, quantity: Math.max(1, i.quantity - 1) } : i))}
                              className="w-6 h-6 rounded-md flex items-center justify-center border hover:bg-slate-50">
                              <Minus size={11} style={{ color: brand.navy[600] }} />
                            </button>
                            <input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => setBulkItems(prev => prev.map(i => i.productId === item.productId ? { ...i, quantity: Math.max(1, parseInt(e.target.value) || 1) } : i))}
                              className="w-8 text-center text-sm font-bold outline-none"
                              style={{ color: brand.navy[950] }}
                              min="1"
                            />
                            <button onClick={() => setBulkItems(prev => prev.map(i => i.productId === item.productId ? { ...i, quantity: i.quantity + 1 } : i))}
                              className="w-6 h-6 rounded-md flex items-center justify-center border hover:bg-slate-50">
                              <Plus size={11} style={{ color: brand.navy[600] }} />
                            </button>
                          </div>

                          {/* Remove */}
                          <button onClick={() => setBulkItems(prev => prev.filter(i => i.productId !== item.productId))}
                            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-50">
                            <Trash2 size={13} style={{ color: '#DC2626' }} />
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {/* Totals bar */}
                  <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200/60"
                    style={{ backgroundColor: 'rgba(10,22,40,0.03)' }}>
                    <div className="text-sm" style={{ color: '#64748B' }}>
                      <span className="font-semibold" style={{ color: brand.navy[950] }}>{bulkItems.length}</span> productos ·{' '}
                      <span className="font-semibold" style={{ color: brand.navy[950] }}>{totalLabels}</span> etiquetas totales
                      {dirtyCount > 0 && (
                        <span className="ml-2 text-xs px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: '#FEF3C7', color: '#92400E' }}>
                          {dirtyCount} sin guardar
                        </span>
                      )}
                    </div>
                    <button onClick={() => setBulkItems([])}
                      className="text-xs text-slate-400 hover:text-red-500">
                      Limpiar lote
                    </button>
                  </div>
                </div>
              ) : (
                <div style={glass} className="rounded-2xl p-8 text-center">
                  <Layers size={40} style={{ color: '#CBD5E1', margin: '0 auto 12px' }} />
                  <p className="text-slate-400 text-sm">Agrega productos al lote usando el buscador</p>
                  <p className="text-slate-300 text-xs mt-1">Luego asigna cantidades y genera todas las etiquetas de una vez</p>
                </div>
              )}

              {/* Bulk actions */}
              {bulkItems.length > 0 && (
                <div style={glass} className="rounded-2xl p-4 space-y-3">
                  {bulkResult && (
                    <div className={`rounded-xl p-3 flex items-center gap-2 ${bulkResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                      {bulkResult.success ? <CheckCircle2 size={16} style={{ color: '#16A34A' }} /> : <AlertCircle size={16} style={{ color: '#DC2626' }} />}
                      <span className="text-sm" style={{ color: bulkResult.success ? '#166534' : '#991B1B' }}>{bulkResult.message}</span>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={autoGenerateAll}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold hover:opacity-80"
                      style={{ backgroundColor: 'rgba(10,22,40,0.06)', color: brand.navy[800] }}>
                      <Wand2 size={14} />
                      Auto-generar desde SKU (sin código)
                    </button>

                    {dirtyCount > 0 && (
                      <button
                        onClick={saveAllBarcodes}
                        disabled={bulkSaving}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 hover:opacity-90"
                        style={{ backgroundColor: '#0F1F3A', color: 'white' }}>
                        <Save size={14} />
                        {bulkSaving ? 'Guardando...' : `Guardar ${dirtyCount} código(s)`}
                      </button>
                    )}

                    <button
                      onClick={() => void printAll()}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90 ml-auto"
                      style={{ background: `linear-gradient(135deg, ${brand.orange[500]}, ${brand.orange[600]})`, color: 'white' }}>
                      <Printer size={14} />
                      Imprimir {totalLabels} etiqueta{totalLabels !== 1 ? 's' : ''}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
