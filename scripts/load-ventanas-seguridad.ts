/**
 * Carga masiva: 72 SKUs Ventanas de Seguridad
 * Línea LAMA 4" (18 medidas) + LAMA 3" (18 medidas)
 * Acabados: Acid Etched (AE), Blue Green (BG)
 * Stock inicial: 0
 * Sin precios
 *
 * Decisión: Camino A (productos planos) — ver TD-010
 * SKU con ¾ Unicode — ver TD-011
 *
 * Ejecutar: npx tsx scripts/load-ventanas-seguridad.ts
 */

import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

const LAMA_4_MEDIDAS = [
  { skuPart: '24x21¾', label: '24x21¾' },
  { skuPart: '24x29¾', label: '24x29¾' },
  { skuPart: '24x37¾', label: '24x37¾' },
  { skuPart: '24x45¾', label: '24x45¾' },
  { skuPart: '24x53¾', label: '24x53¾' },
  { skuPart: '24x57¾', label: '24x57¾' },
  { skuPart: '30x21¾', label: '30x21¾' },
  { skuPart: '30x29¾', label: '30x29¾' },
  { skuPart: '30x37¾', label: '30x37¾' },
  { skuPart: '30x45¾', label: '30x45¾' },
  { skuPart: '30x53¾', label: '30x53¾' },
  { skuPart: '30x57¾', label: '30x57¾' },
  { skuPart: '36x21¾', label: '36x21¾' },
  { skuPart: '36x29¾', label: '36x29¾' },
  { skuPart: '36x37¾', label: '36x37¾' },
  { skuPart: '36x45¾', label: '36x45¾' },
  { skuPart: '36x53¾', label: '36x53¾' },
  { skuPart: '36x57¾', label: '36x57¾' },
];

const LAMA_3_MEDIDAS = [
  { skuPart: '24x22¾', label: '24x22¾' },
  { skuPart: '24x28¾', label: '24x28¾' },
  { skuPart: '24x37¾', label: '24x37¾' },
  { skuPart: '24x46¾', label: '24x46¾' },
  { skuPart: '24x52¾', label: '24x52¾' },
  { skuPart: '24x58¾', label: '24x58¾' },
  { skuPart: '30x22¾', label: '30x22¾' },
  { skuPart: '30x28¾', label: '30x28¾' },
  { skuPart: '30x37¾', label: '30x37¾' },
  { skuPart: '30x46¾', label: '30x46¾' },
  { skuPart: '30x52¾', label: '30x52¾' },
  { skuPart: '30x58¾', label: '30x58¾' },
  { skuPart: '36x22¾', label: '36x22¾' },
  { skuPart: '36x28¾', label: '36x28¾' },
  { skuPart: '36x37¾', label: '36x37¾' },
  { skuPart: '36x46¾', label: '36x46¾' },
  { skuPart: '36x52¾', label: '36x52¾' },
  { skuPart: '36x58¾', label: '36x58¾' },
];

const ACABADOS = [
  { code: 'AE', name: 'Acid Etched' },
  { code: 'BG', name: 'Blue Green' },
];

async function main() {
  console.log('🚀 Iniciando carga masiva — Ventanas de Seguridad\n');

  // 1. Crear o encontrar categoría
  const categoria = await db.category.upsert({
    where: { slug: 'ventanas-de-seguridad' },
    create: {
      name: 'Ventanas de Seguridad',
      slug: 'ventanas-de-seguridad',
      isActive: true,
    },
    update: {},
  });
  console.log(`✓ Categoría: ${categoria.name} (id: ${categoria.id})`);

  // 2. Encontrar o crear almacén
  let almacen = await db.warehouse.findFirst({
    where: { name: { contains: 'Principal', mode: 'insensitive' } },
  });
  if (!almacen) {
    almacen = await db.warehouse.create({
      data: { name: 'Almacén Principal', isActive: true },
    });
  }
  console.log(`✓ Almacén: ${almacen.name} (id: ${almacen.id})\n`);

  // 3. Construir lista
  type ProductoData = { sku: string; name: string; line: 'L4' | 'L3'; finish: string };
  const productos: ProductoData[] = [];

  for (const medida of LAMA_4_MEDIDAS) {
    for (const acabado of ACABADOS) {
      productos.push({
        sku: `VS-L4-${medida.skuPart}-${acabado.code}`,
        name: `Ventana Seguridad Lama 4" ${medida.label} ${acabado.name}`,
        line: 'L4',
        finish: acabado.name,
      });
    }
  }

  for (const medida of LAMA_3_MEDIDAS) {
    for (const acabado of ACABADOS) {
      productos.push({
        sku: `VS-L3-${medida.skuPart}-${acabado.code}`,
        name: `Ventana Seguridad Lama 3" ${medida.label} ${acabado.name}`,
        line: 'L3',
        finish: acabado.name,
      });
    }
  }

  console.log(`✓ Lista construida: ${productos.length} productos esperados\n`);

  // 4. Insertar
  let created = 0;
  let skipped = 0;
  const errors: { sku: string; error: string }[] = [];

  for (const p of productos) {
    try {
      const existing = await db.product.findUnique({ where: { sku: p.sku } });
      if (existing) {
        skipped++;
        continue;
      }

      await db.$transaction(async (tx) => {
        const product = await tx.product.create({
          data: {
            sku: p.sku,
            name: p.name,
            categoryId: categoria.id,
            unitCost: 0,
            retailPrice: 0,
            wholesalePrice: 0,
            isActive: true,
          },
        });

        await tx.productLocation.create({
          data: {
            productId: product.id,
            warehouseId: almacen!.id,
            locationCode: 'ALMACEN-PRINCIPAL',
            quantityOnHand: 0,
            reservedQuantity: 0,
          },
        });
      });

      created++;
      if (created % 10 === 0) {
        console.log(`  ... ${created}/${productos.length} cargados`);
      }
    } catch (e: unknown) {
      errors.push({ sku: p.sku, error: String(e) });
    }
  }

  console.log(`\n✅ Carga completada:`);
  console.log(`   Creados:            ${created}`);
  console.log(`   Existentes (skip):  ${skipped}`);
  console.log(`   Errores:            ${errors.length}`);
  console.log(`   Total esperado:     72`);

  if (errors.length > 0) {
    console.log(`\n⚠️  Errores detectados:`);
    for (const e of errors) console.log(`   ${e.sku}: ${e.error.slice(0, 120)}`);
  }

  // 5. Verificación final
  const totalEnCategoria = await db.product.count({
    where: { categoryId: categoria.id },
  });
  const totalLocations = await db.productLocation.count({
    where: { warehouseId: almacen!.id, locationCode: 'ALMACEN-PRINCIPAL' },
  });
  console.log(`\n📊 Verificación final:`);
  console.log(`   Productos en "Ventanas de Seguridad": ${totalEnCategoria}`);
  console.log(`   Ubicaciones en ALMACEN-PRINCIPAL:     ${totalLocations}`);

  if (totalEnCategoria !== 72 || totalLocations !== 72) {
    console.log(`\n❌ ADVERTENCIA: conteo no es 72/72 — revisar errores arriba`);
    process.exit(1);
  }

  console.log(`\n🎉 72 productos cargados correctamente.`);
}

main()
  .catch((e) => {
    console.error('❌ Error fatal:', e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
