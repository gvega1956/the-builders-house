/**
 * Integration tests for Bug 2.7 — validación de precio mínimo.
 *
 * Validates the minimum-price invariant:
 * - VENDOR cannot create an INVOICE or QUOTE with unitPrice < product.unitCost → FORBIDDEN
 * - MANAGER/ADMIN can sell below cost only with discountReason provided → success
 * - MANAGER/ADMIN without discountReason → BAD_REQUEST (not FORBIDDEN)
 * - Option A: QUOTE also validates minimum price (same rules apply)
 * - Below-cost ISSUED invoices record belowCostSale + belowCostItems in audit_log
 *
 * Run with: npm test
 *
 * AUDIT-BUG-27
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
        email: `${role.toLowerCase()}-bug27@test.invalid`,
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

const UNIT_COST = 100;
const RETAIL_PRICE = 150;

// ─────────────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  const cat = await db.category.create({
    data: { name: 'TEST-INV-BUG27-CAT', slug: 'test-inv-bug27' },
  });
  catId = cat.id;

  const wh = await db.warehouse.create({ data: { name: 'TEST-INV-BUG27-WH' } });
  whId = wh.id;

  const vendor = await db.user.create({
    data: { name: 'Test Vendor Bug27', email: 'vendor-bug27@test.invalid', role: 'VENDOR' },
  });
  vendorId = vendor.id;

  const manager = await db.user.create({
    data: { name: 'Test Manager Bug27', email: 'manager-bug27@test.invalid', role: 'MANAGER' },
  });
  managerId = manager.id;

  const customer = await db.customer.create({
    data: { code: 'CLI-BUG27-TEST', name: 'Test Customer Bug27', type: 'RETAIL' },
  });
  customerId = customer.id;

  const product = await db.product.create({
    data: {
      sku: 'BUG27-PROD-1',
      name: 'Test Product Bug27',
      categoryId: catId,
      unitCost: UNIT_COST,
      retailPrice: RETAIL_PRICE,
      wholesalePrice: 120,
    },
  });
  productId = product.id;

  const loc = await db.productLocation.create({
    data: { productId, warehouseId: whId, locationCode: 'BUG27-LOC-A', quantityOnHand: 1000 },
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
    where: { entityType: 'Invoice', userId: { in: [vendorId, managerId] } },
  });
  await db.invoice.deleteMany({ where: { customerId } });
  await db.productLocation.deleteMany({ where: { id: locationId } });
  await db.product.deleteMany({ where: { id: productId } });
  await db.customer.delete({ where: { id: customerId } }).catch(() => {});
  await db.user.delete({ where: { id: vendorId } }).catch(() => {});
  await db.user.delete({ where: { id: managerId } }).catch(() => {});
  await db.warehouse.delete({ where: { id: whId } }).catch(() => {});
  await db.category.delete({ where: { id: catId } }).catch(() => {});
  await db.$disconnect();
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Bug 2.7 — validación de precio mínimo', () => {
  it('T1: VENDOR crea INVOICE con unitPrice >= unitCost → éxito (caso base)', async () => {
    const vendor = makeCaller(vendorId, 'VENDOR');

    // unitPrice=150 >= unitCost=100 → allowed for VENDOR
    const invoice = await vendor.create({
      customerId,
      type: 'INVOICE',
      items: [{ productId, locationId, quantity: 1, unitPrice: 150 }],
      taxRate: 0,
    });

    expect(invoice.status).toBe('ISSUED');
    expect(Number(invoice.total)).toBeCloseTo(150, 2);
  });

  it('T2: VENDOR intenta crear INVOICE con unitPrice < unitCost → FORBIDDEN', async () => {
    const vendor = makeCaller(vendorId, 'VENDOR');

    // unitPrice=80 < unitCost=100 → VENDOR blocked
    await expect(
      vendor.create({
        customerId,
        type: 'INVOICE',
        items: [{ productId, locationId, quantity: 1, unitPrice: 80 }],
        taxRate: 0,
      }),
    ).rejects.toThrow(/inferior al costo/i);

    // Verify no invoice was created
    const invoices = await db.invoice.findMany({ where: { customerId } });
    expect(invoices).toHaveLength(0);
  });

  it('T3: MANAGER intenta crear INVOICE bajo costo sin discountReason → BAD_REQUEST', async () => {
    const manager = makeCaller(managerId, 'MANAGER');

    // unitPrice=80 < unitCost=100, but no discountReason provided → BAD_REQUEST (not FORBIDDEN)
    await expect(
      manager.create({
        customerId,
        type: 'INVOICE',
        items: [{ productId, locationId, quantity: 1, unitPrice: 80 }],
        taxRate: 0,
      }),
    ).rejects.toThrow(/discountReason/i);

    // Verify no invoice was created
    const invoices = await db.invoice.findMany({ where: { customerId } });
    expect(invoices).toHaveLength(0);
  });

  it('T4: MANAGER crea INVOICE bajo costo con discountReason → éxito + belowCostSale en audit', async () => {
    const manager = makeCaller(managerId, 'MANAGER');

    // unitPrice=80 < unitCost=100, discountReason provided → allowed for MANAGER
    const invoice = await manager.create({
      customerId,
      type: 'INVOICE',
      items: [
        {
          productId,
          locationId,
          quantity: 2,
          unitPrice: 80,
          discountReason: 'Cliente VIP — autorización gerencial',
        },
      ],
      taxRate: 0,
    });

    expect(invoice.status).toBe('ISSUED');
    expect(Number(invoice.total)).toBeCloseTo(160, 2);

    // Verify belowCostSale recorded in audit log
    const audit = await db.auditLog.findFirst({
      where: { entityType: 'Invoice', entityId: invoice.id },
    });
    expect(audit).not.toBeNull();

    const newValues = audit!.newValues as Record<string, unknown>;
    expect(newValues.belowCostSale).toBe(true);
    expect(newValues.authorizedBy).toBe('MANAGER');

    const belowCostItems = newValues.belowCostItems as Array<Record<string, unknown>>;
    expect(belowCostItems).toHaveLength(1);
    expect(belowCostItems[0]!.soldAt).toBe('80');
    expect(belowCostItems[0]!.unitCost).toBe('100');
    expect(belowCostItems[0]!.discountReason).toBe('Cliente VIP — autorización gerencial');
  });

  it('T5: VENDOR intenta crear QUOTE con unitPrice < unitCost → FORBIDDEN (Opción A)', async () => {
    const vendor = makeCaller(vendorId, 'VENDOR');

    // Option A: QUOTE also validates minimum price — same FORBIDDEN guard
    await expect(
      vendor.create({
        customerId,
        type: 'QUOTE',
        items: [{ productId, quantity: 1, unitPrice: 50 }],
        taxRate: 0,
      }),
    ).rejects.toThrow(/inferior al costo/i);

    // Verify no quote was created
    const quotes = await db.invoice.findMany({ where: { customerId, type: 'QUOTE' } });
    expect(quotes).toHaveLength(0);
  });
});
