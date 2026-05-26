/**
 * INTEGRACIÓN DE DATASET MAESTRO AUDITADO
 * =========================================
 * Fuente: Inventario físico San Juan + Factura No. 30 Standards Windows
 *
 * Operaciones:
 *  1. Actualiza retailPrice / wholesalePrice en productos existentes
 *  2. Crea ProductLocation con stock exacto auditado (solo si stock > 0)
 *  3. Crea productos especiales de almacén (medidas fuera del catálogo estándar)
 *  4. Crea categoría + productos Glass Door con costo de fábrica
 *
 * Reglas:
 *  - Precio aplicado = "Precio Especial" definitivo de la promoción
 *  - Los productos con precio "Por definir" se cargan con retailPrice = 0
 *  - Las Glass Doors reciben unitCost = precio costo fábrica; retailPrice = 0 (TBD)
 *  - wholesalePrice = retailPrice (ajustar manualmente cuando se defina)
 *  - unitCost de ventanas = 0 (no suministrado)
 *  - Script es idempotente: re-ejecución no duplica datos
 */

import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

// ─── TIPOS ────────────────────────────────────────────────────────────────────

type StockEntry = {
  sku: string;
  stock: number;
  retailPrice: number;   // 0 = Por definir
};

type NewProduct = {
  sku: string;
  name: string;
  description: string;
  model: string;
  color: string;
  dimensions: object;
  stock: number;
  retailPrice: number;
  unitCost: number;
};

// ─── SECCIÓN 1: LAMA 3" — Actualizar precios y stock ─────────────────────────
// SKU format: VS-L3-{W}X{H*100}-{AE|BG}   H en pulgadas con fracción ¾ = .75

const LAMA3_ENTRIES: StockEntry[] = [
  // 24" ancho
  { sku: 'VS-L3-24X2275-AE', stock: 43,  retailPrice: 108 },
  { sku: 'VS-L3-24X2875-AE', stock: 67,  retailPrice: 113 },
  { sku: 'VS-L3-24X2875-BG', stock: 16,  retailPrice: 113 },
  { sku: 'VS-L3-24X3775-BG', stock: 13,  retailPrice: 136 },
  { sku: 'VS-L3-24X5275-AE', stock: 4,   retailPrice: 190 },
  { sku: 'VS-L3-24X5275-BG', stock: 13,  retailPrice: 190 },
  { sku: 'VS-L3-24X5875-AE', stock: 62,  retailPrice: 212 },
  { sku: 'VS-L3-24X5875-BG', stock: 2,   retailPrice: 212 },
  // 30" ancho
  { sku: 'VS-L3-30X2275-AE', stock: 38,  retailPrice: 119 },
  { sku: 'VS-L3-30X2275-BG', stock: 10,  retailPrice: 119 },
  { sku: 'VS-L3-30X2875-AE', stock: 3,   retailPrice: 129 },
  { sku: 'VS-L3-30X2875-BG', stock: 24,  retailPrice: 129 },
  { sku: 'VS-L3-30X3775-AE', stock: 28,  retailPrice: 170 },
  { sku: 'VS-L3-30X3775-BG', stock: 22,  retailPrice: 170 },
  { sku: 'VS-L3-30X4675-AE', stock: 65,  retailPrice: 210 },
  { sku: 'VS-L3-30X4675-BG', stock: 38,  retailPrice: 210 },
  { sku: 'VS-L3-30X5275-AE', stock: 22,  retailPrice: 237 },
  { sku: 'VS-L3-30X5275-BG', stock: 71,  retailPrice: 237 },
  { sku: 'VS-L3-30X5875-AE', stock: 26,  retailPrice: 264 },
  { sku: 'VS-L3-30X5875-BG', stock: 23,  retailPrice: 264 },
  // 36" ancho
  { sku: 'VS-L3-36X2275-AE', stock: 20,  retailPrice: 124 },
  { sku: 'VS-L3-36X2275-BG', stock: 14,  retailPrice: 124 },
  { sku: 'VS-L3-36X2875-BG', stock: 48,  retailPrice: 155 },
  { sku: 'VS-L3-36X3775-AE', stock: 2,   retailPrice: 204 },
  { sku: 'VS-L3-36X3775-BG', stock: 1,   retailPrice: 204 },
  { sku: 'VS-L3-36X4675-BG', stock: 18,  retailPrice: 252 },
  { sku: 'VS-L3-36X5275-AE', stock: 31,  retailPrice: 285 },
  { sku: 'VS-L3-36X5275-BG', stock: 14,  retailPrice: 285 },
  { sku: 'VS-L3-36X5875-AE', stock: 104, retailPrice: 317 },
  { sku: 'VS-L3-36X5875-BG', stock: 54,  retailPrice: 317 },
];

