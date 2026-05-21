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

const salesData = [
  { day: 'Lun', ventas: 4200, meta: 5000 },
  { day: 'Mar', ventas: 5800, meta: 5000 },
  { day: 'Mié', ventas: 4900, meta: 5000 },
  { day: 'Jue', ventas: 7200, meta: 5000 },
  { day: 'Vie', ventas: 8400, meta: 5000 },
  { day: 'Sáb', ventas: 9100, meta: 5000 },
  { day: 'Dom', ventas: 3200, meta: 5000 },
];

const categoryData = [
  { name: 'Corredizas', value: 142 },
  { name: 'Batientes', value: 89 },
  { name: 'Proyectantes', value: 67 },
  { name: 'Fijas', value: 54 },
  { name: 'Puertas', value: 31 },
];

const movements = [
  { tipo: 'salida', sku: 'VEN-CR-3624-AL', cantidad: 3, usuario: 'Carlos M.', tiempo: 'Hace 12 min', orden: 'FAC-2284', foto: true },
  { tipo: 'entrada', sku: 'VEN-BT-4836-BL', cantidad: 24, usuario: 'María R.', tiempo: 'Hace 1h', orden: 'OC-RD-091', foto: true },
  { tipo: 'salida', sku: 'PUE-RD-8030-CB', cantidad: 1, usuario: 'José L.', tiempo: 'Hace 2h', orden: 'FAC-2283', foto: true },
  { tipo: 'ajuste', sku: 'VEN-CR-4824-BR', cantidad: -1, usuario: 'Ana T.', tiempo: 'Hace 3h', orden: 'AJ-0042', foto: false, alerta: true },
];

// Estilo glass para charts y tablas
const glass = {
  backgroundColor: 'rgba(255,255,255,0.72)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: '1px solid rgba(255,255,255,0.85)',
  boxShadow: '0 4px 24px rgba(10,22,40,0.07)',
} as React.CSSProperties;

// KPI cards — tintadas, borde con relieve, proporcionadas
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

function KPICard({
  label, value, change, trend, icon: Icon, prefix = '', accent = false,
}: {
  label: string;
  value: string;
  change?: string;
  trend?: 'up' | 'down';
  icon: React.ElementType;
  prefix?: string;
  accent?: boolean;
}) {
  return (
    <div
      className="rounded-2xl p-5 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg cursor-default"
      style={accent ? kpiAccent : kpiBase}
    >
      <div className="flex items-start justify-between mb-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{
            backgroundColor: accent ? `rgba(236,99,38,0.12)` : `rgba(10,22,40,0.07)`,
          }}
        >
          <Icon
            size={17}
            strokeWidth={2}
            style={{ color: accent ? brand.orange[500] : brand.navy[700] }}
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

