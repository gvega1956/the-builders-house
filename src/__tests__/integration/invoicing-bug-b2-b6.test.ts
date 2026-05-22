/**
 * Integration tests for Bugs B-2 through B-6 (invoicing router).
 *
 * B-2: void requires MANAGER or ADMIN — VENDOR gets FORBIDDEN
 * B-3: CREDIT_NOTE requires sourceInvoiceId (Zod validation, server-side)
 * B-4: CREDIT_NOTE reverses stock and currentBalance of source invoice
 * B-5: addPayment rejects QUOTE and CREDIT_NOTE types
 * B-6: create rejects inactive customers
 *
 * Run with: npm test
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
        email: `${role.toLowerCase()}-bugb@test.invalid`,
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
let inactiveCustomerId: string;
let catId: string;
let whId: string;
let productId: string;
let locationId: string;

// ─────────────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  const cat = await db.category.create({
    data: { name: 'TEST-BUGB-CAT', slug: 'test-bugb-cat' },
  });
  catId = cat.id;

  const wh = await db.warehouse.create({ data: { name: 'TEST-BUGB-WH' } });
  whId = wh.id;

  const vendor = await db.user.create({
    data: { name: 'Test Vendor BugB', email: 'vendor-bugb@test.invalid', role: 'VENDOR' },
  });
  vendorId = vendor.id;

  const manager = await db.user.create({
    data: { name: 'Test Manager BugB', email: 'manager-bugb@test.invalid', role: 'MANAGER' },
  });
  managerId = manager.id;

  const customer = await db.customer.create({
    data: { code: 'CLI-BUGB-ACTIVE', name: 'Test Customer BugB Active', type: 'RETAIL' },
  });
  customerId = customer.id;

  const inactiveCustomer = await db.customer.create({
    data: { code: 'CLI-BUGB-INACTIVE', name: 'Test Customer BugB Inactive', type: 'RETAIL', isActive: false },
  });
  inactiveCustomerId = inactiveCustomer.id;

  const product = await db.product.create({
    data: {
      sku: 'BUGB-PROD-1',
      name: 'Test Product BugB',
      categoryId: catId,
      unitCost: 50,
      retailPrice: 100,
      wholesalePrice: 80,
    },
  });
  productId = product.id;

  const loc = await db.productLocation.create({
    data: { productId, warehouseId: whId, locationCode: 'BUGB-LOC-A', quantityOnHand: 200 },
  });
  locationId = loc.id;
});

beforeEach(async () => {
  await db.invoice.updateMany({
    where: { customerId, sourceQuoteId: { not: null } },
    data: { sourceQuoteId: null },
  });
  await db.invoice.updateMany({
    where: { customerId, sourceInvoiceId: { not: null } },
    data: { sourceInvoiceId: null },
  });
  await db.payment.deleteMany({ where: { invoice: { customerId } } });
  await db.inventoryMovement.deleteMany({ where: { locationId } });
  await db.auditLog.deleteMany({
    where: { entityType: 'Invoice', userId: { in: [vendorId, managerId] } },
  });
  await db.invoice.deleteMany({ where: { customerId } });
  await db.productLocation.update({
    where: { id: locationId },
    data: { quantityOnHand: 200, reservedQuantity: 0 },
  });
  await db.customer.update({
    where: { id: customerId },
    data: { currentBalance: 0 },
  });
});

afterAll(async () => {
  await db.invoice.updateMany({
    where: { customerId, sourceInvoiceId: { not: null } },
    data: { sourceInvoiceId: null },
  });
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
  await db.customer.delete({ where: { id: inactiveCustomerId } }).catch(() => {});
  await db.user.deleteMany({ where: { id: { in: [vendorId, managerId] } } });
  await db.warehouse.delete({ where: { id: whId } }).catch(() => {});
  await db.category.delete({ where: { id: catId } }).catch(() => {});
  await db.$disconnect();
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Bug B-2 — void requiere MANAGER o ADMIN', () => {
  it('B2-a: VENDOR intenta anular ISSUED → FORBIDDEN', async () => {
    const vendor = makeCaller(vendorId, 'VENDOR');
    const invoice = await vendor.create({
      customerId,
      type: 'INVOICE',
      items: [{ productId, locationId, quantity: 2, unitPrice: 100 }],
      taxRate: 0.115,
    });
    expect(invoice.status).toBe('ISSUED');

    await expect(
      vendor.void({ id: invoice.id, reason: 'VENDOR intentando anular' })
    ).rejects.toThrow(/FORBIDDEN|forbidden|MANAGER|ADMIN/i);

    // Invoice must remain ISSUED after failed void attempt
    const inv = await db.invoice.findUnique({ where: { id: invoice.id } });
    expect(inv!.status).toBe('ISSUED');
  });

  it('B2-b: MANAGER puede anular ISSUED → éxito', async () => {
    const vendor = makeCaller(vendorId, 'VENDOR');
    const invoice = await vendor.create({
      customerId,
      type: 'INVOICE',
      items: [{ productId, locationId, quantity: 2, unitPrice: 100 }],
      taxRate: 0.115,
    });

    const manager = makeCaller(managerId, 'MANAGER');
    await manager.void({ id: invoice.id, reason: 'Cancelado por gerencia' });

    const inv = await db.invoice.findUnique({ where: { id: invoice.id } });
    expect(inv!.status).toBe('VOIDED');
  });
});

describe('Bug B-3 — CREDIT_NOTE requiere sourceInvoiceId (validación Zod server-side)', () => {
  it('B3-a: CREDIT_NOTE sin sourceInvoiceId → lanza error de validación (no pasa al handler)', async () => {
    const vendor = makeCaller(vendorId, 'VENDOR');
    await expect(
      vendor.create({
        customerId,
        type: 'CREDIT_NOTE',
        items: [{ productId, locationId, quantity: 1, unitPrice: 100 }],
        taxRate: 0.115,
        // sourceInvoiceId omitted intentionally
      })
    ).rejects.toThrow(/sourceInvoiceId/i);
  });

  it('B3-b: CREDIT_NOTE con sourceInvoiceId inexistente → NOT_FOUND', async () => {
    const vendor = makeCaller(vendorId, 'VENDOR');
    await expect(
      vendor.create({
        customerId,
        type: 'CREDIT_NOTE',
        items: [{ productId, locationId, quantity: 1, unitPrice: 100 }],
        taxRate: 0.115,
        sourceInvoiceId: 'claaaaaaaaaaaaaaaaaaaaaaaaa', // valid CUID format, nonexistent
      })
    ).rejects.toThrow(/NOT_FOUND|not_found|no encontrada|factura/i);
  });

  it('B3-c: CREDIT_NOTE con sourceInvoiceId válido → se crea exitosamente', async () => {
    const vendor = makeCaller(vendorId, 'VENDOR');
    const source = await vendor.create({
      customerId,
      type: 'INVOICE',
      items: [{ productId, locationId, quantity: 5, unitPrice: 100 }],
      taxRate: 0.115,
    });
    expect(source.status).toBe('ISSUED');

    const cn = await vendor.create({
      customerId,
      type: 'CREDIT_NOTE',
      items: [{ productId, locationId, quantity: 2, unitPrice: 100 }],
      taxRate: 0.115,
      sourceInvoiceId: source.id,
    });
    expect(cn.type).toBe('CREDIT_NOTE');
    expect(cn.sourceInvoiceId).toBe(source.id);
  });
});

describe('Bug B-4 — CREDIT_NOTE revierte stock y currentBalance', () => {
  it('B4: emitir CREDIT_NOTE restaura stock vendido y decrementa currentBalance', async () => {
    const vendor = makeCaller(vendorId, 'VENDOR');

    const locBefore = await db.productLocation.findUnique({ where: { id: locationId } });
    const stockBefore = locBefore!.quantityOnHand; // 200

    // Create invoice for 10 units
    const invoice = await vendor.create({
      customerId,
      type: 'INVOICE',
      items: [{ productId, locationId, quantity: 10, unitPrice: 100 }],
      taxRate: 0.115,
    });
    expect(invoice.status).toBe('ISSUED');

    const locAfterInvoice = await db.productLocation.findUnique({ where: { id: locationId } });
    expect(locAfterInvoice!.quantityOnHand).toBe(stockBefore - 10); // 190

    const customerAfterInvoice = await db.customer.findUnique({ where: { id: customerId } });
    const balanceAfterInvoice = Number(customerAfterInvoice!.currentBalance);
    expect(balanceAfterInvoice).toBeGreaterThan(0); // total with IVU

    // Credit note for 3 units (partial reversal)
    const cn = await vendor.create({
      customerId,
      type: 'CREDIT_NOTE',
      items: [{ productId, locationId, quantity: 3, unitPrice: 100 }],
      taxRate: 0.115,
      sourceInvoiceId: invoice.id,
    });
    expect(cn.type).toBe('CREDIT_NOTE');

    // Stock restored by 3
    const locAfterCN = await db.productLocation.findUnique({ where: { id: locationId } });
    expect(locAfterCN!.quantityOnHand).toBe(stockBefore - 10 + 3); // 193

    // RETURN movement created for the credit note items
    const returnMovement = await db.inventoryMovement.findFirst({
      where: { locationId, movementType: 'RETURN' },
    });
    expect(returnMovement).not.toBeNull();
    expect(returnMovement!.quantity).toBe(3);

    // currentBalance reduced by CN total
    const customerAfterCN = await db.customer.findUnique({ where: { id: customerId } });
    const balanceAfterCN = Number(customerAfterCN!.currentBalance);
    const cnTotal = Number(cn.total);
    expect(balanceAfterCN).toBeCloseTo(balanceAfterInvoice - cnTotal, 2);
  });
});

describe('Bug B-5 — addPayment rechaza QUOTE y CREDIT_NOTE', () => {
  it('B5-a: addPayment a QUOTE → BAD_REQUEST', async () => {
    const vendor = makeCaller(vendorId, 'VENDOR');
    const quote = await vendor.create({
      customerId,
      type: 'QUOTE',
      items: [{ productId, locationId, quantity: 1, unitPrice: 100 }],
      taxRate: 0.115,
    });
    expect(quote.type).toBe('QUOTE');

    await expect(
      vendor.addPayment({ invoiceId: quote.id, amount: 50, method: 'CASH' })
    ).rejects.toThrow(/BAD_REQUEST|cotización|QUOTE|no acepta pago/i);
  });

  it('B5-b: addPayment a CREDIT_NOTE → BAD_REQUEST', async () => {
    const vendor = makeCaller(vendorId, 'VENDOR');
    const invoice = await vendor.create({
      customerId,
      type: 'INVOICE',
      items: [{ productId, locationId, quantity: 5, unitPrice: 100 }],
      taxRate: 0.115,
    });

    const cn = await vendor.create({
      customerId,
      type: 'CREDIT_NOTE',
      items: [{ productId, locationId, quantity: 2, unitPrice: 100 }],
      taxRate: 0.115,
      sourceInvoiceId: invoice.id,
    });
    expect(cn.type).toBe('CREDIT_NOTE');

    await expect(
      vendor.addPayment({ invoiceId: cn.id, amount: 50, method: 'CASH' })
    ).rejects.toThrow(/BAD_REQUEST|nota de crédito|CREDIT_NOTE|no acepta pago/i);
  });

  it('B5-c: addPayment a INVOICE ISSUED → éxito', async () => {
    const vendor = makeCaller(vendorId, 'VENDOR');
    const invoice = await vendor.create({
      customerId,
      type: 'INVOICE',
      items: [{ productId, locationId, quantity: 1, unitPrice: 100 }],
      taxRate: 0.115,
    });
    expect(invoice.status).toBe('ISSUED');

    await expect(
      vendor.addPayment({ invoiceId: invoice.id, amount: 50, method: 'CASH' })
    ).resolves.not.toThrow();

    const updated = await db.invoice.findUnique({ where: { id: invoice.id } });
    expect(updated!.status).toBe('PARTIAL');
  });
});

describe('Bug B-6 — create rechaza clientes inactivos', () => {
  it('B6: crear factura para cliente inactivo → BAD_REQUEST', async () => {
    const vendor = makeCaller(vendorId, 'VENDOR');
    await expect(
      vendor.create({
        customerId: inactiveCustomerId,
        type: 'INVOICE',
        items: [{ productId, locationId, quantity: 1, unitPrice: 100 }],
        taxRate: 0.115,
      })
    ).rejects.toThrow(/BAD_REQUEST|inactivo|activo|cliente/i);
  });

  it('B6-b: crear factura para cliente activo → éxito', async () => {
    const vendor = makeCaller(vendorId, 'VENDOR');
    const invoice = await vendor.create({
      customerId,
      type: 'INVOICE',
      items: [{ productId, locationId, quantity: 1, unitPrice: 100 }],
      taxRate: 0.115,
    });
    expect(invoice.status).toBe('ISSUED');
  });
});
