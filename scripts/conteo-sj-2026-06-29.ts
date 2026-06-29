/**
 * Conteo físico San Juan — 29/06/2026
 * Actualiza quantityOnHand en product_locations (sucursal San Juan)
 * Crea movimientos ADJUSTMENT / CYCLE_COUNT por diferencia.
 * Idempotente: si ya está igual no toca nada.
 *
 * Ejecutar: npx tsx scripts/conteo-sj-2026-06-29.ts
 */

import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';

const db = new PrismaClient();

const SJ_WAREHOUSE_ID = 'cmpm5ell00000epvxuj4xx6c7';
const ADMIN_USER_ID   = 'cmpmv4v6e0015hhp48kyzc493';
const REFERENCE_ID    = 'CONTEO-2026-06-29-SJ';
const NOTES           = 'Ajuste por conteo fisico San Juan 29/06/2026';

function genId(): string {
  return 'c' + randomBytes(15).toString('hex').slice(0, 24);
}

// ── Datos del conteo ──────────────────────────────────────────────────────────

const CONTEO: Array<{ sku: string; qty: number }> = [
  // Lama 4" — Acid Etched
  { sku: 'VS-L4-18X1700-AE', qty: 32 },
  { sku: 'VS-L4-18X2200-AE', qty: 22 },
  { sku: 'VS-L4-24X2175-AE', qty:  0 },
  { sku: 'VS-L4-24X2500-AE', qty:  2 },
  { sku: 'VS-L4-24X2975-AE', qty:  0 },
  { sku: 'VS-L4-24X3775-AE', qty: 29 },
  { sku: 'VS-L4-24X4575-AE', qty: 54 },
  { sku: 'VS-L4-24X5375-AE', qty: 17 },
  { sku: 'VS-L4-24X5775-AE', qty: 25 },
  { sku: 'VS-L4-30X2175-AE', qty:  0 },
  { sku: 'VS-L4-30X2975-AE', qty:  8 },
  { sku: 'VS-L4-30X3775-AE', qty:  1 },
  { sku: 'VS-L4-30X4575-AE', qty: 80 },
  { sku: 'VS-L4-30X5375-AE', qty:  0 },
  { sku: 'VS-L4-30X5775-AE', qty:  0 },
  { sku: 'VS-L4-36X2175-AE', qty:  0 },
  { sku: 'VS-L4-36X2975-AE', qty:  0 },
  { sku: 'VS-L4-36X3775-AE', qty:  0 },
  { sku: 'VS-L4-36X4575-AE', qty:  0 },
  { sku: 'VS-L4-36X5375-AE', qty:  0 },
  { sku: 'VS-L4-36X5775-AE', qty: 54 },
  // Lama 4" — Blue Green
  { sku: 'VS-L4-18X1700-BG', qty: 24 },
  { sku: 'VS-L4-18X2200-BG', qty: 11 },
  { sku: 'VS-L4-24X2175-BG', qty: 85 },
  { sku: 'VS-L4-24X2500-BG', qty:  5 },
  { sku: 'VS-L4-24X2975-BG', qty: 140 },
  { sku: 'VS-L4-24X3775-BG', qty: 26 },
  { sku: 'VS-L4-24X4575-BG', qty:  0 },
  { sku: 'VS-L4-24X5375-BG', qty: 37 },
  { sku: 'VS-L4-24X5775-BG', qty: 64 },
  { sku: 'VS-L4-30X2175-BG', qty: 21 },
  { sku: 'VS-L4-30X2975-BG', qty: 27 },
  { sku: 'VS-L4-30X3775-BG', qty: 22 },
  { sku: 'VS-L4-30X4575-BG', qty: 157 },
  { sku: 'VS-L4-30X5375-BG', qty:  7 },
  { sku: 'VS-L4-30X5775-BG', qty:  3 },
  { sku: 'VS-L4-36X2175-BG', qty: 10 },
  { sku: 'VS-L4-36X2975-BG', qty: 39 },
  { sku: 'VS-L4-36X3775-BG', qty: 35 },
  { sku: 'VS-L4-36X4575-BG', qty: 50 },
  { sku: 'VS-L4-36X5375-BG', qty:  0 },
  { sku: 'VS-L4-36X5775-BG', qty:  0 },
  // Lama 3" — Acid Etched
  { sku: 'VS-L3-18X1600-AE', qty:   3 },
  { sku: 'VS-L3-24X2275-AE', qty:  31 },
  { sku: 'VS-L3-24X2500-AE', qty:  10 },
  { sku: 'VS-L3-24X2875-AE', qty:  54 },
  { sku: 'VS-L3-24X3775-AE', qty:  36 },
  { sku: 'VS-L3-24X4675-AE', qty:  67 },
  { sku: 'VS-L3-24X5275-AE', qty:   0 },
  { sku: 'VS-L3-24X5875-AE', qty: 102 },
  { sku: 'VS-L3-30X2275-AE', qty:  16 },
  { sku: 'VS-L3-30X2875-AE', qty:   2 },
  { sku: 'VS-L3-30X3775-AE', qty:  13 },
  { sku: 'VS-L3-30X4675-AE', qty: 210 },
  { sku: 'VS-L3-30X5275-AE', qty:  29 },
  { sku: 'VS-L3-30X5875-AE', qty:   2 },
  { sku: 'VS-L3-36X2275-AE', qty:  16 },
  { sku: 'VS-L3-36X2875-AE', qty:  27 },
  { sku: 'VS-L3-36X3775-AE', qty:   0 },
  { sku: 'VS-L3-36X4675-AE', qty:  24 },
  { sku: 'VS-L3-36X5275-AE', qty:  15 },
  { sku: 'VS-L3-36X5875-AE', qty: 152 },
  // Lama 3" — Blue Green
  { sku: 'VS-L3-18X1600-BG', qty:  9 },
  { sku: 'VS-L3-24X2275-BG', qty:  0 },
  { sku: 'VS-L3-24X2875-BG', qty: 16 },
  { sku: 'VS-L3-24X3775-BG', qty:  5 },
  { sku: 'VS-L3-24X4675-BG', qty: 44 },
  { sku: 'VS-L3-24X5275-BG', qty: 15 },
  { sku: 'VS-L3-24X5875-BG', qty: 16 },
  { sku: 'VS-L3-30X2275-BG', qty: 50 },
  { sku: 'VS-L3-30X2875-BG', qty: 54 },
  { sku: 'VS-L3-30X3775-BG', qty: 55 },
  { sku: 'VS-L3-30X4675-BG', qty: 101 },
  { sku: 'VS-L3-30X5275-BG', qty: 42 },
  { sku: 'VS-L3-30X5875-BG', qty: 42 },
  { sku: 'VS-L3-36X2275-BG', qty:  9 },
  { sku: 'VS-L3-36X2875-BG', qty: 22 },
  { sku: 'VS-L3-36X3775-BG', qty:  0 },
  { sku: 'VS-L3-36X4675-BG', qty:  0 },
  { sku: 'VS-L3-36X5275-BG', qty: 24 },
  { sku: 'VS-L3-36X5875-BG', qty: 51 },
];

