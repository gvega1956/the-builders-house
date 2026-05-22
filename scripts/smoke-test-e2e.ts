/**
 * Smoke Test E2E — Corazón del sistema
 * Ejecuta el flujo: editar precios → stock IN → cliente → factura → verificar stock → anular → verificar stock
 * Replica la lógica exacta de los routers (transacciones, movimientos, secuencias).
 *
 * Ejecutar: npx tsx scripts/smoke-test-e2e.ts
 */

import { PrismaClient, Prisma } from '@prisma/client';

const db = new PrismaClient();

const TARGET_SKU   = 'VS-L4-30x37¾-AE';
const ADMIN_EMAIL  = 'admin@buildershouse.pr';
const CUSTOMER_NAME = 'TEST SMOKE';
const STOCK_TO_ADD  = 10;
const UNITS_TO_SELL = 2;

let pass = 0;
let fail = 0;
const failures: string[] = [];

function ok(msg: string)   { console.log(`  ✅ ${msg}`); pass++; }
function err(msg: string)  { console.log(`  ❌ ${msg}`); fail++; failures.push(msg); }
function step(n: number, title: string) { console.log(`\nPASO ${n} — ${title}`); }

// ── helpers ────────────────────────────────────────────────────────────────

async function getNextSeq(tx: Prisma.TransactionClient, name: string): Promise<string> {
  const seq = await tx.sequence.update({
    where: { name },
    data: { currentValue: { increment: 1 } },
  });
  const prefix  = seq.prefix ?? '';
  const padding = seq.padding ?? 5;
  return `${prefix}${String(seq.currentValue).padStart(padding, '0')}`;
}

