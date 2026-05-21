/**
 * Integration tests for Bug 1.2: atomicity in movements.create.
 *
 * Verifies:
 * 1. SELECT FOR UPDATE serializes concurrent stock checks → no negative stock
 * 2. locationId validation rejects locations that don't belong to the product
 *
 * Tests the core DB transaction logic directly (without tRPC auth context).
 * Run with: npm test
 *
 * AUDIT-BUG-12 / AUDIT-BUG-14
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';

const db = new PrismaClient();

// Test fixture IDs — filled in beforeAll
let testProductId: string;
let testProduct2Id: string;
let testLocationId: string;
let testLocation2Id: string;
let testUserId: string;

// ─── Fixture setup ───────────────────────────────────────────────────────────

beforeAll(async () => {
  // Create the minimum required records for movements
  const category = await db.category.create({
    data: { name: 'TEST-MOVEMENTS-CAT', slug: 'test-movements-cat' },
  });

  const warehouse = await db.warehouse.create({
    data: { name: 'TEST-MOVEMENTS-WH' },
  });

  const user = await db.user.create({
    data: { name: 'Test Movements User', email: 'test-movements@test.invalid' },
  });
  testUserId = user.id;

  const product1 = await db.product.create({
    data: {
      sku: 'TEST-MOV-SKU-1',
      name: 'Test Product 1',
      categoryId: category.id,
      unitCost: 10,
      retailPrice: 15,
      wholesalePrice: 12,
    },
  });
  testProductId = product1.id;

  const product2 = await db.product.create({
    data: {
      sku: 'TEST-MOV-SKU-2',
      name: 'Test Product 2',
      categoryId: category.id,
      unitCost: 10,
      retailPrice: 15,
      wholesalePrice: 12,
    },
  });
  testProduct2Id = product2.id;

  const location1 = await db.productLocation.create({
    data: {
      productId: product1.id,
      warehouseId: warehouse.id,
      locationCode: 'TEST-LOC-A',
      quantityOnHand: 0,
    },
  });
  testLocationId = location1.id;

  // location2 belongs to product2 — used to test cross-product validation
  const location2 = await db.productLocation.create({
    data: {
      productId: product2.id,
      warehouseId: warehouse.id,
      locationCode: 'TEST-LOC-B',
      quantityOnHand: 10,
    },
  });
  testLocation2Id = location2.id;
});

afterAll(async () => {
  // Delete in dependency order (children before parents)
  await db.inventoryMovement.deleteMany({
    where: { locationId: { in: [testLocationId, testLocation2Id] } },
  });
  await db.productLocation.deleteMany({
    where: { id: { in: [testLocationId, testLocation2Id] } },
  });
  await db.product.deleteMany({
    where: { id: { in: [testProductId, testProduct2Id] } },
  });
  await db.user.delete({ where: { id: testUserId } }).catch(() => {});
  await db.warehouse.deleteMany({ where: { name: 'TEST-MOVEMENTS-WH' } });
  await db.category.deleteMany({ where: { slug: 'test-movements-cat' } });
  await db.$disconnect();
});

// ─── Core transaction helpers ────────────────────────────────────────────────

type LocationRow = { id: string; productId: string; quantityOnHand: number };

/**
 * Replicates the core transaction logic of movements.create.
 * Does NOT create an InventoryMovement record (requires userId from session).
 * Tests only the lock + validation + stock decrement path.
 */
async function deductStock(
  locationId: string,
  productId: string,
  quantity: number, // positive: amount to deduct from stock
): Promise<{ quantityOnHand: number }> {
  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    const rows = await tx.$queryRaw<LocationRow[]>`
      SELECT id, "productId", "quantityOnHand"
      FROM product_locations
      WHERE id = ${locationId}
      FOR UPDATE
    `;

    if (rows.length === 0) throw new Error('Ubicación no encontrada');

    const loc = rows[0]!;

    if (loc.productId !== productId) {
      throw new Error('La ubicación no pertenece al producto indicado');
    }

    if (loc.quantityOnHand < quantity) {
      throw new Error(`Stock insuficiente. Disponible: ${loc.quantityOnHand}`);
    }

    const updated = await tx.productLocation.update({
      where: { id: locationId },
      data: { quantityOnHand: { increment: -quantity } },
    });

    return { quantityOnHand: updated.quantityOnHand };
  });
}

/**
 * Full transaction helper: lock + validate + create InventoryMovement + update stock.
 * quantity follows the sign convention (OUT/DAMAGE → negative, IN/RETURN → positive).
 */