// ─── SECCIÓN 2: LAMA 4" — Actualizar precios y stock ─────────────────────────

const LAMA4_ENTRIES: StockEntry[] = [
  // 24" ancho
  { sku: 'VS-L4-24X2175-AE', stock: 46,  retailPrice: 97  },
  { sku: 'VS-L4-24X2175-BG', stock: 26,  retailPrice: 97  },
  { sku: 'VS-L4-24X2975-AE', stock: 1,   retailPrice: 115 },
  { sku: 'VS-L4-24X2975-BG', stock: 8,   retailPrice: 115 },
  { sku: 'VS-L4-24X3775-AE', stock: 51,  retailPrice: 122 },
  { sku: 'VS-L4-24X3775-BG', stock: 26,  retailPrice: 122 },
  { sku: 'VS-L4-24X4575-AE', stock: 63,  retailPrice: 148 },
  { sku: 'VS-L4-24X4575-BG', stock: 96,  retailPrice: 148 },
  { sku: 'VS-L4-24X5375-AE', stock: 50,  retailPrice: 173 },
  { sku: 'VS-L4-24X5375-BG', stock: 71,  retailPrice: 173 },
  { sku: 'VS-L4-24X5775-AE', stock: 22,  retailPrice: 186 },
  { sku: 'VS-L4-24X5775-BG', stock: 14,  retailPrice: 186 },
  // 30" ancho
  { sku: 'VS-L4-30X2175-AE', stock: 1,   retailPrice: 104 },
  { sku: 'VS-L4-30X2175-BG', stock: 23,  retailPrice: 104 },
  { sku: 'VS-L4-30X2975-AE', stock: 6,   retailPrice: 120 },
  { sku: 'VS-L4-30X2975-BG', stock: 2,   retailPrice: 120 },
  { sku: 'VS-L4-30X3775-AE', stock: 8,   retailPrice: 152 },
  { sku: 'VS-L4-30X3775-BG', stock: 25,  retailPrice: 152 },
  { sku: 'VS-L4-30X4575-AE', stock: 87,  retailPrice: 184 },
  { sku: 'VS-L4-30X4575-BG', stock: 43,  retailPrice: 184 },
  { sku: 'VS-L4-30X5775-BG', stock: 15,  retailPrice: 233 },
  // 36" ancho
  { sku: 'VS-L4-36X2175-AE', stock: 8,   retailPrice: 105 },
  { sku: 'VS-L4-36X2175-BG', stock: 13,  retailPrice: 105 },
  { sku: 'VS-L4-36X2975-AE', stock: 7,   retailPrice: 144 },
  { sku: 'VS-L4-36X2975-BG', stock: 28,  retailPrice: 144 },
  { sku: 'VS-L4-36X3775-AE', stock: 33,  retailPrice: 183 },
  { sku: 'VS-L4-36X3775-BG', stock: 20,  retailPrice: 183 },
  { sku: 'VS-L4-36X5375-AE', stock: 2,   retailPrice: 260 },
  { sku: 'VS-L4-36X5775-AE', stock: 62,  retailPrice: 279 },
  { sku: 'VS-L4-36X5775-BG', stock: 32,  retailPrice: 279 },
];

