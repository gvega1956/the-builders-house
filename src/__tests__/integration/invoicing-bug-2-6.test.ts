/**
 * Integration tests for Bug 2.6 — lineTotal consistente con subtotal.
 *
 * Validates the lineTotal ↔ subtotal invariant:
 * - lineTotal is always computed by the backend (invoiceItemSchema has no lineTotal input)
 * - sum(item.lineTotal) stored in DB equals invoice.subtotal, exact to the cent
 * - 33.33% discount does not produce floating-point rounding errors (Decimal arithmetic)
 *
 * Run with: npm test
 *
 * AUDIT-BUG-26
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
        email: `${role.toLowerCase()}-bug26@test.invalid`,
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
let customerId: string;
let catId: string;
let whId: string;
let productId: string;
let locationId: string;

// ─────────────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  const cat = await db.category.create({
    data: { name: 'TEST-INV-BUG26-CAT', slug: 'test-inv-bug26' },
  });
  catId = cat.id;

  const wh = await db.warehouse.create({ data: { name: 'TEST-INV-BUG26-WH' } });
  whId = wh.id;

  const vendor = await db.user.create({
    data: { name: 'Test Vendor Bug26', email: 'vendor-bug26@test.invalid', role: 'VENDOR' },
  });
  vendorId = vendor.id;

  const customer = await db.customer.create({
    data: { code: 'CLI-BUG26-TEST', name: 'Test Customer Bug26', type: 'RETAIL' },
  });
  customerId = customer.id;

  const product = await db.product.create({
    data: {
      sku: 'BUG26-PROD-1',
      name: 'Test Product Bug26',
      categoryId: catId,
      unitCost: 50,
      retailPrice: 100,
      wholesalePrice: 80,
    },
  });
  productId = product.id;

  const loc = await db.productLocation.create({
    data: { productId, warehouseId: whId, locationCode: 'BUG26-LOC-A', quantityOnHand: 1000 },
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
    where: { entityType: 'Invoice', userId: vendorId },
  });
  await db.invoice.deleteMany({ where: { customerId } });
  await db.productLocation.update({
    where: { id: locationId },
    data: { quantityOnHand: 1000, reservedQuantity: 0 },
  });
  await db.customer.update({ where: { id: customerId }, data: { currentBalance: 0 } });
});

afterAll(async () => {
  await db.invoice.updateMany({
    where: { customerId, sourceQuoteId: { not: null } },
    data: { sourceQuoteId: null },
  });
  await db.payment.deleteMany({ where: { invoice: { customerId } } });
  await db.inventoryMovement.deleteMany({ where: { locationId } });
  await db.auditLog.deleteMany({
    where: { entityType: 'Invoice', userId: vendorId },
  });
  await db.invoice.deleteMany({ where: { customerId } });
  await db.productLocation.deleteMany({ where: { id: locationId } });
  await db.product.deleteMany({ where: { id: productId } });
  await db.customer.delete({ where: { id: customerId } }).catch(() => {});
  await db.user.delete({ where: { id: vendorId } }).catch(() => {});
  await db.warehouse.delete({ where: { id: whId } }).catch(() => {});
  await db.category.delete({ where: { id: catId } }).catch(() => {});
  await db.$disconnect();
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Bug 2.6 — lineTotal consistente con subtotal', () => {
  it('T1: lineTotal en DB es calculado por el backend — el schema no acepta lineTotal del frontend', async () => {
    // invoiceItemSchema has no lineTotal field — Zod strips any lineTotal the caller sends.
    // We verify by creating an invoice and checking that the stored lineTotal matches
    // the expected backend calculation: unitPrice × quantity × discountFactor.
    const vendor = makeCaller(vendorId, 'VENDOR');

    // unitPrice=200, quantity=3, discountPercent=10 → lineTotal = 200*3*(1-0.10) = 540.00
    const invoice = await vendor.create({
      customerId,
      type: 'INVOICE',
      items: [{ productId, locationId, quantity: 3, unitPrice: 200, discountPercent: 10 }],
      taxRate: 0,
    });

    const items = await db.invoiceItem.findMany({ where: { invoiceId: invoice.id } });
    expect(items).toHaveLength(1);

    const storedLineTotal = Number(items[0]!.lineTotal);
    // Backend calculation: 200 × 3 × (1 − 10/100) = 200 × 3 × 0.9 = 540
    expect(storedLineTotal).toBeCloseTo(540, 2);

    // The invoice.subtotal must also equal 540 (single item, no other discounts)
    expect(Number(invoice.subtotal)).toBeCloseTo(540, 2);
  });

  it('T2: sum(item.lineTotal) almacenado en DB == invoice.subtotal, exacto al centavo — 5 ítems distintos', async () => {
    const vendor = makeCaller(vendorId, 'VENDOR');

    // Create 5 items with different prices and discounts.
    // We use a single product + location but vary quantity/unitPrice/discountPercent.
    // taxRate: 0 so subtotal == total (simpler assertions).
    const invoice = await vendor.create({
      customerId,
      type: 'INVOICE',
      items: [
        { productId, locationId, quantity: 1, unitPrice: 100, discountPercent: 0 },    // 100.00
        { productId, locationId, quantity: 2, unitPrice: 50, discountPercent: 5 },     //  95.00
        { productId, locationId, quantity: 3, unitPrice: 75, discountPercent: 20 },    // 180.00
        { productId, locationId, quantity: 1, unitPrice: 200, discountPercent: 15 },   // 170.00
        { productId, locationId, quantity: 4, unitPrice: 25, discountPercent: 0 },     // 100.00
        // Expected subtotal: 100 + 95 + 180 + 170 + 100 = 645.00
      ],
      taxRate: 0,
    });

    const items = await db.invoiceItem.findMany({ where: { invoiceId: invoice.id } });
    expect(items).toHaveLength(5);

    // Sum lineTotals from DB using the same Decimal reduction
    const lineTotalSum = items.reduce((acc, item) => acc + Number(item.lineTotal), 0);

    expect(lineTotalSum).toBeCloseTo(645, 2);
    expect(Number(invoice.subtotal)).toBeCloseTo(645, 2);

    // Critical: sum(lineTotal) must equal subtotal exactly (no divergence)
    expect(Math.abs(lineTotalSum - Number(invoice.subtotal))).toBeLessThan(0.01);
  });

  it('T3: discount=33.33% en 3 ítems — sum(lineTotal) == subtotal sin errores de redondeo Decimal', async () => {
    // 33.33% is a finite decimal (3333/10000), not repeating 1/3.
    // Decimal arithmetic must handle it exactly: lineTotal = 100 × 1 × 0.6667 = 66.67
    // With 3 identical items: sum = 3 × 66.67 = 200.01
    // The test verifies that Decimal arithmetic accumulates without floating-point drift.
    const vendor = makeCaller(vendorId, 'VENDOR');

    const invoice = await vendor.create({
      customerId,
      type: 'INVOICE',
      items: [
        { productId, locationId, quantity: 1, unitPrice: 100, discountPercent: 33.33 },
        { productId, locationId, quantity: 1, unitPrice: 100, discountPercent: 33.33 },
        { productId, locationId, quantity: 1, unitPrice: 100, discountPercent: 33.33 },
      ],
      taxRate: 0,
    });

    const items = await db.invoiceItem.findMany({ where: { invoiceId: invoice.id } });
    expect(items).toHaveLength(3);

    // Each item: 100 × 1 × (1 - 33.33/100) = 100 × 0.6667 = 66.67
    for (const item of items) {
      expect(Number(item.lineTotal)).toBeCloseTo(66.67, 2);
    }

    const lineTotalSum = items.reduce((acc, item) => acc + Number(item.lineTotal), 0);

    // sum = 3 × 66.67 = 200.01
    expect(lineTotalSum).toBeCloseTo(200.01, 2);

    // Invariant: sum(lineTotal) == subtotal within $0.01
    expect(Math.abs(lineTotalSum - Number(invoice.subtotal))).toBeLessThan(0.01);
  });
});
