'use client';

import { ArrowLeftRight } from 'lucide-react';
import { brand } from '@/lib/brand';

const glass = {
  backgroundColor: 'rgba(255,255,255,0.72)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: '1px solid rgba(255,255,255,0.85)',
  boxShadow: '0 4px 24px rgba(10,22,40,0.07)',
} as React.CSSProperties;

export function TransfersClient() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: brand.navy[950] }}>Transferencias</h1>
        <p className="text-sm mt-0.5" style={{ color: '#64748B' }}>
          Mover stock entre almacenes (San Juan ↔ Ponce)
        </p>
      </div>
      <div style={glass} className="rounded-2xl flex flex-col items-center justify-center py-24 gap-3">
        <ArrowLeftRight size={48} style={{ color: '#CBD5E1' }} />
        <p className="text-slate-400 text-sm">Módulo en construcción</p>
      </div>
    </div>
  );
}
