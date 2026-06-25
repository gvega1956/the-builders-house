'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { trpc } from '@/lib/trpc';
import { brand } from '@/lib/brand';
import { formatCurrency, formatDate } from '@/lib/utils';
import { glass } from '@/lib/ui';
import {
  Plus, Search, Receipt, X, ChevronLeft, ChevronRight,
  Eye, Trash2, DollarSign, ShieldCheck, Printer,
  Building2, AlertCircle, CheckCircle2,
  FileText, TrendingUp, Clock, AlertTriangle, Pencil, ArrowRight,
} from 'lucide-react';

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  DRAFT:                 { bg: '#F1F5F9', text: '#475569', label: 'Borrador' },
  ISSUED:                { bg: '#EFF6FF', text: '#1D4ED8', label: 'Emitida' },
  PAID:                  { bg: '#F0FDF4', text: '#166534', label: 'Pagada' },
  PARTIAL:               { bg: '#FEF9C3', text: '#854D0E', label: 'Pago Parcial' },
  VOIDED:                { bg: '#FEF2F2', text: '#991B1B', label: 'Anulada' },
  PENDING_AUTHORIZATION: { bg: '#FFF7ED', text: '#C2410C', label: 'Pend. Autorización' },
  CONVERTED:             { bg: '#F0F9FF', text: '#0369A1', label: 'Convertida' },
};

const TYPE_CFG = {
  INVOICE:     { label: 'Factura',          shortLabel: 'FAC', color: brand.orange[500] },
  QUOTE:       { label: 'Cotización',        shortLabel: 'COT', color: '#0284C7' },
  CREDIT_NOTE: { label: 'Nota de Crédito',  shortLabel: 'NC',  color: '#7C3AED' },
} as const;

type InvoiceType = keyof typeof TYPE_CFG;

type LineItem = {
  productId: string;
  productName: string;
  productSku: string;
  quantity: string;
  unitPrice: string;
  discountPercent: string;
  locationId: string;
  availableStock: number;
};

// ─── ProductCombobox ──────────────────────────────────────────────────────────

type ComboProductLocation = {
  id: string;
  locationCode: string;
  quantityOnHand: number;
  reservedQuantity: number;
  warehouse: { name: string };
};

type ComboProduct = {
  id: string;
  sku: string;
  name: string;
  description?: string | null;
  color?: string | null;
  model?: string | null;
  type?: string | null;
  dimensions?: unknown;
  locations?: ComboProductLocation[];
};

