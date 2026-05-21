/**
 * Integration tests for Bug 2.1 — Factura descuenta inventario.
 *
 * Validates all flows of the invoicing module against the real database:
 * - INVOICE creation: stock decrement, PENDING_AUTHORIZATION, MANAGER override
 * - QUOTE creation: no stock touch, locationId=NULL in DB, COT- sequence
 * - CREDIT_NOTE: METHOD_NOT_SUPPORTED (TD-005)
 * - authorizeBackorder: MANAGER only, orphan check, stock at authorization time
 * - convertQuoteToInvoice: price inheritance, Regla 4, TOCTOU prevention
 * - void with sourceQuoteId: Regla 3 (QUOTE reverts to ISSUED)
 * - addPayment guard: no payments to QUOTEs
 * - Concurrent convertQuoteToInvoice: race condition prevention
 *
 * R-test 1: Each test is independent. beforeEach resets invoices, movements,
 * and stock. Shared fixtures (users, products, locations) are created once
 * in beforeAll.
 *
 * R-test 2: After each mutation, state is verified directly in the DB via
 * findUnique/findMany, not only via the return value.
 *
 * Run with: npm test
 *
 * AUDIT-BUG-21
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createCallerFactory } from '@/server/trpc';
import { invoicingRouter } from '@/server/trpc/routers/invoicing';
import type { Context } from '@/server/trpc/context';

const db = new PrismaClient();
const makeInvoicingCaller = createCallerFactory(invoicingRouter);

// ─── Test context factory ────────────────────────────────────────────────────
// Bypasses Auth.js and HTTP — provides a fake session directly to the router.
// The router casts session.user as { role?: string }, so role survives any cast.

function makeCaller(userId: string, role: 'VENDOR' | 'MANAGER' | 'ADMIN') {
  const ctx = {
    db,
    session: {
      user: {
        id: userId,
        name: `Test ${role}`,
        email: `${role.toLowerCase()}-bug21@test.invalid`,
        role,
      },
      expires: new Date(Date.now() + 8 * 3600 * 1000).toISOString(),
    },
    req: {
      headers: { get: (_name: string) => null },
    },
  } as unknown as Context;
  return makeInvoicingCaller(ctx);
}

// ─── Shared fixture IDs (set in beforeAll) ───────────────────────────────────

let vendorId: string;
let managerId: string;
let customerId: string;
let catId: string;
let whId: string;
let productId: string;   // lives in locationId
let product2Id: string;  // lives in location2Id (different product → cross-product tests)
let locationId: string;
let location2Id: string;

// ─────────────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  const cat = await db.category.create({
    data: { name: 'TEST-INVOICING-BUG21-CAT', slug: 'test-inv-bug21' },
  });
  catId = cat.id;

  const wh = await db.warehouse.create({ data: { name: 'TEST-INVOICING-BUG21-WH' } });
  whId = wh.id;

  const vendor = await db.user.create({
    data: { name: 'Test Vendor Bug21', email: 'vendor-bug21@test.invalid', role: 'VENDOR' },
  });
  vendorId = vendor.id;

  const manager = await db.user.create({
    data: { name: 'Test Manager Bug21', email: 'manager-bug21@test.invalid', role: 'MANAGER' },
  });
  managerId = manager.id;

  const customer = await db.customer.create({
    data: { code: 'CLI-BUG21-TEST', name: 'Test Customer Bug21', type: 'RETAIL' },
  });
  customerId = customer.id;

  const p1 = await db.product.create({
    data: {
      sku: 'BUG21-PROD-1',
      name: 'Test Product 1 Bug21',
      categoryId: catId,
      unitCost: 50,
      retailPrice: 100,
      wholesalePrice: 80,
    },
  });
  productId = p1.id;

  const p2 = await db.product.create({
    data: {
      sku: 'BUG21-PROD-2',
      name: 'Test Product 2 Bug21',
      categoryId: catId,
      unitCost: 30,
      retailPrice: 60,
      wholesalePrice: 50,
    },
  });
  product2Id = p2.id;

  const loc1 = await db.productLocation.create({
    data: { productId, warehouseId: whId, locationCode: 'BUG21-LOC-A', quantityOnHand: 100 },
  });
  locationId = loc1.id;

  const loc2 = await db.productLocation.create({
    data: { productId: product2Id, warehouseId: whId, locationCode: 'BUG21-LOC-B', quantityOnHand: 100 },
  });
  location2Id = loc2.id;
});

// Reset state between tests: delete invoices (cascades items), movements,
// audit logs, payments; reset stock to a known high value.

beforeEach(async () => {
  // Nullify sourceQuoteId references before deleting to avoid FK conflicts
  await db.invoice.updateMany({
    where: { customerId, sourceQuoteId: { not: null } },
    data: { sourceQuoteId: null },
  });
  await db.payment.deleteMany({ where: { invoice: { customerId } } });
  await db.inventoryMovement.deleteMany({
    where: { locationId: { in: [locationId, location2Id] } },
  });
  // AuditLog.entityId has no FK → delete by entityType without cascade concerns
  await db.auditLog.deleteMany({ where: { entityType: 'Invoice', userId: { in: [vendorId, managerId] } } });
  await db.invoice.deleteMany({ where: { customerId } });

  await db.productLocation.update({
    where: { id: locationId },
    data: { quantityOnHand: 100, reservedQuantity: 0 },
  });
  await db.productLocation.update({
    where: { id: location2Id },
    data: { quantityOnHand: 100, reservedQuantity: 0 },
  });
});

afterAll(async () => {
  await db.invoice.updateMany({
    where: { customerId, sourceQuoteId: { not: null } },
    data: { sourceQuoteId: null },
  });
  await db.payment.deleteMany({ where: { invoice: { customerId } } });
  await db.inventoryMovement.deleteMany({
    where: { locationId: { in: [locationId, location2Id] } },
  });
  await db.auditLog.deleteMany({ where: { entityType: 'Invoice', userId: { in: [vendorId, managerId] } } });
  await db.invoice.deleteMany({ where: { customerId } });
  await db.productLocation.deleteMany({ where: { id: { in: [locationId, location2Id] } } });
  await db.product.deleteMany({ where: { id: { in: [productId, product2Id] } } });
  await db.customer.delete({ where: { id: customerId } }).catch(() => {});
  await db.user.deleteMany({ where: { id: { in: [vendorId, managerId] } } });
  await db.warehouse.delete({ where: { id: whId } }).catch(() => {});
  await db.category.delete({ where: { id: catId } }).catch(() => {});
  await db.$disconnect();
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Bug 2.1 — Factura descuenta inventario', () => {
  // ── A. create — type=INVOICE ──────────────────────────────────────────────

  describe('create — type=INVOICE', () => {
    it('A1: factura con stock suficiente descuenta inventario y crea movimiento OUT correcto', async () => {
      await db.productLocation.update({
        where: { id: locationId },
        data: { quantityOnHand: 10 },
      });

      const vendor = makeCaller(vendorId, 'VENDOR');
      const invoice = await vendor.create({
        customerId,
        type: 'INVOICE',
        items: [{ productId, locationId, quantity: 3, unitPrice: 100 }],
        taxRate: 0.115,
      });

      expect(invoice.status).toBe('ISSUED');
      expect(invoice.invoiceNumber).toMatch(/^FAC-/);

      const loc = await db.productLocation.findUnique({ where: { id: locationId } });
      expect(loc!.quantityOnHand).toBe(7);

      const movements = await db.inventoryMovement.findMany({ where: { locationId } });
      expect(movements).toHaveLength(1);
      expect(movements[0]!.movementType).toBe('OUT');
      expect(movements[0]!.quantity).toBe(-3);
      expect(movements[0]!.referenceId).toBe(invoice.invoiceNumber);
    });

    it('A2: VENDOR con stock insuficiente → PENDING_AUTHORIZATION, stock intacto, 0 movimientos, shortages en audit', async () => {
      await db.productLocation.update({
        where: { id: locationId },
        data: { quantityOnHand: 2 },
      });

      const vendor = makeCaller(vendorId, 'VENDOR');
      const invoice = await vendor.create({
        customerId,
        type: 'INVOICE',
        items: [{ productId, locationId, quantity: 5, unitPrice: 100 }],
        taxRate: 0.115,
      });

      expect(invoice.status).toBe('PENDING_AUTHORIZATION');

      const loc = await db.productLocation.findUnique({ where: { id: locationId } });
      expect(loc!.quantityOnHand).toBe(2);

      const movements = await db.inventoryMovement.findMany({ where: { locationId } });
      expect(movements).toHaveLength(0);

      const audit = await db.auditLog.findFirst({ where: { entityId: invoice.id } });
      expect(audit!.newValues).toMatchObject({
        status: 'PENDING_AUTHORIZATION',
        reason: expect.stringContaining('Stock insuficiente'),
        shortages: expect.arrayContaining([
          expect.objectContaining({ productId, requested: 5, available: 2 }),
        ]),
      });
    });

    it('A3: MANAGER con stock insuficiente → ISSUED, stock negativo, managerStockOverride en audit', async () => {
      await db.productLocation.update({
        where: { id: locationId },
        data: { quantityOnHand: 2 },
      });

      const manager = makeCaller(managerId, 'MANAGER');
      const invoice = await manager.create({
        customerId,
        type: 'INVOICE',
        items: [{ productId, locationId, quantity: 5, unitPrice: 100 }],
        taxRate: 0.115,
      });

      expect(invoice.status).toBe('ISSUED');

      const loc = await db.productLocation.findUnique({ where: { id: locationId } });
      expect(loc!.quantityOnHand).toBe(-3); // 2 - 5

      const movements = await db.inventoryMovement.findMany({ where: { locationId } });
      expect(movements).toHaveLength(1);
      expect(movements[0]!.quantity).toBe(-5);

      const audit = await db.auditLog.findFirst({ where: { entityId: invoice.id } });
      expect(audit!.newValues).toMatchObject({
        managerStockOverride: true,
        shortagesOverridden: expect.arrayContaining([
          expect.objectContaining({ productId }),
        ]),
      });
    });

    it('A4: locationId pertenece a producto diferente → BAD_REQUEST, transacción rollback, secuencia no gastada', async () => {
      const seqBefore = await db.sequence.findUnique({ where: { name: 'INVOICE' } });
      const valueBefore = seqBefore!.currentValue;

      const vendor = makeCaller(vendorId, 'VENDOR');
      await expect(
        vendor.create({
          customerId,
          type: 'INVOICE',
          // location2 belongs to product2, not product1 — explicit mismatch
          items: [{ productId, locationId: location2Id, quantity: 1, unitPrice: 100 }],
          taxRate: 0.115,
        })
      ).rejects.toThrow(/no pertenece al producto/);

      const count = await db.invoice.count({ where: { customerId } });
      expect(count).toBe(0);

      // Sequence counter rolled back — next successful invoice gets the same number
      const seqAfter = await db.sequence.findUnique({ where: { name: 'INVOICE' } });
      expect(seqAfter!.currentValue).toBe(valueBefore);
    });

    it('A5: locationId inexistente → NOT_FOUND, rollback completo, 0 facturas creadas', async () => {
      const vendor = makeCaller(vendorId, 'VENDOR');
      await expect(
        vendor.create({
          customerId,
          type: 'INVOICE',
          items: [{ productId, locationId: 'clxxxxxxxxxxxxxxxxxxxxxxxx', quantity: 1, unitPrice: 100 }],
          taxRate: 0.115,
        })
      ).rejects.toThrow(/no encontrada/);

      const count = await db.invoice.count({ where: { customerId } });
      expect(count).toBe(0);
    });
  });

  // ── B. create — type=QUOTE ────────────────────────────────────────────────

  describe('create — type=QUOTE', () => {
    it('B1: cotización NO descuenta stock y guarda locationId=NULL en invoice_items aunque se envíe locationId', async () => {
      await db.productLocation.update({
        where: { id: locationId },
        data: { quantityOnHand: 50 },
      });

      const vendor = makeCaller(vendorId, 'VENDOR');
      const quote = await vendor.create({
        customerId,
        type: 'QUOTE',
        // Router strips locationId for QUOTE path (calcInvoiceTotals → itemsData excludes it)
        items: [{ productId, locationId, quantity: 10, unitPrice: 100 }],
        taxRate: 0.115,
      });

      expect(quote.type).toBe('QUOTE');
      expect(quote.status).toBe('ISSUED');

      const loc = await db.productLocation.findUnique({ where: { id: locationId } });
      expect(loc!.quantityOnHand).toBe(50);

      const movements = await db.inventoryMovement.findMany({ where: { locationId } });
      expect(movements).toHaveLength(0);

      // DB must have locationId=NULL — strip by construction (see invoicing.ts:calcInvoiceTotals)
      const items = await db.invoiceItem.findMany({ where: { invoiceId: quote.id } });
      expect(items).toHaveLength(1);
      expect(items[0]!.locationId).toBeNull();
    });

    it('B2: cotización usa secuencia QUOTE (COT-XXXXX), no la secuencia INVOICE (FAC-XXXXX)', async () => {
      const vendor = makeCaller(vendorId, 'VENDOR');
      const quote = await vendor.create({
        customerId,
        type: 'QUOTE',
        items: [{ productId, locationId, quantity: 1, unitPrice: 100 }],
        taxRate: 0.115,
      });

      expect(quote.invoiceNumber).toMatch(/^COT-/);
    });
  });

  // ── C. create — type=CREDIT_NOTE ─────────────────────────────────────────

  describe('create — type=CREDIT_NOTE', () => {
    it('C1: CREDIT_NOTE lanza METHOD_NOT_SUPPORTED con referencia a TD-005', async () => {
      const vendor = makeCaller(vendorId, 'VENDOR');
      await expect(
        vendor.create({
          customerId,
          type: 'CREDIT_NOTE',
          items: [{ productId, locationId, quantity: 1, unitPrice: 100 }],
          taxRate: 0.115,
        })
      ).rejects.toThrow(/TD-005/);
    });
  });

  // ── D. authorizeBackorder ─────────────────────────────────────────────────

  describe('authorizeBackorder', () => {
    it('D1: MANAGER autoriza PENDING_AUTHORIZATION → ISSUED, stock descontado, audit con AUTHORIZE_BACKORDER', async () => {
      await db.productLocation.update({
        where: { id: locationId },
        data: { quantityOnHand: 1 },
      });

      const vendor = makeCaller(vendorId, 'VENDOR');
      const pending = await vendor.create({
        customerId,
        type: 'INVOICE',
        items: [{ productId, locationId, quantity: 5, unitPrice: 200 }],
        taxRate: 0.115,
      });
      expect(pending.status).toBe('PENDING_AUTHORIZATION');

      // Stock still at 1 before authorization — no movements created yet
      const locBefore = await db.productLocation.findUnique({ where: { id: locationId } });
      expect(locBefore!.quantityOnHand).toBe(1);
      expect(await db.inventoryMovement.count({ where: { locationId } })).toBe(0);

      const manager = makeCaller(managerId, 'MANAGER');
      const authorized = await manager.authorizeBackorder({
        id: pending.id,
        authorizationNotes: 'Aprobado por gerencia — cliente prioritario',
      });

      expect(authorized.status).toBe('ISSUED');

      const locAfter = await db.productLocation.findUnique({ where: { id: locationId } });
      expect(locAfter!.quantityOnHand).toBe(-4); // 1 - 5 = -4 (explicit MANAGER override)

      const movements = await db.inventoryMovement.findMany({ where: { locationId } });
      expect(movements).toHaveLength(1);
      expect(movements[0]!.movementType).toBe('OUT');
      expect(movements[0]!.quantity).toBe(-5);

      const audit = await db.auditLog.findFirst({
        where: { entityId: pending.id, action: 'AUTHORIZE_BACKORDER' },
      });
      expect(audit).not.toBeNull();
      expect(audit!.newValues).toMatchObject({
        previousStatus: 'PENDING_AUTHORIZATION',
        newStatus: 'ISSUED',
        authorizationNotes: 'Aprobado por gerencia — cliente prioritario',
        managerStockOverride: true,
      });
    });

    it('D2: VENDOR intenta autorizar backorder → FORBIDDEN', async () => {
      await db.productLocation.update({
        where: { id: locationId },
        data: { quantityOnHand: 1 },
      });

      const vendor = makeCaller(vendorId, 'VENDOR');
      const pending = await vendor.create({
        customerId,
        type: 'INVOICE',
        items: [{ productId, locationId, quantity: 5, unitPrice: 100 }],
        taxRate: 0.115,
      });

      await expect(
        vendor.authorizeBackorder({ id: pending.id, authorizationNotes: 'intento' })
      ).rejects.toThrow(/MANAGER|ADMIN/);
    });

    it('D3: intentar autorizar factura con status ISSUED → BAD_REQUEST mencionando el estado actual', async () => {
      const vendor = makeCaller(vendorId, 'VENDOR');
      const issued = await vendor.create({
        customerId,
        type: 'INVOICE',
        items: [{ productId, locationId, quantity: 2, unitPrice: 100 }],
        taxRate: 0.115,
      });
      expect(issued.status).toBe('ISSUED');

      const manager = makeCaller(managerId, 'MANAGER');
      await expect(
        manager.authorizeBackorder({ id: issued.id, authorizationNotes: 'test' })
      ).rejects.toThrow(/ISSUED/);
    });
  });

  // ── E. convertQuoteToInvoice ──────────────────────────────────────────────

  describe('convertQuoteToInvoice', () => {
    it('E1: conversión exitosa — INVOICE con sourceQuoteId, precios heredados, taxRate y dueDate NO heredados, stock descontado', async () => {
      const vendor = makeCaller(vendorId, 'VENDOR');
      // Quote with taxRate=0.08 and dueDate — neither should transfer to the INVOICE
      const quote = await vendor.create({
        customerId,
        type: 'QUOTE',
        items: [{ productId, locationId, quantity: 5, unitPrice: 75, discountPercent: 10 }],
        taxRate: 0.08,
        dueDate: new Date('2026-12-31'),
      });
      expect(quote.status).toBe('ISSUED');

      const newInvoice = await vendor.convertQuoteToInvoice({
        quoteId: quote.id,
        items: [{ productId, locationId, quantity: 3 }], // partial quantity
      });

      expect(newInvoice.type).toBe('INVOICE');
      expect(newInvoice.status).toBe('ISSUED');
      expect(newInvoice.invoiceNumber).toMatch(/^FAC-/);
      expect(newInvoice.sourceQuoteId).toBe(quote.id);
      expect(newInvoice.dueDate).toBeNull();
      // taxRate must be current PR IVU (0.115), NOT the quote's 0.08
      expect(Number(newInvoice.taxRate)).toBeCloseTo(0.115, 3);

      // Prices must be inherited from the QUOTE items
      const item = newInvoice.items[0]!;
      expect(Number(item.unitPrice)).toBeCloseTo(75, 2);
      expect(Number(item.discountPercent)).toBeCloseTo(10, 2);
      expect(item.quantity).toBe(3);

      // QUOTE marked as CONVERTED
      const updatedQuote = await db.invoice.findUnique({ where: { id: quote.id } });
      expect(updatedQuote!.status).toBe('CONVERTED');

      // Stock decremented by the converted quantity (3, not 5)
      const loc = await db.productLocation.findUnique({ where: { id: locationId } });
      expect(loc!.quantityOnHand).toBe(97); // 100 - 3

      const movements = await db.inventoryMovement.findMany({ where: { locationId } });
      expect(movements).toHaveLength(1);
      expect(movements[0]!.quantity).toBe(-3);
      expect(movements[0]!.referenceId).toBe(newInvoice.invoiceNumber);
    });

    it('E2: producto no presente en la cotización original → BAD_REQUEST con productId en el mensaje', async () => {
      const vendor = makeCaller(vendorId, 'VENDOR');
      const quote = await vendor.create({
        customerId,
        type: 'QUOTE',
        items: [{ productId, locationId, quantity: 2, unitPrice: 100 }],
        taxRate: 0.115,
      });

      await expect(
        vendor.convertQuoteToInvoice({
          quoteId: quote.id,
          items: [{ productId: product2Id, locationId: location2Id, quantity: 1 }],
        })
      ).rejects.toThrow(new RegExp(product2Id));
    });

    it('E3: cotización ya CONVERTED no puede re-convertirse → BAD_REQUEST mencionando el estado actual', async () => {
      // This test validates the sequential guard: status check fires before Regla 4.
      // Regla 4 (with invoiceNumber in the message) is for the concurrent race —
      // tested separately in H1. In the sequential case, the QUOTE is already
      // CONVERTED when the second attempt reads it, so the status guard fires first.
      const vendor = makeCaller(vendorId, 'VENDOR');
      const quote = await vendor.create({
        customerId,
        type: 'QUOTE',
        items: [{ productId, locationId, quantity: 2, unitPrice: 100 }],
        taxRate: 0.115,
      });

      const firstInvoice = await vendor.convertQuoteToInvoice({
        quoteId: quote.id,
        items: [{ productId, locationId, quantity: 2 }],
      });
      expect(firstInvoice.status).toBe('ISSUED');

      // QUOTE is now CONVERTED — second attempt hits the status guard, not Regla 4
      await expect(
        vendor.convertQuoteToInvoice({
          quoteId: quote.id,
          items: [{ productId, locationId, quantity: 2 }],
        })
      ).rejects.toThrow(/CONVERTED/);

      // Invariant: only one active INVOICE derived from this QUOTE
      const activeCount = await db.invoice.count({
        where: { sourceQuoteId: quote.id, status: { notIn: ['VOIDED'] } },
      });
      expect(activeCount).toBe(1);
    });
  });

  // ── F. void con sourceQuoteId (Regla 3 — ADR-002) ────────────────────────

  describe('void con sourceQuoteId (Regla 3 — ADR-002)', () => {
    it('F1: anular la única INVOICE activa derivada de un QUOTE revierte el QUOTE de CONVERTED a ISSUED', async () => {
      const vendor = makeCaller(vendorId, 'VENDOR');
      const quote = await vendor.create({
        customerId,
        type: 'QUOTE',
        items: [{ productId, locationId, quantity: 3, unitPrice: 100 }],
        taxRate: 0.115,
      });

      const invoice = await vendor.convertQuoteToInvoice({
        quoteId: quote.id,
        items: [{ productId, locationId, quantity: 3 }],
      });

      const quoteBefore = await db.invoice.findUnique({ where: { id: quote.id } });
      expect(quoteBefore!.status).toBe('CONVERTED');

      await vendor.void({ id: invoice.id, reason: 'Error en cantidad — debe reemitirse' });

      // Regla 3: QUOTE reverts to ISSUED — can be re-converted
      const quoteAfter = await db.invoice.findUnique({ where: { id: quote.id } });
      expect(quoteAfter!.status).toBe('ISSUED');

      const invoiceAfter = await db.invoice.findUnique({ where: { id: invoice.id } });
      expect(invoiceAfter!.status).toBe('VOIDED');
    });
  });

  // ── G. addPayment guards ──────────────────────────────────────────────────

  describe('addPayment guards', () => {
    it('G1: intentar registrar pago a una QUOTE → BAD_REQUEST con mensaje descriptivo', async () => {
      const vendor = makeCaller(vendorId, 'VENDOR');
      const quote = await vendor.create({
        customerId,
        type: 'QUOTE',
        items: [{ productId, locationId, quantity: 1, unitPrice: 100 }],
        taxRate: 0.115,
      });

      await expect(
        vendor.addPayment({ invoiceId: quote.id, amount: 50, method: 'CASH' })
      ).rejects.toThrow(/cotizacion|quote/i);
    });
  });

  // ── H. Concurrencia — TOCTOU prevention ──────────────────────────────────

  describe('Concurrencia — TOCTOU prevention en convertQuoteToInvoice', () => {
    it('H1: dos llamadas concurrentes al mismo QUOTE: una pasa, la otra falla con el invoiceNumber de la ganadora', async () => {
      const vendor = makeCaller(vendorId, 'VENDOR');
      const quote = await vendor.create({
        customerId,
        type: 'QUOTE',
        items: [{ productId, locationId, quantity: 2, unitPrice: 100 }],
        taxRate: 0.115,
      });

      // Both conversions start concurrently — SELECT FOR UPDATE serializes them at DB level.
      // One wins the lock and creates the INVOICE; the other finds the QUOTE already CONVERTED.
      const [r1, r2] = await Promise.allSettled([
        vendor.convertQuoteToInvoice({ quoteId: quote.id, items: [{ productId, locationId, quantity: 2 }] }),
        vendor.convertQuoteToInvoice({ quoteId: quote.id, items: [{ productId, locationId, quantity: 2 }] }),
      ]);

      const successes = [r1, r2].filter((r) => r.status === 'fulfilled');
      const failures = [r1, r2].filter((r) => r.status === 'rejected');

      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(1);

      const winner = (successes[0] as PromiseFulfilledResult<typeof r1 extends PromiseFulfilledResult<infer T> ? T : never>).value;
      expect((winner as { invoiceNumber: string }).invoiceNumber).toMatch(/^FAC-/);

      // Error message must include the winning invoice number (Regla 4 message)
      const loserErr = (failures[0] as PromiseRejectedResult).reason as Error;
      expect(loserErr.message).toContain((winner as { invoiceNumber: string }).invoiceNumber);

      // Exactly one active INVOICE derived from this QUOTE
      const activeCount = await db.invoice.count({
        where: { sourceQuoteId: quote.id, status: { notIn: ['VOIDED'] } },
      });
      expect(activeCount).toBe(1);

      // Stock decremented exactly once — quantity=2 deducted once, not twice
      const loc = await db.productLocation.findUnique({ where: { id: locationId } });
      expect(loc!.quantityOnHand).toBe(98); // 100 - 2
    });
  });
});