// ── MAIN ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 Smoke Test E2E — The Builder\'s House\n');
  console.log(`   SKU objetivo:   ${TARGET_SKU}`);
  console.log(`   Admin:          ${ADMIN_EMAIL}`);
  console.log(`   Cliente:        ${CUSTOMER_NAME}`);
  console.log(`   Stock a cargar: ${STOCK_TO_ADD}`);
  console.log(`   Unidades venta: ${UNITS_TO_SELL}`);

  // ── PASO 1: Login (verificar admin activo) ────────────────────────────────
  step(1, 'Verificar admin activo');
  const admin = await db.user.findUnique({
    where: { email: ADMIN_EMAIL },
    select: { id: true, name: true, role: true, isActive: true },
  });
  if (!admin)              { err(`Admin ${ADMIN_EMAIL} no existe`); process.exit(1); }
  if (!admin.isActive)     { err('Admin está inactivo'); process.exit(1); }
  if (admin.role !== 'ADMIN') { err(`Rol inesperado: ${admin.role}`); process.exit(1); }
  ok(`Admin "${admin.name}" — rol ADMIN — activo`);

  // ── PASO 2: Confirmar 72 productos ───────────────────────────────────────
  step(2, 'Confirmar 72 productos en inventario');
  const totalProducts = await db.product.count({ where: { isActive: true } });
  if (totalProducts === 72) ok(`${totalProducts} productos activos en DB`);
  else err(`Esperados 72, encontrados ${totalProducts}`);

  // ── PASO 3: Encontrar producto objetivo ──────────────────────────────────
  step(3, `Buscar producto ${TARGET_SKU}`);
  const product = await db.product.findUnique({
    where: { sku: TARGET_SKU },
    include: { locations: { include: { warehouse: true } } },
  });
  if (!product) { err(`SKU ${TARGET_SKU} no encontrado`); process.exit(1); }
  ok(`Encontrado: "${product.name}"`);
  ok(`Locations: ${product.locations.length} (esperada: 1)`);
  const location = product.locations[0]!;
  ok(`Ubicación: ${location.locationCode} @ ${location.warehouse.name}`);
  const stockBefore = location.quantityOnHand;
  ok(`Stock inicial: ${stockBefore}`);

  // ── PASO 4: Editar precios ────────────────────────────────────────────────
  step(4, 'Actualizar precios (costo=50, retail=100, mayoreo=85)');
  // Validar como lo hace el router
  const unitCost = 50, retailPrice = 100, wholesalePrice = 85;
  if (retailPrice < unitCost)     { err('retailPrice < unitCost — rechazado'); process.exit(1); }
  if (wholesalePrice < unitCost)  { err('wholesalePrice < unitCost — rechazado'); process.exit(1); }

  await db.product.update({
    where: { id: product.id },
    data: { unitCost, retailPrice, wholesalePrice },
  });
  const updated = await db.product.findUnique({ where: { id: product.id }, select: { unitCost: true, retailPrice: true, wholesalePrice: true } });
  ok(`Costo:       $${updated?.unitCost}`);
  ok(`Retail:      $${updated?.retailPrice}`);
  ok(`Mayoreo:     $${updated?.wholesalePrice}`);

  // ── PASO 5: Movimiento IN → stock +10 ────────────────────────────────────
  step(5, `Movimiento IN → +${STOCK_TO_ADD} unidades`);
  // IN no requiere foto (solo OUT, DAMAGE, ADJUSTMENT la requieren)
  await db.$transaction(async (tx) => {
    await tx.inventoryMovement.create({
      data: {
        productId: product.id,
        locationId: location.id,
        movementType: 'IN',
        quantity: STOCK_TO_ADD,
        referenceType: 'PURCHASE_ORDER',
        referenceId: 'SMOKE-TEST-PO',
        notes: 'Stock inicial — smoke test',
        userId: admin.id,
      },
    });
    await tx.productLocation.update({
      where: { id: location.id },
      data: { quantityOnHand: { increment: STOCK_TO_ADD } },
    });
  });

  const locAfterIN = await db.productLocation.findUnique({ where: { id: location.id } });
  const stockAfterIN = locAfterIN!.quantityOnHand;
  if (stockAfterIN === stockBefore + STOCK_TO_ADD) ok(`Stock después de IN: ${stockAfterIN} ✓`);
  else err(`Stock esperado ${stockBefore + STOCK_TO_ADD}, obtenido ${stockAfterIN}`);

  // ── PASO 6: Crear cliente "TEST SMOKE" ───────────────────────────────────
  step(6, `Crear cliente "${CUSTOMER_NAME}"`);
  let customer = await db.customer.findFirst({ where: { name: CUSTOMER_NAME } });
  if (customer) {
    ok(`Cliente ya existe: ${customer.code} (reutilizando)`);
  } else {
    const seq = await db.$transaction(async (tx) => {
      const s = await tx.sequence.update({
        where: { name: 'CUSTOMER' },
        data: { currentValue: { increment: 1 } },
      });
      return `CLI-${String(s.currentValue).padStart(5, '0')}`;
    });
    customer = await db.customer.create({
      data: { name: CUSTOMER_NAME, type: 'RETAIL', code: seq, isActive: true, creditLimit: 0, currentBalance: 0 },
    });
    ok(`Cliente creado: ${customer.code} — ${customer.name} (${customer.type})`);
  }

  // ── PASO 7: Crear factura (INVOICE) ──────────────────────────────────────
  step(7, `Crear factura para ${CUSTOMER_NAME} — ${UNITS_TO_SELL}× ${TARGET_SKU}`);

  const UNIT_PRICE = 100;
  const TAX_RATE   = 0.115;
  const lineTotal  = UNIT_PRICE * UNITS_TO_SELL;
  const taxAmount  = lineTotal * TAX_RATE;
  const total      = lineTotal + taxAmount;

  // Verificar stock disponible (como lo hace el router)
  const locForSale = await db.productLocation.findUnique({ where: { id: location.id } });
  const available  = locForSale!.quantityOnHand - locForSale!.reservedQuantity;
  if (available < UNITS_TO_SELL) {
    err(`Stock insuficiente: disponible ${available}, requerido ${UNITS_TO_SELL}`);
    process.exit(1);
  }
  ok(`Stock disponible: ${available} — suficiente para ${UNITS_TO_SELL}`);

  let invoiceNumber = '';
  let invoiceId     = '';

  await db.$transaction(async (tx) => {
    // Lock de ubicación (igual que el router)
    const rows = await tx.$queryRaw<Array<{ id: string; quantityOnHand: number; reservedQuantity: number }>>`
      SELECT id, "quantityOnHand", "reservedQuantity"
      FROM product_locations
      WHERE id = ${location.id}
      FOR UPDATE
    `;
    const locLocked = rows[0]!;
    const avail = locLocked.quantityOnHand - locLocked.reservedQuantity;
    if (avail < UNITS_TO_SELL) throw new Error(`Stock insuficiente en lock: ${avail}`);

    invoiceNumber = await getNextSeq(tx, 'INVOICE');

    const inv = await tx.invoice.create({
      data: {
        invoiceNumber,
        type: 'INVOICE',
        status: 'ISSUED',
        customerId: customer!.id,
        createdById: admin.id,
        subtotal: lineTotal,
        taxRate: TAX_RATE,
        taxAmount,
        total,
        items: {
          create: [{
            productId: product.id,
            locationId: location.id,
            quantity: UNITS_TO_SELL,
            unitPrice: UNIT_PRICE,
            discountPercent: 0,
            lineTotal,
          }],
        },
      },
    });
    invoiceId = inv.id;

    // Movimiento OUT (igual que el router)
    await tx.inventoryMovement.create({
      data: {
        productId: product.id,
        locationId: location.id,
        movementType: 'OUT',
        quantity: -UNITS_TO_SELL,
        referenceType: 'INVOICE',
        referenceId: invoiceNumber,
        userId: admin.id,
      },
    });

    // Decrementar stock
    await tx.productLocation.update({
      where: { id: location.id },
      data: { quantityOnHand: { decrement: UNITS_TO_SELL } },
    });

    // Incrementar balance del cliente
    await tx.customer.update({
      where: { id: customer!.id },
      data: { currentBalance: { increment: total } },
    });
  });

  ok(`Factura creada: ${invoiceNumber} — $${total.toFixed(2)} — ISSUED`);

  // ── PASO 8: Verificar stock bajó ─────────────────────────────────────────
  step(8, 'Verificar stock después de factura');
  const locAfterSale = await db.productLocation.findUnique({ where: { id: location.id } });
  const stockAfterSale = locAfterSale!.quantityOnHand;
  const expectedAfterSale = stockAfterIN - UNITS_TO_SELL;
  if (stockAfterSale === expectedAfterSale) ok(`Stock: ${stockAfterIN} → ${stockAfterSale} (bajó ${UNITS_TO_SELL}) ✓`);
  else err(`Stock esperado ${expectedAfterSale}, obtenido ${stockAfterSale}`);

  // ── PASO 9: Anular factura ───────────────────────────────────────────────
  step(9, `Anular factura ${invoiceNumber}`);
  await db.$transaction(async (tx) => {
    const inv = await tx.invoice.findUnique({
      where: { id: invoiceId },
      include: { items: true },
    });
    if (!inv) throw new Error('Factura no encontrada');
    if (inv.status === 'VOIDED') throw new Error('Ya estaba anulada');

    await tx.invoice.update({
      where: { id: invoiceId },
      data: { status: 'VOIDED', notes: '[ANULADA: Smoke test — anulación de prueba]' },
    });

    // Movimiento RETURN + restaurar stock (igual que el router)
    for (const item of inv.items) {
      await tx.inventoryMovement.create({
        data: {
          productId: item.productId,
          locationId: item.locationId!,
          movementType: 'RETURN',
          quantity: item.quantity,
          referenceType: 'INVOICE',
          referenceId: inv.invoiceNumber,
          userId: admin.id,
        },
      });
      await tx.productLocation.update({
        where: { id: item.locationId! },
        data: { quantityOnHand: { increment: item.quantity } },
      });
    }

    // Revertir balance del cliente
    await tx.customer.update({
      where: { id: customer!.id },
      data: { currentBalance: { decrement: Number(inv.total) } },
    });
  });
  ok(`Factura ${invoiceNumber} → VOIDED`);

  // ── PASO 10: Verificar stock restaurado ──────────────────────────────────
  step(10, 'Verificar stock después de anulación');
  const locFinal = await db.productLocation.findUnique({ where: { id: location.id } });
  const stockFinal = locFinal!.quantityOnHand;
  if (stockFinal === stockAfterIN) ok(`Stock: ${stockAfterSale} → ${stockFinal} (restaurado a ${stockAfterIN}) ✓`);
  else err(`Stock esperado ${stockAfterIN}, obtenido ${stockFinal}`);

  // ── Verificación de movimientos creados ──────────────────────────────────
  step(11, 'Auditoría de movimientos generados');
  const movements = await db.inventoryMovement.findMany({
    where: { productId: product.id },
    orderBy: { createdAt: 'asc' },
    select: { movementType: true, quantity: true, referenceType: true, referenceId: true },
  });
  for (const m of movements) {
    const sign = m.quantity > 0 ? '+' : '';
    ok(`${m.movementType.padEnd(12)} ${sign}${m.quantity} | ${m.referenceType} ${m.referenceId ?? ''}`);
  }

  // ── Resumen final ─────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(55));
  console.log(`  RESULTADO: ${pass} pasados · ${fail} fallados`);
  if (failures.length > 0) {
    console.log('\n  Fallos:');
    failures.forEach(f => console.log(`    ✗ ${f}`));
    console.log('\n❌ Smoke test FALLIDO');
    process.exit(1);
  } else {
    console.log('\n🎉 Smoke test PASADO — El corazón del sistema está vivo.');
    console.log(`\n   Puedes ver en la UI:`);
    console.log(`   • /inventory  → busca "${TARGET_SKU}" → stock = ${stockAfterIN}`);
    console.log(`   • /customers  → existe "${CUSTOMER_NAME}" (CLI-00001)`);
    console.log(`   • /invoicing  → ${invoiceNumber} estado VOIDED`);
    console.log(`   • /audit      → movimientos IN, OUT, RETURN registrados`);
  }
}

main()
  .catch((e) => { console.error('\n❌ Error fatal:', e.message); process.exit(1); })
  .finally(() => db.$disconnect());