async function createMovement({
  locationId,
  productId,
  quantity, // negative for OUT (sign convention from Bug 1.3)
  userId,
}: {
  locationId: string;
  productId: string;
  quantity: number;
  userId: string;
}): Promise<{ movementId: string; quantityOnHand: number }> {
  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    const rows = await tx.$queryRaw<LocationRow[]>`
      SELECT id, "productId", "quantityOnHand"
      FROM product_locations
      WHERE id = ${locationId}
      FOR UPDATE
    `;

    if (rows.length === 0) throw new Error('Ubicación no encontrada');

    const loc = rows[0]!;

    if (loc.productId !== productId) {
      throw new Error('La ubicación no pertenece al producto indicado');
    }

    // quantity is negative for OUT; check absolute value against stock
    if (loc.quantityOnHand < Math.abs(quantity)) {
      throw new Error(`Stock insuficiente. Disponible: ${loc.quantityOnHand}`);
    }

    const movement = await tx.inventoryMovement.create({
      data: {
        productId,
        locationId,
        movementType: 'OUT',
        quantity,
        referenceType: 'ADJUSTMENT',
        userId,
      },
    });

    const updated = await tx.productLocation.update({
      where: { id: locationId },
      data: { quantityOnHand: { increment: quantity } }, // quantity is negative → decrements
    });

    return { movementId: movement.id, quantityOnHand: updated.quantityOnHand };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: Stock=5, two concurrent requests for 3 → one passes, one fails
//
// Without SELECT FOR UPDATE, both transactions could read stock=5, both pass
// the check, both decrement → final stock = -1 (invalid).
//
// With SELECT FOR UPDATE, the second transaction waits for the first to
// COMMIT. After commit, it reads stock=2 and correctly rejects the request.
// ─────────────────────────────────────────────────────────────────────────────
it('dos requests concurrentes de 3 con stock=5: uno pasa, uno falla con stock insuficiente', async () => {
  await db.productLocation.update({
    where: { id: testLocationId },
    data: { quantityOnHand: 5 },
  });

  const results = await Promise.allSettled([
    deductStock(testLocationId, testProductId, 3),
    deductStock(testLocationId, testProductId, 3),
  ]);

  const successes = results.filter((r) => r.status === 'fulfilled');
  const failures = results.filter((r) => r.status === 'rejected');

  expect(successes).toHaveLength(1);
  expect(failures).toHaveLength(1);

  const failReason = (failures[0] as PromiseRejectedResult).reason as Error;
  expect(failReason.message).toContain('Stock insuficiente');
  expect(failReason.message).toContain('2'); // Disponible: 2

  // Stock final debe ser 2 (5 - 3 = 2), nunca -1
  const final = await db.productLocation.findUnique({ where: { id: testLocationId } });
  expect(final!.quantityOnHand).toBe(2);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: locationId de product2 rechazado cuando productId = product1
//
// location2 pertenece a product2. Si se pasa productId=product1 con
// locationId=location2, debe lanzar error claro.
// ─────────────────────────────────────────────────────────────────────────────
it('rechaza locationId que no pertenece al productId indicado', async () => {
  await expect(
    deductStock(testLocation2Id, testProductId, 1) // location2 → product2, not product1
  ).rejects.toThrow('La ubicación no pertenece al producto indicado');
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 3: Stock exactamente suficiente pasa sin error
// ─────────────────────────────────────────────────────────────────────────────
it('deducción exacta al stock disponible no lanza error', async () => {
  await db.productLocation.update({
    where: { id: testLocationId },
    data: { quantityOnHand: 3 },
  });

  const result = await deductStock(testLocationId, testProductId, 3);
  expect(result.quantityOnHand).toBe(0);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 4: Ubicación inexistente lanza error claro
// ─────────────────────────────────────────────────────────────────────────────
it('ubicación inexistente lanza error claro', async () => {
  await expect(
    deductStock('clxxxxxxxxxxxxxxxxxxxxxxxxx', testProductId, 1)
  ).rejects.toThrow('Ubicación no encontrada');
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 5: 10 requests concurrentes de 1 unidad con stock=5
//
// Con SELECT FOR UPDATE, las 10 transacciones se serializan. Las primeras 5
// encuentran stock suficiente y hacen commit. Las últimas 5 (en cualquier orden)
// encuentran stock=0 y son rechazadas.
//
// Verifica además que solo 5 registros de InventoryMovement persisten —
// los de las 5 transacciones fallidas no dejan huella (atomic rollback).
//
// Este test refleja carga realista del sistema: múltiples vendedores
// procesando ventas simultáneas del mismo producto.
// ─────────────────────────────────────────────────────────────────────────────
it('10 requests concurrentes de 1 unidad con stock=5: exactamente 5 pasan y 5 fallan', async () => {
  await db.productLocation.update({
    where: { id: testLocationId },
    data: { quantityOnHand: 5 },
  });

  // Baseline: count existing movements before this test
  const movementsBefore = await db.inventoryMovement.count({
    where: { locationId: testLocationId },
  });

  // 10 truly concurrent transactions — Promise.allSettled dispatches all
  // before any COMMIT, so each races for the SELECT FOR UPDATE lock
  const results = await Promise.allSettled(
    Array.from({ length: 10 }, () =>
      createMovement({
        locationId: testLocationId,
        productId: testProductId,
        quantity: -1, // OUT: negative per sign convention (Bug 1.3)
        userId: testUserId,
      })
    )
  );

  const successes = results.filter((r) => r.status === 'fulfilled');
  const failures = results.filter((r) => r.status === 'rejected');

  expect(successes).toHaveLength(5);
  expect(failures).toHaveLength(5);

  // All failures are stock-related, not infrastructure errors
  for (const f of failures) {
    const msg = ((f as PromiseRejectedResult).reason as Error).message;
    expect(msg).toContain('Stock insuficiente');
  }

  // Stock drained to exactly 0 — no negative stock, no phantom units
  const final = await db.productLocation.findUnique({ where: { id: testLocationId } });
  expect(final!.quantityOnHand).toBe(0);

  // Only 5 InventoryMovement records created — failed transactions left no trace
  const movementsAfter = await db.inventoryMovement.count({
    where: { locationId: testLocationId },
  });
  expect(movementsAfter - movementsBefore).toBe(5);
});
