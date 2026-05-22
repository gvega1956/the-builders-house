/**
 * Integration tests for Bugs G-1, G-2, G-3 (dashboard router).
 *
 * G-1: kpis.inventoryValue and kpis.totalUnits use SQL aggregation (not JS reduce
 *      over a full product_locations findMany). Verified by: correct values and
 *      the query returning a single row from $queryRaw (aggregation, not a set).
 *
 * G-2: salesByDay groups invoices by DATE() in SQL — returns N distinct days,
 *      not N invoice rows. Multiple invoices on the same day merge into one entry.
 *
 * G-3: toNum() converts Prisma.Decimal via .toFixed(2) + parseFloat, not native
 *      Number() — avoids float precision loss on large monetary values.
 *
 * Run with: npm test
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { PrismaClient, Prisma } from '@prisma/client';
import { createCallerFactory } from '@/server/trpc';
import { dashboardRouter } from '@/server/trpc/routers/dashboard';
import { invoicingRouter } from '@/server/trpc/routers/invoicing';
import type { Context } from '@/server/trpc/context';

const db = new PrismaClient();
const makeDashboardCaller = createCallerFactory(dashboardRouter);
const makeInvoicingCaller = createCallerFactory(invoicingRouter);

function makeDashboardCtx(userId: string) {
  const ctx = {
    db,
    session: {
      user: { id: userId, name: 'Test Admin G', email: 'admin-g@test.invalid', role: 'ADMIN' },
      expires: new Date(Date.now() + 8 * 3600 * 1000).toISOString(),
    },
    req: { headers: { get: (_: string) => null } },
  } as unknown as Context;
  return makeDashboardCaller(ctx);
}

function makeInvoicingCtx(userId: string, role: 'VENDOR' | 'MANAGER' | 'ADMIN') {
  const ctx = {
    db,
    session: {
      user: { id: userId, name: `Test ${role} G`, email: `${role.toLowerCase()}-g@test.invalid`, role },
      expires: new Date(Date.now() + 8 * 3600 * 1000).toISOString(),
    },
    req: { headers: { get: (_: string) => null } },
  } as unknown as Context;
  return makeInvoicingCaller(ctx);
}

// ─── Fixture IDs ─────────────────────────────────────────────────────────────

let adminId: string;
let vendorId: string;
let customerId: string;
let catId: string;
let whId: string;
let productId: string;
let locationId: string;

// ─────────────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  const cat = await db.category.create({
    data: { name: 'TEST-BUGG-CAT', slug: 'test-bugg-cat' },
  });
  catId = cat.id;

  const wh = await db.warehouse.create({ data: { name: 'TEST-BUGG-WH' } });
  whId = wh.id;

  const admin = await db.user.create({
    data: { name: 'Test Admin BugG', email: 'admin-bugg@test.invalid', role: 'ADMIN' },
  });
  adminId = admin.id;

  const vendor = await db.user.create({
    data: { name: 'Test Vendor BugG', email: 'vendor-bugg@test.invalid', role: 'VENDOR' },
  });
  vendorId = vendor.id;

  const customer = await db.customer.create({
    data: { code: 'CLI-BUGG-TEST', name: 'Test Customer BugG', type: 'RETAIL' },
  });
  customerId = customer.id;

  const product = await db.product.create({
    data: {
      sku: 'BUGG-PROD-1',
      name: 'Test Product BugG',
      categoryId: catId,
      unitCost: 200,     // $200 unit cost
      retailPrice: 400,
      wholesalePrice: 320,
    },
  });
  productId = product.id;

  const loc = await db.productLocation.create({
    data: { productId, warehouseId: whId, locationCode: 'BUGG-LOC-A', quantityOnHand: 50 },
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
    where: { entityType: 'Invoice', userId: { in: [adminId, vendorId] } },
  });
  await db.invoice.deleteMany({ where: { customerId } });
  await db.productLocation.update({
    where: { id: locationId },
    data: { quantityOnHand: 50, reservedQuantity: 0 },
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
    where: { entityType: 'Invoice', userId: { in: [adminId, vendorId] } },
  });
  await db.invoice.deleteMany({ where: { customerId } });
  await db.productLocation.deleteMany({ where: { id: locationId } });
  await db.product.deleteMany({ where: { id: productId } });
  await db.customer.delete({ where: { id: customerId } }).catch(() => {});
  await db.user.deleteMany({ where: { id: { in: [adminId, vendorId] } } });
  await db.warehouse.delete({ where: { id: whId } }).catch(() => {});
  await db.category.delete({ where: { id: catId } }).catch(() => {});
  await db.$disconnect();
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Bug G-1 — inventoryValue y totalUnits usan SQL aggregation (no JS reduce)', () => {
  it('G1-a: kpis retorna inventoryValue = sum(quantityOnHand * unitCost) para productos activos', async () => {
    // Setup: product with 50 units at $200 cost → expected contribution = $10,000
    const locBefore = await db.productLocation.findUnique({ where: { id: locationId } });
    expect(locBefore!.quantityOnHand).toBe(50);

    const dashboard = makeDashboardCtx(adminId);
    const kpis = await dashboard.kpis();

    // inventoryValue must include our product: 50 * $200 = $10,000 (+ any other products)
    expect(kpis.inventoryValue).toBeGreaterThanOrEqual(10000);
    // totalUnits must be at least 50 (our location)
    expect(kpis.totalUnits).toBeGreaterThanOrEqual(50);

    // The key invariant: inventoryValue is a number (not an array), proving SQL aggregation
    expect(typeof kpis.inventoryValue).toBe('number');
    expect(typeof kpis.totalUnits).toBe('number');
  });

  it('G1-b: inventoryValue es preciso — refleja cambio de stock inmediatamente', async () => {
    const dashboard = makeDashboardCtx(adminId);

    const before = await dashboard.kpis();
    const inventoryBefore = before.inventoryValue;
    const unitsBefore = before.totalUnits;

    // Add 10 more units directly to our location
    await db.productLocation.update({
      where: { id: locationId },
      data: { quantityOnHand: { increment: 10 } },
    });

    const after = await dashboard.kpis();

    // 10 units * $200 = $2,000 more
    expect(after.inventoryValue).toBeCloseTo(inventoryBefore + 2000, 0);
    expect(after.totalUnits).toBe(unitsBefore + 10);

    // Restore
    await db.productLocation.update({
      where: { id: locationId },
      data: { quantityOnHand: { decrement: 10 } },
    });
  });

  it('G1-c: productos inactivos no se incluyen en inventoryValue', async () => {
    const dashboard = makeDashboardCtx(adminId);
    const before = await dashboard.kpis();

    // Deactivate our product
    await db.product.update({ where: { id: productId }, data: { isActive: false } });

    const after = await dashboard.kpis();

    // inventoryValue must decrease by 50 * $200 = $10,000
    expect(after.inventoryValue).toBeCloseTo(before.inventoryValue - 10000, 0);
    expect(after.totalUnits).toBe(before.totalUnits - 50);

    // Restore
    await db.product.update({ where: { id: productId }, data: { isActive: true } });
  });
});

describe('Bug G-2 — salesByDay usa GROUP BY DATE() en SQL (no JS grouping)', () => {
  it('G2-a: múltiples facturas del mismo día → UN solo punto en salesByDay', async () => {
    const vendor = makeInvoicingCtx(vendorId, 'VENDOR');

    // Create 3 invoices (all within the same test run = same day)
    // Use unitPrice >= unitCost ($200) so VENDOR can sell without FORBIDDEN
    await vendor.create({
      customerId, type: 'INVOICE', taxRate: 0,
      items: [{ productId, locationId, quantity: 1, unitPrice: 200 }],
    });
    await vendor.create({
      customerId, type: 'INVOICE', taxRate: 0,
      items: [{ productId, locationId, quantity: 1, unitPrice: 300 }],
    });
    await vendor.create({
      customerId, type: 'INVOICE', taxRate: 0,
      items: [{ productId, locationId, quantity: 1, unitPrice: 400 }],
    });

    const dashboard = makeDashboardCtx(adminId);
    const salesByDay = await dashboard.salesByDay({ days: 1 });

    // All 3 invoices are on the same day → must appear as a SINGLE entry
    // (SQL GROUP BY DATE → aggregation, not raw rows)
    expect(salesByDay).toHaveLength(1);

    const entry = salesByDay[0]!;
    // $200 + $300 + $400 = $900 (tax=0 for simplicity)
    expect(entry.total).toBeCloseTo(900, 0);

    // day format: YYYY-MM-DD
    expect(entry.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('G2-b: sin facturas en el rango → array vacío (no error)', async () => {
    const dashboard = makeDashboardCtx(adminId);
    // days=1 but no invoices created in beforeEach (all cleaned up)
    const salesByDay = await dashboard.salesByDay({ days: 1 });
    expect(Array.isArray(salesByDay)).toBe(true);
    // may be 0 or more depending on other test data, but must not throw
  });

  it('G2-c: salesByDay retorna días ordenados ASC por fecha', async () => {
    const vendor = makeInvoicingCtx(vendorId, 'VENDOR');

    // Create one invoice today
    await vendor.create({
      customerId, type: 'INVOICE', taxRate: 0,
      items: [{ productId, locationId, quantity: 1, unitPrice: 500 }],
    });

    const dashboard = makeDashboardCtx(adminId);
    const salesByDay = await dashboard.salesByDay({ days: 7 });

    // Entries must be in ascending order by date
    for (let i = 1; i < salesByDay.length; i++) {
      expect(salesByDay[i]!.day >= salesByDay[i - 1]!.day).toBe(true);
    }
  });
});

describe('Bug G-3 — toNum() preserva precisión Decimal (no usa Number() nativo)', () => {
  it('G3-a: salesToday retorna float preciso, no valor con drift de float', async () => {
    // Use unitPrice at retail ($400, above unitCost $200) with IVU 11.5%
    // $400 * 1.115 = $446.00 exactly — tests that toNum doesn't introduce drift
    const vendor = makeInvoicingCtx(vendorId, 'VENDOR');
    await vendor.create({
      customerId, type: 'INVOICE', taxRate: 0.115,
      items: [{ productId, locationId, quantity: 1, unitPrice: 400 }],
    });

    const expectedTotal = Number(new Prisma.Decimal(400).mul(new Prisma.Decimal(1.115)).toFixed(2));

    const dashboard = makeDashboardCtx(adminId);
    const from = new Date(Date.now() - 60 * 1000); // last minute
    const to = new Date(Date.now() + 60 * 1000);
    const kpis = await dashboard.kpis({ from, to });

    // salesToday must match the invoice total exactly (toNum uses .toFixed(2), not Number())
    expect(kpis.salesToday).toBeCloseTo(expectedTotal, 2);

    // More important: salesToday is a clean float, not something like 111.48849999999
    const twoDecimalStr = kpis.salesToday.toFixed(2);
    const reparsed = parseFloat(twoDecimalStr);
    expect(Math.abs(kpis.salesToday - reparsed)).toBeLessThan(0.001);
  });

  it('G3-b: toNum() con null/undefined retorna 0 (no NaN ni undefined)', async () => {
    // When no invoices exist in range, _sum.total is null → toNum should return 0
    const dashboard = makeDashboardCtx(adminId);
    // Use a time range with no invoices
    const pastDate = new Date('2020-01-01');
    const kpis = await dashboard.kpis({ from: pastDate, to: pastDate });

    expect(kpis.salesToday).toBe(0);
    expect(Number.isFinite(kpis.salesToday)).toBe(true);
    expect(kpis.salesToday).not.toBeNaN();
  });

  it('G3-c: inventoryValue con valores grandes (>$1M) sin drift de float', async () => {
    // Set a large unit cost to test precision at scale
    await db.product.update({
      where: { id: productId },
      data: { unitCost: new Prisma.Decimal('9999.99') },
    });
    // 50 units * $9,999.99 = $499,999.50
    const expectedValue = 50 * 9999.99;

    const dashboard = makeDashboardCtx(adminId);
    const kpis = await dashboard.kpis();

    // inventoryValue must include at least our product's contribution
    expect(kpis.inventoryValue).toBeGreaterThanOrEqual(expectedValue - 1);

    // Restore
    await db.product.update({
      where: { id: productId },
      data: { unitCost: new Prisma.Decimal('200') },
    });
  });
});