// También actualizamos el precio de los productos que aparecen en catálogo
// pero cuyo par (AE o BG) no tiene stock auditado — precio igual por medida.
// Estos solo actualizan precio, SIN crear ProductLocation.
const LAMA3_PRICE_ONLY: { sku: string; retailPrice: number }[] = [
  { sku: 'VS-L3-24X2275-BG', retailPrice: 108 },
  { sku: 'VS-L3-24X3775-AE', retailPrice: 136 },
  { sku: 'VS-L3-36X2875-AE', retailPrice: 155 },
  { sku: 'VS-L3-36X4675-AE', retailPrice: 252 },
];

const LAMA4_PRICE_ONLY: { sku: string; retailPrice: number }[] = [
  { sku: 'VS-L4-30X5375-AE', retailPrice: 217 },
  { sku: 'VS-L4-30X5375-BG', retailPrice: 217 },
  { sku: 'VS-L4-30X5775-AE', retailPrice: 233 },
  { sku: 'VS-L4-36X4575-AE', retailPrice: 221 },
  { sku: 'VS-L4-36X4575-BG', retailPrice: 221 },
  { sku: 'VS-L4-36X5375-BG', retailPrice: 260 },
];

// ─── SECCIÓN 1 ESPECIALES: Lama 3" — medidas fuera del catálogo estándar ────

const LAMA3_SPECIAL: NewProduct[] = [
  {
    sku: 'VS-L3-18X1675-AE',
    name: 'Ventana Seguridad Lama 3" 18x16¾ Acid Etched',
    description: 'Medida especial de almacén. Lama 3". Medidas: 18"×16¾". Acid Etched.',
    model: 'Lama 3"', color: 'Acid Etched',
    dimensions: { width: 18, height: 16.75, unit: 'in' },
    stock: 46, retailPrice: 0, unitCost: 0,
  },
  {
    sku: 'VS-L3-18X1675-BG',
    name: 'Ventana Seguridad Lama 3" 18x16¾ Blue Green',
    description: 'Medida especial de almacén. Lama 3". Medidas: 18"×16¾". Blue Green.',
    model: 'Lama 3"', color: 'Blue Green',
    dimensions: { width: 18, height: 16.75, unit: 'in' },
    stock: 30, retailPrice: 0, unitCost: 0,
  },
  {
    sku: 'VS-L3-24X4700-XX',
    name: 'Ventana Seguridad Lama 3" 24x47 (Cristal Desconocido)',
    description: 'Medida especial de almacén. Lama 3". Medidas: 24"×47". Tipo de cristal por identificar.',
    model: 'Lama 3"', color: 'Desconocido',
    dimensions: { width: 24, height: 47, unit: 'in' },
    stock: 1, retailPrice: 0, unitCost: 0,
  },
  {
    sku: 'VS-L3-24X3200-XX',
    name: 'Ventana Seguridad Lama 3" 24x32 (Cristal Desconocido)',
    description: 'Medida especial de almacén. Lama 3". Medidas: 24"×32". Tipo de cristal por identificar.',
    model: 'Lama 3"', color: 'Desconocido',
    dimensions: { width: 24, height: 32, unit: 'in' },
    stock: 1, retailPrice: 0, unitCost: 0,
  },
];

// ─── SECCIÓN 2 ESPECIALES: Lama 4" — medidas fuera del catálogo estándar ────

