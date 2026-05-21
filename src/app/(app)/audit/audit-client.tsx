'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { brand } from '@/lib/brand';
import { formatDateTime } from '@/lib/utils';
import { Shield, ChevronLeft, ChevronRight, Search, Eye, X } from 'lucide-react';

const glass = {
  backgroundColor: 'rgba(255,255,255,0.72)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: '1px solid rgba(255,255,255,0.85)',
  boxShadow: '0 4px 24px rgba(10,22,40,0.07)',
} as React.CSSProperties;

const ACTION_STYLES: Record<string, { bg: string; text: string }> = {
  CREATE: { bg: '#F0FDF4', text: '#166534' },
  UPDATE: { bg: '#EFF6FF', text: '#1D4ED8' },
  DELETE: { bg: '#FEF2F2', text: '#991B1B' },
  VOID:   { bg: '#FEF2F2', text: '#991B1B' },
  LOGIN:  { bg: '#F5F3FF', text: '#6D28D9' },
  LOGOUT: { bg: '#F8FAFC', text: '#94A3B8' },
  APPROVE:{ bg: '#FEF9C3', text: '#854D0E' },
};

export function AuditClient() {
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [detailLog, setDetailLog] = useState<{ old: unknown; new: unknown } | null>(null);

  const { data, isLoading } = trpc.audit.list.useQuery({
    entityType: entityType || undefined,
    action: action || undefined,
    page,
    pageSize: 30,
  });

  const logs = data?.logs ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 30);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: brand.navy[950] }}>Auditoría</h1>
        <p className="text-sm mt-0.5" style={{ color: '#64748B' }}>
          Log inmutable de todas las acciones · {total} eventos registrados
        </p>
      </div>

      {/* Filters */}
      <div style={glass} className="rounded-2xl p-4 flex flex-wrap gap-3">
        <select value={entityType} onChange={(e) => { setEntityType(e.target.value); setPage(1); }}
          className="text-sm px-3 py-2 rounded-xl border bg-white/60 outline-none" style={{ color: brand.navy[800] }}>
          <option value="">Todas las entidades</option>
          <option value="Product">Producto</option>
          <option value="Customer">Cliente</option>
          <option value="Invoice">Factura</option>
          <option value="User">Usuario</option>
          <option value="InventoryMovement">Movimiento</option>
        </select>
        <select value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}
          className="text-sm px-3 py-2 rounded-xl border bg-white/60 outline-none" style={{ color: brand.navy[800] }}>
          <option value="">Todas las acciones</option>
          <option value="CREATE">Crear</option>
          <option value="UPDATE">Actualizar</option>
          <option value="DELETE">Eliminar</option>
          <option value="VOID">Anular</option>
          <option value="LOGIN">Login</option>
        </select>
      </div>

      {/* Table */}
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
                  {['Fecha/Hora', 'Usuario', 'Acción', 'Entidad', 'ID', 'IP', ''].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: '#94A3B8' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => {
                  const st = ACTION_STYLES[log.action] ?? { bg: '#F1F5F9', text: '#475569' };
                  return (
                    <tr key={log.id} style={{
                      borderBottom: i < logs.length - 1 ? '1px solid rgba(10,22,40,0.05)' : 'none',
                      backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(10,22,40,0.015)',
                    }}>
                      <td className="px-4 py-3 text-xs" style={{ color: '#64748B' }}>
                        {formatDateTime(log.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-sm" style={{ color: brand.navy[900] }}>{log.user.name}</div>
                        <div className="text-xs text-slate-400">{log.user.role}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold"
                          style={{ backgroundColor: st.bg, color: st.text }}>
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{log.entityType}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-400">
                        {log.entityId ? log.entityId.slice(-8) : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">{log.ipAddress ?? '—'}</td>
                      <td className="px-4 py-3">
                        {(log.oldValues || log.newValues) && (
                          <button
                            onClick={() => {
                              setSelected(log.id);
                              setDetailLog({ old: log.oldValues, new: log.newValues });
                            }}
                            className="p-1.5 rounded-lg hover:bg-slate-100">
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm" style={{ color: '#64748B' }}>
          <span>Mostrando {(page - 1) * 30 + 1}–{Math.min(page * 30, total)} de {total}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded-lg border disabled:opacity-40"><ChevronLeft size={16} /></button>
            <span className="px-3 py-1 rounded-lg bg-white/60 border">{page} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1.5 rounded-lg border disabled:opacity-40"><ChevronRight size={16} /></button>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selected && detailLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" style={{ backdropFilter: 'blur(4px)' }}
            onClick={() => { setSelected(null); setDetailLog(null); }} />
          <div className="relative w-full max-w-lg mx-4 rounded-2xl p-6 max-h-[80vh] overflow-y-auto"
            style={{ background: 'rgba(255,255,255,0.97)', boxShadow: '0 24px 64px rgba(10,22,40,0.18)' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold" style={{ color: brand.navy[950] }}>Detalle del Evento</h2>
              <button onClick={() => { setSelected(null); setDetailLog(null); }}><X size={18} style={{ color: '#64748B' }} /></button>
            </div>
            {!!detailLog.old && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-slate-400 mb-2">VALORES ANTERIORES</p>
                <pre className="text-xs bg-slate-50 p-3 rounded-xl overflow-x-auto" style={{ color: brand.navy[800] }}>
                  {JSON.stringify(detailLog.old as never, null, 2)}
                </pre>
              </div>
            )}
            {!!detailLog.new && (
              <div>
                <p className="text-xs font-semibold text-slate-400 mb-2">VALORES NUEVOS</p>
                <pre className="text-xs bg-green-50 p-3 rounded-xl overflow-x-auto" style={{ color: '#166534' }}>
                  {JSON.stringify(detailLog.new as never, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

