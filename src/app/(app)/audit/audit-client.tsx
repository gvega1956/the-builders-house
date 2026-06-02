'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { brand } from '@/lib/brand';
import { formatDateTime } from '@/lib/utils';
import {
  Shield, ChevronLeft, ChevronRight, Eye, X,
  Download, Filter, RefreshCw,
} from 'lucide-react';

const glass = {
  backgroundColor: 'rgba(255,255,255,0.72)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: '1px solid rgba(255,255,255,0.85)',
  boxShadow: '0 4px 24px rgba(10,22,40,0.07)',
} as React.CSSProperties;

// ─── Estilos por tipo de acción ───────────────────────────────────────────────

const ACTION_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  CREATE:              { bg: '#F0FDF4', text: '#166534', label: 'Crear' },
  UPDATE:              { bg: '#EFF6FF', text: '#1D4ED8', label: 'Actualizar' },
  DELETE:              { bg: '#FEF2F2', text: '#991B1B', label: 'Eliminar' },
  DEACTIVATE:          { bg: '#FEF2F2', text: '#991B1B', label: 'Archivar' },
  VOID:                { bg: '#FEF2F2', text: '#991B1B', label: 'Anular' },
  LOGIN:               { bg: '#F5F3FF', text: '#6D28D9', label: 'Login' },
  LOGOUT:              { bg: '#F8FAFC', text: '#94A3B8', label: 'Logout' },
  APPROVE:             { bg: '#FEF9C3', text: '#854D0E', label: 'Aprobar' },
  AUTHORIZE_BACKORDER: { bg: '#FEF9C3', text: '#854D0E', label: 'Autorizar' },
  TRANSFER_STOCK:      { bg: '#F0F9FF', text: '#0369A1', label: 'Transferir' },
  ADD_STOCK:           { bg: '#F0FDF4', text: '#166534', label: 'Agregar Stock' },
  UPDATE_STOCK:        { bg: '#FFF7ED', text: '#C2410C', label: 'Ajustar Stock' },
  RECONCILE_BALANCE:   { bg: '#EFF6FF', text: '#1D4ED8', label: 'Reconciliar' },
  RECEIVE_PO:          { bg: '#F0FDF4', text: '#166534', label: 'Recibir OC' },
  PAYMENT:             { bg: '#F5F3FF', text: '#6D28D9', label: 'Pago' },
};

