/**
 * Integration tests for the two-phase Transfer router (transfers.ts).
 *
 * Verifies exact stock arithmetic for the three paths:
 *   create  → status=PENDING,    reservedQuantity += qty, quantityOnHand UNCHANGED, 0 movements
 *   confirm → status=CONFIRMED,  quantityOnHand delta on both sides, reservedQuantity released, 2 TRANSFER movements
 *   cancel  → status=CANCELLED,  reservedQuantity released, quantityOnHand NEVER touched, 0 movements
 *
 * Also verifies state-machine guards: double-confirm and cancel-after-confirm both fail.
 *
 * Run with: npm test
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createCallerFactory } from '@/server/trpc';
import { transfersRouter } from '@/server/trpc/routers/transfers';
import type { Context } from '@/server/trpc/context';

const db = new PrismaClient();
const makeTransfersCaller = createCallerFactory(transfersRouter);

function makeCaller(userId: string, role: 'VENDOR' | 'MANAGER' | 'ADMIN') {
  const ctx = {
    db,
    session: {
      user: {
        id: userId,
        name: `Test ${role}`,
        email: `${role.toLowerCase()}-trf@test.invalid`,
        role,
      },
      expires: new Date(Date.now() + 8 * 3600 * 1000).toISOString(),
    },
    req: { headers: { get: (_name: string) => null } },
  } as unknown as Context;
  return makeTransfersCaller(ctx);
}

// ─── Fixture IDs ──────────────────────────────────────────────────────────────

let managerId: string;
let catId: string;
let fromWhId: string;
let toWhId: string;
let productId: string;
let originLocId: string;

// ─────────────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  // Pre-clean: remove fixtures orphaned by any previous failed run.
  // Uses stable names/SKUs so this is idempotent regardless of DB state.
  const orphanProduct = await db.product.findUnique({ where: { sku: 'TRF-PROD-1' } });
  if (orphanProduct) {
    await db.inventoryMovement.deleteMany({ where: { productId: orphanProduct.id } });
    const orphanWhs = await db.warehouse.findMany({
      where: { name: { in: ['TEST-TRF-WH-FROM', 'TEST-TRF-WH-TO'] } },
      select: { id: true },
    });
    const orphanWhIds = orphanWhs.map((w) => w.id);
    await db.transfer.deleteMany({
      where: { OR: [{ fromWarehouseId: { in: orphanWhIds } }, { toWarehouseId: { in: orphanWhIds } }] },
    });
    await db.productLocation.deleteMany({ where: { productId: orphanProduct.id } });
    await db.product.delete({ where: { id: orphanProduct.id } });
  }
  const orphanUser = await db.user.findFirst({ where: { email: 'manager-trf@test.invalid' } });
  if (orphanUser) {
    await db.auditLog.deleteMany({ where: { userId: orphanUser.id } });
    await db.user.delete({ where: { id: orphanUser.id } });
  }
  await db.warehouse.deleteMany({ where: { name: { in: ['TEST-TRF-WH-FROM', 'TEST-TRF-WH-TO'] } } });
  await db.category.deleteMany({ where: { name: 'TEST-TRF-CAT' } });

  // Create fresh fixtures
  const cat = await db.category.create({
    data: { name: 'TEST-TRF-CAT', slug: 'test-trf-cat' },
  });
  catId = cat.id;

  const fromWh = await db.warehouse.create({ data: { name: 'TEST-TRF-WH-FROM' } });
  fromWhId = fromWh.id;

  const toWh = await db.warehouse.create({ data: { name: 'TEST-TRF-WH-TO' } });
  toWhId = toWh.id;

  const manager = await db.user.create({
    data: { name: 'Test Manager TRF', email: 'manager-trf@test.invalid', role: 'MANAGER' },
  });
  managerId = manager.id;

  const product = await db.product.create({
    data: {
      sku: 'TRF-PROD-1',
      name: 'Test Product Transfer',
      categoryId: catId,
      unitCost: 100,
      retailPrice: 200,
      wholesalePrice: 160,
    },
  });
  productId = product.id;

  // Origin location: 100 units on hand, 0 reserved
  const originLoc = await db.productLocation.create({
    data: {
      productId,
      warehouseId: fromWhId,
      locationCode: 'TRF-LOC-FROM',
      quantityOnHand: 100,
      reservedQuantity: 0,
    },
  });
  originLocId = originLoc.id;

  // Ensure TRANSFER sequence row exists (normally inserted by migration 20260602000001)
  await db.sequence.upsert({
    where: { name: 'TRANSFER' },
    update: {},
    create: { name: 'TRANSFER', prefix: 'TRF-', padding: 4, currentValue: 0 },
  });
});

beforeEach(async () => {
  // Delete inventory movements for this test product (created by confirm)
  await db.inventoryMovement.deleteMany({ where: { productId } });
  // Delete all transfers touching test warehouses (cascade deletes TransferLines)
  await db.transfer.deleteMany({
    where: { OR: [{ fromWarehouseId: fromWhId }, { toWarehouseId: toWhId }] },
  });
  // Delete destination location if created by a previous confirm
  await db.productLocation.deleteMany({ where: { productId, warehouseId: toWhId } });
  // Reset origin to baseline: 100 on hand, 0 reserved
  await db.productLocation.update({
    where: { id: originLocId },
    data: { quantityOnHand: 100, reservedQuantity: 0 },
  });
});

afterAll(async () => {
  // Guard each deletion: if beforeAll crashed mid-flight, some IDs may be undefined.
  // Prisma treats { id: undefined } as no filter → would match all rows.
  if (productId) {
    await db.inventoryMovement.deleteMany({ where: { productId } });
  }
  if (fromWhId || toWhId) {
    await db.transfer.deleteMany({
      where: { OR: [{ fromWarehouseId: fromWhId }, { toWarehouseId: toWhId }] },
    });
  }
  if (productId) {
    await db.productLocation.deleteMany({ where: { productId } });
    await db.product.deleteMany({ where: { id: productId } });
  }
  if (managerId) {
    await db.auditLog.deleteMany({ where: { userId: managerId } });
    await db.user.deleteMany({ where: { id: managerId } });
  }
  const whIds = [fromWhId, toWhId].filter(Boolean);
  if (whIds.length) await db.warehouse.deleteMany({ where: { id: { in: whIds } } });
  if (catId) await db.category.delete({ where: { id: catId } }).catch(() => {});
  await db.$disconnect();
});

// ─────────────────────────────────────────────────────────────────────────────

describe('transfers.create — PENDING: reserva stock, sin movimientos físicos', () => {
  it('TRF-01: status=PENDING, reservedQty += qty, quantityOnHand sin cambio, 0 movimientos', async () => {
    const manager = makeCaller(managerId, 'MANAGER');
    const qty = 30;

    const transfer = await manager.create({
      fromWarehouseId: fromWhId,
      toWarehouseId: toWhId,
      lines: [{ productId, quantity: qty }],
      reason: 'Test TRF-01',
    });

    // Header
    expect(transfer.status).toBe('PENDING');
    expect(transfer.transferNumber).toMatch(/^TRF-\d{4}-\d{4}$/);

    // Origin: onHand unchanged, reserved += 30
    const originLoc = await db.productLocation.findUnique({ where: { id: originLocId } });
    expect(originLoc!.quantityOnHand).toBe(100); // unchanged
    expect(originLoc!.reservedQuantity).toBe(30); // reserved

    // Zero InventoryMovements
    const movements = await db.inventoryMovement.findMany({
      where: { referenceId: transfer.id },
    });
    expect(movements).toHaveLength(0);
  });

  it('TRF-02: falla con BAD_REQUEST si el stock disponible es insuficiente (reservedQuantity lo bloquea)', async () => {
    // origin: 100 on hand, 80 reserved → available = 20
    await db.productLocation.update({
      where: { id: originLocId },
      data: { quantityOnHand: 100, reservedQuantity: 80 },
    });

    const manager = makeCaller(managerId, 'MANAGER');

    // Requesting 30 but only 20 available
    await expect(
      manager.create({
        fromWarehouseId: fromWhId,
        toWarehouseId: toWhId,
        lines: [{ productId, quantity: 30 }],
        reason: 'Test TRF-02 shortage',
      }),
    ).rejects.toThrow(/insuficiente|disponible/i);

    // Stock completely untouched
    const originLoc = await db.productLocation.findUnique({ where: { id: originLocId } });
    expect(originLoc!.quantityOnHand).toBe(100);
    expect(originLoc!.reservedQuantity).toBe(80);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('transfers.confirm — movimiento físico, 2 InventoryMovements, reserva liberada', () => {
  it('TRF-03: confirm mueve stock, libera reserva, crea exactamente 2 TRANSFER movements ligados por transfer.id', async () => {
    const manager = makeCaller(managerId, 'MANAGER');
    const qty = 30;

    const pending = await manager.create({
      fromWarehouseId: fromWhId,
      toWarehouseId: toWhId,
      lines: [{ productId, quantity: qty }],
      reason: 'Test TRF-03',
    });
    expect(pending.status).toBe('PENDING');

    // Before confirm: verify reservation is in place
    const beforeConfirm = await db.productLocation.findUnique({ where: { id: originLocId } });
    expect(beforeConfirm!.reservedQuantity).toBe(qty);
    expect(beforeConfirm!.quantityOnHand).toBe(100);

    const confirmed = await manager.confirm({ id: pending.id });

    // Header
    expect(confirmed.status).toBe('CONFIRMED');

    // Origin: onHand -= 30, reservedQty -= 30 (CRITICAL: reservation released)
    const originLoc = await db.productLocation.findUnique({ where: { id: originLocId } });
    expect(originLoc!.quantityOnHand).toBe(70);  // 100 - 30
    expect(originLoc!.reservedQuantity).toBe(0);  // reservation released

    // Destination: created by upsert, onHand += 30
    const destLoc = await db.productLocation.findFirst({
      where: { productId, warehouseId: toWhId },
    });
    expect(destLoc).not.toBeNull();
    expect(destLoc!.quantityOnHand).toBe(30);

    // Exactly 2 TRANSFER movements linked by the same referenceId (transfer UUID)
    const movements = await db.inventoryMovement.findMany({
      where: { referenceId: pending.id },
    });
    expect(movements).toHaveLength(2);

    const outMov = movements.find((m) => m.quantity < 0);
    const inMov  = movements.find((m) => m.quantity > 0);
    expect(outMov).toBeDefined();
    expect(inMov).toBeDefined();

    // Correct signs
    expect(outMov!.quantity).toBe(-qty);
    expect(inMov!.quantity).toBe(qty);

    // Both are TRANSFER type
    expect(outMov!.movementType).toBe('TRANSFER');
    expect(inMov!.movementType).toBe('TRANSFER');

    // Correct locations
    expect(outMov!.locationId).toBe(originLocId);
    expect(inMov!.locationId).toBe(destLoc!.id);

    // Both legs share the transfer UUID as referenceId
    expect(outMov!.referenceId).toBe(inMov!.referenceId);
    expect(outMov!.referenceId).toBe(pending.id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('transfers.cancel — libera reserva, sin movimientos ni cambio en onHand', () => {
  it('TRF-04: cancel libera reservedQty, quantityOnHand nunca se toca, 0 movimientos', async () => {
    const manager = makeCaller(managerId, 'MANAGER');
    const qty = 25;

    const pending = await manager.create({
      fromWarehouseId: fromWhId,
      toWarehouseId: toWhId,
      lines: [{ productId, quantity: qty }],
      reason: 'Test TRF-04',
    });
    expect(pending.status).toBe('PENDING');

    // Verify reservation was made
    const beforeCancel = await db.productLocation.findUnique({ where: { id: originLocId } });
    expect(beforeCancel!.reservedQuantity).toBe(qty);
    expect(beforeCancel!.quantityOnHand).toBe(100);

    const cancelled = await manager.cancel({ id: pending.id, reason: 'Motivo de prueba TRF-04' });

    // Header
    expect(cancelled.status).toBe('CANCELLED');

    // Origin: reservedQty released, onHand never touched
    const originLoc = await db.productLocation.findUnique({ where: { id: originLocId } });
    expect(originLoc!.quantityOnHand).toBe(100); // never touched
    expect(originLoc!.reservedQuantity).toBe(0);  // released

    // Zero InventoryMovements
    const movements = await db.inventoryMovement.findMany({
      where: { referenceId: pending.id },
    });
    expect(movements).toHaveLength(0);

    // No destination location was ever created
    const destLoc = await db.productLocation.findFirst({
      where: { productId, warehouseId: toWhId },
    });
    expect(destLoc).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('State machine guards — transiciones inválidas deben fallar', () => {
  it('TRF-05: confirm sobre transferencia ya CONFIRMED → BAD_REQUEST (no doble-movimiento)', async () => {
    const manager = makeCaller(managerId, 'MANAGER');

    const pending = await manager.create({
      fromWarehouseId: fromWhId,
      toWarehouseId: toWhId,
      lines: [{ productId, quantity: 10 }],
    });

    await manager.confirm({ id: pending.id });

    // Second confirm must fail
    await expect(
      manager.confirm({ id: pending.id }),
    ).rejects.toThrow(/PENDING|estado/i);
  });

  it('TRF-06: cancel sobre transferencia ya CONFIRMED → BAD_REQUEST', async () => {
    const manager = makeCaller(managerId, 'MANAGER');

    const pending = await manager.create({
      fromWarehouseId: fromWhId,
      toWarehouseId: toWhId,
      lines: [{ productId, quantity: 10 }],
    });

    await manager.confirm({ id: pending.id });

    // Cancel after confirm must fail
    await expect(
      manager.cancel({ id: pending.id, reason: 'Intento de cancelar transferencia confirmada' }),
    ).rejects.toThrow(/PENDING|estado/i);
  });
});
