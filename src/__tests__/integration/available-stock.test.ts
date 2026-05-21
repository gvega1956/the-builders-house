/**
 * Unit tests for calculateAvailableStock.
 *
 * Pure function — no DB, no Prisma client.
 * Run with: npm test
 *
 * AUDIT-BUG-21 (Paso 2)
 */

import { it, expect, describe } from 'vitest';
import { calculateAvailableStock } from '@/lib/inventory';

describe('calculateAvailableStock', () => {
  it('sin reservas: disponible = quantityOnHand', () => {
    expect(calculateAvailableStock({ quantityOnHand: 10, reservedQuantity: 0 })).toBe(10);
  });

  it('con reservas parciales: descuenta correctamente', () => {
    expect(calculateAvailableStock({ quantityOnHand: 10, reservedQuantity: 3 })).toBe(7);
  });

  it('reservas iguales al stock: disponible = 0', () => {
    expect(calculateAvailableStock({ quantityOnHand: 5, reservedQuantity: 5 })).toBe(0);
  });

  it('stock cero: disponible = 0 aunque no haya reservas', () => {
    expect(calculateAvailableStock({ quantityOnHand: 0, reservedQuantity: 0 })).toBe(0);
  });

  it('stock negativo (MANAGER override): disponible puede ser negativo', () => {
    // MANAGER puede forzar factura con stock insuficiente → quantityOnHand < 0
    expect(calculateAvailableStock({ quantityOnHand: -2, reservedQuantity: 0 })).toBe(-2);
  });

  it('overcommit — reservas superan stock: resultado negativo (señal de inconsistencia)', () => {
    // Caso de borde: si reservedQuantity > quantityOnHand, el resultado es negativo.
    // Ocurre si dos vendedores reservan simultáneamente y la lógica de lock falla.
    // La función devuelve la realidad matemática, no oculta el problema —
    // el sistema que la llama debe tratar resultado < 0 como alerta de overcommit.
    expect(calculateAvailableStock({ quantityOnHand: 5, reservedQuantity: 8 })).toBe(-3);
    expect(calculateAvailableStock({ quantityOnHand: 3, reservedQuantity: 5 })).toBe(-2);
  });
});
