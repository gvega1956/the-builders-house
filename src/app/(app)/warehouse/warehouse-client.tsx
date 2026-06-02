'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { brand } from '@/lib/brand';
import { Warehouse, Package, MapPin, Search, BarChart3, Hash } from 'lucide-react';

const glass = {
  backgroundColor: 'rgba(255,255,255,0.72)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: '1px solid rgba(255,255,255,0.85)',
  boxShadow: '0 4px 24px rgba(10,22,40,0.07)',
} as React.CSSProperties;

export function WarehouseClient() {
  const [search, setSearch] = useState('');
  const [selectedWh, setSelectedWh] = useState<string | null>(null);

  const { data: warehouses, isLoading } = trpc.settings.warehouses.useQuery();
  const { data: summary } = trpc.stock.warehousesSummary.useQuery();

  const filtered = warehouses ?? [];
  const selected = filtered.find((w) => w.id === selectedWh) ?? filtered[0];

  const filteredLocations = selected?.locations.filter((loc) => {
    if (!search) return true;
    return (
      loc.locationCode.toLowerCase().includes(search.toLowerCase()) ||
      loc.product.name.toLowerCase().includes(search.toLowerCase()) ||
      loc.product.sku.toLowerCase().includes(search.toLowerCase())
    );
  }) ?? [];

  const totalUnits = filteredLocations.reduce((s, l) => s + l.quantityOnHand, 0);
  const lowStockLocs = filteredLocations.filter((l) => l.quantityOnHand === 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: brand.navy[950] }}>Almacenes</h1>
        <p className="text-sm mt-0.5" style={{ color: '#64748B' }}>
          Vista de ubicaciones y stock por almacén
        </p>
      </div>

      {/* KPI cards globales */}
      {summary && summary.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          {/* Total almacenes */}
          <div style={glass} className="rounded-2xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: brand.orange[50] }}>
              <Warehouse size={18} style={{ color: brand.orange[500] }} />
            </div>
            <div>
              <div className="text-xl font-bold" style={{ color: brand.navy[950] }}>{summary.length}</div>
              <div className="text-xs" style={{ color: '#94A3B8' }}>Almacenes activos</div>
            </div>
          </div>
          {/* Total unidades */}
          <div style={glass} className="rounded-2xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#F0FDF4' }}>
              <BarChart3 size={18} style={{ color: brand.semantic.success }} />
            </div>
            <div>
              <div className="text-xl font-bold" style={{ color: brand.navy[950] }}>
                {summary.reduce((s, w) => s + w.totalUnits, 0).toLocaleString()}
              </div>
              <div className="text-xs" style={{ color: '#94A3B8' }}>Unidades totales</div>
            </div>
          </div>
          {/* Total SKUs */}
          <div style={glass} className="rounded-2xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#EFF6FF' }}>
              <Hash size={18} style={{ color: brand.semantic.info }} />
            </div>
            <div>
              <div className="text-xl font-bold" style={{ color: brand.navy[950] }}>
                {summary.reduce((s, w) => s + w.skuCount, 0).toLocaleString()}
              </div>
              <div className="text-xs" style={{ color: '#94A3B8' }}>SKUs en sistema</div>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-slate-400 text-sm">Cargando almacenes...</div>
      ) : filtered.length === 0 ? (
        <div style={glass} className="rounded-2xl flex flex-col items-center justify-center py-20 gap-3">
          <Warehouse size={48} style={{ color: '#CBD5E1' }} />
          <p className="text-slate-400 text-sm">No hay almacenes configurados</p>
          <a href="/settings" className="text-sm font-medium" style={{ color: brand.orange[500] }}>
            Crear almacén en Configuración →
          </a>
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-5">
          {/* Warehouse Selector */}
          <div className="col-span-3 space-y-3">
            {filtered.map((w) => (
              <button
                key={w.id}
                onClick={() => setSelectedWh(w.id)}
                className="w-full text-left rounded-2xl p-4 transition-all"
                style={selected?.id === w.id
                  ? { background: `linear-gradient(135deg, ${brand.navy[800]}, ${brand.navy[900]})`, boxShadow: '0 4px 20px rgba(10,22,40,0.20)' }
                  : { ...glass }
                }
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: selected?.id === w.id ? 'rgba(255,255,255,0.15)' : brand.orange[50] }}>
                    <Warehouse size={16} style={{ color: selected?.id === w.id ? '#FFFFFF' : brand.orange[500] }} />
                  </div>
                  <span className="font-semibold text-sm" style={{ color: selected?.id === w.id ? '#FFFFFF' : brand.navy[950] }}>
                    {w.name}
                  </span>
                </div>
                {w.address && (
                  <div className="flex items-center gap-1.5 text-xs" style={{ color: selected?.id === w.id ? 'rgba(255,255,255,0.6)' : '#94A3B8' }}>
                    <MapPin size={11} />
                    {w.address}
                  </div>
                )}
                <div className="mt-3 flex gap-4">
                  <div>
                    <div className="text-lg font-bold" style={{ color: selected?.id === w.id ? '#FFFFFF' : brand.navy[950] }}>
                      {w._count.locations}
                    </div>
                    <div className="text-xs" style={{ color: selected?.id === w.id ? 'rgba(255,255,255,0.6)' : '#94A3B8' }}>ubicaciones</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold" style={{ color: selected?.id === w.id ? '#FFFFFF' : brand.navy[950] }}>
                      {w.locations.reduce((s, l) => s + l.quantityOnHand, 0)}
                    </div>
                    <div className="text-xs" style={{ color: selected?.id === w.id ? 'rgba(255,255,255,0.6)' : '#94A3B8' }}>unidades</div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Location Grid */}
          <div className="col-span-9">
            {selected && (
              <>
                {/* Stats */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {[
                    { label: 'Total Ubicaciones', value: selected._count.locations, color: brand.navy[700] },
                    { label: 'Unidades en Stock', value: totalUnits, color: '#059669' },
                    { label: 'Ubicaciones Vacías', value: lowStockLocs.length, color: lowStockLocs.length > 0 ? '#DC2626' : '#059669' },
                  ].map((s) => (
                    <div key={s.label} style={glass} className="rounded-2xl p-4 text-center">
                      <div className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
                      <div className="text-xs text-slate-500 mt-1">{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Search */}
                <div style={glass} className="rounded-2xl p-3 mb-4 flex items-center gap-2">
                  <Search size={15} style={{ color: '#94A3B8' }} />
                  <input value={search} onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar por código de ubicación, producto o SKU..."
                    className="flex-1 text-sm bg-transparent outline-none" style={{ color: brand.navy[950] }} />
                </div>

                {/* Locations */}
                <div style={glass} className="rounded-2xl overflow-hidden">
                  {filteredLocations.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3">
                      <Package size={36} style={{ color: '#CBD5E1' }} />
                      <p className="text-slate-400 text-sm">No se encontraron ubicaciones</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr style={{ borderBottom: '1px solid rgba(10,22,40,0.08)' }}>
                            {['Ubicación', 'Producto', 'SKU', 'En Mano', 'Reservado', 'Estado'].map((h) => (
                              <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: '#94A3B8' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {filteredLocations.map((loc, i) => (
                            <tr key={loc.id} style={{
                              borderBottom: i < filteredLocations.length - 1 ? '1px solid rgba(10,22,40,0.05)' : 'none',
                              backgroundColor: loc.quantityOnHand === 0 ? 'rgba(220,38,38,0.03)' : i % 2 === 0 ? 'transparent' : 'rgba(10,22,40,0.015)',
                            }}>
                              <td className="px-4 py-3 font-mono text-xs font-bold" style={{ color: brand.orange[600] }}>
                                {loc.locationCode}
                              </td>
                              <td className="px-4 py-3 font-medium" style={{ color: brand.navy[950] }}>
                                {loc.product.name}
                              </td>
                              <td className="px-4 py-3 font-mono text-xs" style={{ color: brand.navy[600] }}>
                                {loc.product.sku}
                              </td>
                              <td className="px-4 py-3 font-bold text-center"
                                style={{ color: loc.quantityOnHand === 0 ? '#DC2626' : brand.navy[900] }}>
                                {loc.quantityOnHand}
                              </td>
                              <td className="px-4 py-3 text-center text-slate-500">
                                {loc.reservedQuantity}
                              </td>
                              <td className="px-4 py-3">
                                <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                                  style={loc.quantityOnHand === 0
                                    ? { backgroundColor: '#FEF2F2', color: '#991B1B' }
                                    : { backgroundColor: '#F0FDF4', color: '#166534' }
                                  }>
                                  {loc.quantityOnHand === 0 ? 'Vacío' : 'Con Stock'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

