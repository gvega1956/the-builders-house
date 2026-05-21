/**
 * Integration tests for Bug 2.2 — Anulación revierte inventario.
 *
 * Validates that void restores stock correctly via RETURN movements:
 * - ISSUED invoice void: RETURN movement created, stock restored
 * - PARTIAL invoice void: RETURN movement created, stock restored
 * - PENDING_AUTHORIZATION void: NO RETURN (no OUT was ever created)
 * - Orphan item (locationId=NULL via ON DELETE SET NULL): void succeeds,
 *   stock NOT restored for that item, audit log records the exception
 * - PAID invoice void: BAD_REQUEST (pre-existing guard — not changed)
 *
 * Run with: npm test
 *
 * AUDIT-BUG-22
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createCallerFactory } from '@/server/trpc';
import { invoicingRouter } from '@/server/trpc/routers/invoicing';
import type { Context } from '@/server/trpc/context';

const db = new PrismaClient();
const makeInvoicingCaller = createCallerFactory(invoicingRouter);

function makeCaller(userId: string, role: 'VENDOR' | 'MANAGER' | 'ADMIN') {
  const ctx = {
    db,
    session: {
      user: {
        id: userId,
        name: `Test ${role}`,
        email: `${role.toLowerCase()}-bug22@test.invalid`,
        role,
      },
      expires: new Date(Date.now() + 8 * 3600 * 1000).toISOString(),
    },
    req: { headers: { get: (_name: string) => null } },
  } as unknown as Context;
  return makeInvoicingCaller(ctx);
}

// ─── Fixture IDs ─────────────────────────────────────────────────────────────

let vendorId: string;
let managerId: string;
let customerId: string;
let catId: string;
let whId: string;
let productId: string;
let locationId: string;

// ─────────────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  const cat = await db.category.create({
    data: { name: 'TEST-INVOICING-BUG22-CAT', slug: 'test-inv-bug22' },
  });
  catId = cat.id;

  const wh = await db.warehouse.create({ data: { name: 'TEST-INVOICING-BUG22-WH' } });
  whId = wh.id;

  const vendor = await db.user.create({
    data: { name: 'Test Vendor Bug22', email: 'vendor-bug22@test.invalid', role: 'VENDOR' },
  });
  vendorId = vendor.id;

  const manager = await db.user.create({
    data: { name: 'Test Manager Bug22', email: 'manager-bug22@test.invalid', role: 'MANAGER' },
  });
  managerId = manager.id;

  const customer = await db.customer.create({
    data: { code: 'CLI-BUG22-TEST', name: 'Test Customer Bug22', type: 'RETAIL' },
  });
  customerId = customer.id;

  const product = await db.product.create({
    data: {
      sku: 'BUG22-PROD-1',
      name: 'Test Product Bug22',
      categoryId: catId,
      unitCost: 50,
      retailPrice: 100,
      wholesalePrice: 80,
    },
  });
  productId = product.id;

  const loc = await db.productLocation.create({
    data: { productId, warehouseId: whId, locationCode: 'BUG22-LOC-A', quantityOnHand: 100 },
  });
  locationId = loc.id;
});

beforeEach(async () => {
  await db.invoice.updateMany({
    where: { customerId, sourceQuoteId: { not: null } },
    data: { sourceQuoteId: null },
  });
  await db.payment.deleteMany({ where: { invoice: { customerId } } });
  await db.inventoryMovement.deleteMany({ where: { locationId } });
  await db.auditLog.deleteMany({
    where: { entityType: 'Invoice', userId: { in: [vendorId, managerId] } },
  });
  await db.invoice.deleteMany({ where: { customerId } });
  await db.productLocation.update({
    where: { id: locationId },
    data: { quantityOnHand: 100, reservedQuantity: 0 },
  });
});

afterAll(async () => {
  await db.invoice.updateMany({
    where: { customerId, sourceQuoteId: { not: null } },
    data: { sourceQuoteId: null },
  });
  await db.payment.deleteMany({ where: { invoice: { customerId } } });
  await db.inventoryMovement.deleteMany({ where: { locationId } });
  await db.auditLog.deleteMany({
    where: { entityType: 'Invoice', userId: { in: [vendorId, managerId] } },
  });
  await db.invoice.deleteMany({ where: { customerId } });
  await db.productLocation.deleteMany({ where: { id: locationId } });
  await db.product.deleteMany({ where: { id: productId } });
  await db.customer.delete({ where: { id: customerId } }).catch(() => {});
  await db.user.deleteMany({ where: { id: { in: [vendorId, managerId] } } });
  await db.warehouse.delete({ where: { id: whId } }).catch(() => {});
  await db.category.delete({ where: { id: catId } }).catch(() => {});
  await db.$disconnect();
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Bug 2.2 — Anulación revierte inventario', () => {
  it('T1: anular INVOICE ISSUED restaura stock con movimiento RETURN de cantidad positiva', async () => {
    await db.productLocation.update({
      where: { id: locationId },
      data: { quantityOnHand: 50 },
    });

    const vendor = makeCaller(vendorId, 'VENDOR');
    const invoice = await vendor.create({
      customerId,
      type: 'INVOICE',
      items: [{ productId, locationId, quantity: 8, unitPrice: 100 }],
      taxRate: 0.115,
    });
    expect(invoice.status).toBe('ISSUED');

    const locAfterCreate = await db.productLocation.findUnique({ where: { id: locationId } });
    expect(locAfterCreate!.quantityOnHand).toBe(42); // 50 - 8

    await vendor.void({ id: invoice.id, reason: 'Pedido cancelado por el cliente' });

    // Stock must be fully restored
    const locAfterVoid = await db.productLocation.findUnique({ where: { id: locationId } });
    expect(locAfterVoid!.quantityOnHand).toBe(50); // 42 + 8

    // RETURN movement with positive quantity (stock re-entry)
    const movements = await db.inventoryMovement.findMany({ where: { locationId } });
    expect(movements).toHaveLength(2); // 1 OUT (create) + 1 RETURN (void)

    const returnMovement = movements.find((m) => m.movementType === 'RETURN');
    expect(returnMovement).toBeDefined();
    expect(returnMovement!.quantity).toBe(8); // positive — sign convention for RETURN
    expect(returnMovement!.referenceId).toBe(invoice.invoiceNumber);
  });

  it('T2: anular INVOICE PARTIAL restaura el stock completo (el pago parcial no afecta el inventario)', async () => {
    await db.productLocation.update({
      where: { id: locationId },
      data: { quantityOnHand: 50 },
    });

    const vendor = makeCaller(vendorId, 'VENDOR');
    const invoice = await vendor.create({
      customerId,
      type: 'INVOICE',
      items: [{ productId, locationId, quantity: 5, unitPrice: 200 }],
      taxRate: 0.115,
    });
    expect(invoice.status).toBe('ISSUED');

    // Partial payment — invoice becomes PARTIAL
    await vendor.addPayment({ invoiceId: invoice.id, amount: 100, method: 'CASH' });
    const invoicePartial = await db.invoice.findUnique({ where: { id: invoice.id } });
    expect(invoicePartial!.status).toBe('PARTIAL');

    const locAfterCreate = await db.productLocation.findUnique({ where: { id: locationId } });
    expect(locAfterCreate!.quantityOnHand).toBe(45); // 50 - 5

    await vendor.void({ id: invoice.id, reason: 'Devolución total — pago parcial registrado externamente' });

    // Full inventory restoration regardless of partial payment
    const locAfterVoid = await db.productLocation.findUnique({ where: { id: locationId } });
    expect(locAfterVoid!.quantityOnHand).toBe(50); // 45 + 5

    const returnMovement = await db.inventoryMovement.findFirst({
      where: { locationId, movementType: 'RETURN' },
    });
    expect(returnMovement).not.toBeNull();
    expect(returnMovement!.quantity).toBe(5);

    const voidedInvoice = await db.invoice.findUnique({ where: { id: invoice.id } });
    expect(voidedInvoice!.status).toBe('VOIDED');
  });

  it('T3: anular INVOICE PENDING_AUTHORIZATION NO crea movimiento RETURN (nunca hubo OUT)', async () => {
    await db.productLocation.update({
      where: { id: locationId },
      data: { quantityOnHand: 2 },
    });

    const vendor = makeCaller(vendorId, 'VENDOR');
    const invoice = await vendor.create({
      customerId,
      type: 'INVOICE',
      items: [{ productId, locationId, quantity: 10, unitPrice: 100 }],
      taxRate: 0.115,
    });
    expect(invoice.status).toBe('PENDING_AUTHORIZATION');

    // Stock was never decremented — still at 2
    const locBefore = await db.productLocation.findUnique({ where: { id: locationId } });
    expect(locBefore!.quantityOnHand).toBe(2);

    await vendor.void({ id: invoice.id, reason: 'Backorder rechazado — sin stock disponible' });

    // No RETURN movement — PENDING_AUTHORIZATION never created OUT movements
    const movements = await db.inventoryMovement.findMany({ where: { locationId } });
    expect(movements).toHaveLength(0);

    // Stock remains at 2 — nothing to restore
    const locAfter = await db.productLocation.findUnique({ where: { id: locationId } });
    expect(locAfter!.quantityOnHand).toBe(2);

    const voidedInvoice = await db.invoice.findUnique({ where: { id: invoice.id } });
    expect(voidedInvoice!.status).toBe('VOIDED');
  });

  it('T4: anular INVOICE con item locationId=NULL — factura se anula, stock NO se restaura, audit registra excepción', async () => {
    await db.productLocation.update({
      where: { id: locationId },
      data: { quantityOnHand: 50 },
    });

    const vendor = makeCaller(vendorId, 'VENDOR');
    const invoice = await vendor.create({
      customerId,
      type: 'INVOICE',
      items: [{ productId, locationId, quantity: 3, unitPrice: 100 }],
      taxRate: 0.115,
    });
    expect(invoice.status).toBe('ISSUED');

    const locAfterCreate = await db.productLocation.findUnique({ where: { id: locationId } });
    expect(locAfterCreate!.quantityOnHand).toBe(47); // 50 - 3

    // Simulate ON DELETE SET NULL: the ProductLocation was deleted after the invoice was created.
    // The FK nullifies locationId on the invoice_item — we replicate this directly.
    await db.invoiceItem.updateMany({
      where: { invoiceId: invoice.id },
      data: { locationId: null },
    });

    // Void must succeed even with orphan items
    await vendor.void({ id: invoice.id, reason: 'Anulación con ubicación eliminada' });

    const voidedInvoice = await db.invoice.findUnique({ where: { id: invoice.id } });
    expect(voidedInvoice!.status).toBe('VOIDED');

    // NO RETURN movement — locationId was NULL, stock cannot be restored
    const returnMovements = await db.inventoryMovement.findMany({
      where: { locationId, movementType: 'RETURN' },
    });
    expect(returnMovements).toHaveLength(0);

    // Stock remains decremented — no way to restore without a valid location
    const locAfterVoid = await db.productLocation.findUnique({ where: { id: locationId } });
    expect(locAfterVoid!.quantityOnHand).toBe(47);

    // Audit log must record the orphan exception explicitly
    const audit = await db.auditLog.findFirst({
      where: { entityId: invoice.id, action: 'VOID' },
    });
    expect(audit!.newValues).toMatchObject({
      stockNotRestoredItems: expect.arrayContaining([
        expect.objectContaining({ productId, quantity: 3 }),
      ]),
      stockNotRestoredReason: expect.stringContaining('locationId=NULL'),
    });
  });

  it('T5: anular INVOICE PAID → BAD_REQUEST (regla pre-existente no modificada)', async () => {
    const vendor = makeCaller(vendorId, 'VENDOR');
    const invoice = await vendor.create({
      customerId,
      type: 'INVOICE',
      items: [{ productId, locationId, quantity: 1, unitPrice: 100 }],
      taxRate: 0.115,
    });

    // Full payment — invoice becomes PAID
    await vendor.addPayment({
      invoiceId: invoice.id,
      amount: Number(invoice.total),
      method: 'CASH',
    });
    const paidInvoice = await db.invoice.findUnique({ where: { id: invoice.id } });
    expect(paidInvoice!.status).toBe('PAID');

    await expect(
      vendor.void({ id: invoice.id, reason: 'intento de anulación' })
    ).rejects.toThrow(/pagada/);
  });
});
