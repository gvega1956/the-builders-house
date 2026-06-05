'use client';

import { useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { brand } from '@/lib/brand';
import { formatCurrency, formatDate } from '@/lib/utils';
import { glass } from '@/lib/ui';
import {
  DollarSign, Users, Clock, AlertTriangle, Search,
  ChevronLeft, ChevronRight, Eye, Plus, X, TrendingUp,
  TrendingDown, Receipt, CheckCircle2, FileText,
  ArrowDownLeft, Building2,
} from 'lucide-react';

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Tab = 'dashboard' | 'cuentas';

const METHOD_LABELS: Record<string, string> = {
  CASH: 'Efectivo', CHECK: 'Cheque', TRANSFER: 'Transferencia',
  CARD: 'Tarjeta', CREDIT: 'Crédito',
};

// ─── Componente ───────────────────────────────────────────────────────────────

export function CxcClient({ role }: { role: string }) {
  const canManage = role === 'ADMIN' || role === 'MANAGER';

  // ── Estado general
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [search, setSearch] = useState('');
  const [hasBalance, setHasBalance] = useState<boolean | undefined>(undefined);
  const [paymentTermsFilter, setPaymentTermsFilter] = useState<'ALL'|'CREDITO'|'CONTADO'>('ALL');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');

  // ── Modales
  const [modal, setModal] = useState<'none' | 'statement' | 'collection' | 'openingBalance'>('none');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [statementFrom, setStatementFrom] = useState('');
  const [statementTo, setStatementTo] = useState('');

  // ── Cobro
  const [collectionTotal, setCollectionTotal] = useState('');
  const [collectionMethod, setCollectionMethod] = useState<'CASH'|'CHECK'|'TRANSFER'|'CARD'|'CREDIT'>('CASH');
  const [collectionRef, setCollectionRef] = useState('');
  const [collectionNotes, setCollectionNotes] = useState('');
  const [collectionMode, setCollectionMode] = useState<'fifo' | 'manual'>('fifo');
  const [manualAllocations, setManualAllocations] = useState<Record<string, string>>({});

  // ── Saldo inicial
  const [openingAmount, setOpeningAmount] = useState('');
  const [openingNotes, setOpeningNotes] = useState('');

  // ── Queries
  const { data: dashboard } = trpc.cxc.dashboard.useQuery(undefined, { enabled: activeTab === 'dashboard' });
  const { data: custData, isLoading: custLoading, refetch: refetchCust } = trpc.cxc.customerSummary.useQuery(
    { search: search || undefined, hasBalance, paymentTermsFilter, page, pageSize: 20 },
    { enabled: activeTab === 'cuentas' },
  );
  const { data: statement, isLoading: stmtLoading } = trpc.cxc.customerStatement.useQuery(
    {
      customerId: selectedCustomerId ?? '',
      from: statementFrom ? new Date(statementFrom) : undefined,
      to: statementTo   ? new Date(statementTo)   : undefined,
    },
    { enabled: !!selectedCustomerId && modal === 'statement' },
  );
  const { data: openInvoices } = trpc.cxc.openInvoicesForCustomer.useQuery(
    selectedCustomerId ?? '',
    { enabled: !!selectedCustomerId && modal === 'collection' },
  );

  // ── Mutations
  const collectionMutation = trpc.cxc.recordCollection.useMutation({
    onSuccess: () => { refetchCust(); closeModal(); },
    onError: (e) => setError(e.message),
  });
  const openingMutation = trpc.cxc.setOpeningBalance.useMutation({
    onSuccess: () => { refetchCust(); closeModal(); },
    onError: (e) => setError(e.message),
  });

  function closeModal() {
    setModal('none'); setSelectedCustomerId(null); setError('');
    setCollectionTotal(''); setCollectionRef(''); setCollectionNotes('');
    setCollectionMode('fifo'); setManualAllocations({});
    setOpeningAmount(''); setOpeningNotes('');
    setStatementFrom(''); setStatementTo('');
  }

  function openCollection(customerId: string) {
    setSelectedCustomerId(customerId); setModal('collection'); setError('');
    setCollectionTotal(''); setManualAllocations({});
  }

  function openStatement(customerId: string) {
    setSelectedCustomerId(customerId); setModal('statement');
  }

  function openOpening(customerId: string) {
    setSelectedCustomerId(customerId); setModal('openingBalance'); setError('');
  }

  // Calcula distribución manual vs monto total para validación UI
  const manualTotal = useMemo(() =>
    Object.values(manualAllocations).reduce((s, v) => s + (parseFloat(v) || 0), 0),
    [manualAllocations],
  );
  const collectionTotalNum = parseFloat(collectionTotal) || 0;
  const manualDiff = Math.abs(manualTotal - collectionTotalNum);

  function submitCollection() {
    setError('');
    const amount = parseFloat(collectionTotal);
    if (!amount || amount <= 0) { setError('Ingresa un monto válido'); return; }
    if (!selectedCustomerId) return;

    if (collectionMode === 'manual') {
      if (manualDiff > 0.01) { setError(`La suma de asignaciones ($${manualTotal.toFixed(2)}) debe igualar el total ($${amount.toFixed(2)})`); return; }
      const allocs = Object.entries(manualAllocations)
        .filter(([, v]) => parseFloat(v) > 0)
        .map(([invoiceId, v]) => ({ invoiceId, amount: parseFloat(v) }));
      if (allocs.length === 0) { setError('Asigna el monto a al menos una factura'); return; }
      collectionMutation.mutate({ customerId: selectedCustomerId, totalAmount: amount, method: collectionMethod, reference: collectionRef || undefined, notes: collectionNotes || undefined, allocations: allocs });
    } else {
      collectionMutation.mutate({ customerId: selectedCustomerId, totalAmount: amount, method: collectionMethod, reference: collectionRef || undefined, notes: collectionNotes || undefined });
    }
  }

  const customers = custData?.customers ?? [];
  const custTotal = custData?.total ?? 0;
  const totalPages = Math.ceil(custTotal / 20);

  // Exportar estado de cuenta como CSV
  function exportStatement() {
    if (!statement) return;
    const rows = [
      ['Fecha', 'Tipo', 'Número', 'Descripción', 'Cargo', 'Abono', 'Saldo'],
      ...statement.ledger.map((e) => [
        new Date(e.date).toLocaleDateString('es-PR'),
        e.docType, e.docNumber, e.description,
        e.debit > 0 ? e.debit.toFixed(2) : '',
        e.credit > 0 ? e.credit.toFixed(2) : '',
        e.balance.toFixed(2),
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `estado-cuenta-${statement.customer.code}-${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: brand.navy[950] }}>Cuentas por Cobrar</h1>
          <p className="text-sm mt-0.5" style={{ color: '#64748B' }}>
            Gestión de balances, cobros y estados de cuenta
          </p>
        </div>
      </div>

      {/* Tab strip */}
      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: 'rgba(10,22,40,0.06)' }}>
        {([
          { key: 'dashboard', label: 'Dashboard', icon: TrendingUp },
          { key: 'cuentas',   label: 'Cuentas',   icon: Users },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
            style={{
              background: activeTab === key ? 'white' : 'transparent',
              color: activeTab === key ? brand.navy[950] : '#64748B',
              boxShadow: activeTab === key ? '0 1px 4px rgba(10,22,40,0.12)' : 'none',
            }}>
            <Icon size={14} />{label}
            {key === 'cuentas' && dashboard && dashboard.totalOwed > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs font-bold text-white"
                style={{ background: brand.orange[500] }}>
                {formatCurrency(dashboard.totalOwed)}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ══════════════════ DASHBOARD ══════════════════ */}
      {activeTab === 'dashboard' && dashboard && (
        <div className="space-y-5">

          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Total por Cobrar', value: dashboard.totalOwed, sub: `${dashboard.openCount} facturas abiertas`, icon: DollarSign, color: brand.navy[950], bg: `${brand.navy[950]}08`, border: `${brand.navy[950]}15` },
              { label: 'Vencido', value: dashboard.totalOverdue, sub: 'Con fecha de vencimiento pasada', icon: AlertTriangle, color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
              { label: 'Vence en 7 días', value: dashboard.dueSoon7, sub: 'Próximas a vencer', icon: Clock, color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
              { label: 'Cobrado este mes', value: dashboard.collectedThisMonth, sub: dashboard.collectedLastMonth > 0 ? `${((dashboard.collectedThisMonth / dashboard.collectedLastMonth - 1) * 100).toFixed(0)}% vs mes anterior` : 'Mes anterior: $0', icon: dashboard.collectedThisMonth >= dashboard.collectedLastMonth ? TrendingUp : TrendingDown, color: '#059669', bg: '#F0FDF4', border: '#BBF7D0' },
            ].map((card) => (
              <div key={card.label} className="rounded-2xl p-4" style={{ background: card.bg, border: `1px solid ${card.border}` }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: card.color }}>{card.label}</span>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: card.color + '18' }}>
                    <card.icon size={14} style={{ color: card.color }} />
                  </div>
                </div>
                <div className="text-2xl font-bold" style={{ color: card.color }}>{formatCurrency(card.value)}</div>
                <div className="text-xs mt-0.5" style={{ color: card.color + '99' }}>{card.sub}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Aging */}
            <div style={glass} className="rounded-2xl p-5">
              <h3 className="text-sm font-bold mb-4" style={{ color: brand.navy[950] }}>Envejecimiento de Saldos</h3>
              {[
                { label: 'Al corriente',  value: dashboard.aging.current, color: '#059669', pct: dashboard.aging.total > 0 ? (dashboard.aging.current / dashboard.aging.total) * 100 : 0 },
                { label: '1-30 días',     value: dashboard.aging.d30,     color: '#D97706', pct: dashboard.aging.total > 0 ? (dashboard.aging.d30     / dashboard.aging.total) * 100 : 0 },
                { label: '31-60 días',    value: dashboard.aging.d60,     color: '#EA580C', pct: dashboard.aging.total > 0 ? (dashboard.aging.d60     / dashboard.aging.total) * 100 : 0 },
                { label: '61-90 días',    value: dashboard.aging.d90,     color: '#DC2626', pct: dashboard.aging.total > 0 ? (dashboard.aging.d90     / dashboard.aging.total) * 100 : 0 },
                { label: '+90 días',      value: dashboard.aging.d90plus, color: '#991B1B', pct: dashboard.aging.total > 0 ? (dashboard.aging.d90plus / dashboard.aging.total) * 100 : 0 },
              ].map((row) => (
                <div key={row.label} className="flex items-center gap-3 mb-3">
                  <span className="text-xs w-20 shrink-0" style={{ color: '#64748B' }}>{row.label}</span>
                  <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${row.pct}%`, background: row.color }} />
                  </div>
                  <span className="text-xs font-semibold w-20 text-right shrink-0" style={{ color: row.value > 0 ? row.color : '#CBD5E1' }}>
                    {formatCurrency(row.value)}
                  </span>
                </div>
              ))}
              <div className="flex justify-between pt-2 border-t border-slate-100 text-sm font-bold mt-1">
                <span style={{ color: brand.navy[700] }}>TOTAL</span>
                <span style={{ color: brand.navy[950] }}>{formatCurrency(dashboard.aging.total)}</span>
              </div>
            </div>

            {/* Top deudores */}
            <div style={glass} className="rounded-2xl overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100">
                <h3 className="text-sm font-bold" style={{ color: brand.navy[950] }}>Top 10 Deudores</h3>
              </div>
              {dashboard.topDebtors.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2">
                  <CheckCircle2 size={32} style={{ color: '#BBF7D0' }} />
                  <p className="text-sm text-slate-400">Sin cuentas pendientes</p>
                </div>
              ) : (
                <div className="overflow-y-auto max-h-64">
                  {dashboard.topDebtors.map((d, i) => (
                    <div key={d.customerId} className="flex items-center gap-3 px-5 py-2.5 hover:bg-slate-50/50 cursor-pointer"
                      style={{ borderBottom: '1px solid rgba(10,22,40,0.05)' }}
                      onClick={() => { setSelectedCustomerId(d.customerId); setActiveTab('cuentas'); }}>
                      <span className="text-xs font-mono w-5 text-slate-400">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate" style={{ color: brand.navy[950] }}>{d.name}</div>
                        <div className="text-xs text-slate-400">{d.code}</div>
                      </div>
                      <span className="font-bold text-sm shrink-0" style={{ color: '#DC2626' }}>{formatCurrency(d.balance)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════ CUENTAS ══════════════════ */}
      {activeTab === 'cuentas' && (
        <div className="space-y-4">
          {/* Filtros */}
          <div style={glass} className="rounded-2xl p-4 flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2 flex-1 min-w-48 bg-white/60 rounded-xl px-3 py-2 border border-white/80">
              <Search size={15} style={{ color: '#94A3B8' }} />
              <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Buscar cliente..." className="flex-1 text-sm bg-transparent outline-none" style={{ color: brand.navy[950] }} />
            </div>
            <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(10,22,40,0.05)' }}>
              {([
                { val: true,      label: 'Con saldo' },
                { val: undefined, label: 'Todos' },
                { val: false,     label: 'Al día' },
              ] as const).map(({ val, label }) => (
                <button key={String(val)} onClick={() => { setHasBalance(val); setPage(1); }}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  style={{
                    background: hasBalance === val ? brand.orange[500] : 'transparent',
                    color: hasBalance === val ? 'white' : '#64748B',
                  }}>
                  {label}
                </button>
              ))}
            </div>
            {/* Filtro por tipo de pago */}
            <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(10,22,40,0.05)' }}>
              {([
                { val: 'ALL',     label: 'Todos' },
                { val: 'CREDITO', label: 'Crédito' },
                { val: 'CONTADO', label: 'Contado' },
              ] as const).map(({ val, label }) => (
                <button key={val} onClick={() => { setPaymentTermsFilter(val); setPage(1); }}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  style={{
                    background: paymentTermsFilter === val ? (val === 'CREDITO' ? '#1D4ED8' : val === 'CONTADO' ? '#059669' : brand.navy[950]) : 'transparent',
                    color: paymentTermsFilter === val ? 'white' : '#64748B',
                  }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Tabla */}
          <div style={glass} className="rounded-2xl overflow-hidden">
            {custLoading ? (
              <div className="flex items-center justify-center py-20 text-slate-400 text-sm">Cargando...</div>
            ) : customers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Users size={40} style={{ color: '#CBD5E1' }} />
                <p className="text-slate-400 text-sm">Sin clientes con saldo</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(10,22,40,0.08)' }}>
                      {['Cliente', 'Corriente', '1-30d', '31-60d', '+60d', 'Balance Total', 'Crédito', ''].map((h) => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: '#94A3B8' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {customers.map((c, i) => {
                      const overdue = c.aging.d30 + c.aging.d60 + c.aging.d90 + c.aging.d90plus;
                      return (
                        <tr key={c.id} style={{ borderBottom: i < customers.length - 1 ? '1px solid rgba(10,22,40,0.05)' : 'none' }} className="hover:bg-slate-50/40">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="font-medium" style={{ color: brand.navy[950] }}>{c.name}</span>
                              {c.aging.total > 0 && (
                                <span className="text-xs px-1.5 py-0.5 rounded font-bold"
                                  style={{ background: '#EFF6FF', color: '#1D4ED8' }}>
                                  CRÉDITO
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-400">{c.code} · {c.type === 'WHOLESALE' ? 'Mayorista' : 'Detallista'} · {c.openInvoicesCount} factura{c.openInvoicesCount !== 1 ? 's' : ''} abierta{c.openInvoicesCount !== 1 ? 's' : ''}</div>
                          </td>
                          <td className="px-4 py-3 text-sm" style={{ color: '#059669' }}>{c.aging.current > 0 ? formatCurrency(c.aging.current) : <span className="text-slate-300">—</span>}</td>
                          <td className="px-4 py-3 text-sm" style={{ color: c.aging.d30 > 0 ? '#D97706' : '#CBD5E1' }}>{c.aging.d30 > 0 ? formatCurrency(c.aging.d30) : '—'}</td>
                          <td className="px-4 py-3 text-sm" style={{ color: c.aging.d60 > 0 ? '#EA580C' : '#CBD5E1' }}>{c.aging.d60 > 0 ? formatCurrency(c.aging.d60) : '—'}</td>
                          <td className="px-4 py-3 text-sm" style={{ color: (c.aging.d90 + c.aging.d90plus) > 0 ? '#DC2626' : '#CBD5E1' }}>
                            {(c.aging.d90 + c.aging.d90plus) > 0 ? formatCurrency(c.aging.d90 + c.aging.d90plus) : '—'}
                          </td>
                          <td className="px-4 py-3 font-bold text-sm" style={{ color: c.currentBalance > 0 ? '#DC2626' : '#059669' }}>
                            {formatCurrency(c.currentBalance)}
                            {overdue > 0 && <div className="text-xs font-normal text-red-500">{formatCurrency(overdue)} vencido</div>}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-400">
                            {c.creditLimit > 0 ? formatCurrency(c.creditLimit) : 'Sin límite'}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1">
                              <button onClick={() => openStatement(c.id)} title="Estado de Cuenta"
                                className="p-1.5 rounded-lg hover:bg-blue-50">
                                <FileText size={14} style={{ color: '#1D4ED8' }} />
                              </button>
                              {c.currentBalance > 0 && (
                                <button onClick={() => openCollection(c.id)} title="Registrar Cobro"
                                  className="p-1.5 rounded-lg hover:bg-green-50">
                                  <ArrowDownLeft size={14} style={{ color: '#059669' }} />
                                </button>
                              )}
                              {canManage && (
                                <button onClick={() => openOpening(c.id)} title="Ingresar Saldo Inicial"
                                  className="p-1.5 rounded-lg hover:bg-orange-50">
                                  <Plus size={14} style={{ color: brand.orange[500] }} />
                                </button>
                              )}
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

          {/* Paginación */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm" style={{ color: '#64748B' }}>
              <span>Mostrando {(page-1)*20+1}–{Math.min(page*20, custTotal)} de {custTotal}</span>
              <div className="flex gap-2">
                <button onClick={() => setPage((p) => Math.max(1, p-1))} disabled={page===1} className="p-1.5 rounded-lg border disabled:opacity-40"><ChevronLeft size={16}/></button>
                <span className="px-3 py-1 rounded-lg bg-white/60 border">{page}/{totalPages}</span>
                <button onClick={() => setPage((p) => Math.min(totalPages, p+1))} disabled={page===totalPages} className="p-1.5 rounded-lg border disabled:opacity-40"><ChevronRight size={16}/></button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ ESTADO DE CUENTA ══ */}
      {modal === 'statement' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" style={{ backdropFilter: 'blur(6px)' }} onClick={closeModal} />
          <div className="relative w-full max-w-4xl rounded-2xl overflow-hidden flex flex-col"
            style={{ height: '90vh', background: 'rgba(255,255,255,0.98)', boxShadow: '0 32px 80px rgba(10,22,40,0.28)' }}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ background: brand.navy[950] }}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: brand.orange[500] }}>
                  <Receipt size={15} className="text-white" />
                </div>
                <div>
                  <div className="text-base font-bold text-white">Estado de Cuenta</div>
                  <div className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    {statement?.customer.name ?? '...'} · {statement?.customer.code}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Filtro fechas */}
                <input type="date" value={statementFrom} onChange={(e) => setStatementFrom(e.target.value)}
                  className="text-xs px-2 py-1 rounded-lg border bg-white/10 text-white border-white/20 outline-none" />
                <span className="text-white/40 text-xs">—</span>
                <input type="date" value={statementTo} onChange={(e) => setStatementTo(e.target.value)}
                  className="text-xs px-2 py-1 rounded-lg border bg-white/10 text-white border-white/20 outline-none" />
                <button onClick={exportStatement} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-medium"
                  style={{ color: 'white', border: '1px solid rgba(255,255,255,0.25)' }}>
                  Exportar CSV
                </button>
                <button onClick={closeModal} className="p-1.5 rounded-lg hover:bg-white/10">
                  <X size={18} className="text-white/70" />
                </button>
              </div>
            </div>

            {stmtLoading ? (
              <div className="flex-1 flex items-center justify-center text-slate-400">Cargando estado de cuenta...</div>
            ) : statement ? (
              <div className="flex flex-col flex-1 min-h-0">
                {/* Resumen */}
                <div className="grid grid-cols-4 gap-0 shrink-0 border-b border-slate-100">
                  {[
                    { label: 'Total Cargos', value: statement.summary.totalDebit, color: '#DC2626' },
                    { label: 'Total Abonos', value: statement.summary.totalCredit, color: '#059669' },
                    { label: 'Saldo Actual', value: statement.summary.currentBalance, color: statement.summary.currentBalance > 0 ? '#DC2626' : '#059669' },
                    { label: 'Transacciones', value: statement.summary.entryCount, color: brand.navy[950], isCount: true },
                  ].map((s) => (
                    <div key={s.label} className="px-5 py-3 text-center border-r border-slate-100 last:border-r-0">
                      <div className="text-xs text-slate-400 mb-0.5">{s.label}</div>
                      <div className="text-lg font-bold" style={{ color: s.color }}>
                        {(s as { isCount?: boolean }).isCount ? s.value : formatCurrency(s.value as number)}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Ledger */}
                <div className="flex-1 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0" style={{ background: '#F8FAFC', zIndex: 10 }}>
                      <tr style={{ borderBottom: '1px solid rgba(10,22,40,0.08)' }}>
                        {['Fecha', 'Tipo', 'Número', 'Descripción', 'Cargo', 'Abono', 'Saldo'].map((h, idx) => (
                          <th key={h} className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wide ${idx >= 4 ? 'text-right' : 'text-left'}`}
                            style={{ color: '#94A3B8' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {statement.ledger.map((entry, i) => {
                        const isBF = entry.type === 'BALANCE_FORWARD';
                        const isAbono = entry.type === 'ABONO';
                        return (
                          <tr key={i} style={{
                            borderBottom: '1px solid rgba(10,22,40,0.04)',
                            backgroundColor: isBF ? '#FFF7ED' : isAbono ? 'rgba(5,150,105,0.03)' : 'transparent',
                          }}>
                            <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                              {new Date(entry.date).toLocaleDateString('es-PR')}
                            </td>
                            <td className="px-4 py-2.5">
                              <span className="text-xs px-1.5 py-0.5 rounded font-semibold"
                                style={{
                                  background: isBF ? '#FFF7ED' : isAbono ? '#F0FDF4' : '#FEF2F2',
                                  color: isBF ? brand.orange[600] : isAbono ? '#166534' : '#991B1B',
                                }}>
                                {entry.docType}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 font-mono text-xs" style={{ color: brand.navy[700] }}>{entry.docNumber}</td>
                            <td className="px-4 py-2.5 text-xs text-slate-600 max-w-xs truncate">{entry.description}</td>
                            <td className="px-4 py-2.5 text-right text-sm font-medium" style={{ color: entry.debit > 0 ? '#DC2626' : '#CBD5E1' }}>
                              {entry.debit > 0 ? formatCurrency(entry.debit) : '—'}
                            </td>
                            <td className="px-4 py-2.5 text-right text-sm font-medium" style={{ color: entry.credit > 0 ? '#059669' : '#CBD5E1' }}>
                              {entry.credit > 0 ? formatCurrency(entry.credit) : '—'}
                            </td>
                            <td className="px-4 py-2.5 text-right text-sm font-bold" style={{ color: entry.balance > 0 ? '#DC2626' : entry.balance < 0 ? '#059669' : '#94A3B8' }}>
                              {formatCurrency(Math.abs(entry.balance))}{entry.balance < 0 ? ' CR' : ''}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {statement.ledger.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-16 gap-2">
                      <Building2 size={36} style={{ color: '#CBD5E1' }} />
                      <p className="text-slate-400 text-sm">Sin movimientos en este período</p>
                    </div>
                  )}
                </div>

                {/* Footer con cobro rápido */}
                {statement.summary.currentBalance > 0 && (
                  <div className="px-6 py-3 border-t border-slate-100 flex items-center justify-between shrink-0">
                    <span className="text-sm font-semibold" style={{ color: '#DC2626' }}>
                      Saldo pendiente: {formatCurrency(statement.summary.currentBalance)}
                    </span>
                    <button onClick={() => { closeModal(); openCollection(statement.customer.id); }}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold"
                      style={{ background: `linear-gradient(135deg, #059669, #047857)` }}>
                      <ArrowDownLeft size={14} /> Registrar Cobro
                    </button>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* ══ REGISTRAR COBRO ══ */}
      {modal === 'collection' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" style={{ backdropFilter: 'blur(4px)' }} onClick={closeModal} />
          <div className="relative w-full max-w-lg rounded-2xl overflow-hidden max-h-[90vh] flex flex-col"
            style={{ background: 'rgba(255,255,255,0.98)', boxShadow: '0 24px 64px rgba(10,22,40,0.18)' }}>
            <div className="px-6 py-4 flex items-center justify-between shrink-0" style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}>
              <div className="flex items-center gap-2">
                <ArrowDownLeft size={18} className="text-white" />
                <h2 className="text-base font-bold text-white">Registrar Cobro</h2>
              </div>
              <button onClick={closeModal} className="p-1 rounded-lg hover:bg-white/10"><X size={18} className="text-white/70" /></button>
            </div>

            <div className="overflow-y-auto flex-1 p-6 space-y-4">
              {error && <div className="px-3 py-2 rounded-xl text-sm text-red-700 bg-red-50 border border-red-200">{error}</div>}

              {/* Monto total */}
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>Monto total recibido *</label>
                <input type="number" value={collectionTotal} onChange={(e) => setCollectionTotal(e.target.value)}
                  placeholder="0.00" step="0.01" className="w-full px-3 py-3 rounded-xl border border-slate-200 text-lg font-bold outline-none text-center"
                  style={{ color: '#059669' }} />
              </div>

              {/* Método */}
              <div>
                <label className="block text-xs font-semibold mb-2" style={{ color: brand.navy[700] }}>Método de cobro</label>
                <div className="grid grid-cols-5 gap-1.5">
                  {(['CASH','CHECK','TRANSFER','CARD','CREDIT'] as const).map((m) => (
                    <button key={m} onClick={() => setCollectionMethod(m)}
                      className="py-2 rounded-xl text-xs font-semibold transition-all"
                      style={{
                        background: collectionMethod === m ? '#059669' : 'transparent',
                        color: collectionMethod === m ? 'white' : brand.navy[700],
                        border: `2px solid ${collectionMethod === m ? '#059669' : '#E2E8F0'}`,
                      }}>
                      {METHOD_LABELS[m]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Referencia */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>Referencia</label>
                  <input value={collectionRef} onChange={(e) => setCollectionRef(e.target.value)} placeholder="#cheque, confirmación..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none" style={{ color: brand.navy[900] }} />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>Notas</label>
                  <input value={collectionNotes} onChange={(e) => setCollectionNotes(e.target.value)} placeholder="Opcional..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none" style={{ color: brand.navy[900] }} />
                </div>
              </div>

              {/* Modo de distribución */}
              <div>
                <label className="block text-xs font-semibold mb-2" style={{ color: brand.navy[700] }}>Aplicar a facturas</label>
                <div className="flex rounded-xl overflow-hidden border border-slate-200">
                  {([
                    { key: 'fifo',   label: 'Automático (más antigua primero)' },
                    { key: 'manual', label: 'Manual (yo distribuyo)' },
                  ] as const).map(({ key, label }) => (
                    <button key={key} onClick={() => setCollectionMode(key)}
                      className="flex-1 py-2 text-xs font-semibold transition-all"
                      style={{ background: collectionMode === key ? '#059669' : 'white', color: collectionMode === key ? 'white' : '#64748B' }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Facturas abiertas */}
              {openInvoices && openInvoices.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold" style={{ color: brand.navy[700] }}>
                      Facturas pendientes ({openInvoices.length})
                    </span>
                    {collectionMode === 'manual' && collectionTotalNum > 0 && (
                      <span className={`text-xs font-semibold ${manualDiff < 0.01 ? 'text-green-600' : 'text-red-500'}`}>
                        Asignado: {formatCurrency(manualTotal)} / {formatCurrency(collectionTotalNum)}
                      </span>
                    )}
                  </div>
                  <div className="space-y-1.5 max-h-52 overflow-y-auto">
                    {openInvoices.map((inv) => {
                      const autoApply = collectionMode === 'fifo'
                        ? (() => {
                            let rem = collectionTotalNum;
                            for (const i of openInvoices) {
                              if (i.id === inv.id) return Math.min(rem, inv.balance);
                              rem = Math.max(0, rem - i.balance);
                            }
                            return 0;
                          })()
                        : 0;
                      return (
                        <div key={inv.id} className="flex items-center gap-3 p-2.5 rounded-xl border border-slate-100"
                          style={{ background: autoApply > 0 ? '#F0FDF4' : 'transparent' }}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold" style={{ color: brand.navy[700] }}>{inv.invoiceNumber}</span>
                              <span className="text-xs px-1.5 py-0.5 rounded font-semibold"
                                style={{ background: inv.type === 'BALANCE_FORWARD' ? '#FFF7ED' : '#FEF2F2', color: inv.type === 'BALANCE_FORWARD' ? brand.orange[600] : '#991B1B' }}>
                                {inv.type === 'BALANCE_FORWARD' ? 'SALDO INICIAL' : 'FAC'}
                              </span>
                              <span className="text-xs text-slate-400">{formatDate(inv.createdAt)}</span>
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              Balance: <span className="font-semibold" style={{ color: '#DC2626' }}>{formatCurrency(inv.balance)}</span>
                            </div>
                          </div>
                          {collectionMode === 'manual' ? (
                            <input type="number" step="0.01" min="0" max={inv.balance}
                              value={manualAllocations[inv.id] ?? ''}
                              onChange={(e) => setManualAllocations((prev) => ({ ...prev, [inv.id]: e.target.value }))}
                              placeholder="0.00"
                              className="w-24 px-2 py-1 rounded-lg border border-slate-200 text-xs text-right outline-none"
                              style={{ color: brand.navy[900] }} />
                          ) : (
                            <span className="text-xs font-semibold w-20 text-right" style={{ color: autoApply > 0 ? '#059669' : '#CBD5E1' }}>
                              {autoApply > 0 ? formatCurrency(autoApply) : '—'}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 pb-5 pt-3 border-t border-slate-100 flex gap-3 shrink-0">
              <button onClick={closeModal} className="flex-1 py-2 rounded-xl text-sm border hover:bg-slate-50" style={{ color: '#64748B' }}>Cancelar</button>
              <button onClick={submitCollection}
                disabled={collectionMutation.isPending || !collectionTotal || parseFloat(collectionTotal) <= 0}
                className="flex-1 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}>
                {collectionMutation.isPending ? 'Procesando...' : `Cobrar ${collectionTotal ? formatCurrency(parseFloat(collectionTotal)) : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ SALDO INICIAL ══ */}
      {modal === 'openingBalance' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" style={{ backdropFilter: 'blur(4px)' }} onClick={closeModal} />
          <div className="relative w-full max-w-sm rounded-2xl overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.98)', boxShadow: '0 24px 64px rgba(10,22,40,0.18)' }}>
            <div className="px-6 py-4" style={{ background: brand.orange[500] }}>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Plus size={16} /> Ingresar Saldo Inicial
              </h2>
              <p className="text-xs mt-1 text-white/75">Balance previo al sistema ERP</p>
            </div>
            <div className="p-6 space-y-4">
              {error && <div className="px-3 py-2 rounded-xl text-sm text-red-700 bg-red-50 border border-red-200">{error}</div>}
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>Monto del saldo *</label>
                <input type="number" value={openingAmount} onChange={(e) => setOpeningAmount(e.target.value)}
                  placeholder="0.00" step="0.01"
                  className="w-full px-3 py-3 rounded-xl border border-slate-200 text-xl font-bold outline-none text-center"
                  style={{ color: brand.navy[900] }} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>Notas / Origen</label>
                <textarea value={openingNotes} onChange={(e) => setOpeningNotes(e.target.value)} rows={2}
                  placeholder="Ej: Balance al 31 de mayo 2026, facturas #100-#115..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none resize-none"
                  style={{ color: brand.navy[900] }} />
              </div>
              <div className="px-3 py-2 rounded-xl text-xs" style={{ background: '#FFF7ED', color: '#92400E' }}>
                Se creará una entrada <strong>BAL-XXXXX</strong> visible en el estado de cuenta y en los reportes de CXC.
              </div>
            </div>
            <div className="px-6 pb-5 flex gap-3">
              <button onClick={closeModal} className="flex-1 py-2 rounded-xl text-sm border hover:bg-slate-50" style={{ color: '#64748B' }}>Cancelar</button>
              <button onClick={() => {
                const amount = parseFloat(openingAmount);
                if (!amount || amount <= 0) { setError('Ingresa un monto válido'); return; }
                if (!selectedCustomerId) return;
                openingMutation.mutate({ customerId: selectedCustomerId, amount, notes: openingNotes || undefined });
              }}
                disabled={openingMutation.isPending || !openingAmount}
                className="flex-1 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-60"
                style={{ background: `linear-gradient(135deg, ${brand.orange[500]}, ${brand.orange[600]})` }}>
                {openingMutation.isPending ? 'Guardando...' : 'Registrar Saldo'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