const EXPECTED_TOTAL = 2451;

// ── Snapshot ──────────────────────────────────────────────────────────────────

async function snapshot(label: string) {
  const rows = await db.$queryRaw<Array<{ locations: bigint; total_units: bigint }>>`
    SELECT COUNT(*) AS locations,
           COALESCE(SUM("quantityOnHand"), 0) AS total_units
    FROM product_locations
    WHERE "warehouseId" = ${SJ_WAREHOUSE_ID}
  `;
  const r = rows[0]!;
  console.log(`\n${label}`);
  console.log(`  Ubicaciones en San Juan : ${r.locations}`);
  console.log(`  Total unidades          : ${r.total_units}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== CONTEO FISICO SAN JUAN — 29/06/2026 ===');
  console.log(`SKUs a procesar: ${CONTEO.length}`);
  console.log(`Total esperado : ${EXPECTED_TOTAL} unidades`);

  await snapshot('ESTADO PREVIO');

  const skusNotFound: string[] = [];
  const updated: Array<{ sku: string; before: number; after: number; delta: number }> = [];
  const created: Array<{ sku: string; qty: number }> = [];
  const noChange: string[] = [];

  // Procesar cada SKU FUERA de la transacción para tolerar SKUs faltantes.
  // Los writes individuales van envueltos en su propia mini-transacción.
  for (const { sku, qty } of CONTEO) {
    // 1. Buscar producto
    const product = await db.product.findUnique({
      where: { sku },
      select: { id: true, sku: true },
    });
    if (!product) {
      skusNotFound.push(sku);
      continue;
    }

    // 2. Buscar ubicación en San Juan
    const loc = await db.productLocation.findFirst({
      where: { productId: product.id, warehouseId: SJ_WAREHOUSE_ID },
    });

    if (!loc) {
      // 3a. No existe → crear con el qty del conteo
      const newLocId = genId();
      const newMovId = genId();

      await db.$transaction([
        db.$executeRaw`
          INSERT INTO product_locations
            (id, "productId", "warehouseId", "locationCode", "quantityOnHand",
             "reservedQuantity", "backorderQuantity", "updatedAt")
          VALUES (
            ${newLocId}, ${product.id}, ${SJ_WAREHOUSE_ID},
            'PRINCIPAL', ${qty}, 0, 0, NOW()
          )
          ON CONFLICT DO NOTHING
        `,
        // Solo crear movimiento si qty > 0
        ...(qty > 0
          ? [db.$executeRaw`
              INSERT INTO inventory_movements
                (id, "productId", "locationId", "movementType", quantity,
                 "referenceType", "referenceId", "userId", notes,
                 "requiresApproval", "createdAt")
              VALUES (
                ${newMovId}, ${product.id}, ${newLocId},
                'ADJUSTMENT', ${qty},
                'CYCLE_COUNT', ${REFERENCE_ID}, ${ADMIN_USER_ID},
                ${NOTES}, false, NOW()
              )
            `]
          : []),
      ]);

      created.push({ sku, qty });
      continue;
    }

    // 3b. Existe → comparar
    const currentQty = loc.quantityOnHand;
    if (currentQty === qty) {
      noChange.push(sku);
      continue;
    }

    // 3c. Diferente → actualizar + movimiento
    const delta  = qty - currentQty;
    const movId  = genId();

    await db.$transaction([
      db.$executeRaw`
        UPDATE product_locations
        SET "quantityOnHand" = ${qty}, "updatedAt" = NOW()
        WHERE id = ${loc.id}
      `,
      db.$executeRaw`
        INSERT INTO inventory_movements
          (id, "productId", "locationId", "movementType", quantity,
           "referenceType", "referenceId", "userId", notes,
           "requiresApproval", "createdAt")
        VALUES (
          ${movId}, ${product.id}, ${loc.id},
          'ADJUSTMENT', ${delta},
          'CYCLE_COUNT', ${REFERENCE_ID}, ${ADMIN_USER_ID},
          ${NOTES}, false, NOW()
        )
      `,
    ]);

    updated.push({ sku, before: currentQty, after: qty, delta });
  }

  await snapshot('ESTADO POSTERIOR');

  // ── Reporte final ────────────────────────────────────────────────────────────

  console.log('\n=== REPORTE ===');
  console.log(`  SKUs en listado   : ${CONTEO.length}`);
  console.log(`  No encontrados    : ${skusNotFound.length}`);
  console.log(`  Sin cambio        : ${noChange.length}`);
  console.log(`  Ubicaciones nuevas: ${created.length}`);
  console.log(`  Actualizados      : ${updated.length}`);

  if (skusNotFound.length > 0) {
    console.log('\n  *** SKUs NO ENCONTRADOS EN BD ***');
    skusNotFound.forEach((s) => console.log(`    - ${s}`));
  }

  if (created.length > 0) {
    console.log('\n  Creados:');
    created.forEach(({ sku, qty }) => console.log(`    ${sku.padEnd(22)} qty=${qty}`));
  }

  if (updated.length > 0) {
    console.log('\n  Actualizados:');
    updated.forEach(({ sku, before, after, delta }) =>
      console.log(`    ${sku.padEnd(22)} ${before} → ${after}  (${delta > 0 ? '+' : ''}${delta})`),
    );
  }

  // Validación de total
  const rows = await db.$queryRaw<Array<{ total: bigint }>>`
    SELECT COALESCE(SUM("quantityOnHand"), 0) AS total
    FROM product_locations
    WHERE "warehouseId" = ${SJ_WAREHOUSE_ID}
  `;
  const finalTotal = Number(rows[0]!.total);
  const diff       = finalTotal - EXPECTED_TOTAL;

  console.log('\n=== VALIDACION ===');
  console.log(`  Total final San Juan : ${finalTotal}`);
  console.log(`  Total esperado       : ${EXPECTED_TOTAL}`);
  console.log(`  Diferencia           : ${diff === 0 ? '0 ✓ OK' : `${diff} *** ALERTA ***`}`);

  if (diff !== 0) {
    console.log('\n  POSIBLES CAUSAS:');
    console.log('  - Existen ubicaciones en San Juan con productos fuera de este listado');
    console.log('  - Algún SKU no fue encontrado y no se actualizó');
    console.log('  - Revisar "No encontrados" arriba');
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
