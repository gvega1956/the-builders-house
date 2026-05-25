'use client';

import { useState, useRef } from 'react';
import { trpc } from '@/lib/trpc';
import { brand } from '@/lib/brand';
import { formatCurrency } from '@/lib/utils';
import { glass } from '@/lib/ui';
import { Search, Plus, Minus, Trash2, ShoppingCart, X, CheckCircle } from 'lucide-react';

type CartItem = {
  productId: string;
  locationId: string;
  name: string;
  sku: string;
  retailPrice: number;
  wholesalePrice: number;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
};

const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Efectivo', CHECK: 'Cheque', TRANSFER: 'Transferencia', CARD: 'Tarjeta', CREDIT: 'Crédito',
};

export function PosClient() {
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerType, setCustomerType] = useState<'RETAIL' | 'WHOLESALE'>('RETAIL');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CHECK' | 'TRANSFER' | 'CARD' | 'CREDIT'>('CASH');
  const [paymentRef, setPaymentRef] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const { data: sysConfig } = trpc.settings.getSystemConfig.useQuery();
  const TAX_RATE = sysConfig?.TAX_RATE ? Number(sysConfig.TAX_RATE) : 0.115;

  const { data: productData } = trpc.products.list.useQuery(
    { search, pageSize: 12 },
    { enabled: search.length >= 2 }
  );

  const { data: customerData } = trpc.customers.list.useQuery(
    { search: customerSearch, pageSize: 8 },
    { enabled: customerSearch.length >= 2 }
  );

  const selectedCustomer = customerData?.customers.find((c) => c.id === customerId)
    ?? (customerId ? undefined : null);

  const subtotal = cart.reduce((s, i) => s + i.lineTotal, 0);
  const taxAmount = subtotal * TAX_RATE;
  const total = subtotal + taxAmount;

  const createMutation = trpc.invoicing.create.useMutation();
  const payMutation = trpc.invoicing.addPayment.useMutation();

  function addToCart(product: NonNullable<typeof productData>['products'][number]) {
    const loc = product.locations[0];
    if (!loc) { setError(`${product.sku} no tiene ubicación de stock`); return; }
    const retail = Number(product.retailPrice);
    const wholesale = Number(product.wholesalePrice);
    const unitPrice = customerType === 'WHOLESALE' ? wholesale : retail;
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      if (existing) {
        return prev.map((i) =>
          i.productId === product.id
            ? { ...i, quantity: i.quantity + 1, lineTotal: (i.quantity + 1) * i.unitPrice }
            : i
        );
      }
      return [...prev, {
        productId: product.id,
        locationId: loc.id,
        name: product.name,
        sku: product.sku,
        retailPrice: retail,
        wholesalePrice: wholesale,
        unitPrice,
        quantity: 1,
        lineTotal: unitPrice,
      }];
    });
    setSearch('');
    searchRef.current?.focus();
  }

  function applyCustomerPricing(type: 'RETAIL' | 'WHOLESALE') {
    setCart((prev) => prev.map((i) => {
      const unitPrice = type === 'WHOLESALE' ? i.wholesalePrice : i.retailPrice;
      return { ...i, unitPrice, lineTotal: i.quantity * unitPrice };
    }));
  }

  function updateQty(productId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((i) =>
          i.productId === productId
            ? { ...i, quantity: i.quantity + delta, lineTotal: (i.quantity + delta) * i.unitPrice }
            : i
        )
        .filter((i) => i.quantity > 0)
    );
  }

  function removeItem(productId: string) {
    setCart((prev) => prev.filter((i) => i.productId !== productId));
  }

  async function checkout() {
    if (!customerId) { setError('Selecciona un cliente'); return; }
    if (cart.length === 0) { setError('Agrega productos al carrito'); return; }
    setError('');

    try {
      const invoice = await createMutation.mutateAsync({
        customerId,
        type: 'INVOICE',
        taxRate: TAX_RATE,
        items: cart.map((i) => ({
          productId: i.productId,
          locationId: i.locationId,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          discountPercent: 0,
        })),
      });

      await payMutation.mutateAsync({
        invoiceId: invoice.id,
        amount: total,
        method: paymentMethod,
        reference: paymentRef || undefined,
      });

      setSuccess(`Factura ${invoice.invoiceNumber} emitida y pagada`);
      setCart([]);
      setCustomerId('');
      setCustomerSearch('');
      setPaymentRef('');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al procesar');
    }
  }

  function clearSuccess() {
    setSuccess('');
    searchRef.current?.focus();
  }

  return (
    <div className="h-[calc(100vh-7rem)] flex gap-4">
      {/* ── Left: Product Search + Cart ── */}
      <div className="flex-1 flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: brand.navy[950] }}>Punto de Venta</h1>
          <p className="text-sm mt-0.5" style={{ color: '#64748B' }}>Venta rápida con cobro inmediato</p>
        </div>

        {/* Search */}
        <div style={glass} className="rounded-2xl p-3 relative">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ backgroundColor: 'rgba(10,22,40,0.04)' }}>
            <Search size={16} style={{ color: '#94A3B8' }} />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por SKU, nombre o código de barras..."
              className="flex-1 bg-transparent text-sm outline-none"
              style={{ color: brand.navy[900] }}
              autoFocus
            />
            {search && <button onClick={() => setSearch('')}><X size={14} style={{ color: '#94A3B8' }} /></button>}
          </div>

          {search.length >= 2 && productData && (
            <div className="mt-2 space-y-1 max-h-56 overflow-y-auto">
              {productData.products.length === 0 ? (
                <div className="text-sm text-center py-4" style={{ color: '#94A3B8' }}>Sin resultados</div>
              ) : (
                productData.products.map((p) => {
                  const stock = p.locations.reduce((s, l) => s + l.quantityOnHand, 0);
                  return (
                    <button key={p.id} onClick={() => addToCart(p)}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-slate-50 text-left transition-colors"
                      style={{ border: '1px solid rgba(10,22,40,0.05)' }}>
                      <div>
                        <div className="text-sm font-medium" style={{ color: brand.navy[900] }}>{p.name}</div>
                        <div className="text-xs font-mono" style={{ color: '#94A3B8' }}>{p.sku}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold" style={{ color: brand.orange[500] }}>
                          {formatCurrency(customerType === 'WHOLESALE' ? Number(p.wholesalePrice) : Number(p.retailPrice))}
                        </div>
                        {customerType === 'WHOLESALE' && (
                          <div className="text-[10px]" style={{ color: '#1D4ED8' }}>precio mayor</div>
                        )}
                        <div className="text-xs" style={{ color: stock > 0 ? '#16A34A' : '#DC2626' }}>{stock} en stock</div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Cart */}
        <div style={glass} className="rounded-2xl flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid rgba(10,22,40,0.08)' }}>
            <div className="flex items-center gap-2">
              <ShoppingCart size={16} style={{ color: brand.orange[500] }} />
              <span className="font-semibold text-sm" style={{ color: brand.navy[950] }}>
                Carrito · {cart.length} {cart.length === 1 ? 'producto' : 'productos'}
              </span>
            </div>
            {cart.length > 0 && (
              <button onClick={() => setCart([])} className="text-xs text-red-400 hover:text-red-600">Vaciar</button>
            )}
          </div>

          {cart.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3" style={{ color: '#CBD5E1' }}>
              <ShoppingCart size={40} />
              <span className="text-sm">Busca un producto para agregar</span>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {cart.map((item) => (
                <div key={item.productId} className="flex items-center gap-3 px-5 py-3"
                  style={{ borderBottom: '1px solid rgba(10,22,40,0.05)' }}>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate" style={{ color: brand.navy[900] }}>{item.name}</div>
                    <div className="text-xs font-mono" style={{ color: '#94A3B8' }}>{item.sku} · {formatCurrency(item.unitPrice)}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => updateQty(item.productId, -1)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-slate-100"
                      style={{ border: '1px solid rgba(10,22,40,0.1)' }}>
                      <Minus size={12} />
                    </button>
                    <span className="w-8 text-center text-sm font-semibold" style={{ color: brand.navy[950] }}>
                      {item.quantity}
                    </span>
                    <button onClick={() => updateQty(item.productId, 1)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-slate-100"
                      style={{ border: '1px solid rgba(10,22,40,0.1)' }}>
                      <Plus size={12} />
                    </button>
                  </div>
                  <div className="w-20 text-right text-sm font-bold" style={{ color: brand.navy[950] }}>
                    {formatCurrency(item.lineTotal)}
                  </div>
                  <button onClick={() => removeItem(item.productId)} className="text-red-300 hover:text-red-500">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Totals summary in cart */}
          {cart.length > 0 && (
            <div className="px-5 py-3" style={{ borderTop: '1px solid rgba(10,22,40,0.08)', backgroundColor: 'rgba(10,22,40,0.02)' }}>
              <div className="flex justify-between text-xs mb-1" style={{ color: '#64748B' }}>
                <span>Subtotal</span><span>{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between text-xs mb-1" style={{ color: '#64748B' }}>
                <span>IVU {(TAX_RATE * 100).toFixed(1)}%</span><span>{formatCurrency(taxAmount)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold mt-1.5" style={{ color: brand.navy[950] }}>
                <span>Total</span><span style={{ color: brand.orange[500] }}>{formatCurrency(total)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Right: Customer + Payment ── */}
      <div className="w-80 flex flex-col gap-4">
        {/* Customer */}
        <div style={glass} className="rounded-2xl p-4">
          <div className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: '#94A3B8' }}>Cliente</div>

          {customerId && selectedCustomer ? (
            <div className="flex items-start justify-between">
              <div>
                <div className="text-sm font-semibold" style={{ color: brand.navy[950] }}>{selectedCustomer.name}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-slate-400">{selectedCustomer.code}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
                    style={customerType === 'WHOLESALE'
                      ? { backgroundColor: '#EFF6FF', color: '#1D4ED8' }
                      : { backgroundColor: '#F1F5F9', color: '#475569' }}>
                    {customerType === 'WHOLESALE' ? 'MAYORISTA' : 'RETAIL'}
                  </span>
                </div>
              </div>
              <button onClick={() => { setCustomerId(''); setCustomerSearch(''); setCustomerType('RETAIL'); applyCustomerPricing('RETAIL'); }}
                className="text-slate-300 hover:text-slate-500"><X size={14} /></button>
            </div>
          ) : (
            <div className="relative">
              <input
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                placeholder="Buscar cliente..."
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none"
                style={{ color: brand.navy[900] }}
              />
              {customerSearch.length >= 2 && customerData && (
                <div className="absolute left-0 right-0 top-full mt-1 rounded-xl shadow-lg z-10 overflow-hidden"
                  style={{ backgroundColor: 'white', border: '1px solid rgba(10,22,40,0.1)' }}>
                  {customerData.customers.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-slate-400">Sin resultados</div>
                  ) : (
                    customerData.customers.map((c) => (
                      <button key={c.id} onClick={() => {
                        const type = c.type as 'RETAIL' | 'WHOLESALE';
                        setCustomerId(c.id);
                        setCustomerSearch('');
                        setCustomerType(type);
                        applyCustomerPricing(type);
                      }}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm"
                        style={{ borderBottom: '1px solid rgba(10,22,40,0.05)' }}>
                        <div className="font-medium" style={{ color: brand.navy[900] }}>{c.name}</div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-400">{c.code}</span>
                          {c.type === 'WHOLESALE' && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
                              style={{ backgroundColor: '#EFF6FF', color: '#1D4ED8' }}>MAYOR</span>
                          )}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Payment Method */}
        <div style={glass} className="rounded-2xl p-4">
          <div className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: '#94A3B8' }}>Método de Pago</div>
          <div className="grid grid-cols-2 gap-1.5 mb-3">
            {(['CASH', 'CARD', 'TRANSFER', 'CHECK', 'CREDIT'] as const).map((m) => (
              <button key={m} onClick={() => setPaymentMethod(m)}
                className="py-2 rounded-xl text-xs font-semibold transition-all"
                style={paymentMethod === m
                  ? { backgroundColor: brand.orange[500], color: '#FFFFFF' }
                  : { backgroundColor: 'rgba(10,22,40,0.04)', color: '#475569', border: '1px solid rgba(10,22,40,0.08)' }
                }>
                {PAYMENT_LABELS[m]}
              </button>
            ))}
          </div>
          {(paymentMethod === 'CHECK' || paymentMethod === 'TRANSFER') && (
            <input
              value={paymentRef}
              onChange={(e) => setPaymentRef(e.target.value)}
              placeholder={paymentMethod === 'CHECK' ? 'Número de cheque' : 'Referencia'}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none"
              style={{ color: brand.navy[900] }}
            />
          )}
        </div>

        {/* Total + Checkout */}
        <div style={glass} className="rounded-2xl p-4">
          <div className="space-y-2 mb-4">
            <div className="flex justify-between text-xs" style={{ color: '#64748B' }}>
              <span>Subtotal</span><span>{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between text-xs" style={{ color: '#64748B' }}>
              <span>IVU {(TAX_RATE * 100).toFixed(1)}%</span><span>{formatCurrency(taxAmount)}</span>
            </div>
            <div className="flex justify-between text-base font-bold pt-2"
              style={{ borderTop: '1px solid rgba(10,22,40,0.08)', color: brand.navy[950] }}>
              <span>Total</span>
              <span style={{ color: brand.orange[500] }}>{formatCurrency(total)}</span>
            </div>
          </div>

          {error && (
            <div className="mb-3 px-3 py-2 rounded-xl text-xs text-red-700 bg-red-50 border border-red-200">{error}</div>
          )}

          <button
            onClick={checkout}
            disabled={cart.length === 0 || !customerId || createMutation.isPending || payMutation.isPending}
            className="w-full py-3 rounded-xl text-white font-bold text-sm disabled:opacity-50 transition-opacity"
            style={{ background: `linear-gradient(135deg, ${brand.orange[500]}, ${brand.orange[600]})` }}>
            {createMutation.isPending || payMutation.isPending ? 'Procesando...' : `Cobrar ${formatCurrency(total)}`}
          </button>
        </div>
      </div>

      {/* ── Success overlay ── */}
      {success && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" style={{ backdropFilter: 'blur(4px)' }} onClick={clearSuccess} />
          <div className="relative rounded-2xl p-8 flex flex-col items-center gap-4 text-center"
            style={{ background: 'rgba(255,255,255,0.97)', boxShadow: '0 24px 64px rgba(10,22,40,0.18)', minWidth: 320 }}>
            <CheckCircle size={48} style={{ color: '#16A34A' }} />
            <div>
              <div className="text-lg font-bold" style={{ color: brand.navy[950] }}>¡Venta Completada!</div>
              <div className="text-sm mt-1" style={{ color: '#64748B' }}>{success}</div>
            </div>
            <button onClick={clearSuccess}
              className="px-6 py-2.5 rounded-xl text-white font-semibold text-sm"
              style={{ background: `linear-gradient(135deg, ${brand.orange[500]}, ${brand.orange[600]})` }}>
              Nueva Venta
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