function ProductCombobox({
  value,
  products,
  onChange,
}: {
  value: string;
  products: ComboProduct[];
  onChange: (productId: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 320 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedProduct = products.find((p) => p.id === value);

  const totalAvailable = useMemo(() => {
    if (!selectedProduct?.locations) return 0;
    return selectedProduct.locations.reduce(
      (s, loc) => s + loc.quantityOnHand - loc.reservedQuantity,
      0,
    );
  }, [selectedProduct]);

  const calcPos = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setDropdownPos({
      top: rect.bottom + window.scrollY + 4,
      left: rect.left + window.scrollX,
      width: Math.max(rect.width, 320),
    });
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    function onClose(e: MouseEvent) {
      if (triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        const dropdown = document.getElementById('product-combobox-portal');
        if (dropdown && dropdown.contains(e.target as Node)) return;
        setIsOpen(false);
        setSearch('');
      }
    }
    function onScroll() { calcPos(); }
    document.addEventListener('mousedown', onClose);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onClose);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [isOpen, calcPos]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return products;
    return products.filter((p) => {
      const dims = p.dimensions as { width?: number; heightDisplay?: string } | null;
      return [
        p.name,
        p.sku,
        p.description ?? '',
        p.color ?? '',
        p.model ?? '',
        p.type ?? '',
        dims?.width ? String(dims.width) : '',
        dims?.heightDisplay ?? '',
      ].some((f) => f.toLowerCase().includes(q));
    });
  }, [products, search]);

  function handleOpen() {
    calcPos();
    setIsOpen(true);
    setSearch('');
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function handleSelect(productId: string) {
    onChange(productId);
    setIsOpen(false);
    setSearch('');
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange('');
    setIsOpen(false);
    setSearch('');
  }

  const stockColor = totalAvailable > 10 ? '#166534' : totalAvailable > 0 ? '#854D0E' : '#991B1B';
  const stockBg   = totalAvailable > 10 ? '#F0FDF4' : totalAvailable > 0 ? '#FEF9C3' : '#FEF2F2';

  return (
    <div ref={triggerRef} className="relative w-full">
      {/* ── Trigger ── */}
      {isOpen ? (
        <div className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-lg border bg-white"
          style={{ borderColor: brand.orange[500], boxShadow: `0 0 0 2px ${brand.orange[100]}` }}>
          <Search size={11} style={{ color: '#94A3B8', flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, SKU, medida, color…"
            className="flex-1 text-xs outline-none bg-transparent"
            style={{ color: brand.navy[900] }}
          />
          {search && (
            <button type="button" onClick={() => setSearch('')}
              className="shrink-0 hover:text-slate-600" style={{ color: '#94A3B8' }}>
              <X size={10} />
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={handleOpen}
          className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-xs text-left transition-colors hover:border-slate-300"
          style={{ color: selectedProduct ? brand.navy[900] : '#94A3B8' }}
        >
          <Search size={11} style={{ color: '#94A3B8', flexShrink: 0 }} />
          <span className="flex-1 truncate min-w-0">
            {selectedProduct ? selectedProduct.name : 'Seleccionar producto…'}
          </span>
          {selectedProduct && (
            <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ml-1"
              style={{ background: stockBg, color: stockColor }}>
              {totalAvailable}u
            </span>
          )}
          {selectedProduct ? (
            <span onClick={handleClear} role="button"
              className="shrink-0 hover:text-red-500 transition-colors ml-0.5" style={{ color: '#94A3B8' }}>
              <X size={10} />
            </span>
          ) : null}
        </button>
      )}

      {/* ── Dropdown via portal para evitar overflow:hidden del contenedor padre ── */}
      {isOpen && typeof window !== 'undefined' && createPortal(
        <div
          id="product-combobox-portal"
          className="rounded-xl border border-slate-200 bg-white shadow-2xl overflow-auto"
          style={{
            position: 'absolute',
            top: dropdownPos.top,
            left: dropdownPos.left,
            width: dropdownPos.width,
            maxHeight: 300,
            zIndex: 9999,
          }}
        >
          {filtered.length === 0 ? (
            <div className="px-3 py-5 text-xs text-center" style={{ color: '#94A3B8' }}>
              Sin resultados para &ldquo;{search}&rdquo;
            </div>
          ) : (
            filtered.map((p) => {
              const dims = p.dimensions as { width?: number; heightDisplay?: string } | null;
              const dimStr = dims?.width && dims?.heightDisplay
                ? `${dims.width}" × ${dims.heightDisplay}"`
                : null;
              const isSelected = p.id === value;
              const pAvail = p.locations?.reduce(
                (s, loc) => s + loc.quantityOnHand - loc.reservedQuantity,
                0,
              ) ?? 0;
              const pStockColor = pAvail > 10 ? '#166534' : pAvail > 0 ? '#854D0E' : '#991B1B';
              const pStockBg   = pAvail > 10 ? '#F0FDF4' : pAvail > 0 ? '#FEF9C3' : '#FEF2F2';

              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelect(p.id)}
                  className="w-full flex flex-col items-start px-3 py-2 text-left border-b border-slate-50 transition-colors"
                  style={{ backgroundColor: isSelected ? brand.orange[50] : undefined }}
                  onMouseEnter={(e) => {
                    if (!isSelected) (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#FFF7ED';
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) (e.currentTarget as HTMLButtonElement).style.backgroundColor = isSelected ? brand.orange[50] : '';
                  }}
                >
                  {/* Línea 1: nombre + medida + stock total */}
                  <div className="flex items-center gap-2 w-full">
                    <span className="text-xs font-medium flex-1 truncate" style={{ color: brand.navy[900] }}>
                      {p.name}
                    </span>
                    {dimStr && (
                      <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded font-mono"
                        style={{ background: '#F1F5F9', color: '#475569' }}>
                        {dimStr}
                      </span>
                    )}
                    <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded"
                      style={{ background: pStockBg, color: pStockColor }}>
                      {pAvail}u
                    </span>
                  </div>
                  {/* Línea 2: SKU + color + modelo + stock por almacén */}
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span className="font-mono text-[10px]" style={{ color: brand.navy[700] }}>
                      {p.sku}
                    </span>
                    {p.color && (
                      <span className="text-[10px]" style={{ color: '#64748B' }}>· {p.color}</span>
                    )}
                    {p.model && (
                      <span className="text-[10px]" style={{ color: '#64748B' }}>· {p.model}</span>
                    )}
                    {p.locations && p.locations.length > 0 && (
                      <span className="text-[10px]" style={{ color: '#94A3B8' }}>
                        · {p.locations.map((loc) => {
                          const avail = loc.quantityOnHand - loc.reservedQuantity;
                          return `${loc.warehouse.name}: ${avail}u`;
                        }).join(' · ')}
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}

// ─── Live Preview ─────────────────────────────────────────────────────────────

function InvoicePreview({
  invoiceType, customerName, customerCode, customerType,
  dueDate, lines, notes, taxRate,
}: {
  invoiceType: InvoiceType;
  customerName: string;
  customerCode: string;
  customerType: string;
  dueDate: string;
  lines: LineItem[];
  notes: string;
  taxRate: number;
}) {
  const today = new Date().toLocaleDateString('es-PR', { year: 'numeric', month: 'long', day: 'numeric' });
  const cfg = TYPE_CFG[invoiceType];

  const calcLine = (l: LineItem) => {
    const qty = parseInt(l.quantity) || 0;
    const price = parseFloat(l.unitPrice) || 0;
    const disc = parseFloat(l.discountPercent) || 0;
    return qty * price * (1 - disc / 100);
  };

  const filled = lines.filter((l) => l.productId && parseInt(l.quantity) > 0);
  const subtotal = filled.reduce((s, l) => s + calcLine(l), 0);
  const taxAmt = subtotal * taxRate;
  const total = subtotal + taxAmt;

  return (
    <div className="relative bg-white rounded-xl overflow-hidden"
      style={{ minHeight: 580, border: '1px solid rgba(10,22,40,0.1)', boxShadow: '0 2px 12px rgba(10,22,40,0.06)' }}>
      {/* watermark */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 0 }}>
        <span className="text-8xl font-black tracking-widest uppercase select-none"
          style={{ color: 'rgba(10,22,40,0.035)', transform: 'rotate(-30deg)' }}>BORRADOR</span>
      </div>

      <div className="relative z-10 p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: brand.orange[500] }}>
                <Building2 size={15} className="text-white" />
              </div>
              <div>
                <div className="font-black text-sm leading-none" style={{ color: brand.navy[950] }}>THE BUILDER&apos;S HOUSE</div>
                <div className="text-xs text-slate-400">Puerto Rico</div>
              </div>
            </div>
            <div className="text-xs text-slate-400 mt-2 leading-relaxed">
              info@thebuildershouse.pr<br />(787) 000-0000
            </div>
          </div>
          <div className="text-right">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide mb-2"
              style={{ background: cfg.color + '18', color: cfg.color }}>{cfg.label}</span>
            <div className="text-xs font-mono text-slate-400">#— {new Date().getFullYear()}</div>
            <div className="text-xs text-slate-400 mt-0.5">{today}</div>
            {dueDate && (
              <div className="text-xs text-slate-500 mt-0.5">
                Vence: {new Date(dueDate + 'T12:00:00').toLocaleDateString('es-PR')}
              </div>
            )}
          </div>
        </div>

        {/* Bill-to */}
        <div className="mb-5 p-3 rounded-lg" style={{ background: 'rgba(10,22,40,0.03)' }}>
          {customerName ? (
            <>
              <div className="text-xs font-semibold text-slate-400 mb-1">FACTURAR A</div>
              <div className="font-semibold text-sm" style={{ color: brand.navy[900] }}>{customerName}</div>
              {customerCode && (
                <div className="text-xs text-slate-400">
                  {customerCode} · {customerType === 'WHOLESALE' ? 'Mayorista' : 'Detallista'}
                </div>
              )}
            </>
          ) : (
            <div className="text-xs text-slate-300 italic">Selecciona un cliente...</div>
          )}
        </div>

        {/* Line items */}
        <table className="w-full text-xs mb-4">
          <thead>
            <tr style={{ borderBottom: `2px solid ${brand.navy[950]}` }}>
              <th className="text-left py-1.5 font-semibold" style={{ color: brand.navy[900] }}>Descripción</th>
              <th className="text-right py-1.5 font-semibold w-10" style={{ color: brand.navy[900] }}>Cant.</th>
              <th className="text-right py-1.5 font-semibold w-16" style={{ color: brand.navy[900] }}>Precio</th>
              <th className="text-right py-1.5 font-semibold w-16" style={{ color: brand.navy[900] }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {filled.length === 0 ? (
              <tr><td colSpan={4} className="py-8 text-center text-slate-300 italic">Agrega productos...</td></tr>
            ) : filled.map((line, i) => {
              const disc = parseFloat(line.discountPercent) || 0;
              return (
                <tr key={i} style={{ borderBottom: '1px solid rgba(10,22,40,0.06)' }}>
                  <td className="py-1.5" style={{ color: brand.navy[900] }}>
                    {line.productName}
                    {line.productSku && <div className="text-slate-400 font-mono">{line.productSku}</div>}
                    {disc > 0 && <div style={{ color: brand.orange[500] }}>Desc. {disc}%</div>}
                  </td>
                  <td className="py-1.5 text-right" style={{ color: brand.navy[800] }}>{line.quantity}</td>
                  <td className="py-1.5 text-right" style={{ color: brand.navy[800] }}>{formatCurrency(parseFloat(line.unitPrice) || 0)}</td>
                  <td className="py-1.5 text-right font-semibold" style={{ color: brand.navy[950] }}>{formatCurrency(calcLine(line))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Totals */}
        <div className="ml-auto w-44 space-y-1 text-xs">
          <div className="flex justify-between" style={{ color: '#64748B' }}>
            <span>Subtotal</span><span>{formatCurrency(subtotal)}</span>
          </div>
          {taxRate > 0 ? (
            <div className="flex justify-between" style={{ color: '#64748B' }}>
              <span>IVU ({(taxRate * 100).toFixed(1)}%)</span><span>{formatCurrency(taxAmt)}</span>
            </div>
          ) : (
            <div className="flex justify-between" style={{ color: '#94A3B8' }}>
              <span>IVU</span><span>Exento</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-sm pt-1"
            style={{ borderTop: `2px solid ${brand.navy[950]}`, color: brand.navy[950] }}>
            <span>TOTAL</span><span>{formatCurrency(total)}</span>
          </div>
        </div>

        {notes && (
          <div className="mt-5 pt-3 border-t border-dashed border-slate-200">
            <div className="text-xs font-semibold text-slate-400 mb-1">NOTAS</div>
            <p className="text-xs text-slate-500">{notes}</p>
          </div>
        )}

        <div className="mt-6 pt-3 border-t border-slate-100 text-center">
          <p className="text-xs text-slate-300">Gracias por su preferencia · The Builder&apos;s House Puerto Rico</p>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function InvoicingClient({ role }: { role: string }) {
  const canAuthorize = role === 'ADMIN' || role === 'MANAGER';

  // Tab
  const [activeTab, setActiveTab] = useState<'invoices' | 'ar'>('invoices');

  // List state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(1);

  // AR filters
  const [arSearch, setArSearch] = useState('');
  const [arCustomerId, setArCustomerId] = useState('');

  // Modal state
  const [modal, setModal] = useState<'none' | 'create' | 'edit' | 'detail' | 'payment' | 'void' | 'authorize' | 'authorizeAndPay' | 'convertQuote'>('none');
  const [convertLocations, setConvertLocations] = useState<Record<string, string>>({});
  const [convertTaxExempt, setConvertTaxExempt] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editInvoiceId, setEditInvoiceId] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Create form
  const [invoiceType, setInvoiceType] = useState<InvoiceType>('INVOICE');
  const [customerId, setCustomerId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [applyIvu, setApplyIvu] = useState(true);
  const [paymentMode, setPaymentMode] = useState<'CONTADO' | 'CREDITO'>('CONTADO');
  const [creditDays, setCreditDays] = useState<number>(30);
  const [lines, setLines] = useState<LineItem[]>([
    { productId: '', productName: '', productSku: '', quantity: '1', unitPrice: '0', discountPercent: '0', locationId: '', availableStock: 0 },
  ]);
  const [notes, setNotes] = useState('');

  // Payment form
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('CASH');
  const [payRef, setPayRef] = useState('');

  // Void / Authorize
  const [voidReason, setVoidReason] = useState('');
  const [authNotes, setAuthNotes] = useState('');
  const [authPayAmount, setAuthPayAmount] = useState('');
  const [authPayMethod, setAuthPayMethod] = useState<'CASH'|'CHECK'|'TRANSFER'|'CARD'|'CREDIT'>('CASH');
  const [authPayRef, setAuthPayRef] = useState('');

  // Edit reason (required for ISSUED invoices)
  const [editReason, setEditReason] = useState('');

  // Date filter & print
  const [dateMode, setDateMode] = useState<'all' | 'today' | 'week' | 'month' | 'custom'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [printMode, setPrintMode] = useState(false);

  const { queryFrom, queryTo } = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (dateMode === 'today')
      return { queryFrom: todayStart, queryTo: now };
    if (dateMode === 'week') {
      const d = new Date(todayStart);
      d.setDate(d.getDate() - d.getDay());
      return { queryFrom: d, queryTo: now };
    }
    if (dateMode === 'month')
      return { queryFrom: new Date(now.getFullYear(), now.getMonth(), 1), queryTo: now };
    if (dateMode === 'custom' && dateFrom)
      return {
        queryFrom: new Date(dateFrom + 'T00:00:00'),
        queryTo: dateTo ? new Date(dateTo + 'T23:59:59') : now,
      };
    return { queryFrom: undefined, queryTo: undefined };
  }, [dateMode, dateFrom, dateTo]);

  const periodLabel = useMemo(() => {
    if (dateMode === 'today')
      return `Hoy — ${new Date().toLocaleDateString('es-PR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;
    if (dateMode === 'week')  return 'Esta semana';
    if (dateMode === 'month') return new Date().toLocaleDateString('es-PR', { month: 'long', year: 'numeric' });
    if (dateMode === 'custom') {
      const f = dateFrom ? new Date(dateFrom + 'T12:00:00').toLocaleDateString('es-PR') : '—';
      const t = dateTo   ? new Date(dateTo   + 'T12:00:00').toLocaleDateString('es-PR') : 'hoy';
      return `${f} al ${t}`;
    }
    return 'Todos los períodos';
  }, [dateMode, dateFrom, dateTo]);

  // Queries
  const { data, isLoading, isFetching, refetch } = trpc.invoicing.list.useQuery({
    search: search || undefined,
    status: (statusFilter || undefined) as 'DRAFT' | 'ISSUED' | 'PAID' | 'PARTIAL' | 'VOIDED' | 'PENDING_AUTHORIZATION' | 'CONVERTED' | undefined,
    type: (typeFilter as InvoiceType) || undefined,
    from: queryFrom,
    to: queryTo,
    page: printMode ? 1 : page,
    pageSize: printMode ? 500 : 20,
  });

  // Reset printMode when print dialog closes
  useEffect(() => {
    const handler = () => setPrintMode(false);
    window.addEventListener('afterprint', handler);
    return () => window.removeEventListener('afterprint', handler);
  }, []);

  // Trigger window.print() once the large-pageSize data finishes loading
  const fetchingForPrint = useRef(false);
  useEffect(() => {
    if (printMode && isFetching)  { fetchingForPrint.current = true; return; }
    if (printMode && !isFetching && fetchingForPrint.current) {
      fetchingForPrint.current = false;
      window.print();
    }
  }, [printMode, isFetching]);

  function handlePrint() {
    fetchingForPrint.current = false;
    setPage(1);
    setPrintMode(true);
  }

  const { data: detail, refetch: refetchDetail } = trpc.invoicing.byId.useQuery(
    selectedId ?? '',
    { enabled: !!selectedId && modal !== 'create' && modal !== 'none' },
  );

  const { data: customers } = trpc.customers.list.useQuery({ pageSize: 200 });
  const { data: products } = trpc.products.list.useQuery({ pageSize: 500 });
  const { data: warehouses } = trpc.settings.warehouses.useQuery();
  const { data: sysConfig } = trpc.settings.getSystemConfig.useQuery();

  // AR queries (only fetch when on AR tab)
  const { data: arSummary } = trpc.invoicing.arSummary.useQuery(undefined, { enabled: activeTab === 'ar' });
  const { data: arOpenInvoices } = trpc.invoicing.arOpenInvoices.useQuery(
    { customerId: arCustomerId || undefined, search: arSearch || undefined },
    { enabled: activeTab === 'ar' },
  );
  const { data: arAging } = trpc.invoicing.arAging.useQuery(undefined, { enabled: activeTab === 'ar' });

  const taxRate = sysConfig?.TAX_RATE ? parseFloat(sysConfig.TAX_RATE) : 0.115;

  // Mutations
  const createMutation = trpc.invoicing.create.useMutation({
    onSuccess: () => { refetch(); closeModal(); },
    onError: (e) => setError(e.message),
  });
  const paymentMutation = trpc.invoicing.addPayment.useMutation({
    onSuccess: () => { refetch(); refetchDetail(); setModal('detail'); },
    onError: (e) => setError(e.message),
  });
  const voidMutation = trpc.invoicing.void.useMutation({
    onSuccess: () => { refetch(); closeModal(); },
    onError: (e) => setError(e.message),
  });
  const authorizeMutation = trpc.invoicing.authorizeBackorder.useMutation({
    onSuccess: () => { refetch(); closeModal(); },
    onError: (e) => setError(e.message),
  });
  const authorizeAndPayMutation = trpc.invoicing.authorizeAndPay.useMutation({
    onSuccess: () => { refetch(); closeModal(); },
    onError: (e) => setError(e.message),
  });

  const { data: editInvoiceData } = trpc.invoicing.byId.useQuery(
    editInvoiceId ?? '',
    { enabled: !!editInvoiceId && modal === 'edit' },
  );

  const updateMutation = trpc.invoicing.update.useMutation({
    onSuccess: () => { refetch(); closeModal(); },
    onError: (e) => setError(e.message),
  });

  const convertQuoteMutation = trpc.invoicing.convertQuoteToInvoice.useMutation({
    onSuccess: () => { refetch(); closeModal(); },
    onError: (e) => setError(e.message),
  });

  useEffect(() => {
    if (!editInvoiceData || modal !== 'edit') return;
    const inv = editInvoiceData;
    setCustomerId(inv.customerId);
    setInvoiceType(inv.type as InvoiceType);
    setDueDate(inv.dueDate ? new Date(inv.dueDate).toISOString().split('T')[0]! : '');
    setApplyIvu(Number(inv.taxRate) > 0);
    setNotes(inv.notes ?? '');
    setLines(
      inv.items.map((item) => ({
        productId: item.productId,
        productName: item.product.name,
        productSku: (item.product as { name: string; sku?: string }).sku ?? '',
        quantity: String(item.quantity),
        unitPrice: String(Number(item.unitPrice)),
        discountPercent: String(Number(item.discountPercent)),
        locationId: (item as unknown as { locationId?: string }).locationId ?? '',
        availableStock: 0,
      })),
    );
  }, [editInvoiceData, modal]);

  const selectedCustomer = useMemo(
    () => customers?.customers.find((c) => c.id === customerId),
    [customers, customerId],
  );

  function closeModal() {
    setModal('none'); setSelectedId(null); setEditInvoiceId(null); setError('');
    setInvoiceType('INVOICE'); setCustomerId(''); setBranchId(''); setDueDate('');
    setLines([{ productId: '', productName: '', productSku: '', quantity: '1', unitPrice: '0', discountPercent: '0', locationId: '', availableStock: 0 }]);
    setApplyIvu(true); setPaymentMode('CONTADO'); setCreditDays(30);
    setNotes(''); setPayAmount(''); setPayMethod('CASH'); setPayRef('');
    setVoidReason(''); setAuthNotes('');
    setAuthPayAmount(''); setAuthPayMethod('CASH'); setAuthPayRef('');
    setEditReason('');
    setConvertLocations({}); setConvertTaxExempt(false);
  }

  function addLine() {
    setLines((l) => [...l, { productId: '', productName: '', productSku: '', quantity: '1', unitPrice: '0', discountPercent: '0', locationId: '', availableStock: 0 }]);
  }

  function autoLocationForBranch(productId: string, warehouseId: string) {
    if (!warehouseId || !warehouses) return '';
    const wh = warehouses.find((w) => w.id === warehouseId);
    const loc = wh?.locations.find((l) => (l as unknown as { productId: string }).productId === productId);
    return loc?.id ?? '';
  }

  // Cuando cambia la sucursal, reasigna locationId en todas las líneas existentes
  useEffect(() => {
    if (!branchId || !warehouses) return;
    setLines((ls) => ls.map((line) => {
      if (!line.productId) return line;
      return { ...line, locationId: autoLocationForBranch(line.productId, branchId) };
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, warehouses]);

  function updateLine(i: number, field: keyof LineItem, value: string) {
    setLines((ls) => ls.map((l, idx) => {
      if (idx !== i) return l;
      if (field === 'productId') {
        const p = products?.products.find((p) => p.id === value);
        const isWholesale = selectedCustomer?.type === 'WHOLESALE';
        const price = p ? (isWholesale ? Number(p.wholesalePrice) : Number(p.retailPrice)) : 0;
        const totalAvail = p?.locations?.reduce(
          (s: number, loc: { quantityOnHand: number; reservedQuantity: number }) =>
            s + loc.quantityOnHand - loc.reservedQuantity,
          0,
        ) ?? 0;
        const autoLoc = branchId ? autoLocationForBranch(value, branchId) : '';
        return { ...l, productId: value, productName: p?.name ?? '', productSku: p?.sku ?? '', unitPrice: String(price), locationId: autoLoc, availableStock: totalAvail };
      }
      return { ...l, [field]: value };
    }));
  }

  function getLocationsForProduct(productId: string) {
    if (!productId || !warehouses) return [];
    const scope = branchId
      ? (warehouses ?? []).filter((wh) => wh.id === branchId)
      : (warehouses ?? []);
    return scope.flatMap((wh) =>
      wh.locations
        .filter((loc) => (loc as unknown as { productId: string }).productId === productId)
        .map((loc) => ({
          id: loc.id,
          label: branchId ? loc.locationCode : `${wh.name} — ${loc.locationCode}`,
          available: loc.quantityOnHand - loc.reservedQuantity,
        })),
    );
  }

  function calcLine(line: LineItem) {
    const qty = parseInt(line.quantity) || 0;
    const price = parseFloat(line.unitPrice) || 0;
    const disc = parseFloat(line.discountPercent) || 0;
    return qty * price * (1 - disc / 100);
  }

  const subtotal = lines.reduce((s, l) => s + calcLine(l), 0);
  const effectiveTaxRate = applyIvu ? taxRate : 0;
  const taxAmount = subtotal * effectiveTaxRate;
  const totalAmount = subtotal + taxAmount;

  function submitCreate() {
    setError('');
    if (!customerId) { setError('Selecciona un cliente'); return; }
    if (invoiceType !== 'QUOTE' && !branchId) { setError('Selecciona la sucursal que emite esta factura'); return; }
    const validLines = lines.filter((l) => l.productId && parseInt(l.quantity) > 0);
    if (!validLines.length) { setError('Agrega al menos un producto'); return; }
    if (invoiceType !== 'QUOTE') {
      const missing = validLines.find((l) => !l.locationId);
      if (missing) { setError(`Selecciona la ubicación para "${missing.productName}"`); return; }
    }
    // Compute effective dueDate
    let computedDueDate: Date | undefined;
    if (dueDate) {
      computedDueDate = new Date(dueDate + 'T12:00:00');
    } else if (paymentMode === 'CREDITO') {
      const d = new Date();
      d.setDate(d.getDate() + creditDays);
      computedDueDate = d;
    }

    const itemsPayload = validLines.map((l) => ({
      productId: l.productId,
      locationId: l.locationId || undefined,
      quantity: parseInt(l.quantity),
      unitPrice: parseFloat(l.unitPrice),
      discountPercent: parseFloat(l.discountPercent) || 0,
    }));

    if (modal === 'edit' && editInvoiceId) {
      updateMutation.mutate({
        id: editInvoiceId,
        customerId,
        taxRate: effectiveTaxRate,
        dueDate: computedDueDate,
        notes: notes || undefined,
        editReason: editReason || undefined,
        items: itemsPayload,
      });
    } else {
      createMutation.mutate({
        customerId,
        branchId: branchId || undefined,
        type: invoiceType,
        taxRate: effectiveTaxRate,
        paymentTerms: paymentMode,
        dueDate: computedDueDate,
        notes: notes || undefined,
        items: itemsPayload,
      });
    }
  }

  function submitPayment() {
    if (!selectedId) return;
    setError('');
    const amount = parseFloat(payAmount);
    if (!amount || amount <= 0) { setError('Monto inválido'); return; }
    paymentMutation.mutate({
      invoiceId: selectedId,
      amount,
      method: payMethod as 'CASH' | 'CHECK' | 'TRANSFER' | 'CARD' | 'CREDIT',
      reference: payRef || undefined,
    });
  }

  const invoices = data?.invoices ?? [];
  const totalCount = data?.total ?? 0;
  const totalPages = Math.ceil(totalCount / 20);

  const printTotals = useMemo(() => ({
    subtotal: invoices.reduce((s, inv) => s + Number(inv.subtotal), 0),
    tax:      invoices.reduce((s, inv) => s + Number(inv.taxAmount), 0),
    total:    invoices.reduce((s, inv) => s + Number(inv.total), 0),
    paid:     invoices.reduce((s, inv) => s + Number(inv.paidAmount), 0),
  }), [invoices]);

  return (
    <div className="space-y-5">

      {/* ── Page Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: brand.navy[950] }}>Facturación</h1>
          <p className="text-sm mt-0.5" style={{ color: '#64748B' }}>
            {totalCount} documentos · IVU {(taxRate * 100).toFixed(1)}%
          </p>
        </div>
        <button
          onClick={() => setModal('create')}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity"
          style={{ background: `linear-gradient(135deg, ${brand.orange[500]}, ${brand.orange[600]})` }}
        >
          <Plus size={16} /> Nueva Factura
        </button>
      </div>

      {/* ── Tab strip ── */}
      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: 'rgba(10,22,40,0.06)' }}>
        {([
          { key: 'invoices', label: 'Facturas', icon: FileText },
          { key: 'ar',       label: 'Cuentas por Cobrar', icon: TrendingUp },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
            style={{
              background: activeTab === key ? 'white' : 'transparent',
              color: activeTab === key ? brand.navy[950] : '#64748B',
              boxShadow: activeTab === key ? '0 1px 4px rgba(10,22,40,0.12)' : 'none',
            }}>
            <Icon size={14} /> {label}
            {key === 'ar' && arSummary && arSummary.overdueCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs font-bold text-white"
                style={{ background: '#DC2626' }}>
                {arSummary.overdueCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════
          CUENTAS POR COBRAR TAB
      ══════════════════════════════════════════════════════════ */}
      {activeTab === 'ar' && (
        <div className="space-y-5">
          {/* KPI Cards */}
          <div className="grid grid-cols-3 gap-4">
            {[
              {
                label: 'Total por Cobrar',
                value: formatCurrency(arSummary?.totalOwed ?? 0),
                sub: `${arSummary?.openCount ?? 0} facturas abiertas`,
                icon: DollarSign,
                color: brand.navy[950],
                bg: `${brand.navy[950]}08`,
                border: `${brand.navy[950]}15`,
              },
              {
                label: 'Vencido',
                value: formatCurrency(arSummary?.totalOverdue ?? 0),
                sub: `${arSummary?.overdueCount ?? 0} facturas vencidas`,
                icon: AlertTriangle,
                color: '#DC2626',
                bg: '#FEF2F2',
                border: '#FECACA',
              },
              {
                label: 'Vence en 7 días',
                value: formatCurrency(arSummary?.dueSoon ?? 0),
                sub: `${arSummary?.dueSoonCount ?? 0} facturas próximas`,
                icon: Clock,
                color: '#D97706',
                bg: '#FFFBEB',
                border: '#FDE68A',
              },
            ].map((card) => (
              <div key={card.label} className="rounded-2xl p-4"
                style={{ background: card.bg, border: `1px solid ${card.border}` }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: card.color }}>{card.label}</span>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: card.color + '18' }}>
                    <card.icon size={14} style={{ color: card.color }} />
                  </div>
                </div>
                <div className="text-2xl font-bold" style={{ color: card.color }}>{card.value}</div>
                <div className="text-xs mt-0.5" style={{ color: card.color + 'AA' }}>{card.sub}</div>
              </div>
            ))}
          </div>

          {/* Aging table */}
          {arAging && arAging.length > 0 && (
            <div style={glass} className="rounded-2xl overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-sm font-semibold" style={{ color: brand.navy[950] }}>Envejecimiento de Deuda por Cliente</h3>
                <span className="text-xs text-slate-400">Aging report</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(10,22,40,0.08)' }}>
                      {['Cliente', 'Corriente', '1-30 días', '31-60 días', '61-90 días', '+90 días', 'Total'].map((h, idx) => (
                        <th key={h} className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wide ${idx === 0 ? 'text-left' : 'text-right'}`}
                          style={{
                            color: idx === 0 ? '#94A3B8' :
                                   idx === 2 ? '#D97706' :
                                   idx === 3 ? '#EA580C' :
                                   idx >= 4 ? '#DC2626' : '#94A3B8',
                          }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {arAging.map((row, i) => (
                      <tr key={row.customerId}
                        style={{ borderBottom: i < arAging.length - 1 ? '1px solid rgba(10,22,40,0.05)' : 'none' }}
                        className="hover:bg-slate-50/50">
                        <td className="px-4 py-3">
                          <div className="font-medium" style={{ color: brand.navy[950] }}>{row.customerName}</div>
                          <div className="text-xs text-slate-400">{row.customerCode}</div>
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600">{formatCurrency(row.current)}</td>
                        <td className="px-4 py-3 text-right font-medium" style={{ color: row.d30 > 0 ? '#D97706' : '#94A3B8' }}>
                          {formatCurrency(row.d30)}
                        </td>
                        <td className="px-4 py-3 text-right font-medium" style={{ color: row.d60 > 0 ? '#EA580C' : '#94A3B8' }}>
                          {formatCurrency(row.d60)}
                        </td>
                        <td className="px-4 py-3 text-right font-medium" style={{ color: row.d90 > 0 ? '#DC2626' : '#94A3B8' }}>
                          {formatCurrency(row.d90)}
                        </td>
                        <td className="px-4 py-3 text-right font-bold" style={{ color: row.d90plus > 0 ? '#991B1B' : '#94A3B8' }}>
                          {formatCurrency(row.d90plus)}
                        </td>
                        <td className="px-4 py-3 text-right font-bold" style={{ color: brand.navy[950] }}>
                          {formatCurrency(row.total)}
                        </td>
                      </tr>
                    ))}
                    {/* Totals row */}
                    <tr style={{ borderTop: '2px solid rgba(10,22,40,0.1)', background: 'rgba(10,22,40,0.03)' }}>
                      <td className="px-4 py-3 text-xs font-bold uppercase tracking-wide" style={{ color: brand.navy[700] }}>TOTAL</td>
                      {(['current', 'd30', 'd60', 'd90', 'd90plus', 'total'] as const).map((k) => (
                        <td key={k} className="px-4 py-3 text-right font-bold text-sm" style={{ color: brand.navy[950] }}>
                          {formatCurrency(arAging.reduce((s, r) => s + r[k], 0))}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Open invoices list */}
          <div style={glass} className="rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap items-center gap-3">
              <h3 className="text-sm font-semibold" style={{ color: brand.navy[950] }}>Facturas Pendientes de Cobro</h3>
              <div className="flex-1 flex gap-2 justify-end flex-wrap">
                <div className="flex items-center gap-2 bg-white/80 rounded-xl px-3 py-1.5 border border-white/80">
                  <Search size={13} style={{ color: '#94A3B8' }} />
                  <input value={arSearch} onChange={(e) => setArSearch(e.target.value)}
                    placeholder="Buscar..." className="w-32 text-xs bg-transparent outline-none" style={{ color: brand.navy[950] }} />
                </div>
                <select value={arCustomerId} onChange={(e) => setArCustomerId(e.target.value)}
                  className="text-xs px-3 py-1.5 rounded-xl border bg-white/80 outline-none" style={{ color: brand.navy[800] }}>
                  <option value="">Todos los clientes</option>
                  {customers?.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            {!arOpenInvoices || arOpenInvoices.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <CheckCircle2 size={36} style={{ color: '#BBF7D0' }} />
                <p className="text-slate-400 text-sm font-medium">No hay facturas pendientes de cobro</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(10,22,40,0.08)' }}>
                      {['#Factura', 'Cliente', 'Emisión', 'Vencimiento', 'Días', 'Total', 'Pagado', 'Balance', ''].map((h) => (
                        <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wide" style={{ color: '#94A3B8' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {arOpenInvoices.map((inv, i) => {
                      const overdue = inv.daysOverdue !== null && inv.daysOverdue > 0;
                      const dueSoon = inv.daysOverdue !== null && inv.daysOverdue >= -7 && inv.daysOverdue <= 0;
                      const statusColor = overdue ? '#DC2626' : dueSoon ? '#D97706' : '#16A34A';
                      const statusBg   = overdue ? '#FEF2F2' : dueSoon ? '#FFFBEB' : '#F0FDF4';
                      return (
                        <tr key={inv.id}
                          style={{ borderBottom: i < arOpenInvoices.length - 1 ? '1px solid rgba(10,22,40,0.05)' : 'none' }}
                          className="hover:bg-slate-50/40">
                          <td className="px-4 py-3 font-mono text-xs font-semibold" style={{ color: brand.navy[700] }}>{inv.invoiceNumber}</td>
                          <td className="px-4 py-3 font-medium" style={{ color: brand.navy[950] }}>
                            {inv.customer.name}
                            <div className="text-xs text-slate-400">{inv.customer.code}</div>
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-xs">{formatDate(inv.createdAt)}</td>
                          <td className="px-4 py-3 text-xs">
                            {inv.dueDate
                              ? <span style={{ color: overdue ? '#DC2626' : brand.navy[800] }}>{formatDate(inv.dueDate)}</span>
                              : <span className="text-slate-300">Sin fecha</span>}
                          </td>
                          <td className="px-4 py-3">
                            {inv.daysOverdue !== null ? (
                              <span className="px-2 py-0.5 rounded-full text-xs font-bold"
                                style={{ background: statusBg, color: statusColor }}>
                                {inv.daysOverdue > 0 ? `+${inv.daysOverdue}d` : inv.daysOverdue === 0 ? 'Hoy' : `${Math.abs(inv.daysOverdue)}d`}
                              </span>
                            ) : (
                              <span className="text-slate-300 text-xs">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3" style={{ color: brand.navy[800] }}>{formatCurrency(Number(inv.total))}</td>
                          <td className="px-4 py-3 text-slate-500">{formatCurrency(Number(inv.paidAmount))}</td>
                          <td className="px-4 py-3 font-bold" style={{ color: overdue ? '#DC2626' : brand.navy[950] }}>
                            {formatCurrency(inv.balance)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1">
                              <button onClick={() => { setSelectedId(inv.id); setModal('detail'); }}
                                className="p-1.5 rounded-lg hover:bg-slate-100" title="Ver detalle">
                                <Eye size={13} style={{ color: brand.navy[600] }} />
                              </button>
                              <button onClick={() => { setSelectedId(inv.id); setModal('payment'); setPayAmount(''); }}
                                className="p-1.5 rounded-lg hover:bg-green-50" title="Registrar pago">
                                <DollarSign size={13} style={{ color: '#16A34A' }} />
                              </button>
                              <a href={`/api/print/invoice/${inv.id}`} target="_blank" rel="noreferrer"
                                className="p-1.5 rounded-lg hover:bg-slate-100 inline-flex items-center" title="PDF">
                                <Printer size={13} style={{ color: '#64748B' }} />
                              </a>
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
        </div>
      )}

      {activeTab === 'invoices' && (<>

      {/* Print styles */}
      <style>{`
        @media print {
          body > * { visibility: hidden !important; }
          #invoice-print-area, #invoice-print-area * { visibility: visible !important; }
          #invoice-print-area {
            position: fixed !important;
            inset: 0;
            width: 100% !important;
            max-width: 100% !important;
            overflow: visible !important;
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            background: white !important;
          }
          /* Eliminar fondos de color — solo blanco y negro */
          #invoice-print-area [style*="background"],
          #invoice-print-area [style*="backgroundColor"],
          #invoice-print-area [class*="bg-"] {
            background: transparent !important;
            background-color: transparent !important;
          }
          /* Texto negro para máximo contraste sin tinta de color */
          #invoice-print-area td, #invoice-print-area th,
          #invoice-print-area span, #invoice-print-area div {
            color: #000 !important;
          }
          /* Badges de estado: solo borde, sin fondo */
          #invoice-print-area span[style*="borderRadius"],
          #invoice-print-area span[style*="border-radius"] {
            border: 1px solid #000 !important;
            background: transparent !important;
            color: #000 !important;
          }
          /* Filas alternadas: trama gris muy suave en lugar de color */
          #invoice-print-area tr:nth-child(even) td {
            background-color: #f5f5f5 !important;
          }
          /* Encabezados de tabla: línea inferior negra */
          #invoice-print-area thead tr {
            border-bottom: 2px solid #000 !important;
            background: transparent !important;
          }
          #invoice-print-area tfoot tr {
            border-top: 2px solid #000 !important;
          }
          .print\\:hidden { display: none !important; }
          @page { margin: 1.2cm; size: landscape; }
        }
      `}</style>

      {/* ── Filters ── */}
      <div style={glass} className="rounded-2xl p-4 flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2 flex-1 min-w-48 bg-white/60 rounded-xl px-3 py-2 border border-white/80">
          <Search size={15} style={{ color: '#94A3B8' }} />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Número o cliente..." className="flex-1 text-sm bg-transparent outline-none" style={{ color: brand.navy[950] }} />
        </div>
        <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
          className="text-sm px-3 py-2 rounded-xl border bg-white/60 outline-none" style={{ color: brand.navy[800] }}>
          <option value="">Todos los tipos</option>
          <option value="INVOICE">Facturas</option>
          <option value="QUOTE">Cotizaciones</option>
          <option value="CREDIT_NOTE">Notas de Crédito</option>
        </select>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="text-sm px-3 py-2 rounded-xl border bg-white/60 outline-none" style={{ color: brand.navy[800] }}>
          <option value="">Todos los estados</option>
          <option value="ISSUED">Emitidas</option>
          <option value="PAID">Pagadas</option>
          <option value="PARTIAL">Pago Parcial</option>
          <option value="PENDING_AUTHORIZATION">Pend. Autorización</option>
          <option value="DRAFT">Borrador</option>
          <option value="VOIDED">Anuladas</option>
          <option value="CONVERTED">Convertidas</option>
        </select>
      </div>

      {/* ── Date filter + Print ── */}
      <div style={glass} className="rounded-2xl px-4 py-3 flex flex-wrap gap-2 items-center">
        {/* Quick period buttons */}
        {(['all', 'today', 'week', 'month'] as const).map((mode) => {
          const labels = { all: 'Todo', today: 'Hoy', week: 'Esta semana', month: 'Este mes' };
          const active = dateMode === mode;
          return (
            <button key={mode} onClick={() => { setDateMode(mode); setPage(1); }}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
              style={{
                background: active ? brand.navy[950] : 'rgba(255,255,255,0.7)',
                color: active ? '#fff' : brand.navy[700],
                border: `1px solid ${active ? brand.navy[950] : 'rgba(203,213,225,0.8)'}`,
              }}>
              {labels[mode]}
            </button>
          );
        })}
        <button onClick={() => { setDateMode('custom'); setPage(1); }}
          className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
          style={{
            background: dateMode === 'custom' ? brand.orange[500] : 'rgba(255,255,255,0.7)',
            color: dateMode === 'custom' ? '#fff' : brand.navy[700],
            border: `1px solid ${dateMode === 'custom' ? brand.orange[500] : 'rgba(203,213,225,0.8)'}`,
          }}>
          Rango personalizado
        </button>

        {dateMode === 'custom' && (
          <>
            <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="text-xs px-2.5 py-1.5 rounded-xl border bg-white outline-none"
              style={{ color: brand.navy[800], borderColor: '#E2E8F0' }} />
            <span className="text-xs font-medium" style={{ color: '#94A3B8' }}>al</span>
            <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className="text-xs px-2.5 py-1.5 rounded-xl border bg-white outline-none"
              style={{ color: brand.navy[800], borderColor: '#E2E8F0' }} />
          </>
        )}

        <div className="flex-1" />

        {/* Period summary badge */}
        {dateMode !== 'all' && totalCount > 0 && (
          <span className="text-xs font-semibold px-3 py-1.5 rounded-xl"
            style={{ background: brand.orange[50], color: brand.orange[600], border: `1px solid ${brand.orange[100]}` }}>
            {totalCount} doc · {formatCurrency(printTotals.total)}
          </span>
        )}

        {/* Print button */}
        <button onClick={handlePrint} disabled={printMode}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all disabled:opacity-60"
          style={{ background: brand.navy[950], color: '#fff' }}>
          <Printer size={13} />
          {printMode ? 'Preparando…' : 'Imprimir'}
        </button>
      </div>

      {/* ── Invoice Table ── */}
      <div id="invoice-print-area" style={glass} className="rounded-2xl overflow-hidden">

        {/* Print-only header (hidden on screen) */}
        <div className="hidden print:block px-6 pt-6 pb-4 border-b border-slate-200">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xl font-bold" style={{ color: brand.navy[950] }}>
                THE BUILDER&apos;S HOUSE · Puerto Rico
              </div>
              <div className="text-sm font-semibold mt-1" style={{ color: brand.orange[500] }}>
                Reporte de Ventas
              </div>
              <div className="text-xs mt-1" style={{ color: '#64748B' }}>
                Período: {periodLabel}
                {typeFilter && ` · ${TYPE_CFG[typeFilter as InvoiceType]?.label ?? typeFilter}`}
                {statusFilter && ` · ${STATUS_STYLES[statusFilter]?.label ?? statusFilter}`}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs" style={{ color: '#94A3B8' }}>
                Generado el {new Date().toLocaleDateString('es-PR', { year: 'numeric', month: 'long', day: 'numeric' })}
              </div>
              <div className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>
                {totalCount} documento{totalCount !== 1 ? 's' : ''}
              </div>
            </div>
          </div>
        </div>

        {isLoading || (printMode && isFetching) ? (
          <div className="flex items-center justify-center py-20 text-slate-400 text-sm">Cargando...</div>
        ) : invoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Receipt size={40} style={{ color: '#CBD5E1' }} />
            <p className="text-slate-400 text-sm">No se encontraron documentos</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(10,22,40,0.08)' }}>
                  {['Tipo', '#Doc.', 'Cliente', 'Fecha', 'Items', 'Subtotal', 'IVU', 'Total', 'Pagado', 'Estado', ''].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: '#94A3B8' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv, i) => {
                  const st = STATUS_STYLES[inv.status] ?? STATUS_STYLES.DRAFT!;
                  const tc = TYPE_CFG[(inv as unknown as { type: InvoiceType }).type] ?? TYPE_CFG.INVOICE;
                  const balance = Number(inv.total) - Number(inv.paidAmount);
                  return (
                    <tr key={inv.id} style={{
                      borderBottom: i < invoices.length - 1 ? '1px solid rgba(10,22,40,0.05)' : 'none',
                      backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(10,22,40,0.015)',
                    }}>
                      <td className="px-4 py-3">
                        <span className="px-1.5 py-0.5 rounded text-xs font-bold"
                          style={{ background: tc.color + '18', color: tc.color }}>{tc.shortLabel}</span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs font-semibold" style={{ color: brand.navy[700] }}>{inv.invoiceNumber}</td>
                      <td className="px-4 py-3 font-medium" style={{ color: brand.navy[950] }}>
                        {inv.customer.name}
                        <div className="text-xs text-slate-400">{inv.customer.type === 'WHOLESALE' ? 'Mayorista' : 'Detallista'}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{formatDate(inv.createdAt)}</td>
                      <td className="px-4 py-3 text-center" style={{ color: brand.navy[800] }}>{inv._count.items}</td>
                      <td className="px-4 py-3" style={{ color: brand.navy[800] }}>{formatCurrency(Number(inv.subtotal))}</td>
                      <td className="px-4 py-3 text-slate-500">{formatCurrency(Number(inv.taxAmount))}</td>
                      <td className="px-4 py-3 font-semibold" style={{ color: brand.navy[950] }}>{formatCurrency(Number(inv.total))}</td>
                      <td className="px-4 py-3" style={{ color: balance > 0 && inv.status !== 'VOIDED' ? '#DC2626' : '#16A34A' }}>
                        {formatCurrency(Number(inv.paidAmount))}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                          style={{ backgroundColor: st.bg, color: st.text }}>{st.label}</span>
                      </td>
                      <td className="px-4 py-3 print:hidden">
                        <div className="flex gap-1">
                          <button onClick={() => { setSelectedId(inv.id); setModal('detail'); }}
                            className="p-1.5 rounded-lg hover:bg-slate-100" title="Ver detalle">
                            <Eye size={14} style={{ color: brand.navy[600] }} />
                          </button>
                          {/* Editar: DRAFT, QUOTE, o ISSUED (manager) */}
                          {(inv.status === 'DRAFT' ||
                            (inv as unknown as { type: string }).type === 'QUOTE' ||
                            (inv.status === 'ISSUED' && (inv as unknown as { type: string }).type === 'INVOICE' && canAuthorize)
                          ) && (
                            <button
                              onClick={() => { setEditInvoiceId(inv.id); setModal('edit'); }}
                              className="p-1.5 rounded-lg hover:bg-blue-50" title="Editar">
                              <Pencil size={14} style={{ color: '#2563EB' }} />
                            </button>
                          )}
                          {(inv as unknown as { type: string }).type === 'QUOTE' && inv.status === 'ISSUED' && (
                            <button
                              onClick={() => { setSelectedId(inv.id); setModal('convertQuote'); setConvertLocations({}); setConvertTaxExempt(false); }}
                              className="p-1.5 rounded-lg hover:bg-orange-50" title="Convertir a Factura">
                              <ArrowRight size={14} style={{ color: brand.orange[500] }} />
                            </button>
                          )}
                          {(inv.status === 'ISSUED' || inv.status === 'PARTIAL') && (
                            <button onClick={() => { setSelectedId(inv.id); setModal('payment'); setPayAmount(''); }}
                              className="p-1.5 rounded-lg hover:bg-green-50" title="Registrar pago">
                              <DollarSign size={14} style={{ color: '#16A34A' }} />
                            </button>
                          )}
                          {/* Autorizar + Cobrar en un paso (manager) */}
                          {inv.status === 'PENDING_AUTHORIZATION' && canAuthorize && (
                            <button onClick={() => { setSelectedId(inv.id); setModal('authorizeAndPay'); setAuthNotes(''); setAuthPayAmount(''); setAuthPayMethod('CASH'); setAuthPayRef(''); }}
                              className="p-1.5 rounded-lg hover:bg-green-50" title="Autorizar y Cobrar">
                              <ShieldCheck size={14} style={{ color: '#059669' }} />
                            </button>
                          )}
                          <a href={`/api/print/invoice/${inv.id}`} target="_blank" rel="noreferrer"
                            className="p-1.5 rounded-lg hover:bg-slate-100 inline-flex items-center" title="PDF">
                            <Printer size={14} style={{ color: '#64748B' }} />
                          </a>
                          {inv.status !== 'PAID' && inv.status !== 'VOIDED' && inv.status !== 'CONVERTED' && (
                            <button onClick={() => { setSelectedId(inv.id); setModal('void'); setVoidReason(''); }}
                              className="p-1.5 rounded-lg hover:bg-red-50" title="Anular">
                              <Trash2 size={14} style={{ color: '#DC2626' }} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {/* Totals row — always visible, prominent when printing */}
              <tfoot>
                <tr style={{ borderTop: '2px solid rgba(10,22,40,0.12)', backgroundColor: 'rgba(10,22,40,0.03)' }}>
                  <td colSpan={5} className="px-4 py-3 text-xs font-bold uppercase tracking-wide" style={{ color: brand.navy[700] }}>
                    {totalCount} documento{totalCount !== 1 ? 's' : ''}
                    {dateMode !== 'all' && <span className="ml-2 font-normal normal-case" style={{ color: '#64748B' }}>· {periodLabel}</span>}
                  </td>
                  <td className="px-4 py-3 font-bold text-sm" style={{ color: brand.navy[950] }}>
                    {formatCurrency(printTotals.subtotal)}
                  </td>
                  <td className="px-4 py-3 font-semibold text-sm text-slate-500">
                    {formatCurrency(printTotals.tax)}
                  </td>
                  <td className="px-4 py-3 font-bold text-sm" style={{ color: brand.navy[950] }}>
                    {formatCurrency(printTotals.total)}
                  </td>
                  <td className="px-4 py-3 font-bold text-sm" style={{ color: '#16A34A' }}>
                    {formatCurrency(printTotals.paid)}
                  </td>
                  <td className="px-4 py-3 font-bold text-sm" style={{ color: printTotals.total - printTotals.paid > 0 ? '#DC2626' : '#16A34A' }}>
                    {formatCurrency(printTotals.total - printTotals.paid)}
                  </td>
                  <td className="print:hidden" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* ── Pagination (hidden in print mode) ── */}
      {totalPages > 1 && !printMode && (
        <div className="flex items-center justify-between text-sm print:hidden" style={{ color: '#64748B' }}>
          <span>Mostrando {(page - 1) * 20 + 1}–{Math.min(page * 20, totalCount)} de {totalCount}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded-lg border disabled:opacity-40"><ChevronLeft size={16} /></button>
            <span className="px-3 py-1 rounded-lg bg-white/60 border">{page} / {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1.5 rounded-lg border disabled:opacity-40"><ChevronRight size={16} /></button>
          </div>
        </div>
      )}
      </>)}

      {/* ══════════════════════════════════════════════════════════
          CREATE MODAL — Full-screen split panel
      ══════════════════════════════════════════════════════════ */}
      {(modal === 'create' || modal === 'edit') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" style={{ backdropFilter: 'blur(6px)' }} onClick={closeModal} />
          <div className="relative w-full max-w-6xl rounded-2xl overflow-hidden flex flex-col"
            style={{ height: '92vh', background: 'rgba(255,255,255,0.98)', boxShadow: '0 32px 80px rgba(10,22,40,0.28)' }}>

            {/* Modal top bar */}
            <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ background: brand.navy[950] }}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: brand.orange[500] }}>
                  <Receipt size={15} className="text-white" />
                </div>
                <div>
                  <div className="text-base font-bold text-white">{modal === 'edit' ? 'Editar Documento' : 'Nuevo Documento'}</div>
                  <div className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>The Builder&apos;s House · Puerto Rico</div>
                </div>
              </div>
              <button onClick={closeModal} className="p-1.5 rounded-lg hover:bg-white/10">
                <X size={18} className="text-white/70" />
              </button>
            </div>

            {/* Body: form (left) + preview (right) */}
            <div className="flex flex-1 min-h-0">

              {/* ── LEFT: FORM ── */}
              <div className="flex flex-col w-[56%] border-r border-slate-100 min-h-0">
                <div className="flex-1 overflow-y-auto p-6 space-y-5">

                  {error && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-red-700 bg-red-50 border border-red-200">
                      <AlertCircle size={14} />{error}
                    </div>
                  )}

                  {/* Document type — read-only when editing */}
                  <div>
                    <label className="block text-xs font-semibold mb-2" style={{ color: brand.navy[700] }}>Tipo de documento</label>
                    {modal === 'edit' ? (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50">
                        {(() => { const cfg = TYPE_CFG[invoiceType]; return (
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: cfg.color + '20', color: cfg.color }}>{cfg.label}</span>
                        ); })()}
                        <span className="text-xs text-slate-400">No se puede cambiar el tipo al editar</span>
                      </div>
                    ) : (
                    <div className="flex gap-2">
                      {(Object.entries(TYPE_CFG) as [InvoiceType, typeof TYPE_CFG[InvoiceType]][]).map(([type, cfg]) => (
                        <button key={type} onClick={() => setInvoiceType(type)}
                          className="flex-1 py-2 px-2 rounded-xl text-xs font-semibold transition-all"
                          style={{
                            background: invoiceType === type ? cfg.color : 'transparent',
                            color: invoiceType === type ? 'white' : cfg.color,
                            border: `2px solid ${cfg.color}`,
                          }}>
                          {cfg.label}
                        </button>
                      ))}
                    </div>
                    )}
                  </div>

                  {/* Branch / Sucursal — primero para filtrar contexto */}
                  {invoiceType !== 'QUOTE' && (
                    <div>
                      <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>Sucursal *</label>
                      <select value={branchId} onChange={(e) => setBranchId(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border text-sm outline-none"
                        style={{ color: brand.navy[900], borderColor: !branchId ? '#FCA5A5' : '#E2E8F0' }}>
                        <option value="">Seleccionar sucursal...</option>
                        {(warehouses ?? []).map((w) => (
                          <option key={w.id} value={w.id}>{w.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Customer */}
                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>Cliente *</label>
                    <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none" style={{ color: brand.navy[900] }}>
                      <option value="">Seleccionar cliente...</option>
                      {customers?.customers.map((c) => (
                        <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
                      ))}
                    </select>
                    {selectedCustomer && (
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                          style={{
                            background: selectedCustomer.type === 'WHOLESALE' ? '#EFF6FF' : '#F0FDF4',
                            color: selectedCustomer.type === 'WHOLESALE' ? '#1D4ED8' : '#166534',
                          }}>
                          {selectedCustomer.type === 'WHOLESALE' ? 'Mayorista' : 'Detallista'}
                        </span>
                        <span className="text-xs text-slate-400">
                          · Precios {selectedCustomer.type === 'WHOLESALE' ? 'mayorista' : 'retail'} aplicados
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Payment mode + IVU toggle */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* Condición de pago */}
                    <div>
                      <label className="block text-xs font-semibold mb-2" style={{ color: brand.navy[700] }}>Condición de pago</label>
                      <div className="flex rounded-xl overflow-hidden border border-slate-200">
                        {(['CONTADO', 'CREDITO'] as const).map((m) => (
                          <button key={m} type="button" onClick={() => setPaymentMode(m)}
                            className="flex-1 py-2 text-xs font-semibold transition-all"
                            style={{
                              background: paymentMode === m ? brand.navy[950] : 'white',
                              color: paymentMode === m ? 'white' : brand.navy[600],
                            }}>
                            {m === 'CONTADO' ? 'Al Contado' : 'A Crédito'}
                          </button>
                        ))}
                      </div>
                      {paymentMode === 'CREDITO' && (
                        <div className="mt-2 flex gap-1.5 flex-wrap">
                          {[15, 30, 45, 60, 90].map((d) => (
                            <button key={d} type="button" onClick={() => setCreditDays(d)}
                              className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all"
                              style={{
                                background: creditDays === d ? brand.orange[500] : brand.orange[50],
                                color: creditDays === d ? 'white' : brand.orange[500],
                              }}>
                              {d}d
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* IVU toggle */}
                    <div>
                      <label className="block text-xs font-semibold mb-2" style={{ color: brand.navy[700] }}>Impuesto IVU</label>
                      <button type="button" onClick={() => setApplyIvu((v) => !v)}
                        className="w-full flex items-center justify-between px-4 py-2 rounded-xl border transition-all"
                        style={{
                          background: applyIvu ? `${brand.orange[500]}12` : '#F1F5F9',
                          borderColor: applyIvu ? brand.orange[400] : '#E2E8F0',
                        }}>
                        <div className="text-left">
                          <div className="text-xs font-semibold" style={{ color: applyIvu ? brand.orange[600] : '#94A3B8' }}>
                            {applyIvu ? `IVU ${(taxRate * 100).toFixed(1)}%` : 'Exento de IVU'}
                          </div>
                          <div className="text-xs" style={{ color: applyIvu ? brand.orange[500] : '#CBD5E1' }}>
                            {applyIvu ? 'Toca para exentar' : 'Toca para aplicar'}
                          </div>
                        </div>
                        {/* Toggle pill */}
                        <span className="relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-200"
                          style={{ background: applyIvu ? brand.orange[500] : '#CBD5E1' }}>
                          <span className="pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 mt-0.5"
                            style={{ transform: applyIvu ? 'translateX(18px)' : 'translateX(2px)' }} />
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Due date (manual override or shown when CREDITO) */}
                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>
                      Fecha de vencimiento
                      {paymentMode === 'CREDITO' && !dueDate && (
                        <span className="ml-2 font-normal text-slate-400">
                          (calculada: {creditDays} días desde hoy)
                        </span>
                      )}
                    </label>
                    <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none" style={{ color: brand.navy[900] }} />
                    {paymentMode === 'CONTADO' && !dueDate && (
                      <p className="text-xs text-slate-400 mt-1">Al contado — sin fecha de vencimiento</p>
                    )}
                  </div>

                  {/* Line items */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-xs font-semibold" style={{ color: brand.navy[700] }}>Productos</label>
                      <button onClick={addLine}
                        className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg"
                        style={{ color: brand.orange[500], background: brand.orange[50] }}>
                        <Plus size={11} /> Agregar línea
                      </button>
                    </div>

                    {/* Column headers */}
                    <div className="grid text-xs font-semibold px-3 mb-1"
                      style={{ gridTemplateColumns: '1fr 58px 76px 56px 26px', color: '#94A3B8' }}>
                      <span>Producto</span>
                      <span className="text-center">Cant.</span>
                      <span className="text-right">Precio</span>
                      <span className="text-right">Desc%</span>
                      <span />
                    </div>

                    <div className="space-y-2">
                      {lines.map((line, i) => {
                        const locOptions = getLocationsForProduct(line.productId);
                        const lineTotal = calcLine(line);
                        const locAvail = line.locationId
                          ? (locOptions.find((l) => l.id === line.locationId)?.available ?? null)
                          : null;
                        const qty = parseInt(line.quantity) || 0;
                        const overstock = locAvail !== null && qty > locAvail;

                        return (
                          <div key={i} className="rounded-xl border overflow-hidden"
                            style={{ borderColor: overstock ? '#FCA5A5' : '#E2E8F0' }}>
                            <div className="grid items-center gap-1.5 p-2 bg-slate-50/60"
                              style={{ gridTemplateColumns: '1fr 58px 76px 56px 26px' }}>
                              <div>
                                <ProductCombobox
                                  value={line.productId}
                                  products={products?.products ?? []}
                                  onChange={(productId) => updateLine(i, 'productId', productId)}
                                />
                                {line.productSku && (
                                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded"
                                      style={{ background: brand.navy[950] + '12', color: brand.navy[700] }}>
                                      {line.productSku}
                                    </span>
                                    {getLocationsForProduct(line.productId).map((loc) => (
                                      <span key={loc.id} className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                                        style={{
                                          background: loc.available > 10 ? '#F0FDF4' : loc.available > 0 ? '#FEF9C3' : '#FEF2F2',
                                          color:      loc.available > 10 ? '#166534' : loc.available > 0 ? '#854D0E' : '#991B1B',
                                        }}>
                                        {loc.label.split(' — ')[0]}: {loc.available}u
                                      </span>
                                    ))}
                                    {getLocationsForProduct(line.productId).length === 0 && (
                                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                                        style={{ background: '#FEF2F2', color: '#991B1B' }}>
                                        Sin stock en sistema
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                              <input type="number" value={line.quantity} onChange={(e) => updateLine(i, 'quantity', e.target.value)}
                                min="1" className="w-full px-1.5 py-1.5 rounded-lg border border-slate-200 text-xs text-center outline-none bg-white"
                                style={{ color: brand.navy[900] }} />
                              <input type="number" value={line.unitPrice} onChange={(e) => updateLine(i, 'unitPrice', e.target.value)}
                                step="0.01" className="w-full px-1.5 py-1.5 rounded-lg border border-slate-200 text-xs text-right outline-none bg-white"
                                style={{ color: brand.navy[900] }} />
                              <input type="number" value={line.discountPercent} onChange={(e) => updateLine(i, 'discountPercent', e.target.value)}
                                min="0" max="100" className="w-full px-1.5 py-1.5 rounded-lg border border-slate-200 text-xs text-right outline-none bg-white"
                                style={{ color: brand.navy[900] }} />
                              <button onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}
                                className="flex items-center justify-center p-1 rounded-lg hover:bg-red-50"
                                disabled={lines.length === 1}>
                                <X size={11} style={{ color: lines.length === 1 ? '#CBD5E1' : '#DC2626' }} />
                              </button>
                            </div>

                            {line.productId && (
                              <div className="px-2 pb-2 bg-white flex items-center gap-2">
                                {invoiceType !== 'QUOTE' && (
                                  branchId && line.locationId && locOptions.length <= 1 ? (
                                    // Sucursal seleccionada + ubicación auto-asignada → badge de confirmación
                                    <span className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold"
                                      style={{ backgroundColor: '#F0FDF4', color: '#166534', border: '1px solid #BBF7D0' }}>
                                      <CheckCircle2 size={11} />
                                      {locOptions[0]?.label ?? line.locationId} · {locOptions[0]?.available ?? 0} disp.
                                    </span>
                                  ) : (
                                    <select value={line.locationId} onChange={(e) => updateLine(i, 'locationId', e.target.value)}
                                      className="flex-1 px-2 py-1 rounded-lg border text-xs outline-none"
                                      style={{ color: brand.navy[900], borderColor: !line.locationId ? '#FCA5A5' : '#E2E8F0' }}>
                                      <option value="">{branchId ? 'Sin stock en esta sucursal' : 'Seleccionar ubicación *'}</option>
                                      {locOptions.map((loc) => (
                                        <option key={loc.id} value={loc.id}>{loc.label} ({loc.available} disp.)</option>
                                      ))}
                                    </select>
                                  )
                                )}
                                {overstock && (
                                  <span className="flex items-center gap-1 text-xs font-semibold shrink-0" style={{ color: '#DC2626' }}>
                                    <AlertCircle size={11} /> Excede stock
                                  </span>
                                )}
                                <span className="ml-auto text-xs font-bold shrink-0" style={{ color: brand.navy[950] }}>
                                  {formatCurrency(lineTotal)}
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Totals summary */}
                  <div className="rounded-xl p-4 space-y-2" style={{ background: `${brand.navy[950]}08` }}>
                    <div className="flex justify-between text-sm text-slate-500">
                      <span>Subtotal</span><span className="font-medium">{formatCurrency(subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-sm" style={{ color: applyIvu ? '#64748B' : '#94A3B8' }}>
                      <span>{applyIvu ? `IVU (${(taxRate * 100).toFixed(1)}%)` : 'IVU (Exento)'}</span>
                      <span className="font-medium">{applyIvu ? formatCurrency(taxAmount) : ''}</span>
                    </div>
                    <div className="flex justify-between text-base font-bold pt-2 border-t border-slate-200" style={{ color: brand.navy[950] }}>
                      <span>Total</span><span>{formatCurrency(totalAmount)}</span>
                    </div>
                    {paymentMode === 'CREDITO' && (
                      <div className="flex justify-between text-xs pt-1" style={{ color: '#0284C7' }}>
                        <span>Crédito {creditDays} días</span>
                        <span>{dueDate
                          ? new Date(dueDate + 'T12:00:00').toLocaleDateString('es-PR')
                          : (() => { const d = new Date(); d.setDate(d.getDate() + creditDays); return d.toLocaleDateString('es-PR'); })()
                        }</span>
                      </div>
                    )}
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>Notas / Condiciones</label>
                    <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                      placeholder="Condiciones de pago, instrucciones de entrega..."
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none resize-none"
                      style={{ color: brand.navy[900] }} />
                  </div>

                  {/* Motivo de edición — requerido al editar factura ISSUED */}
                  {modal === 'edit' && editInvoiceData?.status === 'ISSUED' && editInvoiceData?.type === 'INVOICE' && (
                    <div className="rounded-xl p-3 border" style={{ background: '#FFFBEB', borderColor: '#FDE68A' }}>
                      <label className="block text-xs font-semibold mb-1.5" style={{ color: '#92400E' }}>
                        Motivo de edición * <span className="font-normal">(factura emitida — requerido)</span>
                      </label>
                      <input value={editReason} onChange={(e) => setEditReason(e.target.value)}
                        placeholder="Ej: Error en cantidad, precio acordado diferente..."
                        className="w-full px-3 py-2 rounded-xl border border-amber-200 text-sm outline-none"
                        style={{ color: brand.navy[900] }} />
                      <p className="text-xs mt-1.5" style={{ color: '#92400E' }}>
                        El inventario se revertirá y re-calculará. Queda registrado en auditoría.
                      </p>
                    </div>
                  )}
                </div>

                {/* Action bar */}
                <div className="px-6 py-4 border-t border-slate-100 flex gap-3 shrink-0" style={{ background: 'rgba(255,255,255,0.95)' }}>
                  <button onClick={closeModal}
                    className="px-4 py-2 rounded-xl text-sm font-medium border border-slate-200 hover:bg-slate-50"
                    style={{ color: '#64748B' }}>
                    Cancelar
                  </button>
                  <div className="flex-1" />
                  <button onClick={submitCreate}
                    disabled={modal === 'edit' ? updateMutation.isPending : createMutation.isPending}
                    className="px-6 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-60 hover:opacity-90 transition-opacity"
                    style={{ background: `linear-gradient(135deg, ${brand.orange[500]}, ${brand.orange[600]})` }}>
                    {modal === 'edit'
                      ? (updateMutation.isPending ? 'Guardando...' : 'Guardar Cambios')
                      : (createMutation.isPending ? 'Emitiendo...' :
                          invoiceType === 'QUOTE' ? 'Emitir Cotización' :
                          invoiceType === 'CREDIT_NOTE' ? 'Emitir Nota de Crédito' :
                          'Emitir Factura')}
                  </button>
                </div>
              </div>

              {/* ── RIGHT: LIVE PREVIEW ── */}
              <div className="flex-1 overflow-y-auto p-6" style={{ background: '#F8FAFC' }}>
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#94A3B8' }}>
                    Vista previa
                  </span>
                  <span className="text-xs text-slate-400">Se actualiza en tiempo real</span>
                </div>
                <InvoicePreview
                  invoiceType={invoiceType}
                  customerName={selectedCustomer?.name ?? ''}
                  customerCode={selectedCustomer?.code ?? ''}
                  customerType={selectedCustomer?.type ?? 'RETAIL'}
                  dueDate={dueDate}
                  lines={lines}
                  notes={notes}
                  taxRate={effectiveTaxRate}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          DETAIL MODAL
      ══════════════════════════════════════════════════════════ */}
      {modal === 'detail' && detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" style={{ backdropFilter: 'blur(4px)' }} onClick={closeModal} />
          <div className="relative w-full max-w-2xl rounded-2xl overflow-hidden flex flex-col max-h-[90vh]"
            style={{ background: 'rgba(255,255,255,0.98)', boxShadow: '0 24px 64px rgba(10,22,40,0.18)' }}>

            {/* Detail header */}
            <div className="px-6 py-4 flex items-start justify-between shrink-0" style={{ background: brand.navy[950] }}>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  {(() => {
                    const tc = TYPE_CFG[(detail as unknown as { type: InvoiceType }).type] ?? TYPE_CFG.INVOICE;
                    return <span className="px-2 py-0.5 rounded text-xs font-bold" style={{ background: tc.color + '30', color: tc.color }}>{tc.shortLabel}</span>;
                  })()}
                  <h2 className="text-lg font-bold text-white">{detail.invoiceNumber}</h2>
                  {(() => {
                    const st = STATUS_STYLES[detail.status] ?? STATUS_STYLES.DRAFT!;
                    return <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ backgroundColor: st.bg, color: st.text }}>{st.label}</span>;
                  })()}
                </div>
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  {detail.customer.name} · {formatDate(detail.createdAt)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a href={`/api/print/invoice/${detail.id}`} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={{ color: 'rgba(255,255,255,0.8)', border: '1px solid rgba(255,255,255,0.2)' }}>
                  <Printer size={13} /> PDF
                </a>
                <button onClick={closeModal} className="p-1.5 rounded-lg hover:bg-white/10">
                  <X size={18} className="text-white/70" />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto p-6 space-y-5">
              {/* Items */}
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '2px solid rgba(10,22,40,0.1)' }}>
                    <th className="text-left pb-2 text-xs font-semibold text-slate-400">Producto</th>
                    <th className="text-right pb-2 text-xs font-semibold text-slate-400 w-12">Cant.</th>
                    <th className="text-right pb-2 text-xs font-semibold text-slate-400 w-20">Precio</th>
                    <th className="text-right pb-2 text-xs font-semibold text-slate-400 w-20">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.items.map((item) => (
                    <tr key={item.id} style={{ borderBottom: '1px solid rgba(10,22,40,0.05)' }}>
                      <td className="py-2.5" style={{ color: brand.navy[900] }}>
                        {item.product.name}
                        {Number(item.discountPercent) > 0 && (
                          <div className="text-xs" style={{ color: brand.orange[500] }}>Desc. {Number(item.discountPercent)}%</div>
                        )}
                      </td>
                      <td className="py-2.5 text-right text-slate-600">{item.quantity}</td>
                      <td className="py-2.5 text-right text-slate-600">{formatCurrency(Number(item.unitPrice))}</td>
                      <td className="py-2.5 text-right font-semibold" style={{ color: brand.navy[950] }}>{formatCurrency(Number(item.lineTotal))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Totals */}
              <div className="ml-auto w-56 p-4 rounded-xl space-y-1.5 text-sm" style={{ background: '#F8FAFC' }}>
                <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{formatCurrency(Number(detail.subtotal))}</span></div>
                <div className="flex justify-between text-slate-500">
                  <span>IVU ({(Number(detail.taxRate) * 100).toFixed(1)}%)</span>
                  <span>{formatCurrency(Number(detail.taxAmount))}</span>
                </div>
                <div className="flex justify-between font-bold text-base pt-1.5 border-t border-slate-200" style={{ color: brand.navy[950] }}>
                  <span>Total</span><span>{formatCurrency(Number(detail.total))}</span>
                </div>
                <div className="flex justify-between" style={{ color: '#16A34A' }}>
                  <span>Pagado</span><span>{formatCurrency(Number(detail.paidAmount))}</span>
                </div>
                {Number(detail.total) - Number(detail.paidAmount) > 0.001 && (
                  <div className="flex justify-between font-semibold" style={{ color: '#DC2626' }}>
                    <span>Balance</span><span>{formatCurrency(Number(detail.total) - Number(detail.paidAmount))}</span>
                  </div>
                )}
              </div>

              {/* Payment history */}
              {detail.payments.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#94A3B8' }}>Pagos recibidos</p>
                  <div className="space-y-2">
                    {detail.payments.map((p) => (
                      <div key={p.id} className="flex items-center justify-between text-sm py-2 px-3 rounded-lg"
                        style={{ background: '#F0FDF4', border: '1px solid #BBF7D0' }}>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 size={14} style={{ color: '#16A34A' }} />
                          <span style={{ color: brand.navy[800] }}>{p.method}</span>
                          {p.reference && <span className="text-xs text-slate-400">· {p.reference}</span>}
                        </div>
                        <span className="font-semibold" style={{ color: '#166534' }}>{formatCurrency(Number(p.amount))}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Detail actions */}
            {(detail.status === 'ISSUED' || detail.status === 'PARTIAL' || detail.status === 'PENDING_AUTHORIZATION') && (
              <div className="px-6 py-4 border-t border-slate-100 flex gap-2 shrink-0">
                {(detail.status === 'ISSUED' || detail.status === 'PARTIAL') && (
                  <button onClick={() => setModal('payment')}
                    className="flex-1 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90"
                    style={{ background: `linear-gradient(135deg, ${brand.orange[500]}, ${brand.orange[600]})` }}>
                    Registrar Pago
                  </button>
                )}
                {detail.status === 'PENDING_AUTHORIZATION' && canAuthorize && (
                  <button onClick={() => { setModal('authorizeAndPay'); setAuthNotes(''); setAuthPayAmount(''); setAuthPayMethod('CASH'); setAuthPayRef(''); }}
                    className="flex-1 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90"
                    style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}>
                    Autorizar + Cobrar
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          PAYMENT MODAL
      ══════════════════════════════════════════════════════════ */}
      {modal === 'payment' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" style={{ backdropFilter: 'blur(4px)' }} onClick={closeModal} />
          <div className="relative w-full max-w-sm rounded-2xl overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.98)', boxShadow: '0 24px 64px rgba(10,22,40,0.18)' }}>
            <div className="px-6 py-4 flex items-center justify-between" style={{ background: brand.navy[950] }}>
              <h2 className="text-base font-bold text-white">Registrar Pago</h2>
              <button onClick={closeModal} className="p-1 rounded-lg hover:bg-white/10"><X size={18} className="text-white/70" /></button>
            </div>
            <div className="p-6 space-y-4">
              {error && <div className="px-3 py-2 rounded-xl text-sm text-red-700 bg-red-50 border border-red-200">{error}</div>}
              {detail && (
                <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: '#FFF7ED' }}>
                  <span className="text-sm text-slate-600">Balance pendiente</span>
                  <span className="font-bold text-lg" style={{ color: brand.orange[500] }}>
                    {formatCurrency(Number(detail.total) - Number(detail.paidAmount))}
                  </span>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>Monto *</label>
                <input type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder="0.00"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none" style={{ color: brand.navy[900] }} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-2" style={{ color: brand.navy[700] }}>Método de pago</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['CASH', 'CHECK', 'TRANSFER', 'CARD', 'CREDIT'] as const).map((m) => (
                    <button key={m} onClick={() => setPayMethod(m)}
                      className="py-2 rounded-xl text-xs font-semibold transition-all"
                      style={{
                        background: payMethod === m ? brand.navy[950] : 'transparent',
                        color: payMethod === m ? 'white' : brand.navy[700],
                        border: `2px solid ${payMethod === m ? brand.navy[950] : '#E2E8F0'}`,
                      }}>
                      {m === 'CASH' ? 'Efectivo' : m === 'CHECK' ? 'Cheque' : m === 'TRANSFER' ? 'Transf.' : m === 'CARD' ? 'Tarjeta' : 'Crédito'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>Referencia</label>
                <input value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="#cheque, confirmación..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none" style={{ color: brand.navy[900] }} />
              </div>
            </div>
            <div className="px-6 pb-5 flex gap-3">
              <button onClick={closeModal} className="flex-1 py-2 rounded-xl text-sm border hover:bg-slate-50" style={{ color: '#64748B' }}>Cancelar</button>
              <button onClick={submitPayment} disabled={paymentMutation.isPending}
                className="flex-1 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-60"
                style={{ background: `linear-gradient(135deg, ${brand.orange[500]}, ${brand.orange[600]})` }}>
                {paymentMutation.isPending ? 'Guardando...' : 'Confirmar Pago'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          AUTHORIZE MODAL
      ══════════════════════════════════════════════════════════ */}
      {modal === 'authorize' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" style={{ backdropFilter: 'blur(4px)' }} onClick={closeModal} />
          <div className="relative w-full max-w-sm rounded-2xl overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.98)', boxShadow: '0 24px 64px rgba(10,22,40,0.18)' }}>
            <div className="px-6 py-4" style={{ background: '#059669' }}>
              <h2 className="text-base font-bold text-white">Autorizar Backorder</h2>
              <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.7)' }}>
                El stock se descontará aunque quede negativo. Queda en auditoría.
              </p>
            </div>
            <div className="p-6 space-y-4">
              {error && <div className="px-3 py-2 rounded-xl text-sm text-red-700 bg-red-50 border border-red-200">{error}</div>}
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>Justificación *</label>
                <textarea value={authNotes} onChange={(e) => setAuthNotes(e.target.value)} rows={4}
                  placeholder="Motivo de autorización..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none resize-none" style={{ color: brand.navy[900] }} />
              </div>
            </div>
            <div className="px-6 pb-5 flex gap-3">
              <button onClick={closeModal} className="flex-1 py-2 rounded-xl text-sm border hover:bg-slate-50" style={{ color: '#64748B' }}>Cancelar</button>
              <button
                onClick={() => selectedId && authorizeMutation.mutate({ id: selectedId, authorizationNotes: authNotes })}
                disabled={!authNotes.trim() || authorizeMutation.isPending}
                className="flex-1 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-60"
                style={{ background: '#059669' }}>
                {authorizeMutation.isPending ? 'Autorizando...' : 'Autorizar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          AUTHORIZE + PAY MODAL (un solo paso)
      ══════════════════════════════════════════════════════════ */}
      {modal === 'authorizeAndPay' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" style={{ backdropFilter: 'blur(4px)' }} onClick={closeModal} />
          <div className="relative w-full max-w-sm rounded-2xl overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.98)', boxShadow: '0 24px 64px rgba(10,22,40,0.18)' }}>
            <div className="px-6 py-4" style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <ShieldCheck size={16} /> Autorizar + Cobrar
              </h2>
              <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.75)' }}>
                Autoriza el stock y registra el pago en un solo paso.
              </p>
            </div>
            <div className="p-6 space-y-4">
              {error && <div className="px-3 py-2 rounded-xl text-sm text-red-700 bg-red-50 border border-red-200">{error}</div>}
              {detail && (
                <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: '#F0FDF4', border: '1px solid #BBF7D0' }}>
                  <span className="text-sm text-slate-600">Total a cobrar</span>
                  <span className="font-bold text-lg" style={{ color: '#059669' }}>
                    {formatCurrency(Number(detail.total) - Number(detail.paidAmount))}
                  </span>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>Justificación de autorización *</label>
                <textarea value={authNotes} onChange={(e) => setAuthNotes(e.target.value)} rows={2}
                  placeholder="Motivo de autorización de stock..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none resize-none" style={{ color: brand.navy[900] }} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>Monto recibido *</label>
                <input type="number" value={authPayAmount} onChange={(e) => setAuthPayAmount(e.target.value)} placeholder="0.00"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none" style={{ color: brand.navy[900] }} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-2" style={{ color: brand.navy[700] }}>Método de pago</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['CASH', 'CHECK', 'TRANSFER', 'CARD', 'CREDIT'] as const).map((m) => (
                    <button key={m} onClick={() => setAuthPayMethod(m)}
                      className="py-1.5 rounded-xl text-xs font-semibold transition-all"
                      style={{
                        background: authPayMethod === m ? '#059669' : 'transparent',
                        color: authPayMethod === m ? 'white' : brand.navy[700],
                        border: `2px solid ${authPayMethod === m ? '#059669' : '#E2E8F0'}`,
                      }}>
                      {m === 'CASH' ? 'Efectivo' : m === 'CHECK' ? 'Cheque' : m === 'TRANSFER' ? 'Transf.' : m === 'CARD' ? 'Tarjeta' : 'Crédito'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>Referencia (opcional)</label>
                <input value={authPayRef} onChange={(e) => setAuthPayRef(e.target.value)} placeholder="#cheque, confirmación..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none" style={{ color: brand.navy[900] }} />
              </div>
            </div>
            <div className="px-6 pb-5 flex gap-3">
              <button onClick={closeModal} className="flex-1 py-2 rounded-xl text-sm border hover:bg-slate-50" style={{ color: '#64748B' }}>Cancelar</button>
              <button
                onClick={() => {
                  if (!selectedId) return;
                  const amount = parseFloat(authPayAmount);
                  if (!amount || amount <= 0) { setError('Monto inválido'); return; }
                  if (!authNotes.trim()) { setError('La justificación es requerida'); return; }
                  authorizeAndPayMutation.mutate({
                    id: selectedId,
                    authorizationNotes: authNotes,
                    amount,
                    method: authPayMethod,
                    reference: authPayRef || undefined,
                  });
                }}
                disabled={!authNotes.trim() || !authPayAmount || authorizeAndPayMutation.isPending}
                className="flex-1 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}>
                {authorizeAndPayMutation.isPending ? 'Procesando...' : 'Autorizar + Cobrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          VOID MODAL
      ══════════════════════════════════════════════════════════ */}
      {modal === 'void' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" style={{ backdropFilter: 'blur(4px)' }} onClick={closeModal} />
          <div className="relative w-full max-w-sm rounded-2xl overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.98)', boxShadow: '0 24px 64px rgba(10,22,40,0.18)' }}>
            <div className="px-6 py-4" style={{ background: '#DC2626' }}>
              <h2 className="text-base font-bold text-white">Anular Documento</h2>
              <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.7)' }}>Esta acción es irreversible. El stock será restaurado.</p>
            </div>
            <div className="p-6 space-y-4">
              {error && <div className="px-3 py-2 rounded-xl text-sm text-red-700 bg-red-50 border border-red-200">{error}</div>}
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>Motivo de anulación *</label>
                <textarea value={voidReason} onChange={(e) => setVoidReason(e.target.value)} rows={4}
                  placeholder="Describe el motivo..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none resize-none" style={{ color: brand.navy[900] }} />
              </div>
            </div>
            <div className="px-6 pb-5 flex gap-3">
              <button onClick={closeModal} className="flex-1 py-2 rounded-xl text-sm border hover:bg-slate-50" style={{ color: '#64748B' }}>Cancelar</button>
              <button onClick={() => selectedId && voidMutation.mutate({ id: selectedId, reason: voidReason })}
                disabled={!voidReason.trim() || voidMutation.isPending}
                className="flex-1 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-60"
                style={{ background: '#DC2626' }}>
                {voidMutation.isPending ? 'Anulando...' : 'Confirmar Anulación'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ CONVERT QUOTE → INVOICE MODAL ══════════════════════════════ */}
      {modal === 'convertQuote' && detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" style={{ backdropFilter: 'blur(4px)' }} onClick={closeModal} />
          <div className="relative w-full max-w-lg mx-4 rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
            style={{ background: 'rgba(255,255,255,0.97)', boxShadow: '0 24px 64px rgba(10,22,40,0.18)' }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold" style={{ color: brand.navy[950] }}>Convertir a Factura</h2>
                <p className="text-sm text-slate-500">{detail.invoiceNumber} · {detail.customer.name}</p>
              </div>
              <button onClick={closeModal}><X size={18} style={{ color: '#64748B' }} /></button>
            </div>
            {error && <div className="mb-4 px-3 py-2 rounded-xl text-sm text-red-700 bg-red-50 border border-red-200">{error}</div>}

            <p className="text-xs text-slate-500 mb-4">
              Selecciona la ubicación de almacén para cada producto. Los precios acordados en la cotización se heredan automáticamente.
            </p>

            <div className="space-y-3 mb-4">
              {detail.items.map((item) => {
                const locOptions = warehouses?.flatMap((w) =>
                  (w.locations as unknown as Array<{ id: string; locationCode: string; quantityOnHand: number; productId: string }>)
                    .filter((l) => l.productId === item.productId)
                    .map((l) => ({ id: l.id, label: `${w.name} — ${l.locationCode}`, qty: l.quantityOnHand }))
                ) ?? [];
                return (
                  <div key={item.id} className="p-3 rounded-xl border border-slate-200">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <div className="text-sm font-medium" style={{ color: brand.navy[900] }}>{item.product.name}</div>
                        <div className="text-xs text-slate-400 font-mono">{item.product.sku} · Cant: {item.quantity}</div>
                      </div>
                    </div>
                    <select
                      value={convertLocations[item.productId] ?? ''}
                      onChange={(e) => setConvertLocations((prev) => ({ ...prev, [item.productId]: e.target.value }))}
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-xs outline-none"
                      style={{ color: brand.navy[900] }}>
                      <option value="">— Seleccionar ubicación —</option>
                      {locOptions.map((l) => (
                        <option key={l.id} value={l.id}>{l.label} ({l.qty} disp.)</option>
                      ))}
                      {locOptions.length === 0 && (
                        <option disabled>No hay ubicaciones para este producto</option>
                      )}
                    </select>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center gap-2 mb-5 p-3 rounded-xl" style={{ background: 'rgba(10,22,40,0.03)' }}>
              <input type="checkbox" id="convertTax" checked={!convertTaxExempt}
                onChange={() => setConvertTaxExempt((v) => !v)}
                className="w-4 h-4 rounded accent-orange-500" />
              <label htmlFor="convertTax" className="text-sm font-medium cursor-pointer" style={{ color: brand.navy[800] }}>
                Aplicar IVU ({taxRate * 100}%)
              </label>
            </div>

            <div className="flex gap-3">
              <button onClick={closeModal} className="flex-1 py-2 rounded-xl text-sm border hover:bg-slate-50" style={{ color: '#64748B' }}>Cancelar</button>
              <button
                disabled={convertQuoteMutation.isPending || detail.items.some((i) => !convertLocations[i.productId])}
                onClick={() => {
                  convertQuoteMutation.mutate({
                    quoteId: detail.id,
                    taxExempt: convertTaxExempt,
                    items: detail.items.map((i) => ({
                      productId: i.productId,
                      locationId: convertLocations[i.productId]!,
                      quantity: i.quantity,
                    })),
                  });
                }}
                className="flex-1 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
                style={{ background: `linear-gradient(135deg, ${brand.orange[500]}, ${brand.orange[600]})` }}>
                {convertQuoteMutation.isPending ? 'Convirtiendo...' : 'Convertir a Factura'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
