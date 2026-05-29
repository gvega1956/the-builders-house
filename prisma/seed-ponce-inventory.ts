/**
 * seed-ponce-inventory.ts
 *
 * Importación inicial de inventario Ponce — conteo físico 28 mayo 2026.
 * Fuente: foto del conteo físico manual (Lama 3" y Lama 4").
 *
 * Operaciones:
 * 1. Renombra "Almacén Principal" → "Ponce"
 * 2. Crea warehouse "San Juan" (vacío)
 * 3. Carga cantidades de Ponce para 72 productos existentes (ADJUSTMENT)
 * 4. Crea 6 productos nuevos (tamaños extra del fondo de la hoja) con sus cantidades
 *
 * Nota: Columna "Negras" de la foto pendiente — no se pudo mapear con certeza.
 *       Ingresar manualmente en el módulo de inventario.
 *
 * Ejecutar con: npx tsx prisma/seed-ponce-inventory.ts
 */

import { PrismaClient, Prisma } from '@prisma/client';

const db = new PrismaClient();

const WH_ID = 'cmpdlymh4000576hl1r94j5pl';
const ADMIN_ID = 'cmpdlyn1u000676hlk9carx95';
const CAT_ID = 'cmpgfuta00000jt1j4hqytpo6';
const REF_ID = 'INVENTARIO-INICIAL-PONCE-20260528';

// ─── Inventario de Ponce (conteo físico 28 mayo 2026) ────────────────────────
// Columnas: A/E = Acid Etched | B/G = Blue Green
// Celdas vacías en la foto = 0

const ponceInventory: { sku: string; qty: number }[] = [
  // ── LAMA 3" — Acid Etched ─────────────────────────────────────────────────
  { sku: 'VS-L3-24x22¾-AE', qty: 0 },
  { sku: 'VS-L3-24x28¾-AE', qty: 14 },
  { sku: 'VS-L3-24x37¾-AE', qty: 12 },
  { sku: 'VS-L3-24x46¾-AE', qty: 11 },
  { sku: 'VS-L3-24x52¾-AE', qty: 10 },
  { sku: 'VS-L3-24x58¾-AE', qty: 15 },
  { sku: 'VS-L3-30x22¾-AE', qty: 0 },
  { sku: 'VS-L3-30x28¾-AE', qty: 17 },
  { sku: 'VS-L3-30x37¾-AE', qty: 17 },
  { sku: 'VS-L3-30x46¾-AE', qty: 26 },
  { sku: 'VS-L3-30x52¾-AE', qty: 13 },
  { sku: 'VS-L3-30x58¾-AE', qty: 0 },
  { sku: 'VS-L3-36x22¾-AE', qty: 14 },
  { sku: 'VS-L3-36x28¾-AE', qty: 2 },
  { sku: 'VS-L3-36x37¾-AE', qty: 0 },
  { sku: 'VS-L3-36x46¾-AE', qty: 0 },
  { sku: 'VS-L3-36x52¾-AE', qty: 21 },
  { sku: 'VS-L3-36x58¾-AE', qty: 78 },
  // ── LAMA 3" — Blue Green ──────────────────────────────────────────────────
  { sku: 'VS-L3-24x22¾-BG', qty: 11 },
  { sku: 'VS-L3-24x28¾-BG', qty: 22 },
  { sku: 'VS-L3-24x37¾-BG', qty: 8 },
  { sku: 'VS-L3-24x46¾-BG', qty: 15 },
  { sku: 'VS-L3-24x52¾-BG', qty: 33 },
  { sku: 'VS-L3-24x58¾-BG', qty: 8 },
  { sku: 'VS-L3-30x22¾-BG', qty: 26 },
  { sku: 'VS-L3-30x28¾-BG', qty: 5 },
  { sku: 'VS-L3-30x37¾-BG', qty: 33 },
  { sku: 'VS-L3-30x46¾-BG', qty: 60 },
  { sku: 'VS-L3-30x52¾-BG', qty: 0 },
  { sku: 'VS-L3-30x58¾-BG', qty: 25 },
  { sku: 'VS-L3-36x22¾-BG', qty: 34 },
  { sku: 'VS-L3-36x28¾-BG', qty: 28 },
  { sku: 'VS-L3-36x37¾-BG', qty: 9 },
  { sku: 'VS-L3-36x46¾-BG', qty: 0 },
  { sku: 'VS-L3-36x52¾-BG', qty: 19 },
  { sku: 'VS-L3-36x58¾-BG', qty: 25 },
  // ── LAMA 4" — Acid Etched ─────────────────────────────────────────────────
  { sku: 'VS-L4-24x21¾-AE', qty: 18 },
  { sku: 'VS-L4-24x29¾-AE', qty: 1 },
  { sku: 'VS-L4-24x37¾-AE', qty: 25 },
  { sku: 'VS-L4-24x45¾-AE', qty: 6 },
  { sku: 'VS-L4-24x53¾-AE', qty: 55 },
  { sku: 'VS-L4-24x57¾-AE', qty: 29 },
  { sku: 'VS-L4-30x21¾-AE', qty: 10 },
  { sku: 'VS-L4-30x29¾-AE', qty: 5 },
  { sku: 'VS-L4-30x37¾-AE', qty: 7 },
  { sku: 'VS-L4-30x45¾-AE', qty: 50 },
  { sku: 'VS-L4-30x53¾-AE', qty: 8 },
  { sku: 'VS-L4-30x57¾-AE', qty: 10 },
  { sku: 'VS-L4-36x21¾-AE', qty: 13 },
  { sku: 'VS-L4-36x29¾-AE', qty: 6 },
  { sku: 'VS-L4-36x37¾-AE', qty: 2 },
  { sku: 'VS-L4-36x45¾-AE', qty: 0 },
  { sku: 'VS-L4-36x53¾-AE', qty: 18 },
  { sku: 'VS-L4-36x57¾-AE', qty: 12 },
  // ── LAMA 4" — Blue Green ──────────────────────────────────────────────────
  { sku: 'VS-L4-24x21¾-BG', qty: 13 },
  { sku: 'VS-L4-24x29¾-BG', qty: 20 },
  { sku: 'VS-L4-24x37¾-BG', qty: 16 },
  { sku: 'VS-L4-24x45¾-BG', qty: 4 },
  { sku: 'VS-L4-24x53¾-BG', qty: 0 },
  { sku: 'VS-L4-24x57¾-BG', qty: 49 },
  { sku: 'VS-L4-30x21¾-BG', qty: 19 },
  { sku: 'VS-L4-30x29¾-BG', qty: 43 },
  { sku: 'VS-L4-30x37¾-BG', qty: 31 },
  { sku: 'VS-L4-30x45¾-BG', qty: 5 },
  { sku: 'VS-L4-30x53¾-BG', qty: 39 },
  { sku: 'VS-L4-30x57¾-BG', qty: 19 },
  { sku: 'VS-L4-36x21¾-BG', qty: 11 },
  { sku: 'VS-L4-36x29¾-BG', qty: 16 },
  { sku: 'VS-L4-36x37¾-BG', qty: 13 },
  { sku: 'VS-L4-36x45¾-BG', qty: 0 },
  { sku: 'VS-L4-36x53¾-BG', qty: 5 },
  { sku: 'VS-L4-36x57¾-BG', qty: 5 },
];

