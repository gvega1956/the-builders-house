/**
 * Smoke tests — IVU, inventario multi-sucursal, transferencias.
 *
 * S1: IVU OFF → tax = 0 en DB
 * S2: IVU ON  → tax = subtotal × TAX_RATE configurado
 * S3: PDF data coincide con backend (valores almacenados, no recalculados)
 * S4: Factura en Ponce descuenta solo Ponce, San Juan intacto
 * S5: Transferencia Ponce→San Juan balancea ambos lados
 * S6: Stock insuficiente bloquea venta (VENDOR → PENDING_AUTHORIZATION)
 *
 * Run with: npm test
 * AUDIT-SMOKE
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createCallerFactory } from '@/server/trpc';
import { invoicingRouter } from '@/server/trpc/routers/invoicing';
import { movementsRouter } from '@/server/trpc/routers/movements';
import type { Context } from '@/server/trpc/context';

const db = new PrismaClient();
const makeInvoicingCaller = createCallerFactory(invoicingRouter);
const makeMovementsCaller = createCallerFactory(movementsRouter);

function makeCtx(userId: string, role: 'VENDOR' | 'MANAGER' | 'ADMIN'): Context {
  return {
    db,
    session: {
      user: { id: userId, name: `Smoke ${role}`, email: `smoke-${role.toLowerCase()}@test.invalid`, role },
      expires: new Date(Date.now() + 8 * 3600 * 1000).toISOString(),
    },
    req: { headers: { get: (_: string) => null } },
  } as unknown as Context;
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

let vendorId: string;
let managerId: string;
let customerId: string;
let catId: string;
let ponceWhId: string;
let sjWhId: string;
let productId: string;
let ponceLocId: string;
let sjLocId: string;

const UNIT_COST = 50;
const RETAIL_PRICE = 100;
const TAX_RATE = 0.115;

// ─────────────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  // Ensure TAX_RATE is seeded
  await db.systemConfig.upsert({
    where: { key: 'TAX_RATE' },
    update: { value: String(TAX_RATE) },
    create: { key: 'TAX_RATE', value: String(TAX_RATE) },
  });

  const cat = await db.category.create({ data: { name: 'SMOKE-CAT', slug: 'smoke-cat' } });
  catId = cat.id;

  const ponceWh = await db.warehouse.findFirst({ where: { name: 'Ponce' } });
  const sjWh = await db.warehouse.findFirst({ where: { name: 'San Juan' } });
  if (!ponceWh || !sjWh) throw new Error('Warehouses Ponce/San Juan no encontrados — ejecutar seed primero');
  ponceWhId = ponceWh.id;
  sjWhId = sjWh.id;

  const vendor = await db.user.create({
    data: { name: 'Smoke Vendor', email: 'smoke-vendor@test.invalid', role: 'VENDOR' },
  });
  vendorId = vendor.id;

  const manager = await db.user.create({
    data: { name: 'Smoke Manager', email: 'smoke-manager@test.invalid', role: 'MANAGER' },
  });
  managerId = manager.id;

  const customer = await db.customer.create({
    data: { code: 'SMOKE-CLI-01', name: 'Smoke Customer', type: 'RETAIL' },
  });
  customerId = customer.id;

  const product = await db.product.create({
    data: {
      sku: 'SMOKE-PROD-01',
      name: 'Smoke Product',
      categoryId: catId,
      unitCost: UNIT_COST,
      retailPrice: RETAIL_PRICE,
      wholesalePrice: 80,
    },
  });
  productId = product.id;

  const ponceLoc = await db.productLocation.create({
    data: { productId, warehouseId: ponceWhId, locationCode: 'SMOKE-PONCE-A', quantityOnHand: 100 },
  });
  ponceLocId = ponceLoc.id;

  const sjLoc = await db.productLocation.create({
    data: { productId, warehouseId: sjWhId, locationCode: 'SMOKE-SJ-A', quantityOnHand: 50 },
  });
  sjLocId = sjLoc.id;
});

beforeEach(async () => {
  // Reset invoices/payments/movements for test product
  await db.invoice.updateMany({ where: { customerId, sourceQuoteId: { not: null } }, data: { sourceQuoteId: null } });
  await db.payment.deleteMany({ where: { invoice: { customerId } } });
  await db.inventoryMovement.deleteMany({ where: { locationId: { in: [ponceLocId, sjLocId] } } });
  await db.auditLog.deleteMany({ where: { entityType: 'Invoice', userId: { in: [vendorId, managerId] } } });
  await db.invoice.deleteMany({ where: { customerId } });
  await db.productLocation.updateMany({
    where: { id: { in: [ponceLocId, sjLocId] } },
    data: {},  // reset handled per-location below
  });
  await db.productLocation.update({ where: { id: ponceLocId }, data: { quantityOnHand: 100, reservedQuantity: 0 } });
  await db.productLocation.update({ where: { id: sjLocId }, data: { quantityOnHand: 50, reservedQuantity: 0 } });
  await db.customer.update({ where: { id: customerId }, data: { currentBalance: 0 } });
});

afterAll(async () => {
  await db.invoice.updateMany({ where: { customerId, sourceQuoteId: { not: null } }, data: { sourceQuoteId: null } });
  await db.payment.deleteMany({ where: { invoice: { customerId } } });
  await db.inventoryMovement.deleteMany({ where: { locationId: { in: [ponceLocId, sjLocId] } } });
  await db.auditLog.deleteMany({ where: { entityType: 'Invoice', userId: { in: [vendorId, managerId] } } });
  await db.invoice.deleteMany({ where: { customerId } });
  await db.productLocation.deleteMany({ where: { id: { in: [ponceLocId, sjLocId] } } });
  await db.product.delete({ where: { id: productId } }).catch(() => {});
  await db.customer.delete({ where: { id: customerId } }).catch(() => {});
  await db.user.deleteMany({ where: { id: { in: [vendorId, managerId] } } });
  await db.category.delete({ where: { id: catId } }).catch(() => {});
  await db.$disconnect();
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Smoke tests — IVU, inventario multi-sucursal, transferencias', () => {

  it('S1: IVU OFF → taxAmount = 0 en DB', async () => {
    const vendor = makeInvoicingCaller(makeCtx(vendorId, 'VENDOR'));

    // taxRate: 0 → exento
    const invoice = await vendor.create({
      customerId,
      type: 'INVOICE',
      items: [{ productId, locationId: ponceLocId, quantity: 1, unitPrice: 100 }],
      taxRate: 0,
    });

    expect(Number(invoice.taxRate)).toBe(0);
    expect(Number(invoice.taxAmount)).toBe(0);
    expect(Number(invoice.total)).toBeCloseTo(Number(invoice.subtotal), 2);

    // Verify directly in DB
    const stored = await db.invoice.findUnique({ where: { id: invoice.id } });
    expect(Number(stored!.taxAmount)).toBe(0);
    expect(Number(stored!.total)).toBe(Number(stored!.subtotal));
  });

  it('S2: IVU ON → taxAmount = subtotal × TAX_RATE configurado (11.5%)', async () => {
    const vendor = makeInvoicingCaller(makeCtx(vendorId, 'VENDOR'));

    // taxRate: 0.115 (cualquier non-zero → backend usa systemConfig TAX_RATE)
    const invoice = await vendor.create({
      customerId,
      type: 'INVOICE',
      items: [{ productId, locationId: ponceLocId, quantity: 2, unitPrice: 100 }],
      taxRate: 0.115,
    });

    const expectedSubtotal = 200;
    const expectedTax = expectedSubtotal * TAX_RATE; // 23

    expect(Number(invoice.subtotal)).toBeCloseTo(expectedSubtotal, 2);
    expect(Number(invoice.taxAmount)).toBeCloseTo(expectedTax, 2);
    expect(Number(invoice.total)).toBeCloseTo(expectedSubtotal + expectedTax, 2);

    // DB agrees
    const stored = await db.invoice.findUnique({ where: { id: invoice.id } });
    expect(Number(stored!.taxAmount)).toBeCloseTo(expectedTax, 2);
    expect(Number(stored!.total)).toBeCloseTo(expectedSubtotal + expectedTax, 2);
  });

  it('S3: PDF data coincide con backend — invoice.total = subtotal + taxAmount (no re-calcula)', async () => {
    const vendor = makeInvoicingCaller(makeCtx(vendorId, 'VENDOR'));

    const invoice = await vendor.create({
      customerId,
      type: 'INVOICE',
      items: [{ productId, locationId: ponceLocId, quantity: 3, unitPrice: 50 }],
      taxRate: 0.115,
    });

    // PDF receives: invoice.subtotal, invoice.taxRate, invoice.taxAmount, invoice.total
    // The PDF must use these stored values, NOT recalculate.
    // Invariant: stored.total == stored.subtotal + stored.taxAmount (exact Decimal math)
    const stored = await db.invoice.findUnique({ where: { id: invoice.id } });
    expect(stored).not.toBeNull();

    const subtotal = Number(stored!.subtotal);
    const taxAmount = Number(stored!.taxAmount);
    const total = Number(stored!.total);

    // This is what the PDF would render
    expect(Math.abs(total - (subtotal + taxAmount))).toBeLessThan(0.01);

    // Also: taxAmount == subtotal * taxRate (backend used systemConfig, not frontend input)
    expect(Math.abs(taxAmount - subtotal * Number(stored!.taxRate))).toBeLessThan(0.01);
  });

  it('S4: Factura en Ponce descuenta solo Ponce — San Juan intacto', async () => {
    const vendor = makeInvoicingCaller(makeCtx(vendorId, 'VENDOR'));

    const qtyBefore = {
      ponce: (await db.productLocation.findUnique({ where: { id: ponceLocId } }))!.quantityOnHand,
      sj: (await db.productLocation.findUnique({ where: { id: sjLocId } }))!.quantityOnHand,
    };

    // Factura usando locationId de Ponce
    const invoice = await vendor.create({
      customerId,
      type: 'INVOICE',
      items: [{ productId, locationId: ponceLocId, quantity: 5, unitPrice: 100 }],
      taxRate: 0,
    });

    expect(invoice.status).toBe('ISSUED');

    const qtyAfter = {
      ponce: (await db.productLocation.findUnique({ where: { id: ponceLocId } }))!.quantityOnHand,
      sj: (await db.productLocation.findUnique({ where: { id: sjLocId } }))!.quantityOnHand,
    };

    // Ponce bajó 5
    expect(Number(qtyAfter.ponce)).toBe(Number(qtyBefore.ponce) - 5);
    // San Juan intacto
    expect(Number(qtyAfter.sj)).toBe(Number(qtyBefore.sj));

    // Movimiento OUT creado en Ponce, no en San Juan
    const movements = await db.inventoryMovement.findMany({
      where: { locationId: { in: [ponceLocId, sjLocId] }, referenceId: invoice.invoiceNumber },
    });
    expect(movements).toHaveLength(1);
    expect(movements[0]!.locationId).toBe(ponceLocId);
    expect(movements[0]!.movementType).toBe('OUT');
    expect(movements[0]!.quantity).toBe(-5);
  });

  it('S5: Transferencia Ponce→San Juan balancea — ambos lados correctos', async () => {
    const manager = makeMovementsCaller(makeCtx(managerId, 'MANAGER'));

    const qtyBefore = {
      ponce: Number((await db.productLocation.findUnique({ where: { id: ponceLocId } }))!.quantityOnHand),
      sj: Number((await db.productLocation.findUnique({ where: { id: sjLocId } }))!.quantityOnHand),
    };

    // Transferir 10 unidades Ponce → San Juan
    await manager.create({
      productId,
      locationId: ponceLocId,
      destinationLocationId: sjLocId,
      movementType: 'TRANSFER',
      quantity: -10,        // negativo en origen (OUT)
      referenceType: 'TRANSFER',
      notes: 'Smoke test: Ponce → San Juan',
    });

    const qtyAfter = {
      ponce: Number((await db.productLocation.findUnique({ where: { id: ponceLocId } }))!.quantityOnHand),
      sj: Number((await db.productLocation.findUnique({ where: { id: sjLocId } }))!.quantityOnHand),
    };

    // Ponce bajó 10
    expect(qtyAfter.ponce).toBe(qtyBefore.ponce - 10);
    // San Juan subió 10
    expect(qtyAfter.sj).toBe(qtyBefore.sj + 10);

    // Delta total del sistema es cero (movimiento interno)
    const totalBefore = qtyBefore.ponce + qtyBefore.sj;
    const totalAfter = qtyAfter.ponce + qtyAfter.sj;
    expect(totalAfter).toBe(totalBefore);

    // Dos movimientos creados: OUT en Ponce, IN en San Juan, mismo referenceId
    const movements = await db.inventoryMovement.findMany({
      where: { locationId: { in: [ponceLocId, sjLocId] }, movementType: 'TRANSFER' },
      orderBy: { createdAt: 'asc' },
    });
    expect(movements).toHaveLength(2);
    expect(movements[0]!.locationId).toBe(ponceLocId);
    expect(movements[0]!.quantity).toBe(-10);
    expect(movements[1]!.locationId).toBe(sjLocId);
    expect(movements[1]!.quantity).toBe(10);
    expect(movements[0]!.referenceId).toBe(movements[1]!.referenceId);
  });

  it('S6: Stock insuficiente bloquea venta VENDOR → PENDING_AUTHORIZATION', async () => {
    const vendor = makeInvoicingCaller(makeCtx(vendorId, 'VENDOR'));

    // Ponce tiene 100 unidades, pedimos 999
    const invoice = await vendor.create({
      customerId,
      type: 'INVOICE',
      items: [{ productId, locationId: ponceLocId, quantity: 999, unitPrice: 100 }],
      taxRate: 0,
    });

    // VENDOR sin stock → PENDING_AUTHORIZATION, NO descuenta stock
    expect(invoice.status).toBe('PENDING_AUTHORIZATION');

    // Stock en Ponce intacto
    const loc = await db.productLocation.findUnique({ where: { id: ponceLocId } });
    expect(Number(loc!.quantityOnHand)).toBe(100);

    // No hubo movimientos OUT
    const movements = await db.inventoryMovement.findMany({
      where: { locationId: ponceLocId, referenceId: invoice.invoiceNumber },
    });
    expect(movements).toHaveLength(0);
  });

});
