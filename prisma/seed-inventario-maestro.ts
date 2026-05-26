/**
 * SEED INVENTARIO MAESTRO — The Builder's House
 * ================================================
 * Fuente: Inventario físico auditado San Juan + Factura No.30
 * Standard Windows and Doors Exports S.R.L
 *
 * Estructura:
 *  - 3 almacenes: San Juan, Negras, Ponce
 *  - 2 categorías: Ventanas de Seguridad, Puertas de Cristal
 *  - 44 ventanas Lama 4" (22 medidas × 2 acabados)
 *  - 44 ventanas Lama 3" (22 medidas × 2 acabados)
 *  - 6 puertas de cristal Lama 4" A/E
 *  Total: 94 productos, ubicaciones en San Juan
 *
 * Totales esperados (validación al final):
 *  - L4 ventanas: A/E=613, B/G=494, Total=1,107
 *  - L3 ventanas: A/E=634, B/G=428, Total=1,062
 *  - Puertas:     6
 *  - GRAN TOTAL:  2,175
 */

import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

// ─── TIPOS ────────────────────────────────────────────────────────────────────

type VentanaRow = {
  width: number;
  heightIn: number;        // decimal: 45.75 para 45¾
  heightDisplay: string;   // "45 3/4"
  aeStock: number;
  bgStock: number;
  aeCost?: number;         // unitCost desde Factura No.30 (solo algunos)
  bgCost?: number;
};

type PuertaRow = {
  width: number;
  heightIn: number;
  heightDisplay: string;
  stock: number;
  unitCost: number;
};

// ─── Función auxiliar: código de altura para SKU ──────────────────────────────
// 45.75 → "4575", 21.75 → "2175", 16 → "1600", 95 → "9500"
function hcode(h: number): string {
  return Math.round(h * 100).toString();
}

function skuVentana(lama: '3' | '4', width: number, height: number, acabado: 'AE' | 'BG'): string {
  return `VS-L${lama}-${width}X${hcode(height)}-${acabado}`;
}

function skuPuerta(width: number, height: number): string {
  return `PD-L4-${width}X${hcode(height)}-AE`;
}

// ─── LAMA 4" — VENTANAS ──────────────────────────────────────────────────────
// [width, heightIn, heightDisplay, aeStock, bgStock, aeCost?, bgCost?]
const LAMA4_VENTANAS: VentanaRow[] = [
  { width: 18, heightIn: 17,    heightDisplay: '17',     aeStock: 32,  bgStock: 28 },
  { width: 18, heightIn: 22,    heightDisplay: '22',     aeStock: 23,  bgStock: 10 },
  { width: 24, heightIn: 21.75, heightDisplay: '21 3/4', aeStock: 46,  bgStock: 26 },
  { width: 24, heightIn: 25,    heightDisplay: '25',     aeStock: 16,  bgStock: 4  },
  { width: 24, heightIn: 29.75, heightDisplay: '29 3/4', aeStock: 1,   bgStock: 8  },
  { width: 24, heightIn: 37.75, heightDisplay: '37 3/4', aeStock: 51,  bgStock: 26 },
  { width: 24, heightIn: 45.75, heightDisplay: '45 3/4', aeStock: 107, bgStock: 96,  aeCost: 26.69 },
  { width: 24, heightIn: 53.75, heightDisplay: '53 3/4', aeStock: 75,  bgStock: 50,  aeCost: 31.35 },
  { width: 24, heightIn: 56,    heightDisplay: '56',     aeStock: 6,   bgStock: 0  },
  { width: 24, heightIn: 57.75, heightDisplay: '57 3/4', aeStock: 22,  bgStock: 14 },
  { width: 30, heightIn: 21.75, heightDisplay: '21 3/4', aeStock: 1,   bgStock: 23 },
  { width: 30, heightIn: 29.75, heightDisplay: '29 3/4', aeStock: 6,   bgStock: 2  },
  { width: 30, heightIn: 37.75, heightDisplay: '37 3/4', aeStock: 8,   bgStock: 25 },
  { width: 30, heightIn: 45.75, heightDisplay: '45 3/4', aeStock: 87,  bgStock: 43 },
  { width: 30, heightIn: 53.75, heightDisplay: '53 3/4', aeStock: 22,  bgStock: 31,  aeCost: 39.19, bgCost: 39.19 },
  { width: 30, heightIn: 57.75, heightDisplay: '57 3/4', aeStock: 0,   bgStock: 15 },
  { width: 36, heightIn: 21.75, heightDisplay: '21 3/4', aeStock: 8,   bgStock: 13 },
  { width: 36, heightIn: 29.75, heightDisplay: '29 3/4', aeStock: 7,   bgStock: 28 },
  { width: 36, heightIn: 37.75, heightDisplay: '37 3/4', aeStock: 33,  bgStock: 20 },
  { width: 36, heightIn: 45.75, heightDisplay: '45 3/4', aeStock: 0,   bgStock: 0  },
  { width: 36, heightIn: 53.75, heightDisplay: '53 3/4', aeStock: 2,   bgStock: 0  },
  { width: 36, heightIn: 57.75, heightDisplay: '57 3/4', aeStock: 62,  bgStock: 32,  bgCost: 50.53 },
];

