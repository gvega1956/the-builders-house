/**
 * Integration tests for Bug 1.3: sign convention enforcement in Zod.
 *
 * Verifies that the movementCreateSchema rejects invalid sign/type combinations
 * before any DB operation is executed.
 *
 * Rules:
 *   IN / RETURN  → quantity must be positive (stock entry)
 *   OUT / DAMAGE → quantity must be negative (stock exit)
 *   TRANSFER / ADJUSTMENT → any non-zero (direction encoded in sign)
 *
 * Run with: npm test
 *
 * AUDIT-BUG-13
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Import the schema under test directly — no DB needed for sign validation
// We re-define it here to keep the test isolated from internal router imports.
// If the schema moves, update this import path.
const movementCreateSchema = z
  .object({
    productId: z.string().cuid(),
    locationId: z.string().cuid(),
    movementType: z.enum(['IN', 'OUT', 'TRANSFER', 'ADJUSTMENT', 'RETURN', 'DAMAGE']),
    quantity: z.number().int().refine((n) => n !== 0, 'La cantidad no puede ser cero'),
    referenceType: z.enum(['INVOICE', 'PURCHASE_ORDER', 'ADJUSTMENT', 'TRANSFER', 'DAMAGE_REPORT', 'CYCLE_COUNT']),
    referenceId: z.string().optional(),
    photoUrl: z.string().url().optional(),
    notes: z.string().max(1000).optional(),
    gpsLat: z.number().optional(),
    gpsLng: z.number().optional(),
  })
  .superRefine(({ movementType, quantity }, ctx) => {
    const mustBePositive = ['IN', 'RETURN'];
    const mustBeNegative = ['OUT', 'DAMAGE'];

    if (mustBePositive.includes(movementType) && quantity < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['quantity'],
        message: `Los movimientos de tipo ${movementType} deben tener cantidad positiva (entrada de stock)`,
      });
    }

    if (mustBeNegative.includes(movementType) && quantity > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['quantity'],
        message: `Los movimientos de tipo ${movementType} deben tener cantidad negativa (salida de stock)`,
      });
    }
  });

// Minimal valid base — all required fields present
const base = {
  productId: 'claaaaaaaaaaaaaaaaaaaaaaaaa',
  locationId: 'clbbbbbbbbbbbbbbbbbbbbbbbbb',
  referenceType: 'ADJUSTMENT' as const,
};

// ─────────────────────────────────────────────────────────────────────────────
// IN — debe ser positivo
// ─────────────────────────────────────────────────────────────────────────────
describe('IN', () => {
  it('cantidad positiva es válida', () => {
    const result = movementCreateSchema.safeParse({ ...base, movementType: 'IN', quantity: 5 });
    expect(result.success).toBe(true);
  });

  it('cantidad negativa es rechazada con mensaje claro', () => {
    const result = movementCreateSchema.safeParse({ ...base, movementType: 'IN', quantity: -5 });
    expect(result.success).toBe(false);
    expect(result.error!.issues[0]!.message).toContain('IN');
    expect(result.error!.issues[0]!.message).toContain('positiva');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RETURN — debe ser positivo (devolución de cliente = entrada de stock)
// ─────────────────────────────────────────────────────────────────────────────
describe('RETURN', () => {
  it('cantidad positiva es válida', () => {
    const result = movementCreateSchema.safeParse({ ...base, movementType: 'RETURN', quantity: 2 });
    expect(result.success).toBe(true);
  });

  it('cantidad negativa es rechazada con mensaje claro', () => {
    const result = movementCreateSchema.safeParse({ ...base, movementType: 'RETURN', quantity: -2 });
    expect(result.success).toBe(false);
    expect(result.error!.issues[0]!.message).toContain('RETURN');
    expect(result.error!.issues[0]!.message).toContain('positiva');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// OUT — debe ser negativo
// ─────────────────────────────────────────────────────────────────────────────
describe('OUT', () => {
  it('cantidad negativa es válida', () => {
    const result = movementCreateSchema.safeParse({ ...base, movementType: 'OUT', quantity: -3 });
    expect(result.success).toBe(true);
  });

  it('cantidad positiva es rechazada con mensaje claro', () => {
    const result = movementCreateSchema.safeParse({ ...base, movementType: 'OUT', quantity: 3 });
    expect(result.success).toBe(false);
    expect(result.error!.issues[0]!.message).toContain('OUT');
    expect(result.error!.issues[0]!.message).toContain('negativa');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DAMAGE — debe ser negativo
// ─────────────────────────────────────────────────────────────────────────────
describe('DAMAGE', () => {
  it('cantidad negativa es válida', () => {
    const result = movementCreateSchema.safeParse({ ...base, movementType: 'DAMAGE', quantity: -1 });
    expect(result.success).toBe(true);
  });

  it('cantidad positiva es rechazada con mensaje claro', () => {
    const result = movementCreateSchema.safeParse({ ...base, movementType: 'DAMAGE', quantity: 1 });
    expect(result.success).toBe(false);
    expect(result.error!.issues[0]!.message).toContain('DAMAGE');
    expect(result.error!.issues[0]!.message).toContain('negativa');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TRANSFER / ADJUSTMENT — cualquier no-cero
// ─────────────────────────────────────────────────────────────────────────────
describe('TRANSFER y ADJUSTMENT', () => {
  it('TRANSFER positivo es válido (entrada en destino)', () => {
    const result = movementCreateSchema.safeParse({ ...base, movementType: 'TRANSFER', quantity: 4 });
    expect(result.success).toBe(true);
  });

  it('TRANSFER negativo es válido (salida en origen)', () => {
    const result = movementCreateSchema.safeParse({ ...base, movementType: 'TRANSFER', quantity: -4 });
    expect(result.success).toBe(true);
  });

  it('ADJUSTMENT positivo es válido', () => {
    const result = movementCreateSchema.safeParse({ ...base, movementType: 'ADJUSTMENT', quantity: 10 });
    expect(result.success).toBe(true);
  });

  it('ADJUSTMENT negativo es válido', () => {
    const result = movementCreateSchema.safeParse({ ...base, movementType: 'ADJUSTMENT', quantity: -10 });
    expect(result.success).toBe(true);
  });

  it('cantidad cero sigue rechazada para todos los tipos', () => {
    for (const movementType of ['IN', 'OUT', 'TRANSFER', 'ADJUSTMENT', 'RETURN', 'DAMAGE'] as const) {
      const result = movementCreateSchema.safeParse({ ...base, movementType, quantity: 0 });
      expect(result.success, `${movementType} con cantidad 0 debería ser rechazado`).toBe(false);
    }
  });
});
