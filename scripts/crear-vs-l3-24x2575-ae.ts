/**
 * Crear / completar VS-L3-24X2575-AE + asignar 10 unidades en San Juan
 * Operación idempotente — conteo físico 29/06/2026
 *
 * Ejecutar: npx tsx scripts/crear-vs-l3-24x2575-ae.ts
 */

import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';

const db = new PrismaClient();

const TARGET_SKU     = 'VS-L3-24X2575-AE';
const SJ_WAREHOUSE   = 'cmpm5ell00000epvxuj4xx6c7';
const ADMIN_USER     = 'cmpmv4v6e0015hhp48kyzc493';
const CATEGORY_ID    = 'cmpm5elwr0003epvxvs61q5ie'; // Ventanas de Seguridad
const REFERENCE_ID   = 'CONTEO-2026-06-29-SJ';
const NOTES          = 'Producto nuevo identificado en conteo San Juan 29/06/2026';
const TARGET_QTY     = 10;

const DIMENSIONS = { unit: 'in', width: 24, height: 25.75, heightDisplay: '25 3/4' };

function genId(): string {
  return 'c' + randomBytes(15).toString('hex').slice(0, 24);
}

async function snapshot(label: string) {
  const rows = await db.$queryRaw<Array<{ products: number; locations: number; units: number }>>`
    SELECT
      (SELECT COUNT(*)::int FROM products)                                       AS products,
      (SELECT COUNT(*)::int FROM product_locations WHERE "warehouseId" = ${SJ_WAREHOUSE}) AS locations,
      (SELECT COALESCE(SUM("quantityOnHand"),0)::int
         FROM product_locations WHERE "warehouseId" = ${SJ_WAREHOUSE})          AS units
  `;
  const r = rows[0]!;
  console.log(`\n${label}`);
  console.log(`  Productos en BD         : ${r.products}`);
  console.log(`  Ubicaciones San Juan    : ${r.locations}`);
  console.log(`  Unidades totales SJ     : ${r.units}`);
}