const LAMA4_SPECIAL: NewProduct[] = [
  {
    sku: 'VS-L4-18X2200-AE',
    name: 'Ventana Seguridad Lama 4" 18x22 Acid Etched',
    description: 'Medida especial de almacén. Lama 4". Medidas: 18"×22". Acid Etched.',
    model: 'Lama 4"', color: 'Acid Etched',
    dimensions: { width: 18, height: 22, unit: 'in' },
    stock: 23, retailPrice: 0, unitCost: 0,
  },
  {
    sku: 'VS-L4-18X2200-BG',
    name: 'Ventana Seguridad Lama 4" 18x22 Blue Green',
    description: 'Medida especial de almacén. Lama 4". Medidas: 18"×22". Blue Green.',
    model: 'Lama 4"', color: 'Blue Green',
    dimensions: { width: 18, height: 22, unit: 'in' },
    stock: 10, retailPrice: 0, unitCost: 0,
  },
  {
    sku: 'VS-L4-18X1700-AE',
    name: 'Ventana Seguridad Lama 4" 18x17 Acid Etched',
    description: 'Medida especial de almacén. Lama 4". Medidas: 18"×17". Acid Etched.',
    model: 'Lama 4"', color: 'Acid Etched',
    dimensions: { width: 18, height: 17, unit: 'in' },
    stock: 32, retailPrice: 0, unitCost: 0,
  },
  {
    sku: 'VS-L4-18X1700-BG',
    name: 'Ventana Seguridad Lama 4" 18x17 Blue Green',
    description: 'Medida especial de almacén. Lama 4". Medidas: 18"×17". Blue Green.',
    model: 'Lama 4"', color: 'Blue Green',
    dimensions: { width: 18, height: 17, unit: 'in' },
    stock: 28, retailPrice: 0, unitCost: 0,
  },
  {
    sku: 'VS-L4-24X2500-AE',
    name: 'Ventana Seguridad Lama 4" 24x25 Acid Etched',
    description: 'Medida especial de almacén. Lama 4". Medidas: 24"×25". Acid Etched.',
    model: 'Lama 4"', color: 'Acid Etched',
    dimensions: { width: 24, height: 25, unit: 'in' },
    stock: 16, retailPrice: 0, unitCost: 0,
  },
  {
    sku: 'VS-L4-24X2500-BG',
    name: 'Ventana Seguridad Lama 4" 24x25 Blue Green',
    description: 'Medida especial de almacén. Lama 4". Medidas: 24"×25". Blue Green.',
    model: 'Lama 4"', color: 'Blue Green',
    dimensions: { width: 24, height: 25, unit: 'in' },
    stock: 4, retailPrice: 0, unitCost: 0,
  },
  {
    sku: 'VS-L4-24X5600-AE',
    name: 'Ventana Seguridad Lama 4" 24x56 Acid Etched',
    description: 'Medida especial de almacén. Lama 4". Medidas: 24"×56". Acid Etched.',
    model: 'Lama 4"', color: 'Acid Etched',
    dimensions: { width: 24, height: 56, unit: 'in' },
    stock: 6, retailPrice: 0, unitCost: 0,
  },
];

// ─── SECCIÓN 3: GLASS DOORS ───────────────────────────────────────────────────
// Precio dado = Costo de Fábrica. RetailPrice = 0 (por definir).

type GlassDoor = {
  sku: string;
  name: string;
  width: number;
  height: number;
  unitCost: number;
};