// ─── LAMA 3" — VENTANAS ──────────────────────────────────────────────────────
const LAMA3_VENTANAS: VentanaRow[] = [
  { width: 18, heightIn: 16,    heightDisplay: '16',     aeStock: 16,  bgStock: 0  },
  { width: 18, heightIn: 16.75, heightDisplay: '16 3/4', aeStock: 30,  bgStock: 30,  aeCost: 7.33, bgCost: 7.33 },
  { width: 24, heightIn: 22.75, heightDisplay: '22 3/4', aeStock: 43,  bgStock: 0  },
  { width: 24, heightIn: 28.75, heightDisplay: '28 3/4', aeStock: 67,  bgStock: 16 },
  { width: 24, heightIn: 32,    heightDisplay: '32',     aeStock: 1,   bgStock: 0  },
  { width: 24, heightIn: 37.75, heightDisplay: '37 3/4', aeStock: 0,   bgStock: 13 },
  { width: 24, heightIn: 46.75, heightDisplay: '46 3/4', aeStock: 93,  bgStock: 28,  aeCost: 27.27, bgCost: 27.27 },
  { width: 24, heightIn: 47,    heightDisplay: '47',     aeStock: 1,   bgStock: 0  },
  { width: 24, heightIn: 52.75, heightDisplay: '52 3/4', aeStock: 4,   bgStock: 13 },
  { width: 24, heightIn: 58.75, heightDisplay: '58 3/4', aeStock: 62,  bgStock: 2  },
  { width: 30, heightIn: 22.75, heightDisplay: '22 3/4', aeStock: 38,  bgStock: 30 },
  { width: 30, heightIn: 28.75, heightDisplay: '28 3/4', aeStock: 3,   bgStock: 24 },
  { width: 30, heightIn: 37.75, heightDisplay: '37 3/4', aeStock: 28,  bgStock: 22 },
  { width: 30, heightIn: 46.75, heightDisplay: '46 3/4', aeStock: 65,  bgStock: 38 },
  { width: 30, heightIn: 52.75, heightDisplay: '52 3/4', aeStock: 0,   bgStock: 40 },
  { width: 30, heightIn: 58.75, heightDisplay: '58 3/4', aeStock: 26,  bgStock: 23 },
  { width: 36, heightIn: 22.75, heightDisplay: '22 3/4', aeStock: 20,  bgStock: 14 },
  { width: 36, heightIn: 28.75, heightDisplay: '28 3/4', aeStock: 0,   bgStock: 48 },
  { width: 36, heightIn: 37.75, heightDisplay: '37 3/4', aeStock: 2,   bgStock: 1  },
  { width: 36, heightIn: 46.75, heightDisplay: '46 3/4', aeStock: 0,   bgStock: 18 },
  { width: 36, heightIn: 52.75, heightDisplay: '52 3/4', aeStock: 31,  bgStock: 14 },
  { width: 36, heightIn: 58.75, heightDisplay: '58 3/4', aeStock: 104, bgStock: 54 },
];

