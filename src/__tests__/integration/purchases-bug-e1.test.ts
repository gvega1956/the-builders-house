/**
 * Integration tests for Bug E-1 — Purchase Order state machine.
 *
 * Validates VALID_PO_TRANSITIONS: DRAFT→SENT→IN_TRANSIT→RECEIVED→CLOSED.
 * Only forward transitions are allowed — no skipping, no reversions.
 *
 * Tests:
 *   E1-a: DRAFT → SENT (valid)
 *   E1-b: SENT → IN_TRANSIT (valid)
 *   E1-c: IN_TRANSIT → RECEIVED via receive() (valid, adds stock)
 *   E1-d: Skip DRAFT → IN_TRANSIT directly → BAD_REQUEST
 *   E1-e: Backward IN_TRANSIT → SENT → BAD_REQUEST
 *   E1-f: VENDOR cannot call updateStatus → FORBIDDEN
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createCallerFactory } from '@/server/trpc';
import { purchasesRouter } from '@/server/trpc/routers/purchases';
import type { Context } from '@/server/trpc/context';

const db = new PrismaClient();
const makePurchasesCaller = createCallerFactory(purchasesRouter);

function makeCaller(userId: string, role: 'VENDOR' | 'MANAGER' | 'ADMIN') {
  const ctx = {
    db,
    session: {
      user: {
        id: userId,
        name: `Test ${role}`,
        email: `${role.toLowerCase()}-buge@test.invalid`,
        role,
      },
      expires: new Date(Date.now() + 8 * 3600 * 1000).toISOString(),
    },
    req: { headers: { get: (_name: string) => null } },
  } as unknown as Context;
  return makePurchasesCaller(ctx);
}

// ─── Fixture IDs ─────────────────────────────────────────────────────────────

let managerId: string;
let vendorId: string;
let catId: string;
let whId: string;
let supplierId: string;
let productId: string;
let locationId: string;

// ─────────────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  const cat = await db.category.create({
    data: { name: 'TEST-BUGE-CAT', slug: 'test-buge-cat' },
  });
  catId = cat.id;

  const wh = await db.warehouse.create({ data: { name: 'TEST-BUGE-WH' } });
  whId = wh.id;

  const manager = await db.user.create({
    data: { name: 'Test Manager BugE', email: 'manager-buge@test.invalid', role: 'MANAGER' },
  });
  managerId = manager.id;

  const vendor = await db.user.create({
    data: { name: 'Test Vendor BugE', email: 'vendor-buge@test.invalid', role: 'VENDOR' },
  });
  vendorId = vendor.id;

  const supplier = await db.supplier.create({
    data: { name: 'TEST-BUGE-SUPPLIER', country: 'DO' },
  });
  supplierId = supplier.id;

  const product = await db.product.create({
    data: {
      sku: 'BUGE-PROD-1',
      name: 'Test Product BugE',
      categoryId: catId,
      unitCost: 100,
      retailPrice: 200,
      wholesalePrice: 160,
    },
  });
  productId = product.id;

  const loc = await db.productLocation.create({
    data: { productId, warehouseId: whId, locationCode: 'BUGE-LOC-A', quantityOnHand: 10 },
  });
  locationId = loc.id;
});

beforeEach(async () => {
  await db.inventoryMovement.deleteMany({ where: { locationId } });
  await db.purchaseOrderItem.deleteMany({
    where: { purchaseOrder: { supplierId } },
  });
  await db.auditLog.deleteMany({
    where: { entityType: 'PurchaseOrder', userId: { in: [managerId, vendorId] } },
  });
  await db.purchaseOrder.deleteMany({ where: { supplierId } });
  await db.productLocation.update({
    where: { id: locationId },
    data: { quantityOnHand: 10 },
  });
});

afterAll(async () => {
  await db.inventoryMovement.deleteMany({ where: { locationId } });
  await db.purchaseOrderItem.deleteMany({
    where: { purchaseOrder: { supplierId } },
  });
  await db.auditLog.deleteMany({
    where: { entityType: 'PurchaseOrder', userId: { in: [managerId, vendorId] } },
  });
  await db.purchaseOrder.deleteMany({ where: { supplierId } });
  await db.productLocation.deleteMany({ where: { id: locationId } });
  await db.product.deleteMany({ where: { id: productId } });
  await db.user.deleteMany({ where: { id: { in: [managerId, vendorId] } } });
  await db.supplier.delete({ where: { id: supplierId } }).catch(() => {});
  await db.warehouse.delete({ where: { id: whId } }).catch(() => {});
  await db.category.delete({ where: { id: catId } }).catch(() => {});
  await db.$disconnect();
});

// ─── Helper to create a DRAFT purchase order ─────────────────────────────────

async function createDraftPO() {
  const manager = makeCaller(managerId, 'MANAGER');
  return manager.create({
    supplierId,
    exchangeRate: 0.017,
    items: [{ productId, quantityOrdered: 5, unitCostUsd: 17 }],
    notes: 'Test PO BugE',
  });
}

// ─────────────────────────────────────────────────────────────────────────────

describe('Bug E-1 — Máquina de estados de Órdenes de Compra', () => {
  it('E1-a: DRAFT → SENT (transición válida)', async () => {
    const po = await createDraftPO();
    expect(po.status).toBe('DRAFT');

    const manager = makeCaller(managerId, 'MANAGER');
    const updated = await manager.updateStatus({ id: po.id, status: 'SENT' });
    expect(updated.status).toBe('SENT');
  });

  it('E1-b: SENT → IN_TRANSIT (transición válida)', async () => {
    const po = await createDraftPO();
    const manager = makeCaller(managerId, 'MANAGER');

    await manager.updateStatus({ id: po.id, status: 'SENT' });
    const updated = await manager.updateStatus({ id: po.id, status: 'IN_TRANSIT' });
    expect(updated.status).toBe('IN_TRANSIT');
  });

  it('E1-c: IN_TRANSIT → RECEIVED via receive() → stock aumenta', async () => {
    const po = await createDraftPO();
    const manager = makeCaller(managerId, 'MANAGER');

    await manager.updateStatus({ id: po.id, status: 'SENT' });
    await manager.updateStatus({ id: po.id, status: 'IN_TRANSIT' });

    // Get the PO items to build the receive payload
    const poWithItems = await db.purchaseOrder.findUnique({
      where: { id: po.id },
      include: { items: true },
    });
    const item = poWithItems!.items[0]!;

    const locBefore = await db.productLocation.findUnique({ where: { id: locationId } });
    const stockBefore = locBefore!.quantityOnHand; // 10

    await manager.receive({
      id: po.id,
      items: [{ itemId: item.id, quantityReceived: 5, locationId }],
    });

    const locAfter = await db.productLocation.findUnique({ where: { id: locationId } });
    expect(locAfter!.quantityOnHand).toBe(stockBefore + 5); // 15

    const receivedPO = await db.purchaseOrder.findUnique({ where: { id: po.id } });
    expect(receivedPO!.status).toBe('RECEIVED');
  });

  it('E1-d: saltar DRAFT → IN_TRANSIT directamente → BAD_REQUEST', async () => {
    const po = await createDraftPO();
    expect(po.status).toBe('DRAFT');

    const manager = makeCaller(managerId, 'MANAGER');
    await expect(
      manager.updateStatus({ id: po.id, status: 'IN_TRANSIT' })
    ).rejects.toThrow(/transición|estado|BAD_REQUEST/i);

    const unchanged = await db.purchaseOrder.findUnique({ where: { id: po.id } });
    expect(unchanged!.status).toBe('DRAFT');
  });

  it('E1-e: reversión IN_TRANSIT → SENT → BAD_REQUEST', async () => {
    const po = await createDraftPO();
    const manager = makeCaller(managerId, 'MANAGER');

    await manager.updateStatus({ id: po.id, status: 'SENT' });
    await manager.updateStatus({ id: po.id, status: 'IN_TRANSIT' });

    // Trying to go backwards
    await expect(
      manager.updateStatus({ id: po.id, status: 'SENT' })
    ).rejects.toThrow(/transición|estado|BAD_REQUEST/i);

    const unchanged = await db.purchaseOrder.findUnique({ where: { id: po.id } });
    expect(unchanged!.status).toBe('IN_TRANSIT');
  });

  it('E1-f: VENDOR intenta cambiar estado → FORBIDDEN', async () => {
    const po = await createDraftPO();

    const vendor = makeCaller(vendorId, 'VENDOR');
    await expect(
      vendor.updateStatus({ id: po.id, status: 'SENT' })
    ).rejects.toThrow(/FORBIDDEN|forbidden|MANAGER|ADMIN/i);

    const unchanged = await db.purchaseOrder.findUnique({ where: { id: po.id } });
    expect(unchanged!.status).toBe('DRAFT');
  });
});
