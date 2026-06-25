'use client';

import { useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { brand } from '@/lib/brand';
import { formatCurrency, formatDate } from '@/lib/utils';
import { glass } from '@/lib/ui';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { TrendingUp, Package, DollarSign, Users, BarChart3, Layers, Download, ChevronLeft, ChevronRight, Building2 } from 'lucide-react';

const PIE_COLORS = [brand.orange[500], brand.navy[700], brand.orange[400], brand.navy[600], '#059669'];

const MOV_LABELS: Record<string, string> = {
  IN: 'Entrada', OUT: 'Salida', TRANSFER: 'Transferencia',
  ADJUSTMENT: 'Ajuste', RETURN: 'Devolución', DAMAGE: 'Daño',
};
const MOV_COLORS: Record<string, { bg: string; text: string }> = {
  IN: { bg: '#F0FDF4', text: '#16A34A' }, OUT: { bg: '#FEF2F2', text: '#DC2626' },
  TRANSFER: { bg: '#EFF6FF', text: '#1D4ED8' }, ADJUSTMENT: { bg: '#FEF9C3', text: '#854D0E' },
  RETURN: { bg: '#F0FDF4', text: '#15803D' }, DAMAGE: { bg: '#FFF7ED', text: '#C2410C' },
};

export function ReportsClient() {
  const [activeTab, setActiveTab] = useState<'summary' | 'movements'>('summary');
  const [movPage, setMovPage] = useState(1);
  const [movType, setMovType] = useState('');
  const [branchPeriod, setBranchPeriod] = useState<'today' | 'week' | 'month'>('week');

  const { branchFrom, branchTo, branchLabel } = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    if (branchPeriod === 'today') {
      return { branchFrom: todayStart, branchTo: now, branchLabel: 'Hoy' };
    }
    if (branchPeriod === 'week') {
      const weekStart = new Date(todayStart);
      weekStart.setDate(weekStart.getDate() - 6);
      return { branchFrom: weekStart, branchTo: now, branchLabel: 'Últimos 7 días' };
    }
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    return { branchFrom: monthStart, branchTo: now, branchLabel: 'Este mes' };
  }, [branchPeriod]);

  const { data: branchSales } = trpc.dashboard.salesByWarehouse.useQuery({ from: branchFrom, to: branchTo });

  const { data: kpis } = trpc.dashboard.kpis.useQuery();
  const { data: salesData } = trpc.dashboard.salesByDay.useQuery({ days: 30 });
  const { data: catData } = trpc.dashboard.inventoryByCategory.useQuery();

  const { data: summary } = trpc.dashboard.reportSummary.useQuery();
  const { data: lowStockData } = trpc.products.lowStock.useQuery();
  const { data: customers } = trpc.customers.list.useQuery({ pageSize: 200 });
  const { data: lama3 } = trpc.stock.getTotalByLama.useQuery({ lama: '3' });
  const { data: lama4 } = trpc.stock.getTotalByLama.useQuery({ lama: '4' });
  const { data: movData } = trpc.movements.list.useQuery({
    movementType: movType as 'IN' | 'OUT' | 'TRANSFER' | 'ADJUSTMENT' | 'RETURN' | 'DAMAGE' | undefined || undefined,
    page: movPage,
    pageSize: 30,
  });

  function downloadCSV() {
    const movements = movData?.movements ?? [];
    const header = ['Fecha', 'Tipo', 'Producto', 'SKU', 'Cantidad', 'Almacén', 'Ubicación', 'Referencia', 'Usuario'];
    const rows = movements.map((m) => [
      new Date(m.createdAt).toLocaleDateString('es-PR'),
      MOV_LABELS[m.movementType] ?? m.movementType,
      m.product.name,
      m.product.sku,
      m.quantity,
      m.location.warehouse.name,
      m.location.locationCode,
      m.referenceId ?? '',
      m.user.name ?? m.user.email,
    ]);
    const csv = [header, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `movimientos-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const totalRevenue = summary?.totalRevenue ?? 0;
  const pendingBalance = summary?.pendingBalance ?? 0;
  const lowStockProducts = lowStockData ?? [];


  const kpiCards = [
    {
      icon: DollarSign,
      label: 'Ventas Totales',
      value: formatCurrency(totalRevenue),
      sub: `${summary?.invoicesByStatus.reduce((s, g) => s + g.count, 0) ?? 0} facturas emitidas`,
      color: brand.orange[500],
    },
    {
      icon: TrendingUp,
      label: 'Balance Pendiente',
      value: formatCurrency(pendingBalance),
      sub: `${summary?.invoicesByStatus.filter((g) => g.status === 'PARTIAL' || g.status === 'ISSUED').reduce((s, g) => s + g.count, 0) ?? 0} facturas abiertas`,
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

  const movTotalPages = Math.ceil((movData?.total ?? 0) / 30);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: brand.navy[950] }}>Reportes</h1>
        <p className="text-sm mt-0.5" style={{ color: '#64748B' }}>Inteligencia de negocio · The Builder's House</p>
      </div>

      {/* Tabs */}
      <div style={glass} className="rounded-2xl p-1.5 flex gap-1">
        {([{ id: 'summary', label: 'Resumen & KPIs' }, { id: 'movements', label: 'Ledger de Movimientos' }] as const).map((t) => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className="flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-all"
            style={activeTab === t.id ? { backgroundColor: brand.orange[500], color: '#FFFFFF' } : { color: '#64748B' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB: Ledger de Movimientos ── */}
      {activeTab === 'movements' && (
        <div style={glass} className="rounded-2xl overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: '1px solid rgba(10,22,40,0.08)' }}>
            <span className="font-semibold text-sm flex-1" style={{ color: brand.navy[950] }}>
              Ledger de Movimientos · {movData?.total ?? 0} registros
            </span>
            <select value={movType} onChange={(e) => { setMovType(e.target.value); setMovPage(1); }}
              className="text-xs px-3 py-1.5 rounded-lg border bg-white/60 outline-none" style={{ color: brand.navy[800] }}>
              <option value="">Todos los tipos</option>
              {Object.entries(MOV_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <button onClick={downloadCSV} disabled={!movData?.movements.length}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border hover:bg-slate-50 disabled:opacity-40 transition-all"
              style={{ color: brand.navy[800] }}>
              <Download size={13} /> Exportar CSV
            </button>
          </div>

          {(movData?.movements ?? []).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Layers size={36} style={{ color: '#CBD5E1' }} />
              <p className="text-sm text-slate-400">No hay movimientos con los filtros seleccionados</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(10,22,40,0.08)' }}>
                      {['Fecha', 'Tipo', 'Producto', 'SKU', 'Cant.', 'Almacén', 'Ubicación', 'Referencia', 'Usuario'].map((h) => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: '#94A3B8' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {movData?.movements.map((m, i) => {
                      const col = MOV_COLORS[m.movementType] ?? { bg: '#F1F5F9', text: '#475569' };
                      return (
                        <tr key={m.id} style={{
                          borderBottom: i < (movData?.movements.length ?? 0) - 1 ? '1px solid rgba(10,22,40,0.05)' : 'none',
                          backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(10,22,40,0.015)',
                        }}>
                          <td className="px-4 py-2.5 text-xs text-slate-400 whitespace-nowrap">{formatDate(m.createdAt)}</td>
                          <td className="px-4 py-2.5">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ backgroundColor: col.bg, color: col.text }}>
                              {MOV_LABELS[m.movementType] ?? m.movementType}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-xs font-medium" style={{ color: brand.navy[950] }}>{m.product.name}</td>
                          <td className="px-4 py-2.5 font-mono text-[10px]" style={{ color: '#94A3B8' }}>{m.product.sku}</td>
                          <td className="px-4 py-2.5 text-center">
                            <span className="px-2 py-0.5 rounded-full text-xs font-bold"
                              style={m.quantity >= 0 ? { backgroundColor: '#F0FDF4', color: '#16A34A' } : { backgroundColor: '#FEF2F2', color: '#DC2626' }}>
                              {m.quantity >= 0 ? '+' : ''}{m.quantity}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-xs" style={{ color: brand.navy[800] }}>{m.location.warehouse.name}</td>
                          <td className="px-4 py-2.5 text-xs text-slate-500">{m.location.locationCode}</td>
                          <td className="px-4 py-2.5"><span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: '#F1F5F9', color: '#475569' }}>{m.referenceId ?? '—'}</span></td>
                          <td className="px-4 py-2.5 text-xs text-slate-500">{m.user.name ?? m.user.email}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {movTotalPages > 1 && (
                <div className="flex items-center justify-between px-5 py-3" style={{ borderTop: '1px solid rgba(10,22,40,0.06)' }}>
                  <span className="text-xs text-slate-400">Página {movPage} de {movTotalPages} · {movData?.total} registros</span>
                  <div className="flex gap-2">
                    <button onClick={() => setMovPage((p) => Math.max(1, p - 1))} disabled={movPage === 1} className="p-1.5 rounded-lg border disabled:opacity-40"><ChevronLeft size={14} /></button>
                    <button onClick={() => setMovPage((p) => Math.min(movTotalPages, p + 1))} disabled={movPage >= movTotalPages} className="p-1.5 rounded-lg border disabled:opacity-40"><ChevronRight size={14} /></button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── TAB: Resumen (existing content) ── */}
      {activeTab === 'summary' && <>

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

      {/* Ventas por Sucursal */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Building2 size={16} style={{ color: brand.navy[700] }} />
            <h2 className="text-sm font-bold uppercase tracking-wide" style={{ color: brand.navy[800] }}>
              Ventas por Sucursal
            </h2>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: '#F1F5F9', color: '#64748B' }}>
              {branchLabel}
            </span>
          </div>
          <div className="flex gap-1">
            {(['today', 'week', 'month'] as const).map((p) => {
              const pLabels: Record<string, string> = { today: 'Hoy', week: 'Semana', month: 'Mes' };
              return (
                <button key={p} onClick={() => setBranchPeriod(p)}
                  className="px-3 py-1 rounded-lg text-xs font-medium transition-all"
                  style={branchPeriod === p
                    ? { backgroundColor: brand.navy[950], color: '#FFFFFF' }
                    : { backgroundColor: '#F1F5F9', color: '#64748B' }}>
                  {pLabels[p]}
                </button>
              );
            })}
          </div>
        </div>
        {branchSales && branchSales.length > 0 ? (() => {
          const grandTotal = branchSales.reduce((s, b) => s + b.total, 0);
          const cols = branchSales.length <= 2 ? 'grid-cols-2' : branchSales.length === 3 ? 'grid-cols-3' : 'grid-cols-4';
          return (
            <div className={`grid ${cols} gap-4`}>
              {branchSales.map((branch) => {
                const pct = grandTotal > 0 ? (branch.total / grandTotal) * 100 : 0;
                return (
                  <div key={branch.warehouseId} style={glass} className="rounded-2xl p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                        style={{ backgroundColor: `${brand.orange[500]}18` }}>
                        <Building2 size={18} style={{ color: brand.orange[500] }} />
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                        style={{ backgroundColor: '#F0FDF4', color: '#16A34A' }}>
                        {pct.toFixed(1)}%
                      </span>
                    </div>
                    <div className="text-xl font-bold" style={{ color: brand.navy[950] }}>
                      {formatCurrency(branch.total)}
                    </div>
                    <div className="text-xs font-semibold mt-0.5" style={{ color: '#64748B' }}>
                      {branch.warehouseName}
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      {branch.invoiceCount} facturas · {branch.unitsSold} unidades
                    </div>
                    {grandTotal > 0 && (
                      <div className="mt-3 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: '#E2E8F0' }}>
                        <div className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: brand.orange[500] }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })() : (
          <div style={glass} className="rounded-2xl p-6 flex flex-col items-center justify-center gap-2 text-slate-400 text-sm">
            <Building2 size={32} style={{ color: '#CBD5E1' }} />
            <span>No hay ventas en el período seleccionado</span>
          </div>
        )}
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
          {(['ISSUED', 'PARTIAL', 'PAID', 'VOIDED'] as const).map((status) => {
            const statusData = summary?.invoicesByStatus.find((g) => g.status === status);
            const count = statusData?.count ?? 0;
            const amount = statusData?.total ?? 0;
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
        {summary?.topCustomers && summary.topCustomers.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={summary.topCustomers.map((c) => ({ name: c.name.split(' ')[0], ventas: c.totalSales }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(10,22,40,0.06)" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94A3B8' }} />
              <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => [formatCurrency(Number(v)), 'Ventas']} />
              <Bar dataKey="ventas" fill={brand.navy[700]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChart label="No hay clientes registrados" />
        )}
      </div>

      {/* Reporte de Vidrio por Lama */}
      {(lama3 ?? lama4) && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Layers size={16} style={{ color: brand.navy[700] }} />
            <h2 className="text-sm font-bold uppercase tracking-wide" style={{ color: brand.navy[800] }}>
              Reporte de Vidrio por Lama
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {([lama3, lama4] as const).map((data, idx) => {
              if (!data) return null;
              const lamaLabel = `Lama ${data.lama}"`;
              const whKeys = Object.keys(data.byWarehouse);
              return (
                <div key={idx} style={glass} className="rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold" style={{ color: brand.navy[950] }}>{lamaLabel}</h3>
                    <span
                      className="text-xs font-bold px-2.5 py-1 rounded-full"
                      style={{ backgroundColor: brand.navy[950], color: '#FFFFFF' }}
                    >
                      {data.total} uds total
                    </span>
                  </div>

                  {/* AE vs BG */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="rounded-xl p-3 text-center" style={{ backgroundColor: '#F0F9FF' }}>
                      <div className="text-xl font-bold" style={{ color: brand.semantic.info }}>{data.ae}</div>
                      <div className="text-xs mt-0.5" style={{ color: '#64748B' }}>Acid Etched (AE)</div>
                    </div>
                    <div className="rounded-xl p-3 text-center" style={{ backgroundColor: '#F8FAFC' }}>
                      <div className="text-xl font-bold" style={{ color: brand.navy[700] }}>{data.bg}</div>
                      <div className="text-xs mt-0.5" style={{ color: '#64748B' }}>Bronze/Grey (BG)</div>
                    </div>
                  </div>

                  {/* Por almacén */}
                  {whKeys.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#94A3B8' }}>
                        Por almacén
                      </div>
                      <div className="space-y-1.5">
                        {whKeys.map((wh) => {
                          const d = data.byWarehouse[wh]!;
                          const whTotal = d.ae + d.bg;
                          return (
                            <div
                              key={wh}
                              className="flex items-center justify-between px-3 py-2 rounded-lg text-xs"
                              style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}
                            >
                              <span style={{ color: brand.navy[800] }}>{wh}</span>
                              <div className="flex items-center gap-3">
                                <span style={{ color: brand.semantic.info }}>AE: {d.ae}</span>
                                <span style={{ color: '#64748B' }}>BG: {d.bg}</span>
                                <span className="font-bold" style={{ color: brand.navy[950] }}>{whTotal}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      </> /* end summary tab */ }
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

