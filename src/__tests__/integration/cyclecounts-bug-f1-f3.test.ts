/**
 * Integration tests for Bugs F-1, F-2, F-3 (cyclecounts router).
 *
 * F-1: assign requires locationId; systemQuantity = that location's quantityOnHand
 *      (not the sum across all locations for the product)
 *
 * F-2: complete uses count.locationId (stored at assign time), not a user-supplied one.
 *      The input schema no longer accepts locationId — the stored value is used.
 *
 * F-3: complete enforces authorization — only the assigned user, MANAGER, or ADMIN
 *      can complete a count. A different VENDOR gets FORBIDDEN.
 *
 * Run with: npm test
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createCallerFactory } from '@/server/trpc';
import { cycleCountsRouter } from '@/server/trpc/routers/cyclecounts';
import type { Context } from '@/server/trpc/context';

const db = new PrismaClient();
const makeCycleCountsCaller = createCallerFactory(cycleCountsRouter);

function makeCaller(userId: string, role: 'VENDOR' | 'MANAGER' | 'ADMIN') {
  const ctx = {
    db,
    session: {
      user: {
        id: userId,
        name: `Test ${role}`,
        email: `${role.toLowerCase()}-bugf@test.invalid`,
        role,
      },
      expires: new Date(Date.now() + 8 * 3600 * 1000).toISOString(),
    },
    req: { headers: { get: (_name: string) => null } },
  } as unknown as Context;
  return makeCycleCountsCaller(ctx);
}

// ─── Fixture IDs ─────────────────────────────────────────────────────────────

let managerId: string;
let vendor1Id: string;
let vendor2Id: string;
let catId: string;
let whId: string;
let wh2Id: string;
let productId: string;
let locationAId: string; // 30 units
let locationBId: string; // 15 units

// ─────────────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  // Clean up any leftovers from previous failed runs (order matters: FK constraints)
  const staleUsers = await db.user.findMany({
    where: { email: { in: ['manager-bugf@test.invalid', 'vendor1-bugf@test.invalid', 'vendor2-bugf@test.invalid'] } },
    select: { id: true },
  });
  const staleUserIds = staleUsers.map((u) => u.id);
  if (staleUserIds.length > 0) {
    await db.auditLog.deleteMany({ where: { userId: { in: staleUserIds } } });
    await db.cycleCount.deleteMany({ where: { assignedUserId: { in: staleUserIds } } });
    await db.user.deleteMany({ where: { id: { in: staleUserIds } } });
  }
  const staleProducts = await db.product.findMany({ where: { sku: { in: ['BUGF-PROD-1', 'BUGF-OTHER-PROD'] } }, select: { id: true } });
  const staleProdIds = staleProducts.map((p) => p.id);
  if (staleProdIds.length > 0) {
    await db.inventoryMovement.deleteMany({ where: { productId: { in: staleProdIds } } });
    await db.productLocation.deleteMany({ where: { productId: { in: staleProdIds } } });
    await db.product.deleteMany({ where: { id: { in: staleProdIds } } });
  }
  await db.warehouse.deleteMany({ where: { name: { in: ['TEST-BUGF-WH-A', 'TEST-BUGF-WH-B'] } } });
  await db.category.deleteMany({ where: { name: 'TEST-BUGF-CAT' } });

  const cat = await db.category.create({
    data: { name: 'TEST-BUGF-CAT', slug: 'test-bugf-cat' },
  });
  catId = cat.id;

  const wh = await db.warehouse.create({ data: { name: 'TEST-BUGF-WH-A' } });
  whId = wh.id;

  const wh2 = await db.warehouse.create({ data: { name: 'TEST-BUGF-WH-B' } });
  wh2Id = wh2.id;

  const manager = await db.user.create({
    data: { name: 'Test Manager BugF', email: 'manager-bugf@test.invalid', role: 'MANAGER' },
  });
  managerId = manager.id;

  const vendor1 = await db.user.create({
    data: { name: 'Test Vendor1 BugF', email: 'vendor1-bugf@test.invalid', role: 'VENDOR' },
  });
  vendor1Id = vendor1.id;

  const vendor2 = await db.user.create({
    data: { name: 'Test Vendor2 BugF', email: 'vendor2-bugf@test.invalid', role: 'VENDOR' },
  });
  vendor2Id = vendor2.id;

  const product = await db.product.create({
    data: {
      sku: 'BUGF-PROD-1',
      name: 'Test Product BugF',
      categoryId: catId,
      unitCost: 50,
      retailPrice: 100,
      wholesalePrice: 80,
    },
  });
  productId = product.id;

  // Two locations for the same product — different quantities
  const locA = await db.productLocation.create({
    data: { productId, warehouseId: whId, locationCode: 'BUGF-LOC-A', quantityOnHand: 30 },
  });
  locationAId = locA.id;

  const locB = await db.productLocation.create({
    data: { productId, warehouseId: wh2Id, locationCode: 'BUGF-LOC-B', quantityOnHand: 15 },
  });
  locationBId = locB.id;
});

afterAll(async () => {
  const userIds = [managerId, vendor1Id, vendor2Id].filter(Boolean);
  if (userIds.length > 0) {
    await db.auditLog.deleteMany({ where: { userId: { in: userIds } } });
    await db.cycleCount.deleteMany({ where: { assignedUserId: { in: userIds } } });
  }
  if (locationAId || locationBId) {
    const locationIds = [locationAId, locationBId].filter(Boolean);
    await db.inventoryMovement.deleteMany({ where: { locationId: { in: locationIds } } });
    await db.productLocation.deleteMany({ where: { id: { in: locationIds } } });
  }
  if (productId) await db.product.deleteMany({ where: { id: productId } });
  if (userIds.length > 0) await db.user.deleteMany({ where: { id: { in: userIds } } });
  if (whId || wh2Id) {
    const whIds = [whId, wh2Id].filter(Boolean);
    await db.warehouse.deleteMany({ where: { id: { in: whIds } } });
  }
  if (catId) await db.category.delete({ where: { id: catId } }).catch(() => {});
  await db.$disconnect();
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Bug F-1 — assign requiere locationId; systemQuantity = esa ubicación específica', () => {
  it('F1-a: assign sin locationId → BAD_REQUEST (Zod)', async () => {
    const manager = makeCaller(managerId, 'MANAGER');
    await expect(
      manager.assign({
        productId,
        // locationId omitted
        assignedUserId: vendor1Id,
        scheduledDate: new Date(),
      } as Parameters<typeof manager.assign>[0])
    ).rejects.toThrow(); // Zod validation error — locationId is required
  });

  it('F1-b: assign para location A (30 units) → systemQuantity = 30, no 45 (suma de ambas)', async () => {
    const manager = makeCaller(managerId, 'MANAGER');
    const count = await manager.assign({
      productId,
      locationId: locationAId,
      assignedUserId: vendor1Id,
      scheduledDate: new Date(),
    });

    // systemQuantity must be exactly location A's stock (30), not the total (30+15=45)
    expect(count.systemQuantity).toBe(30);
    expect(count.locationId).toBe(locationAId);

    // Cleanup
    await db.cycleCount.delete({ where: { id: count.id } });
  });

  it('F1-c: assign para location B (15 units) → systemQuantity = 15', async () => {
    const manager = makeCaller(managerId, 'MANAGER');
    const count = await manager.assign({
      productId,
      locationId: locationBId,
      assignedUserId: vendor1Id,
      scheduledDate: new Date(),
    });

    expect(count.systemQuantity).toBe(15);
    expect(count.locationId).toBe(locationBId);

    await db.cycleCount.delete({ where: { id: count.id } });
  });

  it('F1-d: locationId que no pertenece al producto → BAD_REQUEST', async () => {
    // Create a location for a different product
    const otherProduct = await db.product.create({
      data: {
        sku: 'BUGF-OTHER-PROD',
        name: 'Other Product BugF',
        categoryId: catId,
        unitCost: 10,
        retailPrice: 20,
        wholesalePrice: 16,
      },
    });
    const otherLoc = await db.productLocation.create({
      data: { productId: otherProduct.id, warehouseId: whId, locationCode: 'BUGF-LOC-OTHER', quantityOnHand: 5 },
    });

    try {
      const manager = makeCaller(managerId, 'MANAGER');
      await expect(
        manager.assign({
          productId,
          locationId: otherLoc.id, // belongs to a different product
          assignedUserId: vendor1Id,
          scheduledDate: new Date(),
        })
      ).rejects.toThrow(/BAD_REQUEST|no pertenece|producto/i);
    } finally {
      await db.productLocation.delete({ where: { id: otherLoc.id } });
      await db.product.delete({ where: { id: otherProduct.id } });
    }
  });
});

describe('Bug F-2 — complete usa locationId del conteo asignado (no del input)', () => {
  it('F2: complete usa count.locationId para el ajuste de inventario', async () => {
    // Assign count to location A (30 units)
    const manager = makeCaller(managerId, 'MANAGER');
    const count = await manager.assign({
      productId,
      locationId: locationAId,
      assignedUserId: vendor1Id,
      scheduledDate: new Date(),
    });
    expect(count.locationId).toBe(locationAId);
    expect(count.systemQuantity).toBe(30);

    // Complete as the assigned vendor — count finds 28 units (variance = -2)
    const vendor = makeCaller(vendor1Id, 'VENDOR');
    await vendor.complete({
      id: count.id,
      countedQuantity: 28,
      notes: 'Test F2 — encontré 28 unidades',
      photoUrl: 'https://example.com/count-photo.jpg',
      // No locationId in input — it comes from count.locationId stored at assign time
    });

    // Location A's stock must be updated (30 - 2 = 28)
    const locA = await db.productLocation.findUnique({ where: { id: locationAId } });
    expect(locA!.quantityOnHand).toBe(28);

    // Location B's stock must remain unchanged
    const locB = await db.productLocation.findUnique({ where: { id: locationBId } });
    expect(locB!.quantityOnHand).toBe(15);

    // ADJUSTMENT movement on location A
    const adjustment = await db.inventoryMovement.findFirst({
      where: { locationId: locationAId, movementType: 'ADJUSTMENT' },
    });
    expect(adjustment).not.toBeNull();
    expect(adjustment!.quantity).toBe(-2); // variance = 28 - 30 = -2

    // Restore
    await db.inventoryMovement.deleteMany({ where: { locationId: locationAId } });
    await db.productLocation.update({ where: { id: locationAId }, data: { quantityOnHand: 30 } });
  });
});

describe('Bug F-3 — complete enforces authorization (assigned user, MANAGER, or ADMIN)', () => {
  it('F3-a: usuario diferente al asignado (otro VENDOR) → FORBIDDEN', async () => {
    // Assign to vendor1
    const manager = makeCaller(managerId, 'MANAGER');
    const count = await manager.assign({
      productId,
      locationId: locationAId,
      assignedUserId: vendor1Id,
      scheduledDate: new Date(),
    });

    // vendor2 (not the assigned user) tries to complete
    const vendor2 = makeCaller(vendor2Id, 'VENDOR');
    await expect(
      vendor2.complete({
        id: count.id,
        countedQuantity: 30,
        photoUrl: 'https://example.com/photo.jpg',
      })
    ).rejects.toThrow(/FORBIDDEN|forbidden|asignado|MANAGER|ADMIN/i);

    // Count must remain PENDING (completedAt = null)
    const unchanged = await db.cycleCount.findUnique({ where: { id: count.id } });
    expect(unchanged!.completedAt).toBeNull();

    await db.cycleCount.delete({ where: { id: count.id } });
  });

  it('F3-b: el usuario asignado puede completar su propio conteo', async () => {
    const manager = makeCaller(managerId, 'MANAGER');
    const count = await manager.assign({
      productId,
      locationId: locationAId,
      assignedUserId: vendor1Id,
      scheduledDate: new Date(),
    });

    const vendor1 = makeCaller(vendor1Id, 'VENDOR');
    await expect(
      vendor1.complete({
        id: count.id,
        countedQuantity: 30, // no variance — no adjustment movement
        photoUrl: 'https://example.com/photo.jpg',
      })
    ).resolves.not.toThrow();

    const completed = await db.cycleCount.findUnique({ where: { id: count.id } });
    expect(completed!.completedAt).not.toBeNull();

    // Restore
    await db.inventoryMovement.deleteMany({ where: { locationId: locationAId } });
    await db.productLocation.update({ where: { id: locationAId }, data: { quantityOnHand: 30 } });
  });

  it('F3-c: MANAGER puede completar cualquier conteo sin ser el asignado', async () => {
    const manager = makeCaller(managerId, 'MANAGER');
    const count = await manager.assign({
      productId,
      locationId: locationAId,
      assignedUserId: vendor1Id,
      scheduledDate: new Date(),
    });

    // Manager completes (not the assigned vendor)
    await expect(
      manager.complete({
        id: count.id,
        countedQuantity: 30,
        photoUrl: 'https://example.com/photo.jpg',
      })
    ).resolves.not.toThrow();

    const completed = await db.cycleCount.findUnique({ where: { id: count.id } });
    expect(completed!.completedAt).not.toBeNull();

    await db.inventoryMovement.deleteMany({ where: { locationId: locationAId } });
    await db.productLocation.update({ where: { id: locationAId }, data: { quantityOnHand: 30 } });
  });
});
