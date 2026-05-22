/**
 * Integration tests for Bugs C-1 and C-2 (movements router).
 *
 * C-1: TRANSFER uses availableStock = quantityOnHand - reservedQuantity
 *      (stock physically present but reserved for pending invoices cannot
 *       be transferred — prevents double-commit of reserved inventory)
 *
 * C-2: movementType/referenceType cross-validation
 *      (e.g., IN must pair with PURCHASE_ORDER or ADJUSTMENT, not INVOICE)
 *
 * Run with: npm test
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createCallerFactory } from '@/server/trpc';
import { movementsRouter } from '@/server/trpc/routers/movements';
import type { Context } from '@/server/trpc/context';

const db = new PrismaClient();
const makeMovementsCaller = createCallerFactory(movementsRouter);

function makeCaller(userId: string, role: 'VENDOR' | 'MANAGER' | 'ADMIN') {
  const ctx = {
    db,
    session: {
      user: {
        id: userId,
        name: `Test ${role}`,
        email: `${role.toLowerCase()}-bugc@test.invalid`,
        role,
      },
      expires: new Date(Date.now() + 8 * 3600 * 1000).toISOString(),
    },
    req: { headers: { get: (_name: string) => null } },
  } as unknown as Context;
  return makeMovementsCaller(ctx);
}

// ─── Fixture IDs ─────────────────────────────────────────────────────────────

let managerId: string;
let catId: string;
let whId: string;
let wh2Id: string;
let productId: string;
let locationAId: string; // origin
let locationBId: string; // destination

// ─────────────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  const cat = await db.category.create({
    data: { name: 'TEST-BUGC-CAT', slug: 'test-bugc-cat' },
  });
  catId = cat.id;

  const wh = await db.warehouse.create({ data: { name: 'TEST-BUGC-WH-A' } });
  whId = wh.id;

  const wh2 = await db.warehouse.create({ data: { name: 'TEST-BUGC-WH-B' } });
  wh2Id = wh2.id;

  const manager = await db.user.create({
    data: { name: 'Test Manager BugC', email: 'manager-bugc@test.invalid', role: 'MANAGER' },
  });
  managerId = manager.id;

  const product = await db.product.create({
    data: {
      sku: 'BUGC-PROD-1',
      name: 'Test Product BugC',
      categoryId: catId,
      unitCost: 75,
      retailPrice: 150,
      wholesalePrice: 120,
    },
  });
  productId = product.id;

  const locA = await db.productLocation.create({
    data: { productId, warehouseId: whId, locationCode: 'BUGC-LOC-A', quantityOnHand: 50 },
  });
  locationAId = locA.id;

  const locB = await db.productLocation.create({
    data: { productId, warehouseId: wh2Id, locationCode: 'BUGC-LOC-B', quantityOnHand: 0 },
  });
  locationBId = locB.id;
});

beforeEach(async () => {
  await db.inventoryMovement.deleteMany({
    where: { locationId: { in: [locationAId, locationBId] } },
  });
  await db.productLocation.update({
    where: { id: locationAId },
    data: { quantityOnHand: 50, reservedQuantity: 0 },
  });
  await db.productLocation.update({
    where: { id: locationBId },
    data: { quantityOnHand: 0, reservedQuantity: 0 },
  });
});

afterAll(async () => {
  await db.inventoryMovement.deleteMany({
    where: { locationId: { in: [locationAId, locationBId] } },
  });
  await db.productLocation.deleteMany({ where: { id: { in: [locationAId, locationBId] } } });
  await db.product.deleteMany({ where: { id: productId } });
  await db.user.deleteMany({ where: { id: managerId } });
  await db.warehouse.deleteMany({ where: { id: { in: [whId, wh2Id] } } });
  await db.category.delete({ where: { id: catId } }).catch(() => {});
  await db.$disconnect();
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Bug C-1 — TRANSFER usa availableStock (quantityOnHand - reservedQuantity)', () => {
  it('C1-a: TRANSFER dentro del stock disponible → éxito, ambas ubicaciones actualizadas', async () => {
    // Location A: 50 on hand, 0 reserved → available = 50
    const manager = makeCaller(managerId, 'MANAGER');

    await manager.create({
      productId,
      movementType: 'TRANSFER',
      referenceType: 'TRANSFER',
      referenceId: 'XFER-C1A-TEST',
      locationId: locationAId,
      destinationLocationId: locationBId,
      quantity: 20,
      notes: 'Test transfer dentro del disponible',
    });

    const locA = await db.productLocation.findUnique({ where: { id: locationAId } });
    const locB = await db.productLocation.findUnique({ where: { id: locationBId } });
    expect(locA!.quantityOnHand).toBe(30); // 50 - 20
    expect(locB!.quantityOnHand).toBe(20); // 0 + 20

    // Two mirror movements — both stored as 'TRANSFER', distinguished by quantity sign
    const movements = await db.inventoryMovement.findMany({
      where: { referenceId: 'XFER-C1A-TEST' },
      orderBy: { createdAt: 'asc' },
    });
    expect(movements).toHaveLength(2);
    const departureMov = movements.find((m) => m.quantity < 0);  // origin: -20
    const arrivalMov  = movements.find((m) => m.quantity > 0);   // destination: +20
    expect(departureMov).toBeDefined();
    expect(arrivalMov).toBeDefined();
    expect(departureMov!.quantity).toBe(-20);
    expect(arrivalMov!.quantity).toBe(20);
    expect(departureMov!.movementType).toBe('TRANSFER');
    expect(arrivalMov!.movementType).toBe('TRANSFER');
  });

  it('C1-b: TRANSFER excede stock disponible (reserved bloquea) → BAD_REQUEST', async () => {
    // Location A: 50 on hand, 45 reserved → available = 5
    await db.productLocation.update({
      where: { id: locationAId },
      data: { quantityOnHand: 50, reservedQuantity: 45 },
    });

    const manager = makeCaller(managerId, 'MANAGER');

    // Trying to transfer 10 but only 5 available → must be rejected
    await expect(
      manager.create({
        productId,
        movementType: 'TRANSFER',
        referenceType: 'TRANSFER',
        referenceId: 'XFER-C1B-TEST',
        locationId: locationAId,
        destinationLocationId: locationBId,
        quantity: 10,
        notes: 'Test transfer excede disponible',
      })
    ).rejects.toThrow(/disponible|reservado|insuficiente/i);

    // No movement created — transaction must have rolled back
    const movements = await db.inventoryMovement.findMany({
      where: { referenceId: 'XFER-C1B-TEST' },
    });
    expect(movements).toHaveLength(0);

    // Stock unchanged
    const locA = await db.productLocation.findUnique({ where: { id: locationAId } });
    expect(locA!.quantityOnHand).toBe(50);
    expect(locA!.reservedQuantity).toBe(45);
  });

  it('C1-c: TRANSFER exactamente igual al stock disponible → éxito', async () => {
    // Location A: 50 on hand, 30 reserved → available = 20
    await db.productLocation.update({
      where: { id: locationAId },
      data: { quantityOnHand: 50, reservedQuantity: 30 },
    });

    const manager = makeCaller(managerId, 'MANAGER');

    await manager.create({
      productId,
      movementType: 'TRANSFER',
      referenceType: 'TRANSFER',
      referenceId: 'XFER-C1C-TEST',
      locationId: locationAId,
      destinationLocationId: locationBId,
      quantity: 20, // exactly available
      notes: 'Test transfer exacto al disponible',
    });

    const locA = await db.productLocation.findUnique({ where: { id: locationAId } });
    expect(locA!.quantityOnHand).toBe(30); // 50 - 20
    expect(locA!.reservedQuantity).toBe(30); // unchanged
  });
});

describe('Bug C-2 — movementType/referenceType cross-validation', () => {
  it('C2-a: IN con referenceType INVOICE → BAD_REQUEST (INVOICE solo válido para OUT/RETURN)', async () => {
    const manager = makeCaller(managerId, 'MANAGER');
    await expect(
      manager.create({
        productId,
        movementType: 'IN',
        referenceType: 'INVOICE',
        referenceId: 'FAC-00001',
        locationId: locationAId,
        quantity: 10,
        notes: 'Test tipo inválido',
      })
    ).rejects.toThrow(/referenceType|tipo de referencia|inválido|BAD_REQUEST/i);
  });

  it('C2-b: OUT con referenceType PURCHASE_ORDER → BAD_REQUEST (PO solo válido para IN)', async () => {
    const manager = makeCaller(managerId, 'MANAGER');
    await expect(
      manager.create({
        productId,
        movementType: 'OUT',
        referenceType: 'PURCHASE_ORDER',
        referenceId: 'OC-RD-00001',
        locationId: locationAId,
        quantity: -5,
        notes: 'Test tipo inválido',
      })
    ).rejects.toThrow(/referenceType|tipo de referencia|inválido|BAD_REQUEST/i);
  });

  it('C2-c: RETURN con referenceType CYCLE_COUNT → BAD_REQUEST (CYCLE_COUNT solo válido para ADJUSTMENT)', async () => {
    const manager = makeCaller(managerId, 'MANAGER');
    await expect(
      manager.create({
        productId,
        movementType: 'RETURN',
        referenceType: 'CYCLE_COUNT',
        referenceId: 'CC-00001',
        locationId: locationAId,
        quantity: 3,
        notes: 'Test tipo inválido',
      })
    ).rejects.toThrow(/referenceType|tipo de referencia|inválido|BAD_REQUEST/i);
  });

  it('C2-d: IN con referenceType PURCHASE_ORDER → éxito (combinación válida)', async () => {
    const manager = makeCaller(managerId, 'MANAGER');
    await expect(
      manager.create({
        productId,
        movementType: 'IN',
        referenceType: 'PURCHASE_ORDER',
        referenceId: 'OC-RD-TEST-C2D',
        locationId: locationAId,
        quantity: 5,
        notes: 'Test tipo válido',
      })
    ).resolves.not.toThrow();

    const locA = await db.productLocation.findUnique({ where: { id: locationAId } });
    expect(locA!.quantityOnHand).toBe(55); // 50 + 5
  });

  it('C2-e: ADJUSTMENT con referenceType CYCLE_COUNT → éxito (combinación válida)', async () => {
    const manager = makeCaller(managerId, 'MANAGER');
    await expect(
      manager.create({
        productId,
        movementType: 'ADJUSTMENT',
        referenceType: 'CYCLE_COUNT',
        referenceId: 'CC-TEST-C2E',
        locationId: locationAId,
        quantity: -3,
        notes: 'Test conteo cíclico ajuste',
        photoUrl: 'https://example.com/cycle-count-photo.jpg', // ADJUSTMENT requires photo
      })
    ).resolves.not.toThrow();

    const locA = await db.productLocation.findUnique({ where: { id: locationAId } });
    expect(locA!.quantityOnHand).toBe(47); // 50 - 3
  });
});
