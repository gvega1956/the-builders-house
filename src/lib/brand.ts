export const brand = {
  navy: {
    950: '#0A1628',
    900: '#0F1F3A',
    800: '#1A2D4F',
    700: '#2A3F66',
    600: '#3D5580',
  },
  orange: {
    600: '#D9531E',
    500: '#EC6326',
    400: '#F47C44',
    100: '#FDE4D4',
    50: '#FEF3EC',
  },
  semantic: {
    success: '#059669',
    warning: '#D97706',
    danger: '#DC2626',
    info: '#0284C7',
  },
} as const;

export type BrandColor = typeof brand;