// ─── LAMA 4" — PUERTAS (todas A/E) ───────────────────────────────────────────
// Fuente costo: Factura No.30 Standard Windows and Doors Exports S.R.L
const LAMA4_PUERTAS: PuertaRow[] = [
  { width: 30, heightIn: 81, heightDisplay: '81', stock: 1, unitCost: 59.06 },
  { width: 30, heightIn: 84, heightDisplay: '84', stock: 1, unitCost: 61.25 },
  { width: 30, heightIn: 95, heightDisplay: '95', stock: 1, unitCost: 69.27 },
  { width: 32, heightIn: 81, heightDisplay: '81', stock: 1, unitCost: 63.00 },
  { width: 32, heightIn: 84, heightDisplay: '84', stock: 1, unitCost: 65.33 },
  { width: 32, heightIn: 95, heightDisplay: '95', stock: 1, unitCost: 73.89 },
];

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  SEED INVENTARIO MAESTRO — The Builder\'s House');
  console.log('═══════════════════════════════════════════════════════\n');

  // ── 1. Crear almacenes ──────────────────────────────────────────────────────
  console.log('── PASO 1: Almacenes ──');
  const warehouseNames = ['San Juan', 'Negras', 'Ponce'];
  const warehouses: Record<string, { id: string }> = {};

  for (const name of warehouseNames) {
    const wh = await db.warehouse.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    warehouses[name] = wh;
    console.log(`  ✓ ${name} (${wh.id})`);
  }

  const sjId = warehouses['San Juan'].id;

  // ── 2. Crear categorías ─────────────────────────────────────────────────────
  console.log('\n── PASO 2: Categorías ──');
  const catV = await db.category.upsert({
    where: { slug: 'ventanas-seguridad' },
    update: {},
    create: { name: 'Ventanas de Seguridad', slug: 'ventanas-seguridad' },
  });
  const catP = await db.category.upsert({
    where: { slug: 'puertas-cristal' },
    update: {},
    create: { name: 'Puertas de Cristal', slug: 'puertas-cristal' },
  });
  console.log(`  ✓ ${catV.name}`);
  console.log(`  ✓ ${catP.name}`);

  // ── 3. Crear ventanas Lama 4" ───────────────────────────────────────────────
  console.log(`\n── PASO 3: Ventanas Lama 4" (${LAMA4_VENTANAS.length} medidas × 2 acabados) ──`);
  let l4AeTotal = 0;
  let l4BgTotal = 0;

  for (const row of LAMA4_VENTANAS) {
    for (const acabado of ['AE', 'BG'] as const) {
      const stock = acabado === 'AE' ? row.aeStock : row.bgStock;
      const cost = acabado === 'AE' ? (row.aeCost ?? 0) : (row.bgCost ?? 0);
      const colorName = acabado === 'AE' ? 'Acid Etched' : 'Blue Green';
      const sku = skuVentana('4', row.width, row.heightIn, acabado);
      const name = `Ventana Seguridad Lama 4" ${row.width}x${row.heightDisplay} ${colorName}`;

      const product = await db.product.upsert({
        where: { sku },
        update: { unitCost: cost },
        create: {
          sku,
          name,
          description: `Ventana jalousie de seguridad. Lama 4". ${row.width}"×${row.heightDisplay}". ${colorName}.`,
          categoryId: catV.id,
          dimensions: { width: row.width, height: row.heightIn, heightDisplay: row.heightDisplay, unit: 'in' },
          color: colorName,
          model: 'Lama 4"',
          type: 'Ventana',
          unitCost: cost,
          retailPrice: 0,
          wholesalePrice: 0,
          minStock: 0,
        },
      });

      await db.productLocation.upsert({
        where: { productId_warehouseId: { productId: product.id, warehouseId: sjId } },
        update: { quantityOnHand: stock },
        create: {
          productId: product.id,
          warehouseId: sjId,
          locationCode: 'PRINCIPAL',
          quantityOnHand: stock,
        },
      });

      if (acabado === 'AE') l4AeTotal += stock;
      else l4BgTotal += stock;

      const marker = stock > 0 ? 'OK' : '--';
      console.log(`  ${marker}  ${sku.padEnd(28)} stock=${String(stock).padStart(3)}`);
    }
  }

  // ── 4. Crear ventanas Lama 3" ───────────────────────────────────────────────
  console.log(`\n── PASO 4: Ventanas Lama 3" (${LAMA3_VENTANAS.length} medidas × 2 acabados) ──`);
  let l3AeTotal = 0;
  let l3BgTotal = 0;

  for (const row of LAMA3_VENTANAS) {
    for (const acabado of ['AE', 'BG'] as const) {
      const stock = acabado === 'AE' ? row.aeStock : row.bgStock;
      const cost = acabado === 'AE' ? (row.aeCost ?? 0) : (row.bgCost ?? 0);
      const colorName = acabado === 'AE' ? 'Acid Etched' : 'Blue Green';
      const sku = skuVentana('3', row.width, row.heightIn, acabado);
      const name = `Ventana Seguridad Lama 3" ${row.width}x${row.heightDisplay} ${colorName}`;

      const product = await db.product.upsert({
        where: { sku },
        update: { unitCost: cost },
        create: {
          sku,
          name,
          description: `Ventana jalousie de seguridad. Lama 3". ${row.width}"×${row.heightDisplay}". ${colorName}.`,
          categoryId: catV.id,
          dimensions: { width: row.width, height: row.heightIn, heightDisplay: row.heightDisplay, unit: 'in' },
          color: colorName,
          model: 'Lama 3"',
          type: 'Ventana',
          unitCost: cost,
          retailPrice: 0,
          wholesalePrice: 0,
          minStock: 0,
        },
      });

      await db.productLocation.upsert({
        where: { productId_warehouseId: { productId: product.id, warehouseId: sjId } },
        update: { quantityOnHand: stock },
        create: {
          productId: product.id,
          warehouseId: sjId,
          locationCode: 'PRINCIPAL',
          quantityOnHand: stock,
        },
      });

      if (acabado === 'AE') l3AeTotal += stock;
      else l3BgTotal += stock;

      const marker = stock > 0 ? 'OK' : '--';
      console.log(`  ${marker}  ${sku.padEnd(28)} stock=${String(stock).padStart(3)}`);
    }
  }

  // ── 5. Crear puertas de cristal ─────────────────────────────────────────────
  console.log(`\n── PASO 5: Puertas de Cristal Lama 4" (${LAMA4_PUERTAS.length} productos) ──`);
  let puertasTotal = 0;

  for (const row of LAMA4_PUERTAS) {
    const sku = skuPuerta(row.width, row.heightIn);
    const name = `Puerta Cristal Lama 4" ${row.width}x${row.heightDisplay} Acid Etched`;

    const product = await db.product.upsert({
      where: { sku },
      update: { unitCost: row.unitCost },
      create: {
        sku,
        name,
        description: `Puerta de cristal jalousie. Lama 4" A/E. ${row.width}"×${row.heightDisplay}". Costo fábrica: $${row.unitCost.toFixed(2)}.`,
        categoryId: catP.id,
        dimensions: { width: row.width, height: row.heightIn, heightDisplay: row.heightDisplay, unit: 'in' },
        color: 'Acid Etched',
        model: 'Lama 4"',
        type: 'Puerta',
        unitCost: row.unitCost,
        retailPrice: 0,
        wholesalePrice: 0,
        minStock: 0,
      },
    });

    await db.productLocation.upsert({
      where: { productId_warehouseId: { productId: product.id, warehouseId: sjId } },
      update: { quantityOnHand: row.stock },
      create: {
        productId: product.id,
        warehouseId: sjId,
        locationCode: 'PRINCIPAL',
        quantityOnHand: row.stock,
      },
    });

    puertasTotal += row.stock;
    console.log(`  OK   ${sku.padEnd(28)} stock=${row.stock}  costo=$${row.unitCost.toFixed(2)}`);
  }

  // ── VALIDACIÓN DE TOTALES ──────────────────────────────────────────────────
  const l4Total = l4AeTotal + l4BgTotal;
  const l3Total = l3AeTotal + l3BgTotal;
  const grandTotal = l4Total + l3Total + puertasTotal;

  const EXPECTED_L4_AE = 613;
  const EXPECTED_L4_BG = 494;
  const EXPECTED_L3_AE = 634;
  const EXPECTED_L3_BG = 428;
  const EXPECTED_PUERTAS = 6;
  const EXPECTED_GRAND = 2175;

  const check = (label: string, got: number, expected: number) => {
    const ok = got === expected;
    const mark = ok ? '✓' : '✗';
    const diff = got - expected;
    const diffStr = diff === 0 ? '' : ` (diff: ${diff > 0 ? '+' : ''}${diff})`;
    console.log(`  ${mark} ${label.padEnd(30)} ${String(got).padStart(5)} / ${expected}${diffStr}`);
    return ok;
  };

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  VALIDACIÓN DE TOTALES');
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Categoría                       Cargado / Esperado');
  console.log('  ─────────────────────────────────────────────────────');

  let allOk = true;
  allOk = check('L4 Ventanas A/E', l4AeTotal, EXPECTED_L4_AE) && allOk;
  allOk = check('L4 Ventanas B/G', l4BgTotal, EXPECTED_L4_BG) && allOk;
  allOk = check('L4 Ventanas TOTAL', l4Total, EXPECTED_L4_AE + EXPECTED_L4_BG) && allOk;
  console.log('  ─────────────────────────────────────────────────────');
  allOk = check('L3 Ventanas A/E', l3AeTotal, EXPECTED_L3_AE) && allOk;
  allOk = check('L3 Ventanas B/G', l3BgTotal, EXPECTED_L3_BG) && allOk;
  allOk = check('L3 Ventanas TOTAL', l3Total, EXPECTED_L3_AE + EXPECTED_L3_BG) && allOk;
  console.log('  ─────────────────────────────────────────────────────');
  allOk = check('Puertas Lama 4" A/E', puertasTotal, EXPECTED_PUERTAS) && allOk;
  console.log('  ─────────────────────────────────────────────────────');
  allOk = check('GRAN TOTAL', grandTotal, EXPECTED_GRAND) && allOk;
  console.log('═══════════════════════════════════════════════════════');

  if (allOk) {
    console.log('\n  ✅ VALIDACIÓN EXITOSA — Todos los totales coinciden con el inventario auditado.\n');
  } else {
    console.log('\n  ⚠️  DISCREPANCIA DETECTADA — Revisar los datos fuente.\n');
    console.log('  Nota: El sistema contó los datos exactamente como fueron ingresados.');
    console.log('  Si los totales difieren, corregir los valores en seed-inventario-maestro.ts.\n');
  }

  const totalProductos = await db.product.count();
  const totalUbicaciones = await db.productLocation.count();
  console.log(`  Productos en DB:    ${totalProductos}`);
  console.log(`  Ubicaciones en DB:  ${totalUbicaciones}`);
  console.log(`  Almacenes en DB:    ${Object.keys(warehouses).length}\n`);
}

main()
  .catch((e) => {
    console.error('\n❌ ERROR:', e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
