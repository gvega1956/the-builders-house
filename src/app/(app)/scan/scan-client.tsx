'use client';

import { useState, useRef } from 'react';
import { trpc } from '@/lib/trpc';
import { brand } from '@/lib/brand';
import { formatCurrency } from '@/lib/utils';
import { ScanLine, Package, Search, Plus, Minus, CheckCircle2, AlertCircle } from 'lucide-react';

const glass = {
  backgroundColor: 'rgba(255,255,255,0.72)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: '1px solid rgba(255,255,255,0.85)',
  boxShadow: '0 4px 24px rgba(10,22,40,0.07)',
} as React.CSSProperties;

type MovementResult = { success: boolean; message: string };

export function ScanClient() {
  const [scanInput, setScanInput] = useState('');
  const [sku, setSku] = useState('');
  const [movementType, setMovementType] = useState<'IN' | 'OUT' | 'ADJUSTMENT'>('OUT');
  const [quantity, setQuantity] = useState('1');
  const [notes, setNotes] = useState('');
  const [result, setResult] = useState<MovementResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: product, isLoading: searchLoading } = trpc.products.bySku.useQuery(
    sku,
    { enabled: sku.length > 2, retry: false }
  );

  const createMovement = trpc.movements.create.useMutation({
    onSuccess: () => {
      setResult({ success: true, message: 'Movimiento registrado correctamente' });
      setScanInput('');
      setSku('');
      setQuantity('1');
      setNotes('');
      setTimeout(() => setResult(null), 3000);
    },
    onError: (e) => {
      setResult({ success: false, message: e.message });
    },
  });

  function handleScan(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = scanInput.trim();
    if (trimmed) {
      setSku(trimmed);
      setResult(null);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleScan(e as unknown as React.FormEvent);
  }

  function submitMovement() {
    if (!product || !product.locations[0]) return;
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

  const location = product?.locations[0];
  const currentStock = location?.quantityOnHand ?? 0;

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: brand.navy[950] }}>Escaneo Rápido</h1>
        <p className="text-sm mt-0.5" style={{ color: '#64748B' }}>
          Escanea o ingresa el SKU / código de barras para registrar movimientos
        </p>
      </div>

      {/* Scanner Input */}
      <div style={glass} className="rounded-2xl p-6">
        <form onSubmit={handleScan} className="flex gap-3">
          <div className="flex items-center gap-3 flex-1 bg-white/80 rounded-xl px-4 py-3 border border-white/80">
            <ScanLine size={20} style={{ color: brand.orange[500] }} />
            <input
              ref={inputRef}
              value={scanInput}
              onChange={(e) => setScanInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escanea código de barras o ingresa SKU..."
              className="flex-1 text-base bg-transparent outline-none font-mono"
              style={{ color: brand.navy[950] }}
              autoFocus
            />
          </div>
          <button type="submit"
            className="px-5 py-3 rounded-xl text-white font-semibold text-sm hover:opacity-90"
            style={{ background: `linear-gradient(135deg, ${brand.orange[500]}, ${brand.orange[600]})` }}>
            <Search size={18} />
          </button>
        </form>

        <p className="text-xs text-slate-400 mt-3 text-center">
          Conecta un lector de códigos de barras USB · el cursor debe estar en el campo de entrada
        </p>
      </div>

      {/* Result */}
      {result && (
        <div className={`rounded-2xl p-4 flex items-center gap-3 ${result.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
          {result.success
            ? <CheckCircle2 size={20} style={{ color: '#16A34A' }} />
            : <AlertCircle size={20} style={{ color: '#DC2626' }} />
          }
          <span className="text-sm font-medium" style={{ color: result.success ? '#166534' : '#991B1B' }}>
            {result.message}
          </span>
        </div>
      )}

      {/* Product Found */}
      {searchLoading && sku && (
        <div style={glass} className="rounded-2xl p-6 text-center text-slate-400 text-sm">
          Buscando producto...
        </div>
      )}

      {product && !searchLoading && (
        <>
          {/* Product Card */}
          <div style={glass} className="rounded-2xl p-5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: `linear-gradient(135deg, ${brand.orange[50]}, ${brand.orange[100]})` }}>
                <Package size={22} style={{ color: brand.orange[500] }} />
              </div>
              <div className="flex-1">
                <h2 className="font-bold text-base" style={{ color: brand.navy[950] }}>{product.name}</h2>
                <div className="font-mono text-sm mt-0.5" style={{ color: brand.navy[600] }}>{product.sku}</div>
                <div className="flex gap-4 mt-2">
                  <div>
                    <span className="text-xs text-slate-400">Categoría</span>
                    <div className="text-sm font-medium" style={{ color: brand.navy[800] }}>{product.category.name}</div>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400">Precio Retail</span>
                    <div className="text-sm font-medium" style={{ color: brand.navy[800] }}>{formatCurrency(Number(product.retailPrice))}</div>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400">Stock Actual</span>
                    <div className="text-lg font-bold" style={{ color: currentStock === 0 ? '#DC2626' : brand.navy[900] }}>
                      {currentStock} uds
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Movement Form */}
          <div style={glass} className="rounded-2xl p-5 space-y-4">
            <h3 className="font-bold text-sm" style={{ color: brand.navy[950] }}>Registrar Movimiento</h3>

            {/* Type */}
            <div className="grid grid-cols-3 gap-2">
              {(['OUT', 'IN', 'ADJUSTMENT'] as const).map((t) => {
                const labels = { OUT: { label: 'Salida', color: '#DC2626' }, IN: { label: 'Entrada', color: '#059669' }, ADJUSTMENT: { label: 'Ajuste', color: '#D97706' } };
                const meta = labels[t];
                return (
                  <button key={t} onClick={() => setMovementType(t)}
                    className="py-2.5 rounded-xl text-sm font-semibold transition-all"
                    style={movementType === t
                      ? { backgroundColor: meta.color, color: '#FFFFFF' }
                      : { backgroundColor: 'rgba(0,0,0,0.04)', color: meta.color, border: `1px solid ${meta.color}30` }
                    }>
                    {meta.label}
                  </button>
                );
              })}
            </div>

            {/* Quantity */}
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

            {/* Stock Preview */}
            <div className="flex justify-between text-sm p-3 rounded-xl"
              style={{ backgroundColor: 'rgba(10,22,40,0.04)' }}>
              <span style={{ color: '#64748B' }}>Stock después del movimiento:</span>
              <span className="font-bold" style={{
                color: (() => {
                  const qty = parseInt(quantity) || 0;
                  const newStock = movementType === 'IN' ? currentStock + qty : currentStock - qty;
                  return newStock < 0 ? '#DC2626' : newStock === 0 ? '#D97706' : '#059669';
                })()
              }}>
                {(() => {
                  const qty = parseInt(quantity) || 0;
                  return movementType === 'IN' ? currentStock + qty : currentStock - qty;
                })()}
                {' '}uds
              </span>
            </div>

            {movementType === 'OUT' && currentStock < (parseInt(quantity) || 0) && (
              <div className="px-3 py-2 rounded-xl text-sm text-red-700 bg-red-50 border border-red-200">
                ⚠ Stock insuficiente. Disponible: {currentStock} unidades.
              </div>
            )}

            {/* Notes */}
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>Notas (opcional)</label>
              <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="# orden, observación..."
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none" style={{ color: brand.navy[900] }} />
            </div>

            <button
              onClick={submitMovement}
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
          <p className="text-slate-400 text-sm">SKU: <span className="font-mono">{sku}</span></p>
          <a href="/inventory" className="text-sm font-medium" style={{ color: brand.orange[500] }}>
            Crear nuevo producto →
          </a>
        </div>
      )}
    </div>
  );
}

