import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number | string, currency = 'USD'): string {
  return new Intl.NumberFormat('en-PR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(Number(amount));
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat('es-PR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(date));
}

export function formatDateTime(date: Date | string): string {
  return new Intl.DateTimeFormat('es-PR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

export function generateSKU(type: string, model: string, size: string, color: string): string {
  const t = type.substring(0, 3).toUpperCase();
  const m = model.substring(0, 2).toUpperCase();
  const s = size.replace(/[^0-9x]/gi, '').toUpperCase();
  const c = color.substring(0, 2).toUpperCase();
  return `${t}-${m}-${s}-${c}`;
}
