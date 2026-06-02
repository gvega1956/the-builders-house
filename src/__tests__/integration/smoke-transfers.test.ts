/**
 * Smoke test: two-phase transfer flow — end-to-end against real dev DB.
 * Verifies the three core paths (create/confirm/cancel) and state-machine guards.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createCallerFactory } from '@/server/trpc';
import { transfersRouter } from '@/server/trpc/routers/transfers';
import type { Context } from '@/server/trpc/context';

const db = new PrismaClient();
const makeTransfersCaller = createCallerFactory(transfersRouter);

function ctx(userId: string): Context {
  return {
    db,
    session: {
      user: { id: userId, email: 'smoke@test.invalid', role: 'MANAGER' },
      expires: new Date(Date.now() + 8 * 3600 * 1000).toISOString(),
    },
    req: { headers: { get: (_: string) => null } },
  } as unknown as Context;
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

let caller: ReturnType<typeof makeTransfersCaller>;
let whA: { id: string; name: string };
let whB: { id: string; name: string };
let product: { id: string; sku: string; name: string };
let originLocId: string;
const QTY = 10;

beforeAll(async () => {
  const warehouses = await db.warehouse.findMany({ where: { isActive: true }, select: { id: true, name: true } });
  expect(warehouses.length, 'Need ≥2 active warehouses').toBeGreaterThanOrEqual(2);
  [whA, whB] = warehouses;

  const manager = await db.user.findFirst({
    where: { OR: [{ role: 'MANAGER' }, { role: 'ADMIN' }], isActive: true },
    select: { id: true, email: true, role: true },
  });
  expect(manager, 'Need ≥1 MANAGER or ADMIN user').toBeTruthy();
  caller = makeTransfersCaller(ctx(manager!.id));

  const prod = await db.product.findFirst({ where: { isActive: true }, select: { id: true, sku: true, name: true } });
  expect(prod, 'Need ≥1 active product').toBeTruthy();
  product = prod!;

  // Upsert origin location with 50 units, 0 reserved
  const loc = await db.productLocation.upsert({
    where: { productId_warehouseId: { productId: product.id, warehouseId: whA.id } },
    update: { quantityOnHand: 50, reservedQuantity: 0 },
    create: { productId: product.id, warehouseId: whA.id, locationCode: 'SMOKE-A', quantityOnHand: 50, reservedQuantity: 0 },
  });
  originLocId = loc.id;

  // Clean destination location from previous smoke runs (movements must go first)
  const prevDest = await db.productLocation.findFirst({ where: { productId: product.id, warehouseId: whB.id } });
  if (prevDest) {
    await db.inventoryMovement.deleteMany({ where: { locationId: prevDest.id } });
    await db.productLocation.delete({ where: { id: prevDest.id } });
  }

  // Ensure TRANSFER sequence exists
  await db.sequence.upsert({
    where: { name: 'TRANSFER' },
    update: {},
    create: { name: 'TRANSFER', prefix: 'TRF-', padding: 4, currentValue: 0 },
  });
});

afterAll(async () => {
  // Clean up: movements referencing destination location must go before the location
  const destLoc = await db.productLocation.findFirst({ where: { productId: product.id, warehouseId: whB.id } });
  if (destLoc) {
    await db.inventoryMovement.deleteMany({ where: { locationId: destLoc.id } });
    await db.productLocation.delete({ where: { id: destLoc.id } });
  }
  // Delete smoke-test transfers (lines cascade)
  await db.transfer.deleteMany({ where: { reason: { in: ['Smoke test create', 'Smoke test cancel'] } } });
  // Reset origin to neutral (don't delete — it may be real data)
  await db.productLocation.update({ where: { id: originLocId }, data: { quantityOnHand: 50, reservedQuantity: 0 } });
  await db.$disconnect();
});

// ── STEP 1: CREATE → PENDING ───────────────────────────────────────────────

describe('Step 1 — transfers.create', () => {
  let transferId: string;
  let transferNumber: string;

  it('1a: creates with status=PENDING and correct transferNumber format', async () => {
    const t = await caller.create({
      fromWarehouseId: whA.id,
      toWarehouseId:   whB.id,
      lines: [{ productId: product.id, quantity: QTY }],
      reason: 'Smoke test create',
    });
    expect(t.status).toBe('PENDING');
    expect(t.transferNumber).toMatch(/^TRF-\d{4}-\d{4}$/);
    transferId     = t.id;
    transferNumber = t.transferNumber;
    // stash for subsequent tests in this describe
    (globalThis as Record<string, unknown>).__smokeTransferId = transferId;
    (globalThis as Record<string, unknown>).__smokeTransferNum = transferNumber;
  });

  it('1b: origin onHand UNCHANGED after create', async () => {
    const loc = await db.productLocation.findUnique({ where: { id: originLocId } });
    expect(loc!.quantityOnHand).toBe(50);
  });

  it('1c: origin reservedQuantity += qty after create', async () => {
    const loc = await db.productLocation.findUnique({ where: { id: originLocId } });
    expect(loc!.reservedQuantity).toBe(QTY);
  });

  it('1d: 0 InventoryMovements at PENDING state', async () => {
    const num = (globalThis as Record<string, unknown>).__smokeTransferNum as string;
    const movs = await db.inventoryMovement.findMany({ where: { referenceId: num } });
    expect(movs).toHaveLength(0);
  });
});

// ── STEP 2: CONFIRM → stock moves ─────────────────────────────────────────

describe('Step 2 — transfers.confirm', () => {
  it('2a: status becomes CONFIRMED', async () => {
    const id = (globalThis as Record<string, unknown>).__smokeTransferId as string;
    const t = await caller.confirm({ id });
    expect(t.status).toBe('CONFIRMED');
  });

  it('2b: origin onHand -= qty', async () => {
    const loc = await db.productLocation.findUnique({ where: { id: originLocId } });
    expect(loc!.quantityOnHand).toBe(50 - QTY);
  });

  it('2c CRITICAL: origin reservedQuantity released (back to 0)', async () => {
    const loc = await db.productLocation.findUnique({ where: { id: originLocId } });
    expect(loc!.reservedQuantity).toBe(0);
  });

  it('2d: destination onHand += qty', async () => {
    const dest = await db.productLocation.findFirst({ where: { productId: product.id, warehouseId: whB.id } });
    expect(dest).not.toBeNull();
    expect(dest!.quantityOnHand).toBe(QTY);
  });

  it('2e: exactly 2 TRANSFER InventoryMovements with same referenceId', async () => {
    const num = (globalThis as Record<string, unknown>).__smokeTransferNum as string;
    const movs = await db.inventoryMovement.findMany({ where: { referenceId: num } });
    expect(movs).toHaveLength(2);
    const out = movs.find(m => m.quantity < 0)!;
    const inn = movs.find(m => m.quantity > 0)!;
    expect(out.quantity).toBe(-QTY);
    expect(inn.quantity).toBe(QTY);
    expect(out.movementType).toBe('TRANSFER');
    expect(inn.movementType).toBe('TRANSFER');
    expect(out.referenceId).toBe(inn.referenceId);
  });
});

// ── STEP 3: CANCEL → reservation released, 0 movements ───────────────────

describe('Step 3 — transfers.cancel', () => {
  let cancelTransferId: string;
  let cancelTransferNum: string;
  let onHandBeforeCancel: number;
  let reservedBeforeCancel: number;

  it('setup: create a second transfer and capture baseline', async () => {
    const t = await caller.create({
      fromWarehouseId: whA.id,
      toWarehouseId:   whB.id,
      lines: [{ productId: product.id, quantity: 5 }],
      reason: 'Smoke test cancel',
    });
    cancelTransferId = t.id;
    cancelTransferNum = t.transferNumber;
    const loc = await db.productLocation.findUnique({ where: { id: originLocId } });
    onHandBeforeCancel   = loc!.quantityOnHand;
    reservedBeforeCancel = loc!.reservedQuantity;
  });

  it('3a: status becomes CANCELLED', async () => {
    const t = await caller.cancel({ id: cancelTransferId, reason: 'Smoke test cancel reason' });
    expect(t.status).toBe('CANCELLED');
  });

  it('3b: origin onHand NEVER touched', async () => {
    const loc = await db.productLocation.findUnique({ where: { id: originLocId } });
    expect(loc!.quantityOnHand).toBe(onHandBeforeCancel);
  });

  it('3c: origin reservedQuantity released', async () => {
    const loc = await db.productLocation.findUnique({ where: { id: originLocId } });
    expect(loc!.reservedQuantity).toBe(reservedBeforeCancel - 5);
  });

  it('3d: 0 InventoryMovements on cancel', async () => {
    const movs = await db.inventoryMovement.findMany({ where: { referenceId: cancelTransferNum } });
    expect(movs).toHaveLength(0);
  });
});

// ── Guards ─────────────────────────────────────────────────────────────────

describe('State machine guards', () => {
  it('Guard 1: double-confirm rejected', async () => {
    const id = (globalThis as Record<string, unknown>).__smokeTransferId as string;
    await expect(caller.confirm({ id })).rejects.toThrow(/PENDING|estado/i);
  });

  it('Guard 2: cancel-after-confirm rejected', async () => {
    const id = (globalThis as Record<string, unknown>).__smokeTransferId as string;
    await expect(caller.cancel({ id, reason: 'Late cancel' })).rejects.toThrow(/PENDING|estado/i);
  });
});