// ─── Productos nuevos (tamaños extra del fondo de la hoja) ───────────────────
const newProductsData = [
  {
    sku: 'VS-L3-24x25-AE',
    name: 'Ventana Seguridad Lama 3" 24x25 Acid Etched',
    locationCode: 'PONCE-L3-24x25-AE',
    qty: 18,
  },
  {
    sku: 'VS-L3-24x25-BG',
    name: 'Ventana Seguridad Lama 3" 24x25 Blue Green',
    locationCode: 'PONCE-L3-24x25-BG',
    qty: 6,
  },
  {
    sku: 'VS-L3-18x16-AE',
    name: 'Ventana Seguridad Lama 3" 18x16 Acid Etched',
    locationCode: 'PONCE-L3-18x16-AE',
    qty: 34,
  },
  {
    sku: 'VS-L3-18x16-BG',
    name: 'Ventana Seguridad Lama 3" 18x16 Blue Green',
    locationCode: 'PONCE-L3-18x16-BG',
    qty: 18,
  },
  {
    sku: 'VS-L4-18x17-AE',
    name: 'Ventana Seguridad Lama 4" 18x17 Acid Etched',
    locationCode: 'PONCE-L4-18x17-AE',
    qty: 7,
  },
  {
    sku: 'VS-L4-18x17-BG',
    name: 'Ventana Seguridad Lama 4" 18x17 Blue Green',
    locationCode: 'PONCE-L4-18x17-BG',
    qty: 24,
  },
];

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Importación de inventario Ponce — 28 mayo 2026 ===\n');

  // 1. Renombrar warehouse
  await db.warehouse.update({
    where: { id: WH_ID },
    data: { name: 'Ponce', address: 'Ponce, Puerto Rico' },
  });
  console.log('✓ Warehouse renombrado: "Almacén Principal" → "Ponce"');

  // 2. Crear San Juan (upsert — idempotente)
  const sj = await db.warehouse.upsert({
    where: { name: 'San Juan' },
    update: { address: 'San Juan, Puerto Rico' },
    create: { name: 'San Juan', address: 'San Juan, Puerto Rico' },
  });
  console.log(`✓ Warehouse "San Juan" listo (id: ${sj.id})`);

  // 3. Cargar cantidades de Ponce para 72 productos existentes
  const locations = await db.productLocation.findMany({
    where: { warehouseId: WH_ID },
    include: { product: { select: { id: true, sku: true } } },
  });
  const locMap = new Map(locations.map((l) => [l.product.sku, l]));

  // Verificar si los movimientos de este lote ya existen (idempotencia)
  const existingMov = await db.inventoryMovement.count({ where: { referenceId: REF_ID } });
  const movementsAlreadyLoaded = existingMov > 0;
  if (movementsAlreadyLoaded) console.log(`  ℹ Movimientos de ${REF_ID} ya existen (${existingMov}) — solo actualizando qty`);

  let loaded = 0;
  let skipped = 0;

  for (const item of ponceInventory) {
    const loc = locMap.get(item.sku);
    if (!loc) {
      console.warn(`  ⚠ SKU no encontrado: ${item.sku}`);
      skipped++;
      continue;
    }

    await db.$transaction([
      db.productLocation.update({
        where: { id: loc.id },
        data: { quantityOnHand: item.qty },
      }),
      ...(!movementsAlreadyLoaded && item.qty > 0
        ? [
            db.inventoryMovement.create({
              data: {
                productId: loc.productId,
                locationId: loc.id,
                movementType: 'ADJUSTMENT',
                quantity: item.qty,
                referenceType: 'CYCLE_COUNT',
                referenceId: REF_ID,
                userId: ADMIN_ID,
              },
            }),
          ]
        : []),
    ]);
    loaded++;
  }

  console.log(`✓ Ponce: ${loaded} productos actualizados, ${skipped} omitidos`);

  // 4. Crear 6 productos nuevos con sus ubicaciones en Ponce
  let createdProducts = 0;
  for (const np of newProductsData) {
    const existing = await db.product.findUnique({ where: { sku: np.sku } });
    if (existing) { console.log(`  ↷ ${np.sku}: ya existe, omitido`); continue; }

    const product = await db.product.create({
      data: {
        sku: np.sku,
        name: np.name,
        categoryId: CAT_ID,
        unitCost: new Prisma.Decimal(0),
        retailPrice: new Prisma.Decimal(0),
        wholesalePrice: new Prisma.Decimal(0),
      },
    });

    const loc = await db.productLocation.create({
      data: {
        productId: product.id,
        warehouseId: WH_ID,
        locationCode: np.locationCode,
        quantityOnHand: np.qty,
      },
    });

    if (np.qty > 0) {
      await db.inventoryMovement.create({
        data: {
          productId: product.id,
          locationId: loc.id,
          movementType: 'ADJUSTMENT',
          quantity: np.qty,
          referenceType: 'CYCLE_COUNT',
          referenceId: REF_ID,
          userId: ADMIN_ID,
        },
      });
    }

    createdProducts++;
    console.log(`  + ${np.sku}: qty=${np.qty}`);
  }

  console.log(`✓ ${createdProducts} productos nuevos creados con ubicación en Ponce`);

  // 5. Resumen final
  const totalPonce = ponceInventory.reduce((s, i) => s + i.qty, 0);
  const totalNewPonce = newProductsData.reduce((s, i) => s + i.qty, 0);
  const allWarehouses = await db.warehouse.findMany({ select: { name: true } });

  console.log('\n=== RESUMEN ===');
  console.log(`Warehouses activos: ${allWarehouses.map((w) => w.name).join(', ')}`);
  console.log(`Total piezas cargadas Ponce (72 SKUs): ${totalPonce}`);
  console.log(`Total piezas cargadas Ponce (6 nuevos): ${totalNewPonce}`);
  console.log(`Total inventario Ponce: ${totalPonce + totalNewPonce} piezas`);
  console.log('\nPENDIENTE: Columna "Negras" de la foto — ingresar manualmente');
}

main()
  .catch((e) => { console.error('ERROR:', e); process.exit(1); })
  .finally(() => db.$disconnect());
