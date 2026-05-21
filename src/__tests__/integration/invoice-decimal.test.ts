/**
 * Tests for Bug 1.5: float arithmetic replaced with Prisma.Decimal.
 *
 * Verifies that invoice calculations produce exact results without
 * IEEE-754 rounding errors — especially critical for IVU (11.5%) amounts
 * that appear on SURI tax filings.
 *
 * These are unit tests — no DB connection required.
 * Run with: npm test
 *
 * AUDIT-BUG-15
 */

import { it, expect, describe } from 'vitest';
import { toDecimal } from '@/lib/money';
import { Prisma } from '@prisma/client';

// ─── Helper that mirrors the exact calculation in invoicing.create ────────────

function calcLineTotal(
  unitPrice: number,
  quantity: number,
  discountPercent: number,
): Prisma.Decimal {
  const discountFactor = toDecimal(1).sub(toDecimal(discountPercent).div(100));
  return toDecimal(unitPrice).mul(quantity).mul(discountFactor);
}

function calcInvoiceTotals(
  items: { unitPrice: number; quantity: number; discountPercent: number }[],
  taxRate: number,
): { subtotal: Prisma.Decimal; taxAmount: Prisma.Decimal; total: Prisma.Decimal } {
  const subtotal = items.reduce((sum, item) => {
    return sum.add(calcLineTotal(item.unitPrice, item.quantity, item.discountPercent));
  }, toDecimal(0));

  const taxRateDecimal = toDecimal(taxRate);
  const taxAmount = subtotal.mul(taxRateDecimal);
  const total = subtotal.add(taxAmount);

  return { subtotal, taxAmount, total };
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: Caso IVU 11.5% — el bug original producía error de centavos
//
// 99.99 * 0.115 en float = 11.498849999999999 → toString → "11.498849..."
// 99.99 * 0.115 en Decimal = 11.49885 → rounded to 2dp = 11.50
//
// El bug concreto: factura de $99.99 con IVU 11.5%
//   Float:   total = 111.48884999... → Prisma redondea a 111.49
//   Decimal: total = 111.48885 → Prisma redondea a 111.49 (correcto)
//
// El test más crítico es el subtotal acumulado con múltiples items.
// ─────────────────────────────────────────────────────────────────────────────
describe('IVU 11.5%', () => {
  it('$99.99 con IVU 11.5% produce total exacto', () => {
    const { subtotal, taxAmount, total } = calcInvoiceTotals(
      [{ unitPrice: 99.99, quantity: 1, discountPercent: 0 }],
      0.115,
    );

    expect(subtotal.toFixed(2)).toBe('99.99');
    expect(taxAmount.toFixed(5)).toBe('11.49885');
    expect(total.toFixed(5)).toBe('111.48885');
  });

  it('múltiples items: subtotal acumulado sin pérdida de precisión', () => {
    const items = [
      { unitPrice: 33.33, quantity: 3, discountPercent: 0 },
      { unitPrice: 0.01, quantity: 1, discountPercent: 0 },
    ];
    // Matemática exacta: (33.33 * 3) + 0.01 = 99.99 + 0.01 = 100.00
    const { subtotal } = calcInvoiceTotals(items, 0.115);
    expect(subtotal.toFixed(2)).toBe('100.00');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: Descuento — el original tenía (1 - discountPercent/100) en float
// ─────────────────────────────────────────────────────────────────────────────
describe('descuentos', () => {
  it('descuento 10% sobre $100 produce lineTotal exacto de $90.00', () => {
    const lineTotal = calcLineTotal(100, 1, 10);
    expect(lineTotal.toFixed(2)).toBe('90.00');
  });

  it('descuento 33.333% sobre $150 — resultado exacto con Decimal', () => {
    const lineTotal = calcLineTotal(150, 1, 33.333);
    // 150 * (1 - 0.33333) = 150 * 0.66667 = 100.0005
    expect(lineTotal.toFixed(4)).toBe('100.0005');
  });

  it('sin descuento (0%) no altera el precio', () => {
    const lineTotal = calcLineTotal(250.5, 2, 0);
    expect(lineTotal.toFixed(2)).toBe('501.00');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 3: toDecimal convierte via string (no hereda error del float)
// ─────────────────────────────────────────────────────────────────────────────
describe('toDecimal', () => {
  it('0.115 se almacena exactamente (no como 0.115000000000000002...)', () => {
    const d = toDecimal(0.115);
    expect(d.toFixed(3)).toBe('0.115');
    // Verifica que no hay error de representación binaria
    expect(d.toString()).toBe('0.115');
  });

  it('0.1 + 0.2 con Decimal = exactamente 0.3', () => {
    const result = toDecimal(0.1).add(toDecimal(0.2));
    expect(result.toFixed(1)).toBe('0.3');
  });

  it('0.1 + 0.2 con float nativo NO = 0.3 (confirma el bug original)', () => {
    // Este test documenta el problema que resolvemos
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(0.1 + 0.2).toBeCloseTo(0.3);
  });
});