const ENTITY_LABELS: Record<string, string> = {
  Product:           'Producto',
  Customer:          'Cliente',
  Invoice:           'Factura',
  User:              'Usuario',
  InventoryMovement: 'Movimiento',
  ProductLocation:   'Ubicación',
  PurchaseOrder:     'Orden de Compra',
  CycleCount:        'Conteo Cíclico',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function exportCsv(logs: AuditLog[]) {
  const headers = ['Fecha/Hora', 'Usuario', 'Email', 'Rol', 'Acción', 'Entidad', 'ID Entidad', 'IP', 'Valores Nuevos'];
  const rows = logs.map((l) => [
    formatDateTime(l.createdAt),
    l.user.name ?? '',
    l.user.email ?? '',
    l.user.role ?? '',
    l.action,
    l.entityType ?? '',
    l.entityId ?? '',
    l.ipAddress ?? '',
    l.newValues ? JSON.stringify(l.newValues) : '',
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `auditoria-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

type AuditLog = {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  oldValues: unknown;
  newValues: unknown;
  ipAddress: string | null;
  createdAt: Date | string;
  user: { name: string | null; email: string | null; role: string };
};

// ─── Component ────────────────────────────────────────────────────────────────

export function AuditClient() {
  const [userId, setUserId]         = useState('');
  const [entityType, setEntityType] = useState('');
  const [action, setAction]         = useState('');
  const [from, setFrom]             = useState('');
  const [to, setTo]                 = useState('');
  const [page, setPage]             = useState(1);
  const [selected, setSelected]     = useState<AuditLog | null>(null);
  const [exporting, setExporting]   = useState(false);

  const utils = trpc.useUtils();
  const { data: usersData } = trpc.settings.users.useQuery();

  const { data, isLoading, refetch } = trpc.audit.list.useQuery({
    userId:     userId     || undefined,
    entityType: entityType || undefined,
    action:     action     || undefined,
    from:       from ? new Date(from) : undefined,
    to:         to   ? new Date(to + 'T23:59:59') : undefined,
    page,
    pageSize: 30,
  });

  const logs  = data?.logs ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 30);

  function clearFilters() {
    setUserId(''); setEntityType(''); setAction('');
    setFrom(''); setTo(''); setPage(1);
  }

  const hasFilters = !!(userId || entityType || action || from || to);

  async function handleExport() {
    setExporting(true);
    try {
      const result = await utils.audit.list.fetch({
        userId:     userId     || undefined,
        entityType: entityType || undefined,
        action:     action     || undefined,
        from:       from ? new Date(from) : undefined,
        to:         to   ? new Date(to + 'T23:59:59') : undefined,
        pageSize: 1000,
      });
      exportCsv(result.logs as AuditLog[]);
    } finally {
      setExporting(false);
    }
  }

  const selectStyle = "text-sm px-3 py-2 rounded-xl border bg-white/60 outline-none min-w-0";
  const inputStyle  = "text-sm px-3 py-2 rounded-xl border bg-white/60 outline-none";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: brand.navy[950] }}>Auditoría</h1>
          <p className="text-sm mt-0.5" style={{ color: '#64748B' }}>
            Log inmutable · {total.toLocaleString()} eventos registrados
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void refetch()}
            className="p-2 rounded-xl border hover:bg-slate-50 transition-colors"
            title="Actualizar"
          >
            <RefreshCw size={15} style={{ color: '#64748B' }} />
          </button>
          <button
            onClick={() => void handleExport()}
            disabled={exporting}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border hover:bg-slate-50 transition-colors disabled:opacity-50"
            style={{ color: brand.navy[800], borderColor: '#E2E8F0', backgroundColor: 'white' }}
          >
            <Download size={15} />
            {exporting ? 'Exportando...' : 'Exportar CSV'}
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div style={glass} className="rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Filter size={14} style={{ color: '#94A3B8' }} />
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#94A3B8' }}>Filtros</span>
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="text-xs px-2 py-0.5 rounded-full hover:bg-red-50 transition-colors"
              style={{ color: brand.semantic.danger }}
            >
              Limpiar filtros
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          {/* Usuario */}
          <select
            value={userId}
            onChange={(e) => { setUserId(e.target.value); setPage(1); }}
            className={selectStyle}
            style={{ color: brand.navy[800] }}
          >
            <option value="">Todos los usuarios</option>
            {usersData?.map((u) => (
              <option key={u.id} value={u.id}>{u.name ?? u.email}</option>
            ))}
          </select>

          {/* Entidad */}
          <select
            value={entityType}
            onChange={(e) => { setEntityType(e.target.value); setPage(1); }}
            className={selectStyle}
            style={{ color: brand.navy[800] }}
          >
            <option value="">Todas las entidades</option>
            {Object.entries(ENTITY_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>

          {/* Acción */}
          <select
            value={action}
            onChange={(e) => { setAction(e.target.value); setPage(1); }}
            className={selectStyle}
            style={{ color: brand.navy[800] }}
          >
            <option value="">Todas las acciones</option>
            {Object.entries(ACTION_STYLES).map(([val, { label }]) => (
              <option key={val} value={val}>{label} ({val})</option>
            ))}
          </select>

          {/* Rango de fechas */}
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={from}
              onChange={(e) => { setFrom(e.target.value); setPage(1); }}
              className={inputStyle}
              style={{ color: brand.navy[800] }}
            />
            <span className="text-xs text-slate-400">—</span>
            <input
              type="date"
              value={to}
              onChange={(e) => { setTo(e.target.value); setPage(1); }}
              className={inputStyle}
              style={{ color: brand.navy[800] }}
            />
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div style={glass} className="rounded-2xl overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-slate-400 text-sm">Cargando log de auditoría...</div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Shield size={40} style={{ color: '#CBD5E1' }} />
            <p className="text-slate-400 text-sm">No se encontraron eventos</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(10,22,40,0.08)' }}>
                  {['Fecha/Hora', 'Usuario', 'Acción', 'Entidad', 'ID Entidad', 'IP', ''].map((h) => (
                    <th
                      key={h}
                      className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide"
                      style={{ color: '#94A3B8' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => {
                  const st = ACTION_STYLES[log.action] ?? { bg: '#F1F5F9', text: '#475569', label: log.action };
                  const entityLabel = ENTITY_LABELS[log.entityType ?? ''] ?? log.entityType;
                  return (
                    <tr
                      key={log.id}
                      style={{
                        borderBottom: i < logs.length - 1 ? '1px solid rgba(10,22,40,0.05)' : 'none',
                        backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(10,22,40,0.015)',
                      }}
                    >
                      <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: '#64748B' }}>
                        {formatDateTime(log.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-sm" style={{ color: brand.navy[900] }}>
                          {log.user.name ?? log.user.email}
                        </div>
                        <div className="text-xs text-slate-400">{log.user.role}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="px-2 py-0.5 rounded-full text-xs font-bold whitespace-nowrap"
                          style={{ backgroundColor: st.bg, color: st.text }}
                        >
                          {st.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-sm">{entityLabel ?? '—'}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-400">
                        {log.entityId ? `…${log.entityId.slice(-8)}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">{log.ipAddress ?? '—'}</td>
                      <td className="px-4 py-3">
                        {(log.oldValues || log.newValues) && (
                          <button
                            onClick={() => setSelected(log as AuditLog)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                            title="Ver detalle"
                          >
                            <Eye size={14} style={{ color: brand.navy[600] }} />
                          </button>
                        )}
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
          <span>
            Mostrando {(page - 1) * 30 + 1}–{Math.min(page * 30, total)} de {total.toLocaleString()}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 rounded-lg border disabled:opacity-40"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="px-3 py-1 rounded-lg bg-white/60 border">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1.5 rounded-lg border disabled:opacity-40"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Modal de detalle */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/30"
            style={{ backdropFilter: 'blur(4px)' }}
            onClick={() => setSelected(null)}
          />
          <div
            className="relative w-full max-w-xl mx-4 rounded-2xl p-6 max-h-[85vh] overflow-y-auto"
            style={{ background: 'rgba(255,255,255,0.97)', boxShadow: '0 24px 64px rgba(10,22,40,0.18)' }}
          >
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-base font-bold" style={{ color: brand.navy[950] }}>
                  Detalle del Evento
                </h2>
                <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>
                  {formatDateTime(selected.createdAt)} · {selected.user.name ?? selected.user.email}
                </p>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100"
              >
                <X size={18} style={{ color: '#64748B' }} />
              </button>
            </div>

            {/* Metadata */}
            <div
              className="grid grid-cols-2 gap-3 mb-5 p-3 rounded-xl text-xs"
              style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}
            >
              {[
                { label: 'Acción', value: ACTION_STYLES[selected.action]?.label ?? selected.action },
                { label: 'Entidad', value: ENTITY_LABELS[selected.entityType ?? ''] ?? selected.entityType ?? '—' },
                { label: 'ID', value: selected.entityId ? `…${selected.entityId.slice(-12)}` : '—' },
                { label: 'IP', value: selected.ipAddress ?? '—' },
                { label: 'Usuario', value: selected.user.name ?? selected.user.email ?? '—' },
                { label: 'Rol', value: selected.user.role },
              ].map(({ label, value }) => (
                <div key={label}>
                  <div className="font-semibold uppercase tracking-wide mb-0.5" style={{ color: '#94A3B8' }}>
                    {label}
                  </div>
                  <div style={{ color: brand.navy[800] }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Valores anteriores */}
            {!!selected.oldValues && (
              <div className="mb-4">
                <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#94A3B8' }}>
                  Valores Anteriores
                </p>
                <pre
                  className="text-xs p-3 rounded-xl overflow-x-auto"
                  style={{ backgroundColor: '#FEF2F2', color: '#991B1B' }}
                >
                  {JSON.stringify(selected.oldValues, null, 2)}
                </pre>
              </div>
            )}

            {/* Valores nuevos */}
            {!!selected.newValues && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#94A3B8' }}>
                  Valores Nuevos
                </p>
                <pre
                  className="text-xs p-3 rounded-xl overflow-x-auto"
                  style={{ backgroundColor: '#F0FDF4', color: '#166534' }}
                >
                  {JSON.stringify(selected.newValues, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
