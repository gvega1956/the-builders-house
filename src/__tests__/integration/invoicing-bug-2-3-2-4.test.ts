/**
 * Integration tests for Bugs 2.3 + 2.4 — Pago no excede balance + currentBalance del cliente.
 *
 * Bug 2.3 — addPayment validates that payment does not exceed outstanding balance;
 *            new status guards for PENDING_AUTHORIZATION, DRAFT, CONVERTED.
 * Bug 2.4 — customer.currentBalance is updated on:
 *            create (ISSUED only), authorizeBackorder, convertQuoteToInvoice (ISSUED only),
 *            addPayment (decrement by amount), void (decrement by total - paidAmount).
 *
 * Run with: npm test
 *
 * AUDIT-BUG-23, AUDIT-BUG-24
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
        email: `${role.toLowerCase()}-bug2324@test.invalid`,
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
    data: { name: 'TEST-INV-BUG2324-CAT', slug: 'test-inv-bug2324' },
  });
  catId = cat.id;

  const wh = await db.warehouse.create({ data: { name: 'TEST-INV-BUG2324-WH' } });
  whId = wh.id;

  const vendor = await db.user.create({
    data: { name: 'Test Vendor Bug2324', email: 'vendor-bug2324@test.invalid', role: 'VENDOR' },
  });
  vendorId = vendor.id;

  const manager = await db.user.create({
    data: { name: 'Test Manager Bug2324', email: 'manager-bug2324@test.invalid', role: 'MANAGER' },
  });
  managerId = manager.id;

  const customer = await db.customer.create({
    data: { code: 'CLI-BUG2324-TEST', name: 'Test Customer Bug2324', type: 'RETAIL' },
  });
  customerId = customer.id;

  const product = await db.product.create({
    data: {
      sku: 'BUG2324-PROD-1',
      name: 'Test Product Bug2324',
      categoryId: catId,
      unitCost: 50,
      retailPrice: 100,
      wholesalePrice: 80,
    },
  });
  productId = product.id;

  const loc = await db.productLocation.create({
    data: { productId, warehouseId: whId, locationCode: 'BUG2324-LOC-A', quantityOnHand: 1000 },
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
    data: { quantityOnHand: 1000, reservedQuantity: 0 },
  });
  await db.customer.update({
    where: { id: customerId },
    data: { currentBalance: 0 },
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

describe('Bug 2.3 — addPayment no excede balance', () => {
  it('T1: pago exacto del balance pendiente → PAID, paidAmount = total', async () => {
    const vendor = makeCaller(vendorId, 'VENDOR');
    const invoice = await vendor.create({
      customerId,
      type: 'INVOICE',
      items: [{ productId, locationId, quantity: 2, unitPrice: 100 }],
      taxRate: 0.115,
    });
    const invoiceTotal = Number(invoice.total); // 2*100*1.115 = 223

    await vendor.addPayment({ invoiceId: invoice.id, amount: invoiceTotal, method: 'CASH' });

    const paid = await db.invoice.findUnique({ where: { id: invoice.id } });
    expect(paid!.status).toBe('PAID');
    expect(Number(paid!.paidAmount)).toBeCloseTo(invoiceTotal, 2);
  });

  it('T2: pago parcial → PARTIAL, paidAmount se actualiza correctamente', async () => {
    const vendor = makeCaller(vendorId, 'VENDOR');
    const invoice = await vendor.create({
      customerId,
      type: 'INVOICE',
      items: [{ productId, locationId, quantity: 1, unitPrice: 200 }],
      taxRate: 0.115,
    });

    await vendor.addPayment({ invoiceId: invoice.id, amount: 100, method: 'TRANSFER' });

    const partial = await db.invoice.findUnique({ where: { id: invoice.id } });
    expect(partial!.status).toBe('PARTIAL');
    expect(Number(partial!.paidAmount)).toBeCloseTo(100, 2);
    expect(Number(partial!.total)).toBeCloseTo(Number(invoice.total), 2);
  });

  it('T3: pago que excede balance pendiente → BAD_REQUEST con monto en mensaje', async () => {
    const vendor = makeCaller(vendorId, 'VENDOR');
    const invoice = await vendor.create({
      customerId,
      type: 'INVOICE',
      items: [{ productId, locationId, quantity: 1, unitPrice: 100 }],
      taxRate: 0.115,
    });
    // total = 111.50; pagar 200 → debe rechazarse
    await expect(
      vendor.addPayment({ invoiceId: invoice.id, amount: 200, method: 'CASH' })
    ).rejects.toThrow(/excede/);
  });

  it('T4: pago a factura VOIDED → BAD_REQUEST', async () => {
    const vendor = makeCaller(vendorId, 'VENDOR');
    const invoice = await vendor.create({
      customerId,
      type: 'INVOICE',
      items: [{ productId, locationId, quantity: 1, unitPrice: 50 }],
      taxRate: 0.115,
    });
    await vendor.void({ id: invoice.id, reason: 'Cancelado' });

    await expect(
      vendor.addPayment({ invoiceId: invoice.id, amount: 10, method: 'CASH' })
    ).rejects.toThrow(/anulada/i);
  });

  it('T5: pago a factura PENDING_AUTHORIZATION → BAD_REQUEST', async () => {
    await db.productLocation.update({ where: { id: locationId }, data: { quantityOnHand: 1 } });
    const vendor = makeCaller(vendorId, 'VENDOR');
    const invoice = await vendor.create({
      customerId,
      type: 'INVOICE',
      items: [{ productId, locationId, quantity: 100, unitPrice: 50 }],
      taxRate: 0.115,
    });
    expect(invoice.status).toBe('PENDING_AUTHORIZATION');

    await expect(
      vendor.addPayment({ invoiceId: invoice.id, amount: 10, method: 'CASH' })
    ).rejects.toThrow(/pendiente de autorización/i);
  });

  it('T6: pago a factura DRAFT → BAD_REQUEST', async () => {
    // Router never creates DRAFT — insert directly in DB to simulate it.
    const draft = await db.invoice.create({
      data: {
        customerId,
        type: 'INVOICE',
        invoiceNumber: 'DRAFT-BUG2324-TEST',
        status: 'DRAFT',
        subtotal: 100,
        taxRate: 0.115,
        taxAmount: 11.5,
        total: 111.5,
        paidAmount: 0,
        createdById: vendorId,
      },
    });

    const vendor = makeCaller(vendorId, 'VENDOR');
    await expect(
      vendor.addPayment({ invoiceId: draft.id, amount: 10, method: 'CASH' })
    ).rejects.toThrow(/borrador/i);
  });

  it('T7: dos pagos parciales sumando el total → segundo pago marca PAID', async () => {
    const vendor = makeCaller(vendorId, 'VENDOR');
    // taxRate: 0 → total exacto sin decimales complejos
    const invoice = await vendor.create({
      customerId,
      type: 'INVOICE',
      items: [{ productId, locationId, quantity: 2, unitPrice: 100 }],
      taxRate: 0,
    });
    const invoiceTotal = Number(invoice.total); // 200.00

    await vendor.addPayment({ invoiceId: invoice.id, amount: 100, method: 'CASH' });
    const afterFirst = await db.invoice.findUnique({ where: { id: invoice.id } });
    expect(afterFirst!.status).toBe('PARTIAL');

    await vendor.addPayment({ invoiceId: invoice.id, amount: 100, method: 'TRANSFER' });
    const afterSecond = await db.invoice.findUnique({ where: { id: invoice.id } });
    expect(afterSecond!.status).toBe('PAID');
    expect(Number(afterSecond!.paidAmount)).toBeCloseTo(invoiceTotal, 2);
  });

  it('T8: audit log contiene previousBalance, newBalance, previousStatus y newStatus', async () => {
    const vendor = makeCaller(vendorId, 'VENDOR');
    const invoice = await vendor.create({
      customerId,
      type: 'INVOICE',
      items: [{ productId, locationId, quantity: 1, unitPrice: 100 }],
      taxRate: 0.115,
    });
    const invoiceTotal = Number(invoice.total); // 111.50

    await vendor.addPayment({ invoiceId: invoice.id, amount: 50, method: 'CHECK' });

    const audit = await db.auditLog.findFirst({
      where: { entityId: invoice.id, action: 'PAYMENT' },
    });
    expect(audit).not.toBeNull();
    const values = audit!.newValues as Record<string, unknown>;
    expect(parseFloat(values.previousBalance as string)).toBeCloseTo(invoiceTotal, 2);
    expect(parseFloat(values.newBalance as string)).toBeCloseTo(invoiceTotal - 50, 2);
    expect(values.previousStatus).toBe('ISSUED');
    expect(values.newStatus).toBe('PARTIAL');
  });
});

describe('Bug 2.4 — currentBalance del cliente', () => {
  it('T9a: crear INVOICE ISSUED → currentBalance del cliente += total', async () => {
    const vendor = makeCaller(vendorId, 'VENDOR');
    const invoice = await vendor.create({
      customerId,
      type: 'INVOICE',
      items: [{ productId, locationId, quantity: 3, unitPrice: 100 }],
      taxRate: 0.115,
    });
    const invoiceTotal = Number(invoice.total); // 334.50

    const after = await db.customer.findUnique({ where: { id: customerId } });
    expect(Number(after!.currentBalance)).toBeCloseTo(invoiceTotal, 2);
  });

  it('T9b: crear INVOICE PENDING_AUTHORIZATION → currentBalance NO cambia', async () => {
    await db.productLocation.update({ where: { id: locationId }, data: { quantityOnHand: 1 } });
    const vendor = makeCaller(vendorId, 'VENDOR');
    const invoice = await vendor.create({
      customerId,
      type: 'INVOICE',
      items: [{ productId, locationId, quantity: 100, unitPrice: 50 }],
      taxRate: 0.115,
    });
    expect(invoice.status).toBe('PENDING_AUTHORIZATION');

    const after = await db.customer.findUnique({ where: { id: customerId } });
    expect(Number(after!.currentBalance)).toBe(0);
  });

  it('T9c: authorizeBackorder → currentBalance += total (manager override comprometió stock)', async () => {
    await db.productLocation.update({ where: { id: locationId }, data: { quantityOnHand: 1 } });
    const vendor = makeCaller(vendorId, 'VENDOR');
    const invoice = await vendor.create({
      customerId,
      type: 'INVOICE',
      items: [{ productId, locationId, quantity: 100, unitPrice: 50 }],
      taxRate: 0.115,
    });
    expect(invoice.status).toBe('PENDING_AUTHORIZATION');
    expect(Number((await db.customer.findUnique({ where: { id: customerId } }))!.currentBalance)).toBe(0);

    const manager = makeCaller(managerId, 'MANAGER');
    await manager.authorizeBackorder({ id: invoice.id, authorizationNotes: 'Autorizado backorder' });

    const after = await db.customer.findUnique({ where: { id: customerId } });
    expect(Number(after!.currentBalance)).toBeCloseTo(Number(invoice.total), 2);
  });

  it('T10a: addPayment → currentBalance del cliente decrece por el monto pagado', async () => {
    const vendor = makeCaller(vendorId, 'VENDOR');
    const invoice = await vendor.create({
      customerId,
      type: 'INVOICE',
      items: [{ productId, locationId, quantity: 2, unitPrice: 100 }],
      taxRate: 0.115,
    });
    const invoiceTotal = Number(invoice.total); // 223.00

    await vendor.addPayment({ invoiceId: invoice.id, amount: 100, method: 'CASH' });

    const after = await db.customer.findUnique({ where: { id: customerId } });
    expect(Number(after!.currentBalance)).toBeCloseTo(invoiceTotal - 100, 2);
  });

  it('T10b: void INVOICE ISSUED → currentBalance decrece por total (paidAmount=0)', async () => {
    const vendor = makeCaller(vendorId, 'VENDOR');
    const invoice = await vendor.create({
      customerId,
      type: 'INVOICE',
      items: [{ productId, locationId, quantity: 1, unitPrice: 200 }],
      taxRate: 0.115,
    });
    const invoiceTotal = Number(invoice.total); // 223.00

    expect(Number((await db.customer.findUnique({ where: { id: customerId } }))!.currentBalance))
      .toBeCloseTo(invoiceTotal, 2);

    await vendor.void({ id: invoice.id, reason: 'Cancelación total' });

    const after = await db.customer.findUnique({ where: { id: customerId } });
    expect(Number(after!.currentBalance)).toBeCloseTo(0, 2);
  });

  it('T10c: void INVOICE PARTIAL → currentBalance decrece solo por saldo pendiente (total - paidAmount)', async () => {
    const vendor = makeCaller(vendorId, 'VENDOR');
    const invoice = await vendor.create({
      customerId,
      type: 'INVOICE',
      items: [{ productId, locationId, quantity: 2, unitPrice: 100 }],
      taxRate: 0,
    });
    // total = 200 exacto sin decimales

    await vendor.addPayment({ invoiceId: invoice.id, amount: 100, method: 'CASH' });
    // customer.currentBalance = 200 - 100 = 100

    await vendor.void({ id: invoice.id, reason: 'Devolución con pago parcial' });
    // void decrement = total - paidAmount = 200 - 100 = 100
    // customer.currentBalance = 100 - 100 = 0

    const after = await db.customer.findUnique({ where: { id: customerId } });
    expect(Number(after!.currentBalance)).toBeCloseTo(0, 2);
  });

  it('T11: ciclo completo $1000 + IVU 11.5% — dos pagos hasta PAID, intento final rechazado', async () => {
    // Factura: 1 ítem × $1000, IVU 11.5% → total = $1115.00
    const vendor = makeCaller(vendorId, 'VENDOR');
    const invoice = await vendor.create({
      customerId,
      type: 'INVOICE',
      items: [{ productId, locationId, quantity: 1, unitPrice: 1000 }],
      taxRate: 0.115,
    });
    expect(Number(invoice.total)).toBeCloseTo(1115, 2);
    expect(invoice.status).toBe('ISSUED');

    let customer = await db.customer.findUnique({ where: { id: customerId } });
    expect(Number(customer!.currentBalance)).toBeCloseTo(1115, 2); // 0 + 1115

    // Pago 1: $500 → PARTIAL, paidAmount=500, balance cliente=615
    await vendor.addPayment({ invoiceId: invoice.id, amount: 500, method: 'CASH' });
    let inv = await db.invoice.findUnique({ where: { id: invoice.id } });
    expect(inv!.status).toBe('PARTIAL');
    expect(Number(inv!.paidAmount)).toBeCloseTo(500, 2);
    customer = await db.customer.findUnique({ where: { id: customerId } });
    expect(Number(customer!.currentBalance)).toBeCloseTo(615, 2); // 1115 - 500

    // Pago 2: $615 → PAID, paidAmount=1115, balance cliente=0
    await vendor.addPayment({ invoiceId: invoice.id, amount: 615, method: 'TRANSFER' });
    inv = await db.invoice.findUnique({ where: { id: invoice.id } });
    expect(inv!.status).toBe('PAID');
    expect(Number(inv!.paidAmount)).toBeCloseTo(1115, 2);
    customer = await db.customer.findUnique({ where: { id: customerId } });
    expect(Number(customer!.currentBalance)).toBeCloseTo(0, 2); // 615 - 615

    // Pago 3: $0.01 → BAD_REQUEST (factura ya PAID — guard de status, no de balance)
    // El guard invoice.status === 'PAID' dispara antes del balance check.
    // Mensaje: "La factura ya está completamente pagada."
    await expect(
      vendor.addPayment({ invoiceId: invoice.id, amount: 0.01, method: 'CASH' })
    ).rejects.toThrow(/pagada/i);
  });
});