const GLASS_DOORS: GlassDoor[] = [
  { sku: 'GD-AE-L4-30X95', name: 'Glass Door AE Lama 4" 30x95', width: 30, height: 95, unitCost: 69.27 },
  { sku: 'GD-AE-L4-32X95', name: 'Glass Door AE Lama 4" 32x95', width: 32, height: 95, unitCost: 73.89 },
  { sku: 'GD-AE-L4-30X84', name: 'Glass Door AE Lama 4" 30x84', width: 30, height: 84, unitCost: 61.25 },
  { sku: 'GD-AE-L4-32X84', name: 'Glass Door AE Lama 4" 32x84', width: 32, height: 84, unitCost: 65.33 },
  { sku: 'GD-AE-L4-30X81', name: 'Glass Door AE Lama 4" 30x81', width: 30, height: 81, unitCost: 59.06 },
  { sku: 'GD-AE-L4-32X81', name: 'Glass Door AE Lama 4" 32x81', width: 32, height: 81, unitCost: 63.00 },
];

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  INTEGRACIÓN DATASET MAESTRO AUDITADO');
  console.log('═══════════════════════════════════════════════════════\n');

  // Obtener warehouse principal
  const warehouse = await db.warehouse.findFirst({
    where: { name: 'Almacén Principal' },
  });
  if (!warehouse) throw new Error('Almacén Principal no encontrado. Ejecuta el seed principal primero.');
  console.log(`✓ Warehouse: ${warehouse.name} (${warehouse.id})\n`);

  // Obtener categoría Ventanas de Seguridad
  const catVentanas = await db.category.findFirst({
    where: { slug: 'ventanas-seguridad' },
  });
  if (!catVentanas) throw new Error('Categoría ventanas-seguridad no encontrada.');

  // Obtener o crear categoría Puertas de Cristal
  let catPuertas = await db.category.findFirst({
    where: { OR: [{ slug: 'puertas-cristal' }, { name: 'Puertas de Cristal' }] },
  });
  if (!catPuertas) {
    catPuertas = await db.category.create({
      data: { name: 'Puertas de Cristal', slug: 'puertas-cristal' },
    });
    console.log('✓ Categoría creada: Puertas de Cristal\n');
  }

  let updatedPrices = 0;
  let createdLocations = 0;
  let createdProducts = 0;
  let skippedLocations = 0;

  // ── 1. Actualizar precios + crear ubicaciones: Lama 3 y Lama 4 ─────────────
  const allStockEntries = [...LAMA3_ENTRIES, ...LAMA4_ENTRIES];

  console.log(`── PASO 1: Actualizar precios y stock (${allStockEntries.length} entradas) ──`);

  for (const entry of allStockEntries) {
    const product = await db.product.findUnique({ where: { sku: entry.sku } });
    if (!product) {
      console.log(`  SKIP (no existe) ${entry.sku}`);
      continue;
    }

    // Actualizar precios
    await db.product.update({
      where: { sku: entry.sku },
      data: {
        retailPrice: entry.retailPrice,
        wholesalePrice: entry.retailPrice, // igual hasta que se defina precio mayorista
      },
    });
    updatedPrices++;

    // Crear o actualizar ProductLocation
    const existing = await db.productLocation.findUnique({
      where: { productId_warehouseId: { productId: product.id, warehouseId: warehouse.id } },
    });

    if (existing) {
      await db.productLocation.update({
        where: { id: existing.id },
        data: { quantityOnHand: entry.stock },
      });
      console.log(`  UPD   ${entry.sku}  → precio $${entry.retailPrice} · stock ${entry.stock}`);
      skippedLocations++;
    } else {
      await db.productLocation.create({
        data: {
          productId: product.id,
          warehouseId: warehouse.id,
          locationCode: 'ALMACEN-PRINCIPAL',
          quantityOnHand: entry.stock,
        },
      });
      console.log(`  OK    ${entry.sku}  → precio $${entry.retailPrice} · stock ${entry.stock}`);
      createdLocations++;
    }
  }

  // ── 2. Solo actualizar precios (sin stock auditado) ─────────────────────────
  const priceOnly = [...LAMA3_PRICE_ONLY, ...LAMA4_PRICE_ONLY];
  console.log(`\n── PASO 2: Actualizar solo precios (${priceOnly.length} entradas sin stock) ──`);
  for (const entry of priceOnly) {
    const product = await db.product.findUnique({ where: { sku: entry.sku } });
    if (!product) { console.log(`  SKIP ${entry.sku}`); continue; }
    await db.product.update({
      where: { sku: entry.sku },
      data: { retailPrice: entry.retailPrice, wholesalePrice: entry.retailPrice },
    });
    console.log(`  PRICE ${entry.sku}  → $${entry.retailPrice}`);
    updatedPrices++;
  }

  // ── 3. Crear productos especiales Lama 3" ───────────────────────────────────
  const allSpecial = [...LAMA3_SPECIAL, ...LAMA4_SPECIAL];
  console.log(`\n── PASO 3: Crear productos especiales de almacén (${allSpecial.length}) ──`);
  for (const p of allSpecial) {
    let product = await db.product.findUnique({ where: { sku: p.sku } });
    if (!product) {
      product = await db.product.create({
        data: {
          sku: p.sku,
          name: p.name,
          description: p.description,
          categoryId: catVentanas.id,
          dimensions: p.dimensions,
          color: p.color,
          model: p.model,
          type: 'Seguridad',
          unitCost: p.unitCost,
          retailPrice: p.retailPrice,
          wholesalePrice: p.retailPrice,
          minStock: 0,
        },
      });
      createdProducts++;
      console.log(`  NEW   ${p.sku}`);
    } else {
      console.log(`  EXIST ${p.sku}`);
    }

    if (p.stock > 0) {
      const loc = await db.productLocation.findUnique({
        where: { productId_warehouseId: { productId: product.id, warehouseId: warehouse.id } },
      });
      if (!loc) {
        await db.productLocation.create({
          data: {
            productId: product.id,
            warehouseId: warehouse.id,
            locationCode: 'ALMACEN-PRINCIPAL',
            quantityOnHand: p.stock,
          },
        });
        createdLocations++;
        console.log(`         → stock ${p.stock}`);
      } else {
        await db.productLocation.update({
          where: { id: loc.id },
          data: { quantityOnHand: p.stock },
        });
        console.log(`         → stock ${p.stock} (actualizado)`);
      }
    }
  }

  // ── 4. Glass Doors ──────────────────────────────────────────────────────────
  console.log(`\n── PASO 4: Crear Glass Doors (${GLASS_DOORS.length} productos) ──`);
  for (const gd of GLASS_DOORS) {
    let product = await db.product.findUnique({ where: { sku: gd.sku } });
    if (!product) {
      product = await db.product.create({
        data: {
          sku: gd.sku,
          name: gd.name,
          description: `Puerta de cristal jalousie. Tipo AE Lama 4". Medidas: ${gd.width}"×${gd.height}". Costo fábrica: $${gd.unitCost.toFixed(2)}. Precio de venta por definir.`,
          categoryId: catPuertas!.id,
          dimensions: { width: gd.width, height: gd.height, unit: 'in' },
          color: 'Acid Etched',
          model: 'Lama 4"',
          type: 'Glass Door',
          unitCost: gd.unitCost,
          retailPrice: 0,      // Por definir
          wholesalePrice: 0,   // Por definir
          minStock: 0,
        },
      });
      createdProducts++;
      console.log(`  NEW   ${gd.sku}  → costo fábrica $${gd.unitCost.toFixed(2)}`);
    } else {
      await db.product.update({
        where: { sku: gd.sku },
        data: { unitCost: gd.unitCost },
      });
      console.log(`  EXIST ${gd.sku}  → costo actualizado $${gd.unitCost.toFixed(2)}`);
    }

    // Stock = 1 para cada Glass Door
    const loc = await db.productLocation.findUnique({
      where: { productId_warehouseId: { productId: product.id, warehouseId: warehouse.id } },
    });
    if (!loc) {
      await db.productLocation.create({
        data: {
          productId: product.id,
          warehouseId: warehouse.id,
          locationCode: 'ALMACEN-PRINCIPAL',
          quantityOnHand: 1,
        },
      });
      createdLocations++;
    }
  }

  // ── RESUMEN ─────────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  RESUMEN');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Precios actualizados:       ${updatedPrices}`);
  console.log(`  Ubicaciones creadas:        ${createdLocations}`);
  console.log(`  Ubicaciones actualizadas:   ${skippedLocations}`);
  console.log(`  Productos nuevos creados:   ${createdProducts}`);
  console.log('═══════════════════════════════════════════════════════\n');
}

main()
  .catch((e) => { console.error('\n❌ ERROR:', e); process.exit(1); })
  .finally(() => db.$disconnect());
