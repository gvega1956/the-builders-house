'use client';

import { brand } from '@/lib/brand';

type LogoSize = 'sm' | 'md' | 'lg' | 'xl';
type LogoVariant = 'full' | 'mark';
type LogoTheme = 'dark' | 'light';

interface LogoProps {
  size?: LogoSize;
  variant?: LogoVariant;
  theme?: LogoTheme;
}

const sizes = {
  sm: { mark: 28, text: 'text-sm', sub: 'text-[9px]' },
  md: { mark: 44, text: 'text-lg', sub: 'text-[10px]' },
  lg: { mark: 72, text: 'text-2xl', sub: 'text-xs' },
  xl: { mark: 120, text: 'text-4xl', sub: 'text-sm' },
};

export function Logo({ size = 'md', variant = 'full', theme = 'dark' }: LogoProps) {
  const s = sizes[size];
  const bg = theme === 'dark' ? brand.navy[950] : '#FFFFFF';
  const fg = theme === 'dark' ? '#FFFFFF' : brand.navy[950];
  const accent = brand.orange[500];

  return (
    <div className="flex items-center gap-3">
      <svg width={s.mark} height={s.mark} viewBox="0 0 64 64" fill="none" aria-label="The Builder's House">
        <rect width="64" height="64" rx="12" fill={bg} />
        {/* Puerta — izquierda */}
        <rect x="12" y="14" width="16" height="38" rx="1.5" fill={accent} />
        {/* Manija de puerta */}
        <circle cx="24.5" cy="33" r="1.2" fill={bg} />
        {/* Ventana superior — 4 paneles */}
        <rect x="32" y="14" width="20" height="20" rx="1.5" stroke={accent} strokeWidth="2.5" fill="none" />
        <line x1="42" y1="14" x2="42" y2="34" stroke={accent} strokeWidth="2.5" />
        <line x1="32" y1="24" x2="52" y2="24" stroke={accent} strokeWidth="2.5" />
        {/* Ventana inferior */}
        <rect x="32" y="36" width="20" height="16" rx="1.5" stroke={accent} strokeWidth="2.5" fill="none" />
        <line x1="42" y1="36" x2="42" y2="52" stroke={accent} strokeWidth="2.5" />
      </svg>

      {variant === 'full' && (
        <div className="flex flex-col">
          <span
            className={`${s.text} font-bold tracking-tight leading-none`}
            style={{ color: fg, fontFamily: "'Geist', system-ui" }}
          >
            THE BUILDER&apos;S HOUSE
          </span>
          <span
            className={`${s.sub} font-medium tracking-[0.2em] mt-1`}
            style={{ color: accent }}
          >
            PUERTO RICO
          </span>
        </div>
      )}
    </div>
  );
}
