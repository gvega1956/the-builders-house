'use client';

import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  Plus, ChevronDown, DollarSign, Package, TrendingUp,
  ArrowUpRight, ArrowDownRight, AlertTriangle, Camera,
  CheckCircle2, Shield, Boxes,
} from 'lucide-react';
import { brand } from '@/lib/brand';
import { formatCurrency } from '@/lib/utils';
import { trpc } from '@/lib/trpc';
import { glass } from '@/lib/ui';

const kpiBase = {
  background: 'linear-gradient(160deg, rgba(255,255,255,0.88) 0%, rgba(241,245,252,0.82) 100%)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: '1.5px solid rgba(255,255,255,0.95)',
  boxShadow: [
    '0 2px 0 rgba(255,255,255,1) inset',
    '0 12px 28px rgba(10,22,40,0.10)',
    '0 2px 6px rgba(10,22,40,0.06)',
    '4px 4px 12px rgba(10,22,40,0.06)',
  ].join(', '),
} as React.CSSProperties;

const kpiAccent = {
  background: 'linear-gradient(160deg, rgba(255,240,230,0.95) 0%, rgba(254,228,212,0.88) 100%)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: `1.5px solid rgba(236,99,38,0.35)`,
  boxShadow: [
    '0 2px 0 rgba(255,255,255,0.90) inset',
    `0 12px 28px rgba(236,99,38,0.16)`,
    `0 2px 6px rgba(236,99,38,0.10)`,
    '4px 4px 12px rgba(10,22,40,0.06)',
  ].join(', '),
} as React.CSSProperties;

const kpiColorStyles = {
  blue: {
    card: { ...kpiBase, background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.25)' } as React.CSSProperties,
    icon: { backgroundColor: 'rgba(59,130,246,0.12)' },
    iconColor: '#3B82F6',
  },
  green: {
    card: { ...kpiBase, background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.25)' } as React.CSSProperties,
    icon: { backgroundColor: 'rgba(16,185,129,0.12)' },
    iconColor: '#10B981',
  },
  amber: {
    card: { ...kpiBase, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)' } as React.CSSProperties,
    icon: { backgroundColor: 'rgba(245,158,11,0.12)' },
    iconColor: '#F59E0B',
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
  color?: 'blue' | 'green' | 'amber';
}) {
  const colorStyle = color ? kpiColorStyles[color] : null;
  const cardStyle = accent ? kpiAccent : colorStyle ? colorStyle.card : kpiBase;

  return (
    <div
      className="rounded-2xl p-5 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg cursor-default"
      style={cardStyle}
    >
      <div className="flex items-start justify-between mb-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={colorStyle ? colorStyle.icon : { backgroundColor: accent ? `rgba(236,99,38,0.12)` : `rgba(10,22,40,0.07)` }}
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
              trend === 'up' ? 'text-emerald-700 bg-emerald-50' : 'text-rose-600 bg-rose-50'
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

export function DashboardClient({ userName: fullName }: { userName: string }) {
  const { data: kpis } = trpc.dashboard.kpis.useQuery();
  const { data: salesByDay } = trpc.dashboard.salesByDay.useQuery({ days: 7 });
  const { data: catData } = trpc.dashboard.inventoryByCategory.useQuery();
  const { data: sysConfig } = trpc.settings.getSystemConfig.useQuery();

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
            {kpis?.invoiceCount ?? 0} facturas hoy · {' '}
            {adjustmentsWithoutPhoto > 0 ? (
              <span className="font-semibold text-rose-600">{adjustmentsWithoutPhoto} ajuste(s) sin foto</span>
            ) : (
              <span className="font-semibold text-emerald-600">Auditoría al día</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="px-3 py-2 text-sm font-medium rounded-xl transition-all hover:shadow-md"
            style={{ ...glass, color: brand.navy[800] }}
          >
            Esta semana <ChevronDown size={13} className="inline ml-1" />
          </button>
          <button
            className="px-4 py-2 text-sm font-bold text-white rounded-xl flex items-center gap-1.5 shadow-md transition-all hover:shadow-lg hover:-translate-y-0.5"
            style={{ backgroundColor: brand.orange[500] }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = brand.orange[600])}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = brand.orange[500])}
          >
            <Plus size={14} strokeWidth={2.5} />
            Nueva venta
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4">
        <KPICard
          label="Ventas del día"
          value={formatCurrency(salesToday)}
          icon={DollarSign}
          accent
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

      {/* Gráficas */}
      <div className="grid grid-cols-3 gap-4">

        {/* Área ventas */}
        <div className="col-span-2 rounded-2xl p-5" style={glass}>
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-sm font-semibold" style={{ color: brand.navy[950] }}>
                Ventas vs. meta semanal
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Últimos 7 días · Total: {formatCurrency(totalWeekSales)}
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: brand.orange[500] }} />
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
                  <stop offset="0%" stopColor={brand.orange[500]} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={brand.orange[500]} stopOpacity={0} />
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
              <Area type="monotone" dataKey="ventas" stroke={brand.orange[500]} fill="url(#colorVentas)" strokeWidth={2.5} />
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
                <Bar dataKey="value" fill={brand.navy[800]} radius={[0, 6, 6, 0]} />
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
