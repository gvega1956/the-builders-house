/**
 * Invariantes de inventario
 *
 * g. ADJUSTMENT negativo no puede dejar quantityOnHand < 0 (floor check — regresión C-2)
 * h. SUM(movements.quantity) == quantityOnHand al final de un ciclo de operaciones
 * i. Transfer: create reserva → confirm crea movimientos → cancel libera reserva
 * j. Purchase receive: crea movimiento IN e incrementa quantityOnHand
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createCallerFactory } from '@/server/trpc';
import { movementsRouter } from '@/server/trpc/routers/movements';
import { transfersRouter } from '@/server/trpc/routers/transfers';
import { purchasesRouter } from '@/server/trpc/routers/purchases';
import { testDb, makeCtx, truncateAll, seedTestDb, type TestSeed } from '../setup/test-helpers';

const createMovementsCaller  = createCallerFactory(movementsRouter);
const createTransfersCaller  = createCallerFactory(transfersRouter);
const createPurchasesCaller  = createCallerFactory(purchasesRouter);

let seed: TestSeed;

beforeEach(async () => {
  await truncateAll(testDb);
  seed = await seedTestDb(testDb);
});

// ─────────────────────────────────────────────────────────────────────────────
// g. ADJUSTMENT negativo — floor check
// ─────────────────────────────────────────────────────────────────────────────
describe('g — ADJUSTMENT floor check', () => {
  it('ADJUSTMENT que dejaría quantityOnHand < 0 es rechazado', async () => {
    const caller = createMovementsCaller(makeCtx(testDb, seed.managerUser.id));

    // Seed: 10 unidades. Intentar ajustar -15 (resultaría en -5)
    await expect(
      caller.create({
        productId:     seed.product.id,
        locationId:    seed.location.id,
        movementType:  'ADJUSTMENT',
        referenceType: 'ADJUSTMENT',
        quantity:      -15,
        notes:         'Test floor check',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    // onHand sigue en 10
    const loc = await testDb.productLocation.findUniqueOrThrow({ where: { id: seed.location.id } });
    expect(loc.quantityOnHand).toBe(10);

    // No se creó ningún movimiento
    const movements = await testDb.inventoryMovement.findMany({ where: { movementType: 'ADJUSTMENT' } });
    expect(movements).toHaveLength(0);
  });

  it('ADJUSTMENT negativo exacto al stock disponible es permitido (resultado = 0)', async () => {
    const caller = createMovementsCaller(makeCtx(testDb, seed.managerUser.id));

    await caller.create({
      productId:     seed.product.id,
      locationId:    seed.location.id,
      movementType:  'ADJUSTMENT',
      referenceType: 'ADJUSTMENT',
      quantity:      -10,
      notes:         'Conteo cíclico — resultado cero',
    });

    const loc = await testDb.productLocation.findUniqueOrThrow({ where: { id: seed.location.id } });
    expect(loc.quantityOnHand).toBe(0);
  });

  it('ADJUSTMENT positivo siempre es permitido', async () => {
    const caller = createMovementsCaller(makeCtx(testDb, seed.managerUser.id));

    await caller.create({
      productId:     seed.product.id,
      locationId:    seed.location.id,
      movementType:  'ADJUSTMENT',
      referenceType: 'ADJUSTMENT',
      quantity:      5,
      notes:         'Ajuste por diferencia de conteo',
    });

    const loc = await testDb.productLocation.findUniqueOrThrow({ where: { id: seed.location.id } });
    expect(loc.quantityOnHand).toBe(15);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// h. Reconciliación: SUM(movements) == quantityOnHand
// ─────────────────────────────────────────────────────────────────────────────
describe('h — reconciliación de stock', () => {
  it('SUM(movements.quantity) coincide con quantityOnHand tras ciclo de ajustes', async () => {
    const caller = createMovementsCaller(makeCtx(testDb, seed.managerUser.id));

    // El seed arranca con quantityOnHand=10 pero sin movimientos.
    // Primero anulamos ese stock y lo reconstruimos vía movimientos.
    await testDb.productLocation.update({
      where: { id: seed.location.id },
      data: { quantityOnHand: 0 },
    });

    // +10, -3, +2 → esperado final: 9
    await caller.create({ productId: seed.product.id, locationId: seed.location.id,
      movementType: 'ADJUSTMENT', referenceType: 'ADJUSTMENT', quantity: 10, notes: 'Inventario inicial' });
    await caller.create({ productId: seed.product.id, locationId: seed.location.id,
      movementType: 'ADJUSTMENT', referenceType: 'ADJUSTMENT', quantity: -3, notes: 'Corrección' });
    await caller.create({ productId: seed.product.id, locationId: seed.location.id,
      movementType: 'ADJUSTMENT', referenceType: 'ADJUSTMENT', quantity: 2, notes: 'Recepción manual' });

    // SUM en BD
    const result = await testDb.inventoryMovement.aggregate({
      where: { productId: seed.product.id, locationId: seed.location.id },
      _sum: { quantity: true },
    });
    const sumMovements = Number(result._sum.quantity ?? 0);

    // onHand real
    const loc = await testDb.productLocation.findUniqueOrThrow({ where: { id: seed.location.id } });

    expect(sumMovements).toBe(9);
    expect(sumMovements).toBe(loc.quantityOnHand);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// i. Transfer lifecycle
// transfers.create toma fromWarehouseId + toWarehouseId + lines[]
// ─────────────────────────────────────────────────────────────────────────────
describe('i — transfer lifecycle', () => {
  beforeEach(async () => {
    // Asegura que el producto tenga ubicación en warehouse2 (destino)
    const existing = await testDb.productLocation.findFirst({
      where: { warehouseId: seed.warehouse2.id, productId: seed.product.id },
    });
    if (!existing) {
      await testDb.productLocation.create({
        data: {
          productId:         seed.product.id,
          warehouseId:       seed.warehouse2.id,
          locationCode:      'B-01',
          quantityOnHand:    0,
          reservedQuantity:  0,
          backorderQuantity: 0,
        },
      });
    }
  });

  it('create → confirm: reserva → movimientos TRANSFER, stock correcto en ambos almacenes', async () => {
    const caller = createTransfersCaller(makeCtx(testDb, seed.managerUser.id));

    // Crear transfer (reserva 4 unidades de warehouse1 hacia warehouse2)
    const transfer = await caller.create({
      fromWarehouseId: seed.warehouse.id,
      toWarehouseId:   seed.warehouse2.id,
      lines: [{ productId: seed.product.id, quantity: 4 }],
    });

    // Verificar reserva en origen
    const locOriginMid = await testDb.productLocation.findUniqueOrThrow({
      where: { id: seed.location.id },
    });
    expect(locOriginMid.reservedQuantity).toBe(4);
    expect(locOriginMid.quantityOnHand).toBe(10); // onHand intacto aún

    // Confirmar
    await caller.confirm({ id: transfer.id });

    const locOriginAfter = await testDb.productLocation.findUniqueOrThrow({
      where: { id: seed.location.id },
    });
    const locDestAfter = await testDb.productLocation.findFirstOrThrow({
      where: { warehouseId: seed.warehouse2.id, productId: seed.product.id },
    });

    expect(locOriginAfter.quantityOnHand).toBe(6);  // 10 - 4
    expect(locOriginAfter.reservedQuantity).toBe(0);
    expect(locDestAfter.quantityOnHand).toBe(4);

    // Deben existir exactamente 2 movimientos TRANSFER con el mismo referenceId
    const movements = await testDb.inventoryMovement.findMany({
      where: { movementType: 'TRANSFER' },
      orderBy: { quantity: 'asc' },
    });
    expect(movements).toHaveLength(2);
    expect(movements[0]!.quantity).toBe(-4); // salida de origen
    expect(movements[1]!.quantity).toBe(4);  // entrada en destino
    expect(movements[0]!.referenceId).toBe(movements[1]!.referenceId);
  });

  it('create → cancel: libera reserva; onHand intacto; sin movimientos TRANSFER', async () => {
    const caller = createTransfersCaller(makeCtx(testDb, seed.managerUser.id));

    const transfer = await caller.create({
      fromWarehouseId: seed.warehouse.id,
      toWarehouseId:   seed.warehouse2.id,
      lines: [{ productId: seed.product.id, quantity: 3 }],
    });

    await caller.cancel({ id: transfer.id, reason: 'Ya no es necesario' });

    const locOriginAfter = await testDb.productLocation.findUniqueOrThrow({
      where: { id: seed.location.id },
    });
    expect(locOriginAfter.reservedQuantity).toBe(0);
    expect(locOriginAfter.quantityOnHand).toBe(10); // intacto

    const movements = await testDb.inventoryMovement.findMany({
      where: { movementType: 'TRANSFER' },
    });
    expect(movements).toHaveLength(0);
  });

  it('transfer sin stock suficiente es rechazado', async () => {
    const caller = createTransfersCaller(makeCtx(testDb, seed.managerUser.id));

    await expect(
      caller.create({
        fromWarehouseId: seed.warehouse.id,
        toWarehouseId:   seed.warehouse2.id,
        lines: [{ productId: seed.product.id, quantity: 50 }], // supera las 10 disponibles
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// j. Purchase receive
// purchases.create: { supplierId, items: [{ productId, quantityOrdered, unitCostUsd }] }
// updateStatus({ id, status: 'IN_TRANSIT' }) para preparar la recepción
// receive: { id, items: [{ itemId, quantityReceived, locationId }] }
// ─────────────────────────────────────────────────────────────────────────────
describe('j — purchase receive', () => {
  it('receive crea movimiento IN e incrementa quantityOnHand', async () => {
    const purchasesCaller = createPurchasesCaller(makeCtx(testDb, seed.managerUser.id));

    const po = await purchasesCaller.create({
      supplierId: seed.supplier.id,
      items: [{ productId: seed.product.id, quantityOrdered: 6, unitCostUsd: 50 }],
    });

    // DRAFT → SENT → IN_TRANSIT (transitions estrictas)
    await purchasesCaller.updateStatus({ id: po.id, status: 'SENT' });
    await purchasesCaller.updateStatus({ id: po.id, status: 'IN_TRANSIT' });

    const locBefore = await testDb.productLocation.findUniqueOrThrow({
      where: { id: seed.location.id },
    });

    // receive requiere el itemId real del PO item
    const poItem = po.items[0]!;
    await purchasesCaller.receive({
      id: po.id,
      items: [{ itemId: poItem.id, quantityReceived: 6, locationId: seed.location.id }],
    });

    // Debe existir un movimiento IN
    const inMovements = await testDb.inventoryMovement.findMany({
      where: { movementType: 'IN', productId: seed.product.id },
    });
    expect(inMovements).toHaveLength(1);
    expect(inMovements[0]!.quantity).toBe(6);
    expect(inMovements[0]!.referenceType).toBe('PURCHASE_ORDER');

    // quantityOnHand incrementado
    const locAfter = await testDb.productLocation.findUniqueOrThrow({
      where: { id: seed.location.id },
    });
    expect(locAfter.quantityOnHand).toBe(locBefore.quantityOnHand + 6);
  });

  it('recepción parcial incrementa solo lo recibido', async () => {
    const purchasesCaller = createPurchasesCaller(makeCtx(testDb, seed.managerUser.id));

    const po = await purchasesCaller.create({
      supplierId: seed.supplier.id,
      items: [{ productId: seed.product.id, quantityOrdered: 10, unitCostUsd: 50 }],
    });

    await purchasesCaller.updateStatus({ id: po.id, status: 'SENT' });
    await purchasesCaller.updateStatus({ id: po.id, status: 'IN_TRANSIT' });

    const poItem = po.items[0]!;
    await purchasesCaller.receive({
      id: po.id,
      items: [{ itemId: poItem.id, quantityReceived: 4, locationId: seed.location.id }],
    });

    const loc = await testDb.productLocation.findUniqueOrThrow({ where: { id: seed.location.id } });
    expect(loc.quantityOnHand).toBe(14); // 10 seed + 4 recibidos
  });
});
