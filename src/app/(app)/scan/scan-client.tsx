'use client';

import { useState, useRef, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { brand } from '@/lib/brand';
import { formatCurrency } from '@/lib/utils';
import {
  ScanLine, Package, Search, Plus, Minus,
  CheckCircle2, AlertCircle, Barcode, QrCode,
  Printer, Wand2, Save, X,
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
  const [configSearch, setConfigSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const barcodeRef = useRef<SVGSVGElement>(null);
  const [configResult, setConfigResult] = useState<MovementResult | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(configSearch), 350);
    return () => clearTimeout(t);
  }, [configSearch]);

  // ── Queries ──
  const { data: product, isLoading: searchLoading } = trpc.products.scan.useQuery(
    sku, { enabled: sku.length > 0, retry: false }
  );

  const { data: productList } = trpc.products.list.useQuery(
    { search: debouncedSearch, pageSize: 20 },
    { enabled: debouncedSearch.length > 1 }
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

  // Render barcode preview
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
        format: 'CODE128',
        width: 2, height: 60,
        displayValue: true, fontSize: 13,
        margin: 8, background: '#ffffff', lineColor: '#0A1628',
      });
    } catch { /* invalid chars — ignore */ }
  }, [barcodeInput]);

  // Render QR preview
  useEffect(() => {
    if (!barcodeInput) { setQrDataUrl(''); return; }
    QRCode.toDataURL(barcodeInput, {
      width: 150, margin: 1,
      color: { dark: '#0A1628', light: '#ffffff' },
    }).then(setQrDataUrl).catch(() => setQrDataUrl(''));
  }, [barcodeInput]);

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

  function handlePrint() {
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

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: brand.navy[950] }}>Módulo de Escaneo</h1>
        <p className="text-sm mt-0.5" style={{ color: '#64748B' }}>
          Escaneo rápido y gestión de códigos de barras
        </p>
      </div>

      {/* Tabs */}
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
              {result.success
                ? <CheckCircle2 size={20} style={{ color: '#16A34A' }} />
                : <AlertCircle size={20} style={{ color: '#DC2626' }} />}
              <span className="text-sm font-medium" style={{ color: result.success ? '#166534' : '#991B1B' }}>
                {result.message}
              </span>
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
                    const meta = {
                      OUT: { label: 'Salida', color: '#DC2626' },
                      IN: { label: 'Entrada', color: '#059669' },
                      ADJUSTMENT: { label: 'Ajuste', color: '#D97706' },
                    }[t];
                    return (
                      <button key={t} onClick={() => setMovementType(t)}
                        className="py-2.5 rounded-xl text-sm font-semibold transition-all"
                        style={movementType === t
                          ? { backgroundColor: meta.color, color: '#fff' }
                          : { backgroundColor: 'rgba(0,0,0,0.04)', color: meta.color, border: `1px solid ${meta.color}30` }}>
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
                    {(() => {
                      const qty = parseInt(quantity) || 0;
                      return movementType === 'IN' ? currentStock + qty : currentStock - qty;
                    })()} uds
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
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none"
                    style={{ color: brand.navy[900] }} />
                </div>

                <button onClick={submitMovement}
                  disabled={createMovement.isPending || (movementType === 'OUT' && currentStock < (parseInt(quantity) || 0))}
                  className="w-full py-3 rounded-xl text-white font-semibold disabled:opacity-50 hover:opacity-90"
                  style={{ background: `linear-gradient(135deg, ${brand.orange[500]}, ${brand.orange[600]})` }}>
                  {createMovement.isPending
                    ? 'Registrando...'
                    : `Confirmar ${movementType === 'OUT' ? 'Salida' : movementType === 'IN' ? 'Entrada' : 'Ajuste'}`}
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
                onClick={() => { setActiveTab('config'); setConfigSearch(sku); setDebouncedSearch(sku); }}
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
          {/* Step 1: Search */}
          <div style={glass} className="rounded-2xl p-5">
            <h3 className="font-bold text-sm mb-3" style={{ color: brand.navy[950] }}>
              1. Seleccionar Producto
            </h3>
            <div className="flex items-center gap-3 bg-white/80 rounded-xl px-4 py-3 border border-slate-200 mb-3">
              <Search size={15} style={{ color: '#94A3B8' }} />
              <input
                value={configSearch}
                onChange={(e) => setConfigSearch(e.target.value)}
                placeholder="Buscar por nombre, SKU o código de barras..."
                className="flex-1 text-sm bg-transparent outline-none"
                style={{ color: brand.navy[950] }}
              />
              {configSearch && (
                <button
                  onClick={() => { setConfigSearch(''); setDebouncedSearch(''); setSelectedProductId(null); setBarcodeInput(''); }}
                  className="text-slate-400 hover:text-slate-600">
                  <X size={14} />
                </button>
              )}
            </div>

            {productList?.products && productList.products.length > 0 && debouncedSearch.length > 1 && (
              <div className="space-y-1 max-h-56 overflow-y-auto">
                {productList.products.map((p) => (
                  <button key={p.id}
                    onClick={() => {
                      setSelectedProductId(p.id);
                      setConfigSearch(p.name);
                      setDebouncedSearch('');
                      setBarcodeInput(p.barcode ?? p.sku);
                      setConfigResult(null);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors hover:bg-white/60"
                    style={selectedProductId === p.id
                      ? { backgroundColor: brand.orange[50], border: `1px solid ${brand.orange[100]}` }
                      : { border: '1px solid transparent' }}>
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: brand.orange[100] }}>
                      <Package size={13} style={{ color: brand.orange[500] }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate" style={{ color: brand.navy[950] }}>{p.name}</div>
                      <div className="text-xs font-mono" style={{ color: brand.navy[600] }}>{p.sku}</div>
                    </div>
                    <span className="shrink-0 text-xs px-2 py-0.5 rounded-full"
                      style={p.barcode
                        ? { backgroundColor: '#DCFCE7', color: '#166534' }
                        : { backgroundColor: '#FEF3C7', color: '#92400E' }}>
                      {p.barcode ? 'Con código' : 'Sin código'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Step 2: Configure codes */}
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
                        Código actual: <span className="font-mono">{selectedProduct.barcode}</span>
                      </div>
                    )}
                  </div>
                  <span className="shrink-0 text-xs px-2 py-1 rounded-full font-medium"
                    style={selectedProduct.barcode
                      ? { backgroundColor: '#DCFCE7', color: '#166534' }
                      : { backgroundColor: '#FEF3C7', color: '#92400E' }}>
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

                {/* Previews */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-xl border border-slate-200 p-3 bg-white">
                    <div className="text-xs font-semibold text-center mb-2" style={{ color: '#64748B' }}>
                      Código de Barras (Code128)
                    </div>
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
                    <div className="text-xs font-semibold text-center mb-2" style={{ color: '#64748B' }}>
                      Código QR
                    </div>
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
                    {configResult.success
                      ? <CheckCircle2 size={16} style={{ color: '#16A34A' }} />
                      : <AlertCircle size={16} style={{ color: '#DC2626' }} />}
                    <span className="text-sm" style={{ color: configResult.success ? '#166534' : '#991B1B' }}>
                      {configResult.message}
                    </span>
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      if (selectedProductId && barcodeInput.trim()) {
                        setBarcodeM.mutate({ productId: selectedProductId, barcode: barcodeInput.trim() });
                      }
                    }}
                    disabled={!barcodeInput.trim() || setBarcodeM.isPending}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-white font-semibold disabled:opacity-50 hover:opacity-90"
                    style={{ background: `linear-gradient(135deg, ${brand.orange[500]}, ${brand.orange[600]})` }}>
                    <Save size={15} />
                    {setBarcodeM.isPending ? 'Guardando...' : 'Guardar Código'}
                  </button>
                  <button
                    onClick={handlePrint}
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
              <p className="text-slate-400 text-sm">
                Busca y selecciona un producto para configurar su código de barras y QR
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