export function DashboardClient() {
  return (
    <div className="space-y-6">

      {/* ── Encabezado ── */}
      <div className="flex items-end justify-between">
        <div>
          <div
            className="text-[11px] font-bold tracking-[0.25em] uppercase mb-2 px-3 py-1 rounded-full inline-block"
            style={{
              color: brand.orange[600],
              backgroundColor: 'rgba(236,99,38,0.10)',
            }}
          >
            Martes · 20 Mayo 2026
          </div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: brand.navy[950] }}>
            Buenos días, Roberto
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Tu operación está al día.{' '}
            <span className="font-semibold text-slate-700">3 alertas</span> requieren tu atención.
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

      {/* ── KPIs ── */}
      <div className="grid grid-cols-4 gap-4">
        <KPICard label="Ventas del día" value="8,420" prefix="$" change="+12.4%" trend="up" icon={DollarSign} accent />
        <KPICard label="Unidades vendidas" value="34" change="+8.1%" trend="up" icon={Package} />
        <KPICard label="Valor de inventario" value={formatCurrency(142580)} change="-2.3%" trend="down" icon={Boxes} />
        <KPICard label="Margen bruto" value="42.8%" change="+1.2%" trend="up" icon={TrendingUp} />
      </div>

      {/* ── Gráficas ── */}
      <div className="grid grid-cols-3 gap-4">

        {/* Área ventas */}
        <div className="col-span-2 rounded-2xl p-5" style={glass}>
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-sm font-semibold" style={{ color: brand.navy[950] }}>
                Ventas vs. meta semanal
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">Últimos 7 días · Total: $42,800</p>
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
            <AreaChart data={salesData} margin={{ top: 5, right: 5, bottom: 5, left: -10 }}>
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
            <div className="flex gap-3 p-3 rounded-xl bg-rose-50/80">
              <div className="w-1 rounded-full bg-rose-500 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-xs font-semibold text-rose-900">Ajuste sin foto</p>
                <p className="text-[11px] text-rose-700 mt-0.5">VEN-CR-4824-BR · Ana T.</p>
                <p className="text-[10px] text-rose-400 mt-1">Hace 3h</p>
              </div>
            </div>
            <div
              className="flex gap-3 p-3 rounded-xl"
              style={{ backgroundColor: `${brand.orange[50]}CC` }}
            >
              <div className="w-1 rounded-full flex-shrink-0" style={{ backgroundColor: brand.orange[500] }} />
              <div className="flex-1">
                <p className="text-xs font-semibold" style={{ color: brand.orange[600] }}>Stock crítico</p>
                <p className="text-[11px] mt-0.5" style={{ color: brand.orange[600] }}>2 SKUs bajo el mínimo</p>
                <p className="text-[10px] mt-1" style={{ color: brand.orange[400] }}>Hace 4h</p>
              </div>
            </div>
            <div className="flex gap-3 p-3 rounded-xl bg-slate-50/80">
              <div className="w-1 rounded-full bg-slate-400 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-xs font-semibold text-slate-900">Conteo cíclico</p>
                <p className="text-[11px] text-slate-600 mt-0.5">5 SKUs asignados hoy</p>
                <p className="text-[10px] text-slate-400 mt-1">Hoy 8:00 AM</p>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
            <CheckCircle2 size={13} />
            <span>Sistema en línea</span>
          </div>
        </div>
      </div>

      {/* ── Fila inferior ── */}
      <div className="grid grid-cols-3 gap-4">

        {/* Inventario por categoría */}
        <div className="rounded-2xl p-5" style={glass}>
          <h3 className="text-sm font-semibold mb-1" style={{ color: brand.navy[950] }}>
            Inventario por categoría
          </h3>
          <p className="text-xs text-slate-500 mb-4">383 unidades totales</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={categoryData} layout="vertical" margin={{ top: 0, right: 10, bottom: 0, left: 0 }}>
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
          <div className="space-y-1">
            {movements.map((mov, i) => (
              <div
                key={i}
                className="flex items-center gap-3 p-2.5 rounded-xl transition-colors hover:bg-white/60"
                style={mov.alerta ? { backgroundColor: 'rgba(254,242,242,0.7)' } : {}}
              >
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{
                    backgroundColor:
                      mov.tipo === 'entrada' ? '#ECFDF5' :
                      mov.tipo === 'salida' ? brand.orange[50] : 'rgba(254,242,242,0.8)',
                    color:
                      mov.tipo === 'entrada' ? '#059669' :
                      mov.tipo === 'salida' ? brand.orange[500] : '#DC2626',
                  }}
                >
                  {mov.tipo === 'entrada' ? <ArrowDownRight size={14} /> :
                   mov.tipo === 'salida' ? <ArrowUpRight size={14} /> :
                   <AlertTriangle size={14} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold" style={{ color: brand.navy[950] }}>
                      {mov.sku}
                    </span>
                    <span className="text-xs text-slate-400">·</span>
                    <span className="text-xs text-slate-600 capitalize">{mov.tipo}</span>
                    <span className="text-xs font-bold" style={{ color: brand.navy[800] }}>
                      {mov.cantidad > 0 ? '+' : ''}{mov.cantidad}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-slate-500">{mov.usuario}</span>
                    <span className="text-[11px] text-slate-300">·</span>
                    <span className="text-[11px] text-slate-500 font-mono">{mov.orden}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {mov.foto ? (
                    <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-semibold">
                      <Camera size={12} />Foto
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[11px] text-rose-600 font-semibold">
                      <AlertTriangle size={12} />Sin foto
                    </span>
                  )}
                  <span className="text-[11px] text-slate-400 w-20 text-right">{mov.tiempo}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
