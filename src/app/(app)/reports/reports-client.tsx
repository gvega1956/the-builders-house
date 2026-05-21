'use client';

import { trpc } from '@/lib/trpc';
import { brand } from '@/lib/brand';
import { formatCurrency } from '@/lib/utils';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { TrendingUp, Package, DollarSign, Users, Truck, BarChart3 } from 'lucide-react';

const glass = {
  backgroundColor: 'rgba(255,255,255,0.72)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: '1px solid rgba(255,255,255,0.85)',
  boxShadow: '0 4px 24px rgba(10,22,40,0.07)',
} as React.CSSProperties;

const PIE_COLORS = [brand.orange[500], brand.navy[700], brand.orange[400], brand.navy[600], '#059669'];

export function ReportsClient() {
  const { data: kpis } = trpc.dashboard.kpis.useQuery();
  const { data: salesData } = trpc.dashboard.salesByDay.useQuery({ days: 30 });
  const { data: catData } = trpc.dashboard.inventoryByCategory.useQuery();

  const { data: invoices } = trpc.invoicing.list.useQuery({ pageSize: 100 });
  const { data: customers } = trpc.customers.list.useQuery({ pageSize: 200 });
  const { data: products } = trpc.products.list.useQuery({ pageSize: 500 });

  const totalRevenue = invoices?.invoices
    .filter((i) => i.status !== 'VOIDED')
    .reduce((s, i) => s + Number(i.total), 0) ?? 0;

  const totalPaid = invoices?.invoices
    .filter((i) => i.status !== 'VOIDED')
    .reduce((s, i) => s + Number(i.paidAmount), 0) ?? 0;

  const pendingBalance = totalRevenue - totalPaid;

  const lowStockProducts = products?.products.filter((p) => p.totalStock <= p.minStock) ?? [];

  const paymentMethodData = invoices?.invoices
    .flatMap((inv) => []) // placeholder — real data would come from payments
    ?? [];

  const kpiCards = [
    {
      icon: DollarSign,
      label: 'Ventas Totales',
      value: formatCurrency(totalRevenue),
      sub: `${invoices?.total ?? 0} facturas emitidas`,
      color: brand.orange[500],
    },
    {
      icon: TrendingUp,
      label: 'Balance Pendiente',
      value: formatCurrency(pendingBalance),
      sub: `${invoices?.invoices.filter((i) => i.status === 'PARTIAL' || i.status === 'ISSUED').length ?? 0} facturas abiertas`,
      color: pendingBalance > 0 ? '#DC2626' : '#059669',
    },
    {
      icon: Users,
      label: 'Clientes Activos',
      value: String(customers?.total ?? 0),
      sub: `${customers?.customers.filter((c) => c.type === 'WHOLESALE').length ?? 0} mayoristas`,
      color: brand.navy[700],
    },
    {
      icon: Package,
      label: 'Valor Inventario',
      value: formatCurrency(kpis?.inventoryValue ?? 0),
      sub: `${kpis?.totalUnits ?? 0} unidades en stock`,
      color: '#059669',
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: brand.navy[950] }}>Reportes</h1>
        <p className="text-sm mt-0.5" style={{ color: '#64748B' }}>Inteligencia de negocio · The Builder's House</p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-4 gap-4">
        {kpiCards.map((k) => (
          <div key={k.label} style={glass} className="rounded-2xl p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: `${k.color}18` }}>
                <k.icon size={18} style={{ color: k.color }} />
              </div>
            </div>
            <div className="text-xl font-bold" style={{ color: brand.navy[950] }}>{k.value}</div>
            <div className="text-xs font-semibold mt-0.5" style={{ color: '#64748B' }}>{k.label}</div>
            <div className="text-xs text-slate-400 mt-1">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-2 gap-4">
        {/* Sales by Day */}
        <div style={glass} className="rounded-2xl p-5">
          <h3 className="text-sm font-bold mb-4" style={{ color: brand.navy[950] }}>
            Ventas Últimos 30 Días
          </h3>
          {salesData && salesData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={salesData}>
                <defs>
                  <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={brand.orange[500]} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={brand.orange[500]} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(10,22,40,0.06)" />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#94A3B8' }} />
                <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => [formatCurrency(Number(v)), 'Ventas']} />
                <Area type="monotone" dataKey="total" stroke={brand.orange[500]} fill="url(#salesGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart label="No hay datos de ventas aún" />
          )}
        </div>

        {/* Inventory by Category */}
        <div style={glass} className="rounded-2xl p-5">
          <h3 className="text-sm font-bold mb-4" style={{ color: brand.navy[950] }}>
            Inventario por Categoría
          </h3>
          {catData && catData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={catData} dataKey="units" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                  {catData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => [Number(v), 'Unidades']} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart label="No hay datos de inventario" />
          )}
        </div>
      </div>

      {/* Stock Alerts + Invoice Status */}
      <div className="grid grid-cols-2 gap-4">
        {/* Low Stock */}
        <div style={glass} className="rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold" style={{ color: brand.navy[950] }}>Productos Stock Bajo</h3>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: '#FEF2F2', color: '#DC2626' }}>
              {lowStockProducts.length}
            </span>
          </div>
          {lowStockProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-slate-400 text-sm gap-2">
              <Package size={32} style={{ color: '#CBD5E1' }} />
              <span>Stock en niveles óptimos</span>
            </div>
          ) : (
            <div className="space-y-2">
              {lowStockProducts.slice(0, 8).map((p) => (
                <div key={p.id} className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid rgba(10,22,40,0.05)' }}>
                  <div>
                    <div className="text-sm font-medium" style={{ color: brand.navy[900] }}>{p.name}</div>
                    <div className="text-xs font-mono text-slate-400">{p.sku}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-sm" style={{ color: p.totalStock === 0 ? '#DC2626' : '#D97706' }}>
                      {p.totalStock} uds
                    </div>
                    <div className="text-xs text-slate-400">mín: {p.minStock}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Invoice Summary */}
        <div style={glass} className="rounded-2xl p-5">
          <h3 className="text-sm font-bold mb-4" style={{ color: brand.navy[950] }}>Resumen de Facturación</h3>
          {['ISSUED', 'PARTIAL', 'PAID', 'VOIDED'].map((status) => {
            const count = invoices?.invoices.filter((i) => i.status === status).length ?? 0;
            const amount = invoices?.invoices
              .filter((i) => i.status === status)
              .reduce((s, i) => s + Number(i.total), 0) ?? 0;
            const labels: Record<string, { label: string; color: string }> = {
              ISSUED: { label: 'Emitidas', color: '#1D4ED8' },
              PARTIAL: { label: 'Pago Parcial', color: '#D97706' },
              PAID: { label: 'Pagadas', color: '#16A34A' },
              VOIDED: { label: 'Anuladas', color: '#DC2626' },
            };
            const meta = labels[status]!;
            return (
              <div key={status} className="flex items-center justify-between py-3" style={{ borderBottom: '1px solid rgba(10,22,40,0.05)' }}>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: meta.color }} />
                  <span className="text-sm" style={{ color: brand.navy[800] }}>{meta.label}</span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-semibold" style={{ color: brand.navy[950] }}>{formatCurrency(amount)}</span>
                  <span className="text-xs text-slate-400 ml-2">({count})</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Top Customers */}
      <div style={glass} className="rounded-2xl p-5">
        <h3 className="text-sm font-bold mb-4" style={{ color: brand.navy[950] }}>Clientes por Volumen de Compras</h3>
        {customers && customers.customers.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={customers.customers.slice(0, 10).map((c) => ({ name: c.name.split(' ')[0], facturas: c._count.invoices }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(10,22,40,0.06)" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94A3B8' }} />
              <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} />
              <Tooltip />
              <Bar dataKey="facturas" fill={brand.navy[700]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChart label="No hay clientes registrados" />
        )}
      </div>
    </div>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-48 text-slate-400 text-sm gap-2">
      <BarChart3 size={32} style={{ color: '#CBD5E1' }} />
      <span>{label}</span>
    </div>
  );
}

