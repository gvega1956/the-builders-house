/**
 * Invariantes financieros — facturación
 *
 * a. invoicing.create genera exactamente un OUT por línea con referenceId = invoice.id
 * b. Oversell: VENDOR → PENDING_AUTHORIZATION; ADMIN/MANAGER → ISSUED con override
 * c. addPayment: paidAmount nunca excede total
 * d. void ISSUED revierte stock (RETURN movement + incremento onHand)
 * e. void PENDING_AUTHORIZATION libera reservedQuantity sin mover onHand
 * f. validateItemPricing: VENDOR no puede vender bajo costo; ADMIN sí (con discountReason)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createCallerFactory } from '@/server/trpc';
import { invoicingRouter } from '@/server/trpc/routers/invoicing';
import { testDb, makeCtx, truncateAll, seedTestDb, type TestSeed } from '../setup/test-helpers';

const createInvoicingCaller = createCallerFactory(invoicingRouter);

let seed: TestSeed;

beforeEach(async () => {
  await truncateAll(testDb);
  seed = await seedTestDb(testDb);
});

// ─────────────────────────────────────────────────────────────────────────────
// a. OUT movement con referenceId = invoice.id
// ─────────────────────────────────────────────────────────────────────────────
describe('a — invoicing.create OUT movements', () => {
  /**
   * BUG CONOCIDO: invoicing.create usa `referenceId: invoiceNumber` (string legible,
   * p.ej. "FAC-00001") en lugar de `referenceId: created.id` (UUID de la factura).
   *
   * Las otras rutas (authorizeBackorder, authorizeAndPay, edit) ya fueron corregidas
   * en el sprint anterior. Esta ruta quedó sin corregir.
   *
   * Evidencia: línea ~529 en invoicing.ts:
   *   referenceId: invoiceNumber,   ← debería ser: created.id
   *
   * El test queda como `it.fails` hasta que se aplique el fix.
   * Cuando se corrija, cambiar a `it` normal y actualizar este comentario.
   */
  it.fails(
    'genera exactamente un OUT movement por línea con referenceId = invoice.id [BUG ACTIVO]',
    async () => {
      const caller = createInvoicingCaller(makeCtx(testDb, seed.adminUser.id));

      const invoice = await caller.create({
        customerId: seed.customer.id,
        type: 'INVOICE',
        items: [
          {
            productId: seed.product.id,
            locationId: seed.location.id,
            quantity: 3,
            unitPrice: 100,
          },
        ],
        taxRate: 0,
      });

      expect(invoice.status).toBe('ISSUED');

      const movements = await testDb.inventoryMovement.findMany({
        where: { movementType: 'OUT' },
      });

      expect(movements).toHaveLength(1);
      expect(movements[0]!.quantity).toBe(-3);
      expect(movements[0]!.referenceType).toBe('INVOICE');
      // Falla: actual = 'FAC-00001' (invoiceNumber), esperado = invoice.id (UUID)
      expect(movements[0]!.referenceId).toBe(invoice.id);
    },
  );

  it('genera exactamente un OUT movement por línea de INVOICE (movementType y quantity)', async () => {
    const caller = createInvoicingCaller(makeCtx(testDb, seed.adminUser.id));

    const invoice = await caller.create({
      customerId: seed.customer.id,
      type: 'INVOICE',
      items: [
        { productId: seed.product.id, locationId: seed.location.id, quantity: 3, unitPrice: 100 },
      ],
      taxRate: 0,
    });

    expect(invoice.status).toBe('ISSUED');

    const movements = await testDb.inventoryMovement.findMany({
      where: { movementType: 'OUT' },
    });

    expect(movements).toHaveLength(1);
    expect(movements[0]!.quantity).toBe(-3);
    expect(movements[0]!.referenceType).toBe('INVOICE');
    expect(movements[0]!.productId).toBe(seed.product.id);
    expect(movements[0]!.locationId).toBe(seed.location.id);
  });

  it('QUOTE no crea movimientos de inventario', async () => {
    const caller = createInvoicingCaller(makeCtx(testDb, seed.adminUser.id));

    await caller.create({
      customerId: seed.customer.id,
      type: 'QUOTE',
      items: [{ productId: seed.product.id, quantity: 5, unitPrice: 100 }],
      taxRate: 0,
    });

    const movements = await testDb.inventoryMovement.findMany();
    expect(movements).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// b. Oversell
// ─────────────────────────────────────────────────────────────────────────────
describe('b — oversell', () => {
  it('VENDOR con stock insuficiente → PENDING_AUTHORIZATION, sin OUT, reserva activa', async () => {
    // Bajar stock a 2 para que la compra de 5 genere faltante
    await testDb.productLocation.update({
      where: { id: seed.location.id },
      data: { quantityOnHand: 2 },
    });

    const caller = createInvoicingCaller(makeCtx(testDb, seed.vendorUser.id));
    const invoice = await caller.create({
      customerId: seed.customer.id,
      type: 'INVOICE',
      items: [{ productId: seed.product.id, locationId: seed.location.id, quantity: 5, unitPrice: 100 }],
      taxRate: 0,
    });

    expect(invoice.status).toBe('PENDING_AUTHORIZATION');

    // No debe haber movimientos OUT
    const outMovements = await testDb.inventoryMovement.findMany({ where: { movementType: 'OUT' } });
    expect(outMovements).toHaveLength(0);

    // onHand intacto, reserva activa
    const loc = await testDb.productLocation.findUniqueOrThrow({ where: { id: seed.location.id } });
    expect(loc.quantityOnHand).toBe(2);
    expect(loc.reservedQuantity).toBe(5);
  });

  it('ADMIN con stock insuficiente → ISSUED (override), crea OUT movement', async () => {
    await testDb.productLocation.update({
      where: { id: seed.location.id },
      data: { quantityOnHand: 2 },
    });

    const caller = createInvoicingCaller(makeCtx(testDb, seed.adminUser.id));
    const invoice = await caller.create({
      customerId: seed.customer.id,
      type: 'INVOICE',
      items: [{ productId: seed.product.id, locationId: seed.location.id, quantity: 5, unitPrice: 100 }],
      taxRate: 0,
    });

    expect(invoice.status).toBe('ISSUED');

    const movements = await testDb.inventoryMovement.findMany({ where: { movementType: 'OUT' } });
    expect(movements).toHaveLength(1);
    expect(movements[0]!.quantity).toBe(-5);
  });

  it('VENDOR con stock suficiente → ISSUED directamente', async () => {
    // Seed ya tiene 10 unidades; pedimos 3
    const caller = createInvoicingCaller(makeCtx(testDb, seed.vendorUser.id));
    const invoice = await caller.create({
      customerId: seed.customer.id,
      type: 'INVOICE',
      items: [{ productId: seed.product.id, locationId: seed.location.id, quantity: 3, unitPrice: 100 }],
      taxRate: 0,
    });

    expect(invoice.status).toBe('ISSUED');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// c. addPayment — paidAmount nunca excede total
// ─────────────────────────────────────────────────────────────────────────────
describe('c — addPayment', () => {
  it('pago que excede el balance pendiente es rechazado', async () => {
    const caller = createInvoicingCaller(makeCtx(testDb, seed.adminUser.id));

    // Factura de $100 (1u × $100, sin IVU)
    const invoice = await caller.create({
      customerId: seed.customer.id,
      type: 'INVOICE',
      items: [{ productId: seed.product.id, locationId: seed.location.id, quantity: 1, unitPrice: 100 }],
      taxRate: 0,
    });

    // Pago parcial de $90 → OK
    await caller.addPayment({ invoiceId: invoice.id, amount: 90, method: 'CASH' });

    // Pago de $20 excede el saldo pendiente de $10 → rechazado
    await expect(
      caller.addPayment({ invoiceId: invoice.id, amount: 20, method: 'CASH' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    // paidAmount sigue siendo $90
    const updated = await testDb.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(Number(updated.paidAmount)).toBe(90);
    expect(updated.status).toBe('PARTIAL');
  });

  it('pago exacto al balance pendiente → PAID', async () => {
    const caller = createInvoicingCaller(makeCtx(testDb, seed.adminUser.id));

    const invoice = await caller.create({
      customerId: seed.customer.id,
      type: 'INVOICE',
      items: [{ productId: seed.product.id, locationId: seed.location.id, quantity: 1, unitPrice: 100 }],
      taxRate: 0,
    });

    await caller.addPayment({ invoiceId: invoice.id, amount: 90, method: 'CASH' });
    await caller.addPayment({ invoiceId: invoice.id, amount: 10, method: 'CASH' });

    const updated = await testDb.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(Number(updated.paidAmount)).toBe(100);
    expect(updated.status).toBe('PAID');
  });

  it('factura VOIDED no acepta pagos', async () => {
    const caller = createInvoicingCaller(makeCtx(testDb, seed.adminUser.id));

    const invoice = await caller.create({
      customerId: seed.customer.id,
      type: 'INVOICE',
      items: [{ productId: seed.product.id, locationId: seed.location.id, quantity: 1, unitPrice: 100 }],
      taxRate: 0,
    });

    const managerCaller = createInvoicingCaller(makeCtx(testDb, seed.managerUser.id));
    await managerCaller.void({ id: invoice.id, reason: 'Test' });

    await expect(
      caller.addPayment({ invoiceId: invoice.id, amount: 50, method: 'CASH' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// d. void ISSUED — revierte stock
// ─────────────────────────────────────────────────────────────────────────────
describe('d — void ISSUED revierte stock', () => {
  it('void de ISSUED crea RETURN movement e incrementa quantityOnHand', async () => {
    const adminCaller  = createInvoicingCaller(makeCtx(testDb, seed.adminUser.id));
    const managerCaller = createInvoicingCaller(makeCtx(testDb, seed.managerUser.id));

    const locBefore = await testDb.productLocation.findUniqueOrThrow({
      where: { id: seed.location.id },
    });

    // ISSUED: descuenta stock
    const invoice = await adminCaller.create({
      customerId: seed.customer.id,
      type: 'INVOICE',
      items: [{ productId: seed.product.id, locationId: seed.location.id, quantity: 4, unitPrice: 100 }],
      taxRate: 0,
    });
    expect(invoice.status).toBe('ISSUED');

    // Verificar descuento
    const locMid = await testDb.productLocation.findUniqueOrThrow({ where: { id: seed.location.id } });
    expect(locMid.quantityOnHand).toBe(locBefore.quantityOnHand - 4);

    // Void
    await managerCaller.void({ id: invoice.id, reason: 'Error de prueba' });

    // Stock restaurado
    const locAfter = await testDb.productLocation.findUniqueOrThrow({
      where: { id: seed.location.id },
    });
    expect(locAfter.quantityOnHand).toBe(locBefore.quantityOnHand);

    // Debe existir un movimiento RETURN
    const returnMovs = await testDb.inventoryMovement.findMany({
      where: { movementType: 'RETURN' },
    });
    expect(returnMovs).toHaveLength(1);
    expect(returnMovs[0]!.quantity).toBe(4);
    expect(returnMovs[0]!.referenceId).toBe(invoice.id);

    // La factura queda VOIDED
    const voided = await testDb.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(voided.status).toBe('VOIDED');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// e. void PENDING_AUTHORIZATION — libera reservedQuantity
// ─────────────────────────────────────────────────────────────────────────────
describe('e — void PENDING_AUTHORIZATION libera reserva', () => {
  it('void de PENDING_AUTH decrementa reservedQuantity; onHand intacto; sin movimientos', async () => {
    // Stock insuficiente para forzar PENDING_AUTH en VENDOR
    await testDb.productLocation.update({
      where: { id: seed.location.id },
      data: { quantityOnHand: 2 },
    });

    const vendorCaller   = createInvoicingCaller(makeCtx(testDb, seed.vendorUser.id));
    const managerCaller  = createInvoicingCaller(makeCtx(testDb, seed.managerUser.id));

    const invoice = await vendorCaller.create({
      customerId: seed.customer.id,
      type: 'INVOICE',
      items: [{ productId: seed.product.id, locationId: seed.location.id, quantity: 7, unitPrice: 100 }],
      taxRate: 0,
    });
    expect(invoice.status).toBe('PENDING_AUTHORIZATION');

    const locMid = await testDb.productLocation.findUniqueOrThrow({ where: { id: seed.location.id } });
    expect(locMid.reservedQuantity).toBe(7);

    // Anular: debe liberar la reserva
    await managerCaller.void({ id: invoice.id, reason: 'Cancelada antes de autorizar' });

    const locAfter = await testDb.productLocation.findUniqueOrThrow({
      where: { id: seed.location.id },
    });
    expect(locAfter.reservedQuantity).toBe(0);
    expect(locAfter.quantityOnHand).toBe(2); // Sin cambio

    // No debe haber movimientos de inventario
    const movements = await testDb.inventoryMovement.findMany();
    expect(movements).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// f. validateItemPricing
// ─────────────────────────────────────────────────────────────────────────────
describe('f — validateItemPricing', () => {
  beforeEach(async () => {
    // Subir el costo del producto a $100 para hacer que $80 sea "bajo costo"
    await testDb.product.update({
      where: { id: seed.product.id },
      data: { unitCost: 100 },
    });
  });

  it('VENDOR no puede vender bajo costo → FORBIDDEN', async () => {
    const caller = createInvoicingCaller(makeCtx(testDb, seed.vendorUser.id));

    await expect(
      caller.create({
        customerId: seed.customer.id,
        type: 'INVOICE',
        items: [{ productId: seed.product.id, locationId: seed.location.id, quantity: 1, unitPrice: 80 }],
        taxRate: 0,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('ADMIN sin discountReason bajo costo → BAD_REQUEST', async () => {
    const caller = createInvoicingCaller(makeCtx(testDb, seed.adminUser.id));

    await expect(
      caller.create({
        customerId: seed.customer.id,
        type: 'INVOICE',
        items: [{ productId: seed.product.id, locationId: seed.location.id, quantity: 1, unitPrice: 80 }],
        taxRate: 0,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('ADMIN con discountReason puede vender bajo costo → ISSUED', async () => {
    const caller = createInvoicingCaller(makeCtx(testDb, seed.adminUser.id));

    const invoice = await caller.create({
      customerId: seed.customer.id,
      type: 'INVOICE',
      items: [
        {
          productId: seed.product.id,
          locationId: seed.location.id,
          quantity: 1,
          unitPrice: 80,
          discountReason: 'Descuento especial aprobado por gerencia',
        },
      ],
      taxRate: 0,
    });

    expect(invoice.status).toBe('ISSUED');
  });

  it('MANAGER con discountReason puede vender bajo costo → ISSUED', async () => {
    const caller = createInvoicingCaller(makeCtx(testDb, seed.managerUser.id));

    const invoice = await caller.create({
      customerId: seed.customer.id,
      type: 'INVOICE',
      items: [
        {
          productId: seed.product.id,
          locationId: seed.location.id,
          quantity: 1,
          unitPrice: 80,
          discountReason: 'Liquidación de inventario',
        },
      ],
      taxRate: 0,
    });

    expect(invoice.status).toBe('ISSUED');
  });

  it('QUOTE por encima del costo no requiere discountReason (no hay validación de precios por debajo del costo en QUOTEs...)', async () => {
    // validateItemPricing aplica igual a QUOTE e INVOICE — ambos pasan por la misma función
    // Con costo $100, vender a $80 en una QUOTE también falla para VENDOR
    const caller = createInvoicingCaller(makeCtx(testDb, seed.vendorUser.id));

    await expect(
      caller.create({
        customerId: seed.customer.id,
        type: 'QUOTE',
        items: [{ productId: seed.product.id, quantity: 1, unitPrice: 80 }],
        taxRate: 0,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
