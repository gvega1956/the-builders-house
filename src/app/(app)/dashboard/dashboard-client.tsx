'use client';

import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  Plus, ChevronDown, DollarSign, Package, TrendingUp,
  ArrowUpRight, ArrowDownRight, AlertTriangle, Camera,
  CheckCircle2, Shield, Boxes, ChevronUp, ExternalLink, Clock,
} from 'lucide-react';
import { useState, useMemo, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { brand } from '@/lib/brand';
import { formatCurrency } from '@/lib/utils';
import { trpc } from '@/lib/trpc';
import { glass } from '@/lib/ui';

// Efecto 3D: resalte superior + borde inferior sólido coloreado = tarjeta elevada
function make3dShadow(floorColor: string, glowColor = 'rgba(0,0,0,0)') {
  return [
    '0 1px 0 rgba(255,255,255,0.85) inset',
    `0 6px 0 ${floorColor}`,
    `0 10px 24px ${glowColor}`,
    '0 1px 4px rgba(0,0,0,0.10)',
  ].join(', ');
}

const kpiBase = {
  background: '#FFFFFF',
  border: '1px solid #E2E8F0',
  boxShadow: make3dShadow('rgba(0,0,0,0.10)', 'rgba(0,0,0,0.05)'),
} as React.CSSProperties;

const kpiAccent = {
  background: 'linear-gradient(160deg, #FEF3EC 0%, #FDE8D8 100%)',
  border: '1px solid rgba(236,99,38,0.28)',
  boxShadow: make3dShadow('rgba(180,70,0,0.22)', 'rgba(236,99,38,0.10)'),
} as React.CSSProperties;

const kpiColorStyles = {
  blue: {
    card: {
      background: '#DBEAFE',
      border: '1px solid rgba(37,99,235,0.40)',
      boxShadow: make3dShadow('rgba(29,78,216,0.26)', 'rgba(59,130,246,0.14)'),
    } as React.CSSProperties,
    icon: { backgroundColor: '#BFDBFE' },
    iconColor: '#1D4ED8',
  },
  green: {
    card: {
      background: '#ECFDF5',
      border: '1px solid rgba(16,185,129,0.24)',
      boxShadow: make3dShadow('rgba(4,120,87,0.18)', 'rgba(16,185,129,0.08)'),
    } as React.CSSProperties,
    icon: { backgroundColor: '#D1FAE5' },
    iconColor: '#059669',
  },
  amber: {
    card: {
      background: '#FFFBEB',
      border: '1px solid rgba(245,158,11,0.24)',
      boxShadow: make3dShadow('rgba(146,64,14,0.16)', 'rgba(245,158,11,0.08)'),
    } as React.CSSProperties,
    icon: { backgroundColor: '#FEF3C7' },
    iconColor: '#D97706',
  },
  purple: {
    card: {
      background: '#EDE9FE',
      border: '1px solid rgba(109,40,217,0.40)',
      boxShadow: make3dShadow('rgba(91,33,182,0.26)', 'rgba(139,92,246,0.14)'),
    } as React.CSSProperties,
    icon: { backgroundColor: '#DDD6FE' },
    iconColor: '#6D28D9',
  },
};

function KPICard({
  label, value, change, trend, icon: Icon, prefix = '', accent = false, color,
}: {
  label: string;
  value: string;
  change?: string;
  trend?: 'up' | 'down';
  icon: React.ElementType;
  prefix?: string;
  accent?: boolean;
  color?: 'blue' | 'green' | 'amber' | 'purple';
}) {
  const colorStyle = color ? kpiColorStyles[color] : null;
  const cardStyle = accent ? kpiAccent : colorStyle ? colorStyle.card : kpiBase;

  return (
    <div
      className="rounded-2xl p-5 transition-all duration-200 hover:-translate-y-1 cursor-default"
      style={cardStyle}
    >
      <div className="flex items-start justify-between mb-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={colorStyle
            ? colorStyle.icon
            : { backgroundColor: accent ? brand.orange[100] : '#F1F5F9' }}
        >
          <Icon
            size={17}
            strokeWidth={2}
            style={{ color: colorStyle ? colorStyle.iconColor : accent ? brand.orange[500] : brand.navy[700] }}
          />
        </div>
        {change && (
          <span
            className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg ${
              trend === 'up'
                ? 'text-emerald-700 bg-emerald-50'
                : 'text-rose-700 bg-rose-50'
            }`}
          >
            {trend === 'up' ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {change}
          </span>
        )}
      </div>
      <div
        className="text-2xl font-bold tracking-tight mb-1"
        style={{ color: accent ? brand.orange[600] : brand.navy[950] }}
      >
        {prefix}{value}
      </div>
      <div className="text-xs font-medium text-slate-500">{label}</div>
    </div>
  );
}

const DAY_ABBR = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function formatDayLabel(isoDay: string): string {
  const d = new Date(isoDay + 'T00:00:00');
  return DAY_ABBR[d.getDay()] ?? isoDay;
}

function relativeTime(date: Date): string {
  const diffMs = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Ahora';
  if (mins < 60) return `Hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Hace ${hrs}h`;
  return `Hace ${Math.floor(hrs / 24)}d`;
}

const MOVEMENT_TYPE_LABEL: Record<string, string> = {
  IN: 'entrada',
  OUT: 'salida',
  RETURN: 'devolución',
  DAMAGE: 'daño',
  TRANSFER: 'transferencia',
  ADJUSTMENT: 'ajuste',
};

const PERIOD_OPTS = [
  { key: 'today', label: 'Hoy',        kpiLabel: 'del día',           days: 7  },
  { key: 'week',  label: 'Esta semana', kpiLabel: 'últimos 7 días',    days: 7  },
  { key: 'month', label: 'Este mes',    kpiLabel: 'del mes',           days: 30 },
] as const;
type KpiPeriod = typeof PERIOD_OPTS[number]['key'];

export function DashboardClient({ userName: fullName }: { userName: string }) {
  const router = useRouter();
  const [stockAlertsExpanded, setStockAlertsExpanded] = useState(false);
  const [kpiPeriod, setKpiPeriod] = useState<KpiPeriod>('today');
  const [showPeriodMenu, setShowPeriodMenu] = useState(false);
  const periodMenuRef = useRef<HTMLDivElement>(null);

  // Compute date range on the CLIENT to respect local timezone (PR = UTC-4).
  // Without this, the server's UTC "today" cuts off at 8 PM local time.
  const { kpiFrom, kpiTo, chartDays } = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    if (kpiPeriod === 'today')
      return { kpiFrom: todayStart, kpiTo: now, chartDays: 7 };
    if (kpiPeriod === 'week') {
      const d = new Date(todayStart);
      d.setDate(d.getDate() - 6);
      return { kpiFrom: d, kpiTo: now, chartDays: 7 };
    }
    return { kpiFrom: new Date(now.getFullYear(), now.getMonth(), 1), kpiTo: now, chartDays: 30 };
  }, [kpiPeriod]);

  useEffect(() => {
    if (!showPeriodMenu) return;
    function handler(e: MouseEvent) {
      if (periodMenuRef.current && !periodMenuRef.current.contains(e.target as Node))
        setShowPeriodMenu(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPeriodMenu]);

  const { data: kpis } = trpc.dashboard.kpis.useQuery({ from: kpiFrom, to: kpiTo });
  const { data: salesByDay } = trpc.dashboard.salesByDay.useQuery({ days: chartDays });
  const { data: branchSales } = trpc.dashboard.salesByWarehouse.useQuery({ from: kpiFrom, to: kpiTo });
  const { data: catData } = trpc.dashboard.inventoryByCategory.useQuery();
  const { data: sysConfig } = trpc.settings.getSystemConfig.useQuery();
  const { data: stockAlerts } = trpc.dashboard.stockAlerts.useQuery();
  const { data: pendingAuth } = trpc.dashboard.pendingAuthAlerts.useQuery();

  const currentPeriod = PERIOD_OPTS.find(p => p.key === kpiPeriod)!;

  const userName = fullName.split(' ')[0] ?? 'equipo';
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Buenos días' : hour < 18 ? 'Buenas tardes' : 'Buenas noches';
  const dateLabel = now.toLocaleDateString('es-PR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  const dateFormatted = dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1);

  const salesToday = kpis?.salesToday ?? 0;
  const costToday = kpis?.costToday ?? 0;
  const grossMargin = salesToday > 0 ? ((salesToday - costToday) / salesToday) * 100 : 0;

  const dailyTarget = sysConfig?.SALES_TARGET ? Number(sysConfig.SALES_TARGET) : 5000;
  const chartData = (salesByDay ?? []).map((d) => ({
    day: formatDayLabel(d.day),
    ventas: d.total,
    meta: dailyTarget,
  }));

  const categoryChartData = (catData ?? []).map((c) => ({
    name: c.name,
    value: c.units,
  }));

  const totalCatUnits = (catData ?? []).reduce((s, c) => s + c.units, 0);
  const totalWeekSales = (salesByDay ?? []).reduce((s, d) => s + d.total, 0);

  const adjustmentsWithoutPhoto = kpis?.alerts.adjustmentsWithoutPhoto ?? 0;
  const recentMovements = kpis?.recentMovements ?? [];

  return (
    <div className="space-y-6">

      {/* Encabezado */}
      <div className="flex items-end justify-between">
        <div>
          <div
            className="text-[11px] font-bold tracking-[0.25em] uppercase mb-2 px-3 py-1 rounded-full inline-block"
            style={{
              color: brand.orange[600],
              backgroundColor: 'rgba(236,99,38,0.10)',
            }}
          >
            {dateFormatted}
          </div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: brand.navy[950] }}>
            {greeting}, {userName}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {kpis?.invoiceCount ?? 0} facturas {currentPeriod.label.toLowerCase()} · {' '}
            {adjustmentsWithoutPhoto > 0 ? (
              <span className="font-semibold text-rose-600">{adjustmentsWithoutPhoto} ajuste(s) sin foto</span>
            ) : (
              <span className="font-semibold text-emerald-600">Auditoría al día</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* ── Selector de período ── */}
          <div ref={periodMenuRef} className="relative">
            <button
              onClick={() => setShowPeriodMenu(m => !m)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-xl transition-all hover:shadow-md"
              style={{ ...glass, color: brand.navy[800] }}
            >
              Ver: <span className="font-semibold">{currentPeriod.label}</span>
              <ChevronDown size={13} style={{ transform: showPeriodMenu ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }} />
            </button>
            {showPeriodMenu && (
              <div className="absolute right-0 top-full mt-1.5 rounded-xl bg-white border border-slate-200 shadow-xl overflow-hidden z-50" style={{ minWidth: 160 }}>
                {PERIOD_OPTS.map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => { setKpiPeriod(opt.key); setShowPeriodMenu(false); }}
                    className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-left transition-colors hover:bg-slate-50"
                    style={{ color: kpiPeriod === opt.key ? brand.orange[500] : brand.navy[800], fontWeight: kpiPeriod === opt.key ? 600 : 400 }}
                  >
                    {opt.label}
                    {kpiPeriod === opt.key && <CheckCircle2 size={14} style={{ color: brand.orange[500] }} />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── Nueva factura ── */}
          <button
            onClick={() => router.push('/invoicing')}
            className="px-4 py-2 text-sm font-bold text-white rounded-xl flex items-center gap-1.5 shadow-md transition-all hover:shadow-lg hover:-translate-y-0.5"
            style={{ backgroundColor: brand.orange[500] }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = brand.orange[600])}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = brand.orange[500])}
          >
            <Plus size={14} strokeWidth={2.5} />
            Nueva factura
          </button>
        </div>
      </div>

      {/* ── Facturas Pendientes de Autorización >24h ────────────────────── */}
      {pendingAuth && pendingAuth.overdueCount > 0 && (
        <div
          className="rounded-2xl border border-amber-300 overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, #FFFBEB 0%, #FEF9C3 100%)',
            boxShadow: '0 2px 12px rgba(217,119,6,0.14)',
          }}
        >
          <div className="flex items-center justify-between px-5 py-3.5"
            style={{ background: 'rgba(217,119,6,0.08)' }}>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: 'rgba(217,119,6,0.18)' }}>
                <Clock size={16} style={{ color: '#B45309' }} />
              </div>
              <div>
                <div className="text-sm font-bold" style={{ color: '#92400E' }}>
                  {pendingAuth.overdueCount === 1
                    ? '1 factura lleva más de 24h esperando autorización'
                    : `${pendingAuth.overdueCount} facturas llevan más de 24h esperando autorización`
                  }
                  {pendingAuth.totalPendingCount > pendingAuth.overdueCount && (
                    <span className="font-normal text-amber-700 ml-1">
                      ({pendingAuth.totalPendingCount} total pendientes)
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {pendingAuth.overdue.map((inv) => (
                    <span key={inv.id}
                      className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: inv.hoursWaiting > 72 ? '#DC2626' : '#D97706', color: 'white' }}
                    >
                      {inv.invoiceNumber} · {inv.hoursWaiting}h
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <Link
              href="/invoicing?status=PENDING_AUTHORIZATION"
              className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg shrink-0 transition-colors"
              style={{ color: '#92400E', border: '1px solid rgba(217,119,6,0.35)', background: 'rgba(217,119,6,0.08)' }}
            >
              Revisar <ExternalLink size={11} />
            </Link>
          </div>
        </div>
      )}

      {/* ── Alerta de Stock ─────────────────────────────────────────────── */}
      {stockAlerts && stockAlerts.totalAlerts > 0 && (
        <div className="rounded-2xl overflow-hidden border border-red-300"
          style={{ background: 'linear-gradient(135deg, #FEF2F2 0%, #FFF5F5 100%)', boxShadow: '0 2px 12px rgba(220,38,38,0.12)' }}>

          {/* Header — siempre visible */}
          <button
            onClick={() => setStockAlertsExpanded((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-3.5 text-left"
            style={{ background: 'rgba(220,38,38,0.08)' }}
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(220,38,38,0.15)' }}>
                <AlertTriangle size={16} style={{ color: '#DC2626' }} />
              </div>
              <div>
                <div className="text-sm font-bold" style={{ color: '#991B1B' }}>
                  Alerta de Inventario — {stockAlerts.totalAlerts} producto{stockAlerts.totalAlerts !== 1 ? 's' : ''} requieren atención
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  {stockAlerts.zeroStockCount > 0 && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: '#DC2626', color: 'white' }}>
                      {stockAlerts.zeroStockCount} SIN STOCK
                    </span>
                  )}
                  {stockAlerts.lowStockCount > 0 && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: '#D97706', color: 'white' }}>
                      {stockAlerts.lowStockCount} STOCK BAJO
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Link href="/inventory"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                style={{ color: '#DC2626', border: '1px solid rgba(220,38,38,0.3)', background: 'rgba(220,38,38,0.06)' }}>
                Ver inventario <ExternalLink size={11} />
              </Link>
              {stockAlertsExpanded
                ? <ChevronUp size={18} style={{ color: '#DC2626' }} />
                : <ChevronDown size={18} style={{ color: '#DC2626' }} />}
            </div>
          </button>

          {/* Lista expandida */}
          {stockAlertsExpanded && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(220,38,38,0.15)' }}>
                    {['SKU', 'Producto', 'Stock actual', 'Stock mínimo', 'Sucursales', 'Estado'].map((h, idx) => (
                      <th key={h} className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wide ${idx >= 2 ? 'text-center' : 'text-left'}`}
                        style={{ color: '#991B1B' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stockAlerts.items.map((item, i) => {
                    const isOut = item.level === 'OUT';
                    return (
                      <tr key={item.id}
                        style={{
                          borderBottom: i < stockAlerts.items.length - 1 ? '1px solid rgba(220,38,38,0.08)' : 'none',
                          backgroundColor: isOut ? 'rgba(220,38,38,0.04)' : 'transparent',
                        }}>
                        <td className="px-4 py-2.5 font-mono text-xs font-bold" style={{ color: '#991B1B' }}>
                          {item.sku}
                        </td>
                        <td className="px-4 py-2.5 text-xs font-medium" style={{ color: brand.navy[900] }}>
                          {item.name}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`text-sm font-bold ${isOut ? 'text-red-600' : 'text-amber-600'}`}>
                            {item.totalStock}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-center text-xs text-slate-400">
                          {item.minStock > 0 ? item.minStock : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-slate-500">
                          {item.warehouses ?? '—'}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                            style={isOut
                              ? { background: '#FEF2F2', color: '#DC2626' }
                              : { background: '#FFFBEB', color: '#D97706' }}>
                            {isOut ? 'Sin stock' : 'Stock bajo'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {/* Nota explicativa */}
              <div className="px-5 py-3 text-xs" style={{ color: '#991B1B', borderTop: '1px solid rgba(220,38,38,0.1)', background: 'rgba(220,38,38,0.04)' }}>
                Productos de catálogo sin historial de entradas no se muestran aquí. Solo productos que fueron recibidos en inventario.
              </div>
            </div>
          )}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4">
        <KPICard
          label={`Ventas ${currentPeriod.kpiLabel}`}
          value={formatCurrency(salesToday)}
          icon={DollarSign}
          color="purple"
        />
        <KPICard
          label="Unidades vendidas"
          value={String(kpis?.unitsSold ?? 0)}
          icon={Package}
          color="blue"
        />
        <KPICard
          label="Valor de inventario"
          value={formatCurrency(kpis?.inventoryValue ?? 0)}
          icon={Boxes}
          color="green"
        />
        <KPICard
          label="Margen bruto"
          value={`${grossMargin.toFixed(1)}%`}
          icon={TrendingUp}
          color="amber"
        />
      </div>

      {/* ── Ventas por sucursal ── */}
      {branchSales && branchSales.length > 0 && (
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${branchSales.length}, 1fr)` }}>
          {branchSales.map((branch) => {
            const pct = salesToday > 0 ? (branch.total / salesToday) * 100 : 0;
            return (
              <div key={branch.warehouseId} className="rounded-2xl p-4" style={glass}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: '#94A3B8' }}>
                      Sucursal
                    </div>
                    <div className="text-base font-bold" style={{ color: brand.navy[950] }}>
                      {branch.warehouseName}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-bold" style={{ color: brand.orange[500] }}>
                      {formatCurrency(branch.total)}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {branch.invoiceCount} {branch.invoiceCount === 1 ? 'factura' : 'facturas'} · {branch.unitsSold} u
                    </div>
                  </div>
                </div>
                {/* Barra de progreso relativa al total */}
                <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(pct, 100)}%`, background: `linear-gradient(90deg, ${brand.orange[500]}, ${brand.orange[400]})` }}
                  />
                </div>
                <div className="text-[10px] mt-1.5 font-medium" style={{ color: '#94A3B8' }}>
                  {pct.toFixed(0)}% del total · {currentPeriod.label}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Gráficas */}
      <div className="grid grid-cols-3 gap-4">

        {/* Área ventas */}
        <div className="col-span-2 rounded-2xl p-5" style={glass}>
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-sm font-semibold" style={{ color: brand.navy[950] }}>
                Ventas vs. meta — {currentPeriod.label}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {chartDays === 30 ? 'Últimos 30 días' : 'Últimos 7 días'} · Total: {formatCurrency(totalWeekSales)}
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: '#0284C7' }} />
                <span className="text-slate-600">Ventas</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm inline-block bg-slate-300" />
                <span className="text-slate-600">Meta</span>
              </span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -10 }}>
              <defs>
                <linearGradient id="colorVentas" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0284C7" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#0284C7" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
              <XAxis dataKey="day" stroke="#94A3B8" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="#94A3B8" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(255,255,255,0.9)',
                  border: '1px solid #E2E8F0',
                  borderRadius: '12px',
                  fontSize: '12px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
                  backdropFilter: 'blur(8px)',
                }}
              />
              <Area type="monotone" dataKey="meta" stroke="#CBD5E1" fill="none" strokeWidth={1.5} strokeDasharray="4 4" />
              <Area type="monotone" dataKey="ventas" stroke="#0284C7" fill="url(#colorVentas)" strokeWidth={2.5} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Alertas de seguridad */}
        <div className="rounded-2xl p-5" style={glass}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold" style={{ color: brand.navy[950] }}>
              Seguridad operativa
            </h3>
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: brand.orange[50] }}
            >
              <Shield size={14} style={{ color: brand.orange[500] }} />
            </div>
          </div>
          <div className="space-y-2.5">
            {adjustmentsWithoutPhoto > 0 && (
              <div className="flex gap-3 p-3 rounded-xl bg-rose-50/80">
                <div className="w-1 rounded-full bg-rose-500 shrink-0" />
                <div className="flex-1">
                  <p className="text-xs font-semibold text-rose-900">Ajustes sin foto</p>
                  <p className="text-[11px] text-rose-700 mt-0.5">{adjustmentsWithoutPhoto} movimiento(s) en las últimas 24h</p>
                </div>
              </div>
            )}
            <div
              className="flex gap-3 p-3 rounded-xl"
              style={{ backgroundColor: `${brand.orange[50]}CC` }}
            >
              <div className="w-1 rounded-full shrink-0" style={{ backgroundColor: brand.orange[500] }} />
              <div className="flex-1">
                <p className="text-xs font-semibold" style={{ color: brand.orange[600] }}>Inventario</p>
                <p className="text-[11px] mt-0.5" style={{ color: brand.orange[600] }}>
                  {kpis?.totalUnits ?? 0} unidades en stock
                </p>
              </div>
            </div>
            <div className="flex gap-3 p-3 rounded-xl bg-slate-50/80">
              <div className="w-1 rounded-full bg-slate-400 shrink-0" />
              <div className="flex-1">
                <p className="text-xs font-semibold text-slate-900">Facturas de hoy</p>
                <p className="text-[11px] text-slate-600 mt-0.5">{kpis?.invoiceCount ?? 0} emitidas</p>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-1.5 text-xs font-medium"
            style={{ color: adjustmentsWithoutPhoto > 0 ? '#DC2626' : '#059669' }}>
            {adjustmentsWithoutPhoto > 0 ? <AlertTriangle size={13} /> : <CheckCircle2 size={13} />}
            <span>{adjustmentsWithoutPhoto > 0 ? 'Requiere atención' : 'Sistema en línea'}</span>
          </div>
        </div>
      </div>

      {/* Fila inferior */}
      <div className="grid grid-cols-3 gap-4">

        {/* Inventario por categoría */}
        <div className="rounded-2xl p-5" style={glass}>
          <h3 className="text-sm font-semibold mb-1" style={{ color: brand.navy[950] }}>
            Inventario por categoría
          </h3>
          <p className="text-xs text-slate-500 mb-4">{totalCatUnits} unidades totales</p>
          {categoryChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={categoryChartData} layout="vertical" margin={{ top: 0, right: 10, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
                <XAxis type="number" stroke="#94A3B8" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" stroke="#475569" fontSize={11} tickLine={false} axisLine={false} width={90} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(255,255,255,0.92)',
                    border: '1px solid #E2E8F0',
                    borderRadius: '10px',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="value" fill="#4B91F7" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-48 text-slate-400 text-sm">Sin datos</div>
          )}
        </div>

        {/* Movimientos recientes */}
        <div className="col-span-2 rounded-2xl p-5" style={glass}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold" style={{ color: brand.navy[950] }}>
                Movimientos recientes
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">Auditoría en tiempo real</p>
            </div>
            <button className="text-xs font-semibold hover:underline" style={{ color: brand.orange[500] }}>
              Ver todo →
            </button>
          </div>
          {recentMovements.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-slate-400 text-sm">Sin movimientos recientes</div>
          ) : (
            <div className="space-y-1">
              {recentMovements.map((mov) => {
                const isEntry = mov.movementType === 'IN' || mov.movementType === 'RETURN';
                const isAlert = mov.movementType === 'ADJUSTMENT' || mov.movementType === 'DAMAGE';
                const hasPhoto = !!mov.photoUrl;
                return (
                  <div
                    key={mov.id}
                    className="flex items-center gap-3 p-2.5 rounded-xl transition-colors hover:bg-white/60"
                    style={isAlert && !hasPhoto ? { backgroundColor: 'rgba(254,242,242,0.7)' } : {}}
                  >
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                      style={{
                        backgroundColor: isEntry ? '#ECFDF5' : isAlert ? 'rgba(254,242,242,0.8)' : brand.orange[50],
                        color: isEntry ? '#059669' : isAlert ? '#DC2626' : brand.orange[500],
                      }}
                    >
                      {isEntry ? <ArrowDownRight size={14} /> : isAlert ? <AlertTriangle size={14} /> : <ArrowUpRight size={14} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold truncate" style={{ color: brand.navy[950] }}>
                          {mov.product.sku}
                        </span>
                        <span className="text-xs text-slate-400">·</span>
                        <span className="text-xs text-slate-600">{MOVEMENT_TYPE_LABEL[mov.movementType] ?? mov.movementType}</span>
                        <span className="text-xs font-bold" style={{ color: brand.navy[800] }}>
                          {mov.quantity > 0 ? '+' : ''}{mov.quantity}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] text-slate-500">{mov.user.name}</span>
                        {mov.referenceId && (
                          <>
                            <span className="text-[11px] text-slate-300">·</span>
                            <span className="text-[11px] text-slate-500 font-mono">{mov.referenceId}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {hasPhoto ? (
                        <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-semibold">
                          <Camera size={12} />Foto
                        </span>
                      ) : isAlert ? (
                        <span className="flex items-center gap-1 text-[11px] text-rose-600 font-semibold">
                          <AlertTriangle size={12} />Sin foto
                        </span>
                      ) : null}
                      <span className="text-[11px] text-slate-400 w-20 text-right">
                        {relativeTime(mov.createdAt)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
