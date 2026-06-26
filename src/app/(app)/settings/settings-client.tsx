'use client';

import React, { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { brand } from '@/lib/brand';
import { formatDate } from '@/lib/utils';
import { glass } from '@/lib/ui';
import { Plus, X, Users, Tag, Warehouse, Truck, Pencil, SlidersHorizontal, FileText } from 'lucide-react';

const TABS = [
  { id: 'users', label: 'Usuarios', icon: Users },
  { id: 'categories', label: 'Categorías', icon: Tag },
  { id: 'warehouses', label: 'Almacenes', icon: Warehouse },
  { id: 'suppliers', label: 'Proveedores', icon: Truck },
  { id: 'fiscal', label: 'Fiscal', icon: SlidersHorizontal },
] as const;

type Tab = typeof TABS[number]['id'];

const ROLES: Record<string, string> = {
  ADMIN: 'Administrador',
  MANAGER: 'Gerente',
  VENDOR: 'Vendedor',
  WAREHOUSE: 'Almacén',
  VIEWER: 'Visor',
};

export function SettingsClient() {
  const [tab, setTab] = useState<Tab>('users');
  const [modal, setModal] = useState('');
  const [error, setError] = useState('');

  // Users — create
  const [uName, setUName] = useState(''); const [uEmail, setUEmail] = useState('');
  const [uPass, setUPass] = useState(''); const [uRole, setURole] = useState('VENDOR');

  // Users — edit
  const [editUserId, setEditUserId] = useState('');
  const [editUserName, setEditUserName] = useState('');
  const [editUserRole, setEditUserRole] = useState('VENDOR');
  const [toggleError, setToggleError] = useState<Record<string, string>>({});

  // Categories — create
  const [catName, setCatName] = useState(''); const [catSlug, setCatSlug] = useState('');
  // Categories — edit
  const [editCatId, setEditCatId] = useState('');
  const [editCatName, setEditCatName] = useState('');
  const [editCatSlug, setEditCatSlug] = useState('');

  // Warehouses — create
  const [whName, setWhName] = useState(''); const [whAddr, setWhAddr] = useState('');
  // Warehouses — edit
  const [editWhId, setEditWhId] = useState('');
  const [editWhName, setEditWhName] = useState('');
  const [editWhAddr, setEditWhAddr] = useState('');
  // Warehouses — profile (emisor)
  const [editWhProfileId, setEditWhProfileId] = useState('');
  const [editWhLegalName, setEditWhLegalName] = useState('');
  const [editWhDisplayName, setEditWhDisplayName] = useState('');
  const [editWhCity, setEditWhCity] = useState('');
  const [editWhState, setEditWhState] = useState('PR');
  const [editWhZip, setEditWhZip] = useState('');
  const [editWhPhone, setEditWhPhone] = useState('');
  const [editWhEmail, setEditWhEmail] = useState('');
  const [editWhWebsite, setEditWhWebsite] = useState('');
  const [editWhEin, setEditWhEin] = useState('');
  const [editWhMerchant, setEditWhMerchant] = useState('');

  // Suppliers — create
  const [supName, setSupName] = useState(''); const [supCountry, setSupCountry] = useState('DO');
  const [supContact, setSupContact] = useState(''); const [supEmail, setSupEmail] = useState('');
  const [supPhone, setSupPhone] = useState(''); const [supTerms, setSupTerms] = useState('');
  // Suppliers — edit
  const [editSupId, setEditSupId] = useState('');
  const [editSupName, setEditSupName] = useState('');
  const [editSupContact, setEditSupContact] = useState('');
  const [editSupEmail, setEditSupEmail] = useState('');
  const [editSupPhone, setEditSupPhone] = useState('');
  const [editSupTerms, setEditSupTerms] = useState('');

  // Product Locations — create
  const [plWarehouseId, setPlWarehouseId] = useState('');
  const [plWarehouseName, setPlWarehouseName] = useState('');
  const [plProductId, setPlProductId] = useState('');
  const [plCode, setPlCode] = useState('');
  const [plQty, setPlQty] = useState(0);
  // Product Locations — edit
  const [editLocId,   setEditLocId]   = useState('');
  const [editLocCode, setEditLocCode] = useState('');
  // Warehouse expand state
  const [expandedWh,  setExpandedWh]  = useState<string | null>(null);

  const { data: sysConfig, refetch: refetchConfig } = trpc.settings.getSystemConfig.useQuery();
  const setConfig = trpc.settings.setSystemConfig.useMutation({ onSuccess: () => refetchConfig() });

  const [taxRateInput, setTaxRateInput] = useState('');
  const [salesTargetInput, setSalesTargetInput] = useState('');
  React.useEffect(() => {
    if (sysConfig?.TAX_RATE && taxRateInput === '') {
      setTaxRateInput((Number(sysConfig.TAX_RATE) * 100).toFixed(2));
    }
    if (sysConfig?.SALES_TARGET && salesTargetInput === '') {
      setSalesTargetInput(sysConfig.SALES_TARGET);
    }
  }, [sysConfig, taxRateInput, salesTargetInput]);

  const { data: users, refetch: refetchUsers } = trpc.settings.users.useQuery();
  const { data: categories, refetch: refetchCats } = trpc.settings.categories.useQuery();
  const { data: warehouses, refetch: refetchWh } = trpc.settings.warehouses.useQuery();
  const { data: suppliers, refetch: refetchSup } = trpc.settings.suppliers.useQuery();
  const { data: products } = trpc.products.list.useQuery({ pageSize: 500 });

  const createUser = trpc.settings.createUser.useMutation({
    onSuccess: () => { refetchUsers(); closeModal(); },
    onError: (e) => setError(e.message),
  });
  const createCat = trpc.settings.createCategory.useMutation({
    onSuccess: () => { refetchCats(); closeModal(); },
    onError: (e) => setError(e.message),
  });
  const createWh = trpc.settings.createWarehouse.useMutation({
    onSuccess: () => { refetchWh(); closeModal(); },
    onError: (e) => setError(e.message),
  });
  const createSup = trpc.settings.createSupplier.useMutation({
    onSuccess: () => { refetchSup(); closeModal(); },
    onError: (e) => setError(e.message),
  });
  const updateUser = trpc.settings.updateUser.useMutation({
    onSuccess: () => { refetchUsers(); closeModal(); setToggleError({}); },
    onError: (e, vars) => {
      if (modal === 'editUser') {
        setError(e.message);
      } else {
        setToggleError((prev) => ({ ...prev, [vars.id]: e.message }));
      }
    },
  });
  const createProductLoc = trpc.settings.createProductLocation.useMutation({
    onSuccess: () => { refetchWh(); closeModal(); },
    onError: (e) => setError(e.message),
  });
  const updateProductLoc = trpc.settings.updateProductLocation.useMutation({
    onSuccess: () => { refetchWh(); closeModal(); },
    onError: (e) => setError(e.message),
  });

  const updateCat = trpc.settings.updateCategory.useMutation({
    onSuccess: () => { refetchCats(); closeModal(); },
    onError: (e) => setError(e.message),
  });

  const updateWh = trpc.settings.updateWarehouse.useMutation({
    onSuccess: () => { refetchWh(); closeModal(); },
    onError: (e) => setError(e.message),
  });

  const updateWhProfile = trpc.settings.updateWarehouseProfile.useMutation({
    onSuccess: () => { refetchWh(); closeModal(); },
    onError: (e) => setError(e.message),
  });

  const updateSup = trpc.settings.updateSupplier.useMutation({
    onSuccess: () => { refetchSup(); closeModal(); },
    onError: (e) => setError(e.message),
  });

  function openEditUser(u: { id: string; name: string; role: string }) {
    setEditUserId(u.id);
    setEditUserName(u.name);
    setEditUserRole(u.role);
    setError('');
    setModal('editUser');
  }

  function closeModal() {
    setModal(''); setError('');
    setUName(''); setUEmail(''); setUPass(''); setURole('VENDOR');
    setEditUserId(''); setEditUserName(''); setEditUserRole('VENDOR');
    setCatName(''); setCatSlug('');
    setEditCatId(''); setEditCatName(''); setEditCatSlug('');
    setWhName(''); setWhAddr('');
    setEditWhId(''); setEditWhName(''); setEditWhAddr('');
    setSupName(''); setSupCountry('DO'); setSupContact(''); setSupEmail(''); setSupPhone(''); setSupTerms('');
    setEditSupId(''); setEditSupName(''); setEditSupContact(''); setEditSupEmail(''); setEditSupPhone(''); setEditSupTerms('');
    setPlWarehouseId(''); setPlWarehouseName(''); setPlProductId(''); setPlCode(''); setPlQty(0);
    setEditLocId(''); setEditLocCode('');
    setEditWhProfileId(''); setEditWhLegalName(''); setEditWhDisplayName('');
    setEditWhCity(''); setEditWhState('PR'); setEditWhZip('');
    setEditWhPhone(''); setEditWhEmail(''); setEditWhWebsite('');
    setEditWhEin(''); setEditWhMerchant('');
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: brand.navy[950] }}>Configuración</h1>
        <p className="text-sm mt-0.5" style={{ color: '#64748B' }}>Gestión de usuarios, categorías, almacenes y proveedores</p>
      </div>

      {/* Tabs */}
      <div style={glass} className="rounded-2xl p-1.5 flex gap-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all flex-1 justify-center"
            style={tab === t.id
              ? { backgroundColor: brand.orange[500], color: '#FFFFFF' }
              : { color: '#64748B' }
            }
          >
            <t.icon size={15} />
            {t.label}
          </button>
        ))}
      </div>

      {/* ── USERS ── */}
      {tab === 'users' && (
        <div style={glass} className="rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(10,22,40,0.08)' }}>
            <span className="font-semibold text-sm" style={{ color: brand.navy[950] }}>
              {users?.length ?? 0} usuarios
            </span>
            <button onClick={() => setModal('user')}
              className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-xl text-white"
              style={{ background: `linear-gradient(135deg, ${brand.orange[500]}, ${brand.orange[600]})` }}>
              <Plus size={14} /> Nuevo Usuario
            </button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(10,22,40,0.08)' }}>
                {['Nombre', 'Email', 'Rol', 'Estado', 'Último Login', ''].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: '#94A3B8' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users?.map((u, i) => (
                <React.Fragment key={u.id}>
                  <tr style={{
                    borderBottom: toggleError[u.id] ? 'none' : i < (users.length - 1) ? '1px solid rgba(10,22,40,0.05)' : 'none',
                    backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(10,22,40,0.015)',
                  }}>
                    <td className="px-5 py-3 font-medium" style={{ color: brand.navy[950] }}>{u.name}</td>
                    <td className="px-5 py-3 text-slate-500">{u.email}</td>
                    <td className="px-5 py-3">
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                        style={{ backgroundColor: u.role === 'ADMIN' ? brand.orange[50] : '#F1F5F9', color: u.role === 'ADMIN' ? brand.orange[600] : '#475569' }}>
                        {ROLES[u.role] ?? u.role}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                        style={{ backgroundColor: u.isActive ? '#F0FDF4' : '#FEF2F2', color: u.isActive ? '#166534' : '#991B1B' }}>
                        {u.isActive ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-400 text-xs">
                      {u.lastLoginAt ? formatDate(u.lastLoginAt) : 'Nunca'}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => openEditUser(u)}
                          className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border hover:bg-slate-50"
                          style={{ color: brand.navy[700] }}>
                          <Pencil size={11} /> Editar
                        </button>
                        {toggleError[u.id] ? (
                          <button
                            onClick={() => setToggleError((p) => { const n = { ...p }; delete n[u.id]; return n; })}
                            className="text-xs px-2 py-1 rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100">
                            ✕ Descartar
                          </button>
                        ) : (
                          <button
                            onClick={() => updateUser.mutate({ id: u.id, data: { isActive: !u.isActive } })}
                            disabled={updateUser.isPending}
                            className="text-xs px-2 py-1 rounded-lg border hover:bg-slate-50 disabled:opacity-50"
                            style={{ color: '#64748B' }}>
                            {u.isActive ? 'Desactivar' : 'Activar'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {toggleError[u.id] && (
                    <tr style={{ borderBottom: i < (users.length - 1) ? '1px solid rgba(10,22,40,0.05)' : 'none' }}>
                      <td colSpan={6} className="px-5 pb-3">
                        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{toggleError[u.id]}</div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── CATEGORIES ── */}
      {tab === 'categories' && (
        <div style={glass} className="rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(10,22,40,0.08)' }}>
            <span className="font-semibold text-sm" style={{ color: brand.navy[950] }}>
              {categories?.length ?? 0} categorías
            </span>
            <button onClick={() => setModal('category')}
              className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-xl text-white"
              style={{ background: `linear-gradient(135deg, ${brand.orange[500]}, ${brand.orange[600]})` }}>
              <Plus size={14} /> Nueva Categoría
            </button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(10,22,40,0.08)' }}>
                {['Nombre', 'Slug', 'Productos', 'Creada', ''].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: '#94A3B8' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categories?.map((c, i) => (
                <tr key={c.id} style={{ borderBottom: i < (categories.length - 1) ? '1px solid rgba(10,22,40,0.05)' : 'none' }}>
                  <td className="px-5 py-3 font-medium" style={{ color: brand.navy[950] }}>{c.name}</td>
                  <td className="px-5 py-3 font-mono text-xs text-slate-400">{c.slug}</td>
                  <td className="px-5 py-3" style={{ color: brand.navy[800] }}>{c._count.products}</td>
                  <td className="px-5 py-3 text-slate-400 text-xs">{formatDate(c.createdAt)}</td>
                  <td className="px-5 py-3">
                    <button onClick={() => { setEditCatId(c.id); setEditCatName(c.name); setEditCatSlug(c.slug); setError(''); setModal('editCategory'); }}
                      className="p-1.5 rounded-lg hover:bg-blue-50" title="Editar categoría">
                      <Pencil size={13} style={{ color: '#2563EB' }} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── WAREHOUSES ── */}
      {tab === 'warehouses' && (
        <div style={glass} className="rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(10,22,40,0.08)' }}>
            <span className="font-semibold text-sm" style={{ color: brand.navy[950] }}>
              {warehouses?.length ?? 0} almacenes
            </span>
            <button onClick={() => setModal('warehouse')}
              className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-xl text-white"
              style={{ background: `linear-gradient(135deg, ${brand.orange[500]}, ${brand.orange[600]})` }}>
              <Plus size={14} /> Nuevo Almacén
            </button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(10,22,40,0.08)' }}>
                {['Nombre', 'Dirección', 'Ubicaciones', 'Estado', ''].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: '#94A3B8' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {warehouses?.map((w, i) => (
                <React.Fragment key={w.id}>
                  <tr style={{ borderBottom: '1px solid rgba(10,22,40,0.05)' }}>
                    <td className="px-5 py-3 font-medium" style={{ color: brand.navy[950] }}>{w.name}</td>
                    <td className="px-5 py-3 text-slate-500">{w.address ?? '—'}</td>
                    <td className="px-5 py-3">
                      <button
                        onClick={() => setExpandedWh(expandedWh === w.id ? null : w.id)}
                        className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-lg hover:bg-slate-100 transition-colors"
                        style={{ color: brand.navy[700] }}
                        title="Ver ubicaciones"
                      >
                        {w._count.locations} ubicaciones
                        <span style={{ fontSize: 10 }}>{expandedWh === w.id ? '▲' : '▼'}</span>
                      </button>
                    </td>
                    <td className="px-5 py-3">
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                        style={{ backgroundColor: '#F0FDF4', color: '#166534' }}>Activo</span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => { setEditWhId(w.id); setEditWhName(w.name); setEditWhAddr(w.address ?? ''); setError(''); setModal('editWarehouse'); }}
                          className="p-1.5 rounded-lg hover:bg-blue-50" title="Editar almacén">
                          <Pencil size={13} style={{ color: '#2563EB' }} />
                        </button>
                        <button
                          onClick={() => {
                            setEditWhProfileId(w.id);
                            setEditWhLegalName(w.legalName ?? '');
                            setEditWhDisplayName(w.displayName ?? '');
                            setEditWhCity(w.city ?? '');
                            setEditWhState(w.state ?? 'PR');
                            setEditWhZip(w.zipCode ?? '');
                            setEditWhPhone(w.phone ?? '');
                            setEditWhEmail(w.email ?? '');
                            setEditWhWebsite(w.website ?? '');
                            setEditWhEin(w.ein ?? '');
                            setEditWhMerchant(w.merchantRegistration ?? '');
                            setError('');
                            setModal('editWarehouseProfile');
                          }}
                          className="p-1.5 rounded-lg hover:bg-orange-50"
                          title="Perfil de emisor (datos para facturas)">
                          <FileText size={13} style={{ color: brand.orange[500] }} />
                        </button>
                        <button
                          onClick={() => { setPlWarehouseId(w.id); setPlWarehouseName(w.name); setModal('location'); }}
                          className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border hover:bg-slate-50"
                          style={{ color: brand.navy[700] }}>
                          <Plus size={12} /> Ubicación
                        </button>
                      </div>
                    </td>
                  </tr>
                  {/* Expanded locations sub-table */}
                  {expandedWh === w.id && (
                    <tr>
                      <td colSpan={5} className="px-5 pb-4 pt-0">
                        {(w.locations as unknown as Array<{ id: string; locationCode: string; quantityOnHand: number; reservedQuantity: number; productId: string; product: { name: string; sku: string } }>).length === 0 ? (
                          <p className="text-xs py-2" style={{ color: '#94A3B8' }}>Sin ubicaciones. Usá el botón "+ Ubicación" para agregar.</p>
                        ) : (
                          <table className="w-full text-xs rounded-xl overflow-hidden" style={{ backgroundColor: 'rgba(10,22,40,0.03)' }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid rgba(10,22,40,0.06)' }}>
                                {['Código', 'Producto', 'SKU', 'En mano', 'Reservado', ''].map((h) => (
                                  <th key={h} className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wide" style={{ color: '#94A3B8' }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {(w.locations as unknown as Array<{ id: string; locationCode: string; quantityOnHand: number; reservedQuantity: number; productId: string; product: { name: string; sku: string } }>).map((loc) => (
                                <tr key={loc.id} style={{ borderBottom: '1px solid rgba(10,22,40,0.04)' }}>
                                  <td className="px-3 py-2 font-mono font-semibold" style={{ color: brand.navy[800] }}>{loc.locationCode}</td>
                                  <td className="px-3 py-2" style={{ color: brand.navy[700] }}>{loc.product.name}</td>
                                  <td className="px-3 py-2 font-mono" style={{ color: '#94A3B8' }}>{loc.product.sku}</td>
                                  <td className="px-3 py-2 text-center font-semibold" style={{ color: brand.semantic.success }}>{loc.quantityOnHand}</td>
                                  <td className="px-3 py-2 text-center" style={{ color: '#64748B' }}>{loc.reservedQuantity}</td>
                                  <td className="px-3 py-2">
                                    <button
                                      onClick={() => { setEditLocId(loc.id); setEditLocCode(loc.locationCode); setError(''); setModal('editLocation'); }}
                                      className="p-1 rounded hover:bg-blue-50" title="Editar código de ubicación">
                                      <Pencil size={11} style={{ color: '#2563EB' }} />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── SUPPLIERS ── */}
      {tab === 'suppliers' && (
        <div style={glass} className="rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(10,22,40,0.08)' }}>
            <span className="font-semibold text-sm" style={{ color: brand.navy[950] }}>
              {suppliers?.length ?? 0} proveedores
            </span>
            <button onClick={() => setModal('supplier')}
              className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-xl text-white"
              style={{ background: `linear-gradient(135deg, ${brand.orange[500]}, ${brand.orange[600]})` }}>
              <Plus size={14} /> Nuevo Proveedor
            </button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(10,22,40,0.08)' }}>
                {['Proveedor', 'País', 'Contacto', 'Productos', 'OC', 'Estado'].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: '#94A3B8' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {suppliers?.map((s, i) => (
                <tr key={s.id} style={{ borderBottom: i < (suppliers.length - 1) ? '1px solid rgba(10,22,40,0.05)' : 'none' }}>
                  <td className="px-5 py-3 font-medium" style={{ color: brand.navy[950] }}>
                    {s.name}
                    {s.contactEmail && <div className="text-xs text-slate-400">{s.contactEmail}</div>}
                  </td>
                  <td className="px-5 py-3">
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                      style={{ backgroundColor: s.country === 'DO' ? '#FEF9C3' : '#EFF6FF', color: s.country === 'DO' ? '#854D0E' : '#1D4ED8' }}>
                      {s.country}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-500">{s.contactName ?? '—'}</td>
                  <td className="px-5 py-3" style={{ color: brand.navy[800] }}>{s._count.products}</td>
                  <td className="px-5 py-3" style={{ color: brand.navy[800] }}>{s._count.purchaseOrders}</td>
                  <td className="px-5 py-3">
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                      style={{ backgroundColor: s.isActive ? '#F0FDF4' : '#FEF2F2', color: s.isActive ? '#166534' : '#991B1B' }}>
                      {s.isActive ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <button onClick={() => { setEditSupId(s.id); setEditSupName(s.name); setEditSupContact(s.contactName ?? ''); setEditSupEmail(s.contactEmail ?? ''); setEditSupPhone(s.contactPhone ?? ''); setEditSupTerms(s.paymentTerms ?? ''); setError(''); setModal('editSupplier'); }}
                      className="p-1.5 rounded-lg hover:bg-blue-50" title="Editar proveedor">
                      <Pencil size={13} style={{ color: '#2563EB' }} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── FISCAL ── */}
      {tab === 'fiscal' && (
        <div className="space-y-4">
          <div style={glass} className="rounded-2xl p-6 max-w-lg mb-4">
            <h2 className="font-bold text-sm mb-1" style={{ color: brand.navy[950] }}>Meta de Ventas Diaria</h2>
            <p className="text-xs mb-4" style={{ color: '#64748B' }}>
              Línea de meta que aparece en el gráfico de ventas del dashboard.
            </p>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>Meta diaria ($)</label>
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white">
                  <span className="text-sm font-bold" style={{ color: '#94A3B8' }}>$</span>
                  <input type="number" step="100" min="0" value={salesTargetInput}
                    onChange={(e) => setSalesTargetInput(e.target.value)}
                    className="flex-1 text-sm outline-none font-mono" style={{ color: brand.navy[900] }} />
                </div>
              </div>
              <button
                onClick={() => { const v = Number(salesTargetInput); if (!isNaN(v) && v >= 0) setConfig.mutate({ key: 'SALES_TARGET', value: String(v) }); }}
                disabled={setConfig.isPending}
                className="px-4 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
                style={{ background: `linear-gradient(135deg, ${brand.orange[500]}, ${brand.orange[600]})` }}>
                Guardar
              </button>
            </div>
            <div className="mt-3 p-3 rounded-xl" style={{ backgroundColor: 'rgba(10,22,40,0.03)' }}>
              <div className="text-xs font-semibold mb-1" style={{ color: brand.navy[700] }}>Meta actual</div>
              <div className="text-lg font-bold font-mono" style={{ color: brand.orange[500] }}>
                ${sysConfig?.SALES_TARGET ? Number(sysConfig.SALES_TARGET).toLocaleString() : '5,000'}/día
              </div>
            </div>
          </div>

          <div style={glass} className="rounded-2xl p-6 max-w-lg">
            <h2 className="font-bold text-sm mb-1" style={{ color: brand.navy[950] }}>Impuesto sobre Ventas (IVU)</h2>
            <p className="text-xs mb-4" style={{ color: '#64748B' }}>
              Puerto Rico: 10.5% estatal + hasta 1% municipal = 11.5% estándar.
              Este valor se aplica automáticamente a todas las facturas y el POS.
            </p>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>
                  Tasa IVU (%)
                </label>
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="25"
                    value={taxRateInput}
                    onChange={(e) => setTaxRateInput(e.target.value)}
                    className="flex-1 text-sm outline-none font-mono"
                    style={{ color: brand.navy[900] }}
                  />
                  <span className="text-sm font-bold" style={{ color: '#94A3B8' }}>%</span>
                </div>
              </div>
              <button
                onClick={() => {
                  const pct = Number(taxRateInput);
                  if (isNaN(pct) || pct < 0 || pct > 25) return;
                  setConfig.mutate({ key: 'TAX_RATE', value: (pct / 100).toFixed(4) });
                }}
                disabled={setConfig.isPending}
                className="px-4 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
                style={{ background: `linear-gradient(135deg, ${brand.orange[500]}, ${brand.orange[600]})` }}>
                {setConfig.isPending ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
            {setConfig.isSuccess && (
              <p className="text-xs mt-3 font-medium" style={{ color: '#16A34A' }}>
                Tasa actualizada a {taxRateInput}% — se aplicará en todas las facturas nuevas.
              </p>
            )}
            <div className="mt-4 p-3 rounded-xl" style={{ backgroundColor: 'rgba(10,22,40,0.03)' }}>
              <div className="text-xs font-semibold mb-1" style={{ color: brand.navy[700] }}>Tasa actual en base de datos</div>
              <div className="text-lg font-bold font-mono" style={{ color: brand.orange[500] }}>
                {sysConfig?.TAX_RATE ? (Number(sysConfig.TAX_RATE) * 100).toFixed(2) : '—'}%
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" style={{ backdropFilter: 'blur(4px)' }} onClick={closeModal} />
          <div className={`relative w-full mx-4 rounded-2xl p-6 ${modal === 'editWarehouseProfile' ? 'max-w-lg' : 'max-w-md'}`}
            style={{ background: 'rgba(255,255,255,0.97)', boxShadow: '0 24px 64px rgba(10,22,40,0.18)' }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-bold" style={{ color: brand.navy[950] }}>
                {modal === 'user' ? 'Nuevo Usuario'
                  : modal === 'editUser' ? 'Editar Usuario'
                  : modal === 'category' ? 'Nueva Categoría'
                  : modal === 'editCategory' ? 'Editar Categoría'
                  : modal === 'warehouse' ? 'Nuevo Almacén'
                  : modal === 'editWarehouse' ? 'Editar Almacén'
                  : modal === 'location' ? 'Agregar Ubicación'
                  : modal === 'editLocation' ? 'Editar Ubicación'
                  : modal === 'editSupplier' ? 'Editar Proveedor'
                  : modal === 'editWarehouseProfile' ? `Perfil — ${warehouses?.find((w) => w.id === editWhProfileId)?.name ?? ''}`
                  : 'Nuevo Proveedor'}
              </h2>
              <button onClick={closeModal}><X size={18} style={{ color: '#64748B' }} /></button>
            </div>
            {error && <div className="mb-4 px-3 py-2 rounded-xl text-sm text-red-700 bg-red-50 border border-red-200">{error}</div>}

            {modal === 'user' && (
              <div className="space-y-3">
                <F label="Nombre *"><input value={uName} onChange={(e) => setUName(e.target.value)} placeholder="Nombre completo" /></F>
                <F label="Email *"><input type="email" value={uEmail} onChange={(e) => setUEmail(e.target.value)} placeholder="usuario@buildershouse.pr" /></F>
                <F label="Contraseña *"><input type="password" value={uPass} onChange={(e) => setUPass(e.target.value)} placeholder="Mínimo 8 caracteres" /></F>
                <F label="Rol">
                  <select value={uRole} onChange={(e) => setURole(e.target.value)}>
                    {Object.entries(ROLES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </F>
                <Btns
                  onCancel={closeModal}
                  onConfirm={() => createUser.mutate({ name: uName, email: uEmail, password: uPass, role: uRole as 'ADMIN' | 'MANAGER' | 'VENDOR' | 'WAREHOUSE' | 'VIEWER' })}
                  loading={createUser.isPending}
                  label="Crear Usuario"
                />
              </div>
            )}

            {modal === 'editUser' && (
              <div className="space-y-3">
                <F label="Nombre *">
                  <input value={editUserName} onChange={(e) => setEditUserName(e.target.value)} placeholder="Nombre completo" />
                </F>
                <F label="Rol">
                  <select value={editUserRole} onChange={(e) => setEditUserRole(e.target.value)}>
                    {Object.entries(ROLES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </F>
                <Btns
                  onCancel={closeModal}
                  onConfirm={() => updateUser.mutate({
                    id: editUserId,
                    data: { name: editUserName, role: editUserRole as 'ADMIN' | 'MANAGER' | 'VENDOR' | 'WAREHOUSE' | 'VIEWER' },
                  })}
                  loading={updateUser.isPending}
                  label="Guardar Cambios"
                />
              </div>
            )}

            {modal === 'category' && (
              <div className="space-y-3">
                <F label="Nombre *"><input value={catName} onChange={(e) => {
                  setCatName(e.target.value);
                  setCatSlug(e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''));
                }} placeholder="Ej: Ventanas Corredizas" /></F>
                <F label="Slug"><input value={catSlug} onChange={(e) => setCatSlug(e.target.value)} placeholder="ventanas-corredizas" /></F>
                <Btns onCancel={closeModal} onConfirm={() => createCat.mutate({ name: catName, slug: catSlug })} loading={createCat.isPending} label="Crear Categoría" />
              </div>
            )}

            {modal === 'editLocation' && (
              <div className="space-y-3">
                <p className="text-xs" style={{ color: '#64748B' }}>
                  Solo se puede cambiar el código de ubicación. Para mover stock usá Ajustes o Transferencias.
                </p>
                <F label="Código de Ubicación *">
                  <input
                    value={editLocCode}
                    onChange={(e) => setEditLocCode(e.target.value)}
                    placeholder="Ej: A-12-03"
                    autoFocus
                  />
                </F>
                <Btns
                  onCancel={closeModal}
                  onConfirm={() => updateProductLoc.mutate({ id: editLocId, locationCode: editLocCode })}
                  loading={updateProductLoc.isPending}
                  label="Guardar Cambios"
                />
              </div>
            )}

            {modal === 'warehouse' && (
              <div className="space-y-3">
                <F label="Nombre *"><input value={whName} onChange={(e) => setWhName(e.target.value)} placeholder="Almacén Principal" /></F>
                <F label="Dirección"><input value={whAddr} onChange={(e) => setWhAddr(e.target.value)} placeholder="Dirección física" /></F>
                <Btns onCancel={closeModal} onConfirm={() => createWh.mutate({ name: whName, address: whAddr || undefined })} loading={createWh.isPending} label="Crear Almacén" />
              </div>
            )}

            {modal === 'location' && (
              <div className="space-y-3">
                <div className="text-xs mb-2" style={{ color: '#64748B' }}>
                  Almacén: <strong style={{ color: brand.navy[800] }}>{plWarehouseName}</strong>
                </div>
                <F label="Producto *">
                  <select value={plProductId} onChange={(e) => setPlProductId(e.target.value)}>
                    <option value="">Seleccionar producto...</option>
                    {products?.products.map((p) => (
                      <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>
                    ))}
                  </select>
                </F>
                <F label="Código de Ubicación *">
                  <input value={plCode} onChange={(e) => setPlCode(e.target.value)} placeholder="Ej: A-12-03" />
                </F>
                <F label="Stock Inicial">
                  <input type="number" min="0" value={plQty} onChange={(e) => setPlQty(Number(e.target.value))} />
                </F>
                <Btns
                  onCancel={closeModal}
                  onConfirm={() => createProductLoc.mutate({
                    warehouseId: plWarehouseId,
                    productId: plProductId,
                    locationCode: plCode,
                    quantityOnHand: plQty,
                  })}
                  loading={createProductLoc.isPending}
                  label="Crear Ubicación"
                />
              </div>
            )}

            {modal === 'supplier' && (
              <div className="space-y-3">
                <F label="Nombre *"><input value={supName} onChange={(e) => setSupName(e.target.value)} placeholder="Nombre del proveedor" /></F>
                <F label="País">
                  <select value={supCountry} onChange={(e) => setSupCountry(e.target.value)}>
                    <option value="DO">República Dominicana</option>
                    <option value="PR">Puerto Rico</option>
                    <option value="US">Estados Unidos</option>
                  </select>
                </F>
                <F label="Nombre del Contacto"><input value={supContact} onChange={(e) => setSupContact(e.target.value)} placeholder="Nombre" /></F>
                <F label="Email Contacto"><input type="email" value={supEmail} onChange={(e) => setSupEmail(e.target.value)} placeholder="contacto@proveedor.com" /></F>
                <F label="Teléfono"><input value={supPhone} onChange={(e) => setSupPhone(e.target.value)} placeholder="+1 (809) 000-0000" /></F>
                <F label="Términos de Pago"><input value={supTerms} onChange={(e) => setSupTerms(e.target.value)} placeholder="Net 30, 50% adelanto..." /></F>
                <Btns onCancel={closeModal} onConfirm={() => createSup.mutate({
                  name: supName, country: supCountry as 'DO' | 'PR' | 'US',
                  contactName: supContact || undefined, contactEmail: supEmail || undefined,
                  contactPhone: supPhone || undefined, paymentTerms: supTerms || undefined,
                })} loading={createSup.isPending} label="Crear Proveedor" />
              </div>
            )}

            {modal === 'editCategory' && (
              <div className="space-y-3">
                <F label="Nombre *"><input value={editCatName} onChange={(e) => setEditCatName(e.target.value)} placeholder="Ej: Ventanas de Seguridad" /></F>
                <F label="Slug *"><input value={editCatSlug} onChange={(e) => setEditCatSlug(e.target.value)} placeholder="ej: ventanas-seguridad" /></F>
                <Btns onCancel={closeModal} onConfirm={() => updateCat.mutate({ id: editCatId, data: { name: editCatName, slug: editCatSlug } })} loading={updateCat.isPending} label="Guardar Cambios" />
              </div>
            )}

            {modal === 'editWarehouse' && (
              <div className="space-y-3">
                <F label="Nombre *"><input value={editWhName} onChange={(e) => setEditWhName(e.target.value)} placeholder="Ej: Ponce" /></F>
                <F label="Dirección"><input value={editWhAddr} onChange={(e) => setEditWhAddr(e.target.value)} placeholder="Ej: Ponce, Puerto Rico" /></F>
                <Btns onCancel={closeModal} onConfirm={() => updateWh.mutate({ id: editWhId, data: { name: editWhName, address: editWhAddr || undefined } })} loading={updateWh.isPending} label="Guardar Cambios" />
              </div>
            )}

            {modal === 'editWarehouseProfile' && (
              <div className="space-y-3">
                <p className="text-xs" style={{ color: '#64748B' }}>
                  Datos legales y de contacto para facturas. Todos los campos son opcionales.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <F label="Razón Social Legal"><input value={editWhLegalName} onChange={(e) => setEditWhLegalName(e.target.value)} placeholder="The Builder's House LLC" /></F>
                  <F label="Nombre en Documentos"><input value={editWhDisplayName} onChange={(e) => setEditWhDisplayName(e.target.value)} placeholder="The Builder's House" /></F>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <F label="Ciudad"><input value={editWhCity} onChange={(e) => setEditWhCity(e.target.value)} placeholder="San Juan" /></F>
                  <F label="Estado / Territorio"><input value={editWhState} onChange={(e) => setEditWhState(e.target.value)} placeholder="PR" /></F>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <F label="Código Postal"><input value={editWhZip} onChange={(e) => setEditWhZip(e.target.value)} placeholder="00901" /></F>
                  <F label="Teléfono"><input value={editWhPhone} onChange={(e) => setEditWhPhone(e.target.value)} placeholder="(787) 000-0000" /></F>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <F label="Email"><input type="email" value={editWhEmail} onChange={(e) => setEditWhEmail(e.target.value)} placeholder="info@buildershouse.pr" /></F>
                  <F label="Website"><input value={editWhWebsite} onChange={(e) => setEditWhWebsite(e.target.value)} placeholder="thebuildershouse.pr" /></F>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <F label="EIN (Federal)"><input value={editWhEin} onChange={(e) => setEditWhEin(e.target.value)} placeholder="XX-XXXXXXX" /></F>
                  <F label="Registro de Comerciante"><input value={editWhMerchant} onChange={(e) => setEditWhMerchant(e.target.value)} placeholder="Número PR" /></F>
                </div>
                <Btns
                  onCancel={closeModal}
                  onConfirm={() => updateWhProfile.mutate({
                    id: editWhProfileId,
                    legalName: editWhLegalName,
                    displayName: editWhDisplayName,
                    city: editWhCity,
                    state: editWhState,
                    zipCode: editWhZip,
                    phone: editWhPhone,
                    email: editWhEmail,
                    website: editWhWebsite,
                    ein: editWhEin,
                    merchantRegistration: editWhMerchant,
                  })}
                  loading={updateWhProfile.isPending}
                  label="Guardar Perfil"
                />
              </div>
            )}

            {modal === 'editSupplier' && (
              <div className="space-y-3">
                <F label="Nombre *"><input value={editSupName} onChange={(e) => setEditSupName(e.target.value)} placeholder="Nombre del proveedor" /></F>
                <F label="Contacto"><input value={editSupContact} onChange={(e) => setEditSupContact(e.target.value)} placeholder="Nombre del contacto" /></F>
                <F label="Email"><input type="email" value={editSupEmail} onChange={(e) => setEditSupEmail(e.target.value)} placeholder="contacto@proveedor.com" /></F>
                <F label="Teléfono"><input value={editSupPhone} onChange={(e) => setEditSupPhone(e.target.value)} placeholder="+1 (000) 000-0000" /></F>
                <F label="Términos de pago"><input value={editSupTerms} onChange={(e) => setEditSupTerms(e.target.value)} placeholder="NET-30, COD, etc." /></F>
                <Btns onCancel={closeModal} onConfirm={() => updateSup.mutate({ id: editSupId, data: { name: editSupName, contactName: editSupContact || undefined, contactEmail: editSupEmail || undefined, contactPhone: editSupPhone || undefined, paymentTerms: editSupTerms || undefined } })} loading={updateSup.isPending} label="Guardar Cambios" />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactElement<React.HTMLAttributes<HTMLElement>> }) {
  return (
    <div>
      <label className="block text-xs font-semibold mb-1.5" style={{ color: brand.navy[700] }}>{label}</label>
      {React.cloneElement(children, {
        className: 'w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none',
        style: { color: brand.navy[900] },
      })}
    </div>
  );
}


function Btns({ onCancel, onConfirm, loading, label }: {
  onCancel: () => void; onConfirm: () => void; loading: boolean; label: string;
}) {
  return (
    <div className="flex gap-3 pt-2">
      <button onClick={onCancel} className="flex-1 py-2 rounded-xl text-sm border hover:bg-slate-50" style={{ color: '#64748B' }}>Cancelar</button>
      <button onClick={onConfirm} disabled={loading}
        className="flex-1 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-60"
        style={{ background: `linear-gradient(135deg, ${brand.orange[500]}, ${brand.orange[600]})` }}>
        {loading ? 'Guardando...' : label}
      </button>
    </div>
  );
}

