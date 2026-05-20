'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Package, ScanLine, Warehouse, Receipt,
  Users, Truck, BarChart3, Shield, Settings, ChevronDown,
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
  const initials = user.name
    ? user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : '??';

  return (
    <aside
      className="w-64 flex flex-col flex-shrink-0"
      style={{ backgroundColor: brand.navy[950] }}
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
        <NavSection label="Operación" />
        <NavItem icon={LayoutDashboard} label="Dashboard" href="/dashboard" />
        <NavItem icon={Package} label="Inventario" href="/inventory" badge="383" />
        <NavItem icon={ScanLine} label="Escaneo" href="/scan" />
        <NavItem icon={Warehouse} label="Warehouse" href="/warehouse" />

        <NavSection label="Comercial" />
        <NavItem icon={Receipt} label="Facturación" href="/invoicing" />
        <NavItem icon={Users} label="Clientes" href="/customers" />
        <NavItem icon={Truck} label="Compras · RD" href="/purchases" badge="3" />

        <NavSection label="Inteligencia" />
        <NavItem icon={BarChart3} label="Reportes" href="/reports" />
        <NavItem icon={Shield} label="Auditoría" href="/audit" />
        <NavItem icon={Settings} label="Configuración" href="/settings" />
      </nav>

      {/* Usuario */}
      <div className="p-3 border-t" style={{ borderColor: brand.navy[800] }}>
        <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-white/5 cursor-pointer">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
            style={{
              background: `linear-gradient(135deg, ${brand.orange[500]} 0%, ${brand.orange[600]} 100%)`,
            }}
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-white truncate">{user.name ?? 'Usuario'}</div>
            <div className="text-[11px] truncate" style={{ color: '#94A3B8' }}>
              {user.email}
            </div>
          </div>
          <ChevronDown size={14} style={{ color: '#94A3B8' }} />
        </div>
      </div>
    </aside>
  );
}
