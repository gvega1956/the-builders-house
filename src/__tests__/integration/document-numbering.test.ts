/**
 * Integration tests for branch-prefix document numbering (Phase 2).
 *
 * Validates getNextDocumentNumber() and its integration with the invoicing router:
 * - DNB-01 to DNB-07: direct function tests against a test sequence
 * - DNB-08 to DNB-11: invoicing router integration (INVOICE, QUOTE, CREDIT_NOTE, convert)
 * - DNB-12: concurrency — 5 concurrent calls with same branchId → unique consecutive numbers
 * - DNB-13: PURCHASE_ORDER unchanged (uses OC-RD- fallback, not branch prefix)
 * - DNB-14: documents without branchId → fallback to sequence prefix (backward compat)
 *
 * Run with: npm test
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createCallerFactory } from '@/server/trpc';
import { invoicingRouter } from '@/server/trpc/routers/invoicing';
import { getNextDocumentNumber } from '@/lib/sequences';
import type { Context } from '@/server/trpc/context';

const db = new PrismaClient();
const makeInvoicingCaller = createCallerFactory(invoicingRouter);

const TEST_SEQUENCE = 'TEST_DNB';
const TEST_SEQ_PREFIX = 'TDNB-';

function makeCaller(userId: string) {
  const ctx = {
    db,
    session: {
      user: {
        id: userId,
        name: 'Test Vendor DNB',
        email: 'vendor-dnb@test.invalid',
        role: 'VENDOR',
      },
      expires: new Date(Date.now() + 8 * 3600 * 1000).toISOString(),
    },
    req: { headers: { get: (_name: string) => null } },
  } as unknown as Context;
  return makeInvoicingCaller(ctx);
}

// ─── Fixture IDs ─────────────────────────────────────────────────────────────

let wh1Id: string;        // prefix = 'D1'
let wh2Id: string;        // prefix = 'D2'
let whNoPrefixId: string; // prefix = null

let catId: string;
let userId: string;
let customerId: string;
let productId: string;
let locationId: string;   // productLocation in wh1

// ─────────────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  // Secuencia de test aislada
  await db.sequence.upsert({
    where: { name: TEST_SEQUENCE },
    update: { currentValue: 0, prefix: TEST_SEQ_PREFIX },
    create: { name: TEST_SEQUENCE, prefix: TEST_SEQ_PREFIX, padding: 5, currentValue: 0 },
  });

  // Warehouses para los tests
  const [wh1, wh2, whNp] = await Promise.all([
    db.warehouse.create({ data: { name: 'TEST-DNB-WH1', prefix: 'D1' } }),
    db.warehouse.create({ data: { name: 'TEST-DNB-WH2', prefix: 'D2' } }),
    db.warehouse.create({ data: { name: 'TEST-DNB-WH-NOPFX' } }),
  ]);
  wh1Id = wh1.id;
  wh2Id = wh2.id;
  whNoPrefixId = whNp.id;

  // Fixtures para tests de invoicing router
  const cat = await db.category.create({ data: { name: 'TEST-DNB-CAT', slug: 'test-dnb' } });
  catId = cat.id;

  const user = await db.user.create({
    data: { name: 'Test Vendor DNB', email: 'vendor-dnb@test.invalid', role: 'VENDOR' },
  });
  userId = user.id;

  const customer = await db.customer.create({
    data: { code: 'CLI-DNB-TEST', name: 'Test Customer DNB', type: 'RETAIL' },
  });
  customerId = customer.id;

  const product = await db.product.create({
    data: {
      sku: 'DNB-PROD-1',
      name: 'Test Product DNB',
      categoryId: catId,
      unitCost: 50,
      retailPrice: 100,
      wholesalePrice: 80,
    },
  });
  productId = product.id;

  const loc = await db.productLocation.create({
    data: { productId, warehouseId: wh1Id, locationCode: 'DNB-LOC-A', quantityOnHand: 500 },
  });
  locationId = loc.id;
});

beforeEach(async () => {
  // Limpiar facturas entre tests para aislamiento
  await db.inventoryMovement.deleteMany({ where: { locationId } });
  await db.payment.deleteMany({ where: { invoice: { customerId } } });
  await db.invoice.updateMany({
    where: { customerId, sourceQuoteId: { not: null } },
    data: { sourceQuoteId: null },
  });
  await db.invoice.deleteMany({ where: { customerId } });
  await db.productLocation.update({
    where: { id: locationId },
    data: { quantityOnHand: 500, reservedQuantity: 0 },
  });
  await db.customer.update({ where: { id: customerId }, data: { currentBalance: 0 } });
});

afterAll(async () => {
  await db.inventoryMovement.deleteMany({ where: { locationId } });
  await db.payment.deleteMany({ where: { invoice: { customerId } } });
  await db.invoice.updateMany({
    where: { customerId, sourceQuoteId: { not: null } },
    data: { sourceQuoteId: null },
  });
  await db.invoice.deleteMany({ where: { customerId } });
  await db.productLocation.deleteMany({ where: { id: locationId } });
  await db.product.deleteMany({ where: { id: productId } });
  await db.customer.delete({ where: { id: customerId } }).catch(() => {});
  await db.user.deleteMany({ where: { id: userId } });
  await db.warehouse.deleteMany({
    where: { id: { in: [wh1Id, wh2Id, whNoPrefixId] } },
  });
  await db.category.delete({ where: { id: catId } }).catch(() => {});
  await db.sequence.delete({ where: { name: TEST_SEQUENCE } }).catch(() => {});
  await db.$disconnect();
});

// ─────────────────────────────────────────────────────────────────────────────
// DNB-01: con branchId válido → formato {PREFIX}-{5_DIGITS}
// ─────────────────────────────────────────────────────────────────────────────
it('DNB-01: con branchId válido devuelve {PREFIX}-{5_DIGITS}', async () => {
  await db.sequence.update({ where: { name: TEST_SEQUENCE }, data: { currentValue: 0 } });

  const result = await db.$transaction((tx) =>
    getNextDocumentNumber(tx, TEST_SEQUENCE, wh1Id)
  );

  expect(result).toBe('D1-00001');
});

// ─────────────────────────────────────────────────────────────────────────────
// DNB-02: sin branchId → prefijo de la secuencia (fallback backward compat)
// ─────────────────────────────────────────────────────────────────────────────
it('DNB-02: sin branchId usa el prefijo de la secuencia como fallback', async () => {
  await db.sequence.update({ where: { name: TEST_SEQUENCE }, data: { currentValue: 0 } });

  const result = await db.$transaction((tx) =>
    getNextDocumentNumber(tx, TEST_SEQUENCE, undefined)
  );

  expect(result).toBe('TDNB-00001');
});

// ─────────────────────────────────────────────────────────────────────────────
// DNB-03: branchId inexistente → TRPCError NOT_FOUND
// ─────────────────────────────────────────────────────────────────────────────
it('DNB-03: branchId inexistente → TRPCError NOT_FOUND', async () => {
  await expect(
    db.$transaction((tx) =>
      getNextDocumentNumber(tx, TEST_SEQUENCE, 'cmfakewarehouseid00000000001')
    )
  ).rejects.toThrow(/no encontrada/i);
});

// ─────────────────────────────────────────────────────────────────────────────
// DNB-04: branchId de sucursal sin prefix configurado → TRPCError BAD_REQUEST
// ─────────────────────────────────────────────────────────────────────────────
it('DNB-04: sucursal sin prefix configurado → TRPCError BAD_REQUEST con nombre de sucursal', async () => {
  await expect(
    db.$transaction((tx) =>
      getNextDocumentNumber(tx, TEST_SEQUENCE, whNoPrefixId)
    )
  ).rejects.toThrow(/TEST-DNB-WH-NOPFX/);
});

// ─────────────────────────────────────────────────────────────────────────────
// DNB-05: contador global — dos llamadas con misma sucursal → números consecutivos
// ─────────────────────────────────────────────────────────────────────────────
it('DNB-05: dos llamadas con misma sucursal → números consecutivos con mismo prefijo', async () => {
  await db.sequence.update({ where: { name: TEST_SEQUENCE }, data: { currentValue: 0 } });

  const first  = await db.$transaction((tx) => getNextDocumentNumber(tx, TEST_SEQUENCE, wh1Id));
  const second = await db.$transaction((tx) => getNextDocumentNumber(tx, TEST_SEQUENCE, wh1Id));

  expect(first).toBe('D1-00001');
  expect(second).toBe('D1-00002');
});

// ─────────────────────────────────────────────────────────────────────────────
// DNB-06: dos sucursales distintas comparten el mismo contador global
// ─────────────────────────────────────────────────────────────────────────────
it('DNB-06: dos sucursales comparten el contador global (sin reset por sucursal)', async () => {
  await db.sequence.update({ where: { name: TEST_SEQUENCE }, data: { currentValue: 0 } });

  const fromWh1 = await db.$transaction((tx) => getNextDocumentNumber(tx, TEST_SEQUENCE, wh1Id));
  const fromWh2 = await db.$transaction((tx) => getNextDocumentNumber(tx, TEST_SEQUENCE, wh2Id));

  expect(fromWh1).toBe('D1-00001');
  expect(fromWh2).toBe('D2-00002'); // mismo contador, distinto prefijo
});

// ─────────────────────────────────────────────────────────────────────────────
// DNB-07: rollback revierte el contador — no produce gaps permanentes
// ─────────────────────────────────────────────────────────────────────────────
it('DNB-07: rollback revierte el contador y el siguiente número no tiene gap', async () => {
  await db.sequence.update({ where: { name: TEST_SEQUENCE }, data: { currentValue: 500 } });

  await expect(
    db.$transaction(async (tx) => {
      const num = await getNextDocumentNumber(tx, TEST_SEQUENCE, wh1Id);
      expect(num).toBe('D1-00501');
      throw new Error('rollback deliberado');
    })
  ).rejects.toThrow('rollback deliberado');

  const nextAfterRollback = await db.$transaction((tx) =>
    getNextDocumentNumber(tx, TEST_SEQUENCE, wh1Id)
  );
  expect(nextAfterRollback).toBe('D1-00501');
});

// ─────────────────────────────────────────────────────────────────────────────
// DNB-08: create INVOICE con branchId → invoiceNumber empieza con {PREFIX}-
// ─────────────────────────────────────────────────────────────────────────────
it('DNB-08: create INVOICE con branchId → invoiceNumber con prefijo de sucursal', async () => {
  const caller = makeCaller(userId);
  const invoice = await caller.create({
    customerId,
    branchId: wh1Id,
    type: 'INVOICE',
    items: [{ productId, locationId, quantity: 1, unitPrice: 100 }],
    taxRate: 0.115,
  });

  expect(invoice.invoiceNumber).toMatch(/^D1-\d{5}$/);
});

// ─────────────────────────────────────────────────────────────────────────────
// DNB-09: convertQuoteToInvoice hereda branchId del quote
// ─────────────────────────────────────────────────────────────────────────────
it('DNB-09: convertQuoteToInvoice hereda branchId del quote → invoiceNumber con prefijo de sucursal', async () => {
  const caller = makeCaller(userId);

  const quote = await caller.create({
    customerId,
    branchId: wh1Id,
    type: 'QUOTE',
    items: [{ productId, locationId, quantity: 2, unitPrice: 100 }],
    taxRate: 0.115,
  });
  expect(quote.invoiceNumber).toMatch(/^D1-\d{5}$/);

  const invoice = await caller.convertQuoteToInvoice({
    quoteId: quote.id,
    items: [{ productId, locationId, quantity: 2 }],
  });

  expect(invoice.invoiceNumber).toMatch(/^D1-\d{5}$/);
  expect(invoice.type).toBe('INVOICE');
  expect(invoice.status).toBe('ISSUED');
});

// ─────────────────────────────────────────────────────────────────────────────
// DNB-10: create QUOTE con branchId → invoiceNumber empieza con {PREFIX}-
// ─────────────────────────────────────────────────────────────────────────────
it('DNB-10: create QUOTE con branchId → invoiceNumber con prefijo de sucursal', async () => {
  const caller = makeCaller(userId);
  const quote = await caller.create({
    customerId,
    branchId: wh2Id,
    type: 'QUOTE',
    items: [{ productId, locationId, quantity: 1, unitPrice: 100 }],
    taxRate: 0.115,
  });

  expect(quote.invoiceNumber).toMatch(/^D2-\d{5}$/);
  expect(quote.type).toBe('QUOTE');
});

// ─────────────────────────────────────────────────────────────────────────────
// DNB-11: create CREDIT_NOTE con branchId → invoiceNumber empieza con {PREFIX}-
// ─────────────────────────────────────────────────────────────────────────────
it('DNB-11: create CREDIT_NOTE con branchId → invoiceNumber con prefijo de sucursal', async () => {
  const caller = makeCaller(userId);

  // Crear factura origen
  const sourceInvoice = await caller.create({
    customerId,
    branchId: wh1Id,
    type: 'INVOICE',
    items: [{ productId, locationId, quantity: 5, unitPrice: 100 }],
    taxRate: 0.115,
  });

  // Nota de crédito sobre la misma sucursal
  const nc = await caller.create({
    customerId,
    branchId: wh1Id,
    type: 'CREDIT_NOTE',
    sourceInvoiceId: sourceInvoice.id,
    items: [{ productId, locationId, quantity: 2, unitPrice: 100 }],
    taxRate: 0.115,
  });

  expect(nc.invoiceNumber).toMatch(/^D1-\d{5}$/);
  expect(nc.type).toBe('CREDIT_NOTE');
});

// ─────────────────────────────────────────────────────────────────────────────
// DNB-12: concurrencia — 5 llamadas con mismo branchId → únicos y consecutivos
// ─────────────────────────────────────────────────────────────────────────────
describe('DNB-12: concurrencia con branchId', () => {
  it('5 llamadas concurrentes con mismo branchId → 5 números únicos y consecutivos', async () => {
    await db.sequence.update({ where: { name: TEST_SEQUENCE }, data: { currentValue: 200 } });

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        db.$transaction((tx) => getNextDocumentNumber(tx, TEST_SEQUENCE, wh1Id))
      )
    );

    // Sin duplicados
    expect(new Set(results).size).toBe(5);

    // Todos con prefijo D1
    results.forEach((r) => expect(r).toMatch(/^D1-\d{5}$/));

    // Consecutivos (201..205) — sin importar el orden de llegada
    const numbers = results.map((r) => parseInt(r.replace('D1-', ''), 10));
    expect(Math.min(...numbers)).toBe(201);
    expect(Math.max(...numbers)).toBe(205);

    const sorted = [...numbers].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i]!).toBe(sorted[i - 1]! + 1);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DNB-13: PURCHASE_ORDER sin branchId → prefijo OC-RD- (sin cambios)
// ─────────────────────────────────────────────────────────────────────────────
it('DNB-13: PURCHASE_ORDER sin branchId conserva su prefijo OC-RD-', async () => {
  const result = await db.$transaction((tx) =>
    getNextDocumentNumber(tx, 'PURCHASE_ORDER', undefined)
  );

  expect(result).toMatch(/^OC-RD-\d{5}$/);
});

// ─────────────────────────────────────────────────────────────────────────────
// DNB-14: create INVOICE sin branchId → prefijo FAC- (backward compat)
// ─────────────────────────────────────────────────────────────────────────────
it('DNB-14: create INVOICE sin branchId → prefijo FAC- (compatibilidad documentos históricos)', async () => {
  const caller = makeCaller(userId);
  const invoice = await caller.create({
    customerId,
    // branchId deliberadamente omitido
    type: 'INVOICE',
    items: [{ productId, locationId, quantity: 1, unitPrice: 100 }],
    taxRate: 0.115,
  });

  expect(invoice.invoiceNumber).toMatch(/^FAC-\d{5}$/);
});
