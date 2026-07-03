'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import { signOut } from 'next-auth/react';
import {
  LayoutDashboard, Package, ScanLine, Warehouse, Receipt,
  Users, Truck, BarChart3, Shield, Settings, ChevronDown,
  ShoppingCart, ClipboardCheck, ArrowLeftRight, PackagePlus,
  SlidersHorizontal, RotateCcw, Landmark, LogOut,
} from 'lucide-react';
import { Logo } from '@/components/brand/logo';
import { brand } from '@/lib/brand';

interface SidebarUser {
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

interface NavItemProps {
  icon: React.ElementType;
  label: string;
  href: string;
  badge?: string;
}

function NavItem({ icon: Icon, label, href, badge }: NavItemProps) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(href + '/');

  return (
    <Link
      href={href}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all"
      style={{
        backgroundColor: active ? brand.orange[500] : 'transparent',
        color: active ? '#FFFFFF' : '#94A3B8',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.backgroundColor = brand.navy[800];
          e.currentTarget.style.color = '#FFFFFF';
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.backgroundColor = 'transparent';
          e.currentTarget.style.color = '#94A3B8';
        }
      }}
    >
      <Icon size={17} strokeWidth={2} />
      <span className="flex-1 text-left">{label}</span>
      {badge && (
        <span
          className="text-[10px] px-1.5 py-0.5 rounded-md font-semibold"
          style={{
            backgroundColor: active ? 'rgba(255,255,255,0.2)' : brand.navy[700],
            color: active ? '#FFFFFF' : '#CBD5E1',
          }}
        >
          {badge}
        </span>
      )}
    </Link>
  );
}

function NavSection({ label }: { label: string }) {
  return (
    <div
      className="text-[10px] font-semibold uppercase tracking-[0.15em] px-3 mb-2 mt-5"
      style={{ color: '#64748B' }}
    >
      {label}
    </div>
  );
}

export function Sidebar({ user }: { user: SidebarUser }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const initials = user.name
    ? user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : '??';

  return (
    <aside
      className="w-64 flex flex-col shrink-0"
      style={{
        backgroundColor: 'rgba(10,22,40,0.92)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderRight: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Logo */}
      <div
        className="px-5 py-5 border-b"
        style={{ borderColor: brand.navy[800] }}
      >
        <Logo size="sm" variant="full" theme="dark" />
      </div>

      {/* Navegación */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">

        {/* 1 — DASHBOARD */}
        <NavItem icon={LayoutDashboard} label="Dashboard" href="/dashboard" />

        {/* 2 — OPERACIONES */}
        <NavSection label="Operaciones" />
        <NavItem icon={PackagePlus} label="Recibir Mercancía" href="/operations/receive" />
        <NavItem icon={ArrowLeftRight} label="Transferencias" href="/operations/transfers" />
        <NavItem icon={SlidersHorizontal} label="Ajustes de Stock" href="/operations/adjustments" />
        <NavItem icon={RotateCcw} label="Devoluciones" href="/operations/returns" />
        <NavItem icon={ScanLine} label="Escaneo" href="/scan" />
        <NavItem icon={ClipboardCheck} label="Conteos Cíclicos" href="/cycle-counts" />

        {/* 3 — INVENTARIO */}
        <NavSection label="Inventario" />
        <NavItem icon={Package} label="Productos" href="/inventory" />
        <NavItem icon={Warehouse} label="Almacenes" href="/warehouse" />

        {/* 4 — COMPRAS */}
        <NavSection label="Compras · RD" />
        <NavItem icon={Truck} label="Órdenes de Compra" href="/purchases" />

        {/* 5 — VENTAS */}
        <NavSection label="Ventas" />
        <NavItem icon={ShoppingCart} label="POS" href="/pos" />
        <NavItem icon={Receipt} label="Facturación" href="/invoicing" />
        <NavItem icon={Landmark} label="CXC" href="/cxc" />
        <NavItem icon={Users} label="Clientes" href="/customers" />

        {/* 6 — INTELIGENCIA */}
        <NavSection label="Inteligencia" />
        <NavItem icon={BarChart3} label="Reportes" href="/reports" />
        <NavItem icon={Shield} label="Auditoría" href="/audit" />

        {/* 7 — ADMINISTRACIÓN */}
        <NavSection label="Administración" />
        <NavItem icon={Settings} label="Configuración" href="/settings" />

      </nav>

      {/* Usuario */}
      <div className="p-3 border-t relative" style={{ borderColor: brand.navy[800] }} ref={menuRef}>
        {/* Dropdown menu — aparece arriba del área de usuario */}
        {menuOpen && (
          <div
            className="absolute bottom-full left-3 right-3 mb-1 rounded-lg overflow-hidden shadow-xl"
            style={{
              backgroundColor: brand.navy[800],
              border: `1px solid rgba(255,255,255,0.08)`,
            }}
          >
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left transition-colors"
              style={{ color: '#F87171' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(248,113,113,0.1)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <LogOut size={15} strokeWidth={2} />
              <span className="font-medium">Cerrar sesión</span>
            </button>
          </div>
        )}

        <button
          onClick={() => setMenuOpen((o) => !o)}
          className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg transition-colors"
          style={{ backgroundColor: menuOpen ? 'rgba(255,255,255,0.08)' : 'transparent' }}
          onMouseEnter={(e) => { if (!menuOpen) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'; }}
          onMouseLeave={(e) => { if (!menuOpen) e.currentTarget.style.backgroundColor = 'transparent'; }}
        >
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
            style={{
              background: `linear-gradient(135deg, ${brand.orange[500]} 0%, ${brand.orange[600]} 100%)`,
            }}
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0 text-left">
            <div className="text-xs font-semibold text-white truncate">{user.name ?? 'Usuario'}</div>
            <div className="text-[11px] truncate" style={{ color: '#94A3B8' }}>
              {user.email}
            </div>
          </div>
          <ChevronDown
            size={14}
            style={{
              color: '#94A3B8',
              transform: menuOpen ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 150ms',
            }}
          />
        </button>
      </div>
    </aside>
  );
}
