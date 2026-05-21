/**
 * Integration tests for the atomic sequence generator.
 *
 * These tests hit the real database — they require a running PostgreSQL
 * instance with the sequences table seeded. Run with: npm test
 *
 * AUDIT-BUG-11 / AUDIT-BUG-19 / AUDIT-BUG-24
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { getNextSequenceValue } from '@/lib/sequences';

const db = new PrismaClient();

// Nombre de secuencia temporal para los tests — no interfiere con datos reales
const TEST_SEQUENCE = 'TEST_CONCURRENCY';

beforeAll(async () => {
  // Crear secuencia de test aislada, o resetearla si ya existe
  await db.sequence.upsert({
    where: { name: TEST_SEQUENCE },
    update: { currentValue: 0 },
    create: { name: TEST_SEQUENCE, prefix: 'TST-', padding: 5, currentValue: 0 },
  });
});

afterAll(async () => {
  // Limpiar la secuencia de test
  await db.sequence.delete({ where: { name: TEST_SEQUENCE } }).catch(() => {});
  await db.$disconnect();
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: El primer valor generado es TST-00001
// ─────────────────────────────────────────────────────────────────────────────
it('genera el primer número correctamente', async () => {
  const result = await db.$transaction((tx) => getNextSequenceValue(tx, TEST_SEQUENCE));
  expect(result).toBe('TST-00001');
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: Secuencia inexistente lanza TRPCError claro
// ─────────────────────────────────────────────────────────────────────────────
it('lanza error claro si la secuencia no existe', async () => {
  await expect(
    db.$transaction((tx) => getNextSequenceValue(tx, 'SECUENCIA_QUE_NO_EXISTE'))
  ).rejects.toThrow("Secuencia 'SECUENCIA_QUE_NO_EXISTE' no encontrada");
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 3: 5 llamadas concurrentes generan 5 números únicos y consecutivos
//
// Este test verifica la garantía atómica del UPDATE ... RETURNING.
// Si existiera una race condition, dos llamadas obtendrían el mismo número
// y Set.size sería < 5, o los números no serían consecutivos.
// ─────────────────────────────────────────────────────────────────────────────
it('5 llamadas concurrentes generan 5 números únicos consecutivos', async () => {
  // Resetear a un valor conocido antes del test de concurrencia
  await db.sequence.update({
    where: { name: TEST_SEQUENCE },
    data: { currentValue: 100 },
  });

  // Lanzar 5 transacciones simultáneas
  const results = await Promise.all(
    Array.from({ length: 5 }, () =>
      db.$transaction((tx) => getNextSequenceValue(tx, TEST_SEQUENCE))
    )
  );

  // Sin duplicados
  const uniqueNumbers = new Set(results);
  expect(uniqueNumbers.size).toBe(5);

  // Todos consecutivos (101..105), sin importar el orden en que llegaron
  const sorted = [...results].sort();
  for (let i = 1; i < sorted.length; i++) {
    const prev = parseInt(sorted[i - 1]!.replace('TST-', ''), 10);
    const curr = parseInt(sorted[i]!.replace('TST-', ''), 10);
    expect(curr).toBe(prev + 1);
  }

  // Rango correcto: 101 a 105
  const numbers = results.map((r) => parseInt(r.replace('TST-', ''), 10));
  expect(Math.min(...numbers)).toBe(101);
  expect(Math.max(...numbers)).toBe(105);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 4: Rollback de transacción NO genera un gap (ventaja vs SEQUENCE nativa)
//
// A diferencia de una SEQUENCE nativa de PostgreSQL (que siempre avanza),
// nuestra implementación con UPDATE en tabla transaccional SÍ hace rollback
// del incremento. Esto significa: menos gaps en números de factura.
//
// Gaps solo ocurrirían si el proceso falla DESPUÉS del commit de la secuencia
// pero ANTES del commit de la factura — escenario de crash de red, no de
// rollback lógico. Documentado en src/lib/sequences.ts (JSDoc).
// ─────────────────────────────────────────────────────────────────────────────
it('rollback restaura el contador — NO genera gap (ventaja vs SEQUENCE nativa)', async () => {
  await db.sequence.update({
    where: { name: TEST_SEQUENCE },
    data: { currentValue: 200 },
  });

  // Esta transacción hace rollback — el UPDATE también hace rollback
  await expect(
    db.$transaction(async (tx) => {
      const num = await getNextSequenceValue(tx, TEST_SEQUENCE);
      expect(num).toBe('TST-00201');
      throw new Error('rollback deliberado');
    })
  ).rejects.toThrow('rollback deliberado');

  // El contador volvió a 200, el siguiente número es 201 (no 202 — no hay gap)
  const nextAfterRollback = await db.$transaction((tx) =>
    getNextSequenceValue(tx, TEST_SEQUENCE)
  );
  expect(nextAfterRollback).toBe('TST-00201');
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 5: Las secuencias reales (INVOICE, CUSTOMER, etc.) tienen los prefijos correctos
// ─────────────────────────────────────────────────────────────────────────────
describe('secuencias reales del sistema', () => {
  it.each([
    ['INVOICE',        'FAC-'],
    ['CUSTOMER',       'CLI-'],
    ['PURCHASE_ORDER', 'OC-RD-'],
    ['QUOTE',          'COT-'],
  ])('secuencia %s tiene prefijo %s', async (name, expectedPrefix) => {
    const row = await db.sequence.findUnique({ where: { name } });
    expect(row).not.toBeNull();
    expect(row!.prefix).toBe(expectedPrefix);
    expect(row!.padding).toBe(5);
  });
});