async function main() {
  console.log(`=== CREAR/COMPLETAR ${TARGET_SKU} + 10 UNIDADES SAN JUAN ===`);

  await snapshot('ESTADO PREVIO');

  // ── PASO 1: verificar/crear producto ─────────────────────────────────────────

  let product = await db.product.findUnique({ where: { sku: TARGET_SKU } });

  if (!product) {
    console.log('\nPASO 1: Producto no existe → creando...');
    product = await db.product.create({
      data: {
        sku:            TARGET_SKU,
        name:           'Ventana de Seguridad Lama 3" 24x25 3/4 Acid Etched',
        description:    'Ventana jalousie de seguridad. Lama 3". 24"×25 3/4". Acid Etched.',
        categoryId:     CATEGORY_ID,
        color:          'Acid Etched',
        type:           'Ventana',
        model:          'Lama 3"',
        dimensions:     DIMENSIONS,
        unitCost:       0,
        retailPrice:    0,
        wholesalePrice: 0,
        minStock:       0,
        isActive:       true,
      },
    });
    console.log(`  ✓ Producto creado — id: ${product.id}`);
  } else {
    console.log(`\nPASO 1: Producto ya existe — id: ${product.id}`);

    // Campos que necesitan corrección
    const fixes: Record<string, unknown> = {};
    if (!product.dimensions) {
      fixes.dimensions = DIMENSIONS;
      console.log('  → dimensions era NULL, se corregirá');
    }
    if (!product.description) {
      fixes.description = 'Ventana jalousie de seguridad. Lama 3". 24"×25 3/4". Acid Etched.';
      console.log('  → description era NULL, se corregirá');
    }
    if (!product.type) {
      fixes.type = 'Ventana';
      console.log('  → type era NULL, se corregirá');
    }

    if (Object.keys(fixes).length > 0) {
      await db.product.update({ where: { id: product.id }, data: fixes });
      console.log('  ✓ Campos corregidos:', Object.keys(fixes).join(', '));
    } else {
      console.log('  ✓ Todos los campos críticos OK, sin cambios en producto');
    }
  }

  // ── PASO 2: verificar/crear ubicación en San Juan ─────────────────────────────

  console.log('\nPASO 2: Ubicación en San Juan...');

  const loc = await db.productLocation.findFirst({
    where: { productId: product.id, warehouseId: SJ_WAREHOUSE },
  });

  if (!loc) {
    console.log('  No existe → creando con 10 unidades...');

    const locId = genId();
    const movId = genId();

    await db.$transaction([
      db.$executeRaw`
        INSERT INTO product_locations
          (id, "productId", "warehouseId", "locationCode",
           "quantityOnHand", "reservedQuantity", "backorderQuantity", "updatedAt")
        VALUES (
          ${locId}, ${product.id}, ${SJ_WAREHOUSE},
          'PRINCIPAL', ${TARGET_QTY}, 0, 0, NOW()
        )
        ON CONFLICT DO NOTHING
      `,
      db.$executeRaw`
        INSERT INTO inventory_movements
          (id, "productId", "locationId", "movementType", quantity,
           "referenceType", "referenceId", "userId", notes,
           "requiresApproval", "createdAt")
        VALUES (
          ${movId}, ${product.id}, ${locId},
          'IN', ${TARGET_QTY},
          'CYCLE_COUNT', ${REFERENCE_ID}, ${ADMIN_USER},
          ${NOTES}, false, NOW()
        )
      `,
    ]);

    console.log(`  ✓ Ubicación creada (id: ${locId})`);
    console.log(`  ✓ Movimiento IN creado (id: ${movId}), quantity: +${TARGET_QTY}`);

  } else if (loc.quantityOnHand === TARGET_QTY) {
    console.log(`  ✓ Ubicación ya tiene ${TARGET_QTY} unidades — sin cambio`);

  } else {
    const diff = TARGET_QTY - loc.quantityOnHand;
    console.log(`  quantityOnHand actual: ${loc.quantityOnHand} → ajustando a ${TARGET_QTY} (delta: ${diff > 0 ? '+' : ''}${diff})`);

    const movId = genId();

    await db.$transaction([
      db.$executeRaw`
        UPDATE product_locations
        SET "quantityOnHand" = ${TARGET_QTY}, "updatedAt" = NOW()
        WHERE id = ${loc.id}
      `,
      db.$executeRaw`
        INSERT INTO inventory_movements
          (id, "productId", "locationId", "movementType", quantity,
           "referenceType", "referenceId", "userId", notes,
           "requiresApproval", "createdAt")
        VALUES (
          ${movId}, ${product.id}, ${loc.id},
          'ADJUSTMENT', ${diff},
          'CYCLE_COUNT', ${REFERENCE_ID}, ${ADMIN_USER},
          ${NOTES}, false, NOW()
        )
      `,
    ]);

    console.log(`  ✓ Ajuste aplicado — movimiento ADJUSTMENT (id: ${movId})`);
  }

  // ── PASO 3: snapshot final ────────────────────────────────────────────────────

  await snapshot('ESTADO POSTERIOR');

  // ── PASO 4: validación ────────────────────────────────────────────────────────

  const rows = await db.$queryRaw<Array<{ products: number; units: number }>>`
    SELECT
      (SELECT COUNT(*)::int FROM products) AS products,
      (SELECT COALESCE(SUM("quantityOnHand"),0)::int
         FROM product_locations WHERE "warehouseId" = ${SJ_WAREHOUSE}) AS units
  `;
  const { products, units } = rows[0]!;

  console.log('\n=== VALIDACION ===');
  console.log(`  Productos totales  : ${products} (esperado ≥103 si era nuevo)`);
  console.log(`  Unidades SJ        : ${units}    (esperado 2478 = 2468 + 10)`);
  console.log(`  Diferencia unidades: ${units - 2478 === 0 ? '0 ✓ OK' : `${units - 2478} (revisar)`}`);
}

main()
  .catch((e) => { console.error('ERROR:', e); process.exit(1); })
  .finally(() => db.$disconnect());
