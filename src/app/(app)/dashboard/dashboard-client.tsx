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

// Datos estáticos mientras conectamos la BD
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
      className="bg-white rounded-xl p-5 transition-all hover:shadow-md"
      style={{
        border: accent ? `2px solid ${brand.orange[500]}` : '1px solid #E2E8F0',
      }}
    >
      <div className="flex items-start justify-between mb-3">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: accent ? brand.orange[50] : '#F1F5F9' }}
        >
          <Icon
            size={17}
            strokeWidth={2}
            style={{ color: accent ? brand.orange[500] : '#475569' }}
          />
        </div>
        {change && (
          <span
            className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md ${
              trend === 'up' ? 'text-emerald-700 bg-emerald-50' : 'text-rose-700 bg-rose-50'
            }`}
          >
            {trend === 'up' ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {change}
          </span>
        )}
      </div>
      <div
        className="text-2xl font-semibold tracking-tight mb-1"
        style={{ color: brand.navy[950] }}
      >
        {prefix}{value}
      </div>
      <div className="text-xs text-slate-500 font-medium">{label}</div>
    </div>
  );
}

export function DashboardClient() {
  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex items-end justify-between">
        <div>
          <div
            className="text-[11px] font-semibold tracking-[0.2em] uppercase mb-2"
            style={{ color: brand.orange[500] }}
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
          <button className="px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">
            Esta semana <ChevronDown size={13} className="inline ml-1" />
          </button>
          <button
            className="px-4 py-2 text-sm font-semibold text-white rounded-lg flex items-center gap-1.5 shadow-sm"
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
        <KPICard label="Ventas del día" value="8,420" prefix="$" change="+12.4%" trend="up" icon={DollarSign} accent />
        <KPICard label="Unidades vendidas" value="34" change="+8.1%" trend="up" icon={Package} />
        <KPICard label="Valor de inventario" value={formatCurrency(142580)} change="-2.3%" trend="down" icon={Boxes} />
        <KPICard label="Margen bruto" value="42.8%" change="+1.2%" trend="up" icon={TrendingUp} />
      </div>

      {/* Gráficas */}
      <div className="grid grid-cols-3 gap-4">
        {/* Área de ventas */}
        <div className="col-span-2 bg-white rounded-xl border border-slate-200 p-5">
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
                  <stop offset="0%" stopColor={brand.orange[500]} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={brand.orange[500]} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              <XAxis dataKey="day" stroke="#94A3B8" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="#94A3B8" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #E2E8F0',
                  borderRadius: '8px',
                  fontSize: '12px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                }}
              />
              <Area type="monotone" dataKey="meta" stroke="#CBD5E1" fill="none" strokeWidth={1.5} strokeDasharray="4 4" />
              <Area type="monotone" dataKey="ventas" stroke={brand.orange[500]} fill="url(#colorVentas)" strokeWidth={2.5} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Alertas de seguridad */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold" style={{ color: brand.navy[950] }}>
              Seguridad operativa
            </h3>
            <Shield size={15} style={{ color: brand.orange[500] }} />
          </div>
          <div className="space-y-3">
            <div className="flex gap-3 p-3 rounded-lg bg-rose-50">
              <div className="w-1 rounded-full bg-rose-500" />
              <div className="flex-1">
                <p className="text-xs font-semibold text-rose-900">Ajuste sin foto</p>
                <p className="text-[11px] text-rose-700 mt-0.5">VEN-CR-4824-BR · Ana T.</p>
                <p className="text-[10px] text-rose-500 mt-1">Hace 3h</p>
              </div>
            </div>
            <div className="flex gap-3 p-3 rounded-lg" style={{ backgroundColor: brand.orange[50] }}>
              <div className="w-1 rounded-full" style={{ backgroundColor: brand.orange[500] }} />
              <div className="flex-1">
                <p className="text-xs font-semibold" style={{ color: brand.orange[600] }}>Stock crítico</p>
                <p className="text-[11px] mt-0.5" style={{ color: brand.orange[600] }}>2 SKUs bajo el mínimo</p>
                <p className="text-[10px] mt-1" style={{ color: brand.orange[500] }}>Hace 4h</p>
              </div>
            </div>
            <div className="flex gap-3 p-3 rounded-lg bg-slate-50">
              <div className="w-1 rounded-full bg-slate-400" />
              <div className="flex-1">
                <p className="text-xs font-semibold text-slate-900">Conteo cíclico</p>
                <p className="text-[11px] text-slate-600 mt-0.5">5 SKUs asignados hoy</p>
                <p className="text-[10px] text-slate-400 mt-1">Hoy 8:00 AM</p>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-1.5 text-xs text-emerald-600">
            <CheckCircle2 size={13} />
            <span>Sistema en línea</span>
          </div>
        </div>
      </div>

      {/* Fila inferior */}
      <div className="grid grid-cols-3 gap-4">
        {/* Inventario por categoría */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold mb-1" style={{ color: brand.navy[950] }}>
            Inventario por categoría
          </h3>
          <p className="text-xs text-slate-500 mb-4">383 unidades totales</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={categoryData} layout="vertical" margin={{ top: 0, right: 10, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
              <XAxis type="number" stroke="#94A3B8" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="name" stroke="#475569" fontSize={11} tickLine={false} axisLine={false} width={90} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #E2E8F0',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
              />
              <Bar dataKey="value" fill={brand.navy[950]} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Movimientos recientes */}
        <div className="col-span-2 bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold" style={{ color: brand.navy[950] }}>
                Movimientos recientes
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">Auditoría en tiempo real</p>
            </div>
            <button className="text-xs font-medium hover:underline" style={{ color: brand.orange[500] }}>
              Ver todo →
            </button>
          </div>
          <div className="space-y-1">
            {movements.map((mov, i) => (
              <div
                key={i}
                className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-slate-50"
                style={mov.alerta ? { backgroundColor: '#FEF2F2' } : {}}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{
                    backgroundColor:
                      mov.tipo === 'entrada' ? '#ECFDF5' :
                      mov.tipo === 'salida' ? brand.orange[50] : '#FEF2F2',
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
                    <span className="text-xs font-mono font-semibold" style={{ color: brand.navy[950] }}>
                      {mov.sku}
                    </span>
                    <span className="text-xs text-slate-400">·</span>
                    <span className="text-xs text-slate-600 capitalize">{mov.tipo}</span>
                    <span className="text-xs font-bold" style={{ color: brand.navy[950] }}>
                      {mov.cantidad > 0 ? '+' : ''}{mov.cantidad}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-slate-500">{mov.usuario}</span>
                    <span className="text-[11px] text-slate-300">·</span>
                    <span className="text-[11px] text-slate-500 font-mono">{mov.orden}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {mov.foto ? (
                    <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
                      <Camera size={12} />Foto
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[11px] text-rose-600 font-medium">
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
