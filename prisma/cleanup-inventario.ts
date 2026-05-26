/**
 * LIMPIEZA TOTAL DE INVENTARIO
 * ==============================
 * Elimina todos los productos, ubicaciones, movimientos, categorías y almacenes.
 * Preserva: usuarios, clientes, configuración del sistema, secuencias, auditoría.
 *
 * Ejecutar ANTES de seed-inventario-maestro.ts
 */

import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

async function main() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  LIMPIEZA DE INVENTARIO — The Builder\'s House');
  console.log('═══════════════════════════════════════════════════════\n');

  // Obtener todos los IDs de productos
  const products = await db.product.findMany({ select: { id: true, sku: true } });
  const productIds = products.map((p) => p.id);
  console.log(`  Productos encontrados: ${productIds.length}`);

  if (productIds.length === 0) {
    console.log('  No hay productos. Saltando limpieza de datos relacionados.\n');
  } else {
    // 1. Conteos cíclicos (referencian productId y locationId)
    const delCC = await db.cycleCount.deleteMany({
      where: { productId: { in: productIds } },
    });
    console.log(`  ✓ Conteos cíclicos eliminados:        ${delCC.count}`);

    // 2. Líneas de órdenes de compra
    const delPOI = await db.purchaseOrderItem.deleteMany({
      where: { productId: { in: productIds } },
    });
    console.log(`  ✓ Líneas de compra eliminadas:        ${delPOI.count}`);

    // 3. Movimientos de inventario
    const delMov = await db.inventoryMovement.deleteMany({
      where: { productId: { in: productIds } },
    });
    console.log(`  ✓ Movimientos eliminados:             ${delMov.count}`);

    // 4. Líneas de factura (FK sin cascade en productId)
    //    Primero identificamos las facturas afectadas para limpiarlas si quedan vacías
    const affectedInvoiceIds = [
      ...new Set(
        (
          await db.invoiceItem.findMany({
            where: { productId: { in: productIds } },
            select: { invoiceId: true },
          })
        ).map((i) => i.invoiceId),
      ),
    ];

    const delII = await db.invoiceItem.deleteMany({
      where: { productId: { in: productIds } },
    });
    console.log(`  ✓ Líneas de factura eliminadas:       ${delII.count}`);

    // 4b. Eliminar facturas que quedaron sin ítems (eran de prueba)
    let deletedInvoices = 0;
    for (const invoiceId of affectedInvoiceIds) {
      const remaining = await db.invoiceItem.count({ where: { invoiceId } });
      if (remaining === 0) {
        await db.payment.deleteMany({ where: { invoiceId } });
        await db.invoice.delete({ where: { id: invoiceId } });
        deletedInvoices++;
      }
    }
    if (deletedInvoices > 0) {
      console.log(`  ✓ Facturas vacías eliminadas:         ${deletedInvoices}`);
    }

    // 5. Ubicaciones de producto
    const delLoc = await db.productLocation.deleteMany({
      where: { productId: { in: productIds } },
    });
    console.log(`  ✓ Ubicaciones eliminadas:             ${delLoc.count}`);

    // 6. Productos
    const delProd = await db.product.deleteMany({
      where: { id: { in: productIds } },
    });
    console.log(`  ✓ Productos eliminados:               ${delProd.count}`);
  }

  // 7. Categorías de inventario
  const delCat = await db.category.deleteMany();
  console.log(`  ✓ Categorías eliminadas:              ${delCat.count}`);

  // 8. Almacenes
  const delWH = await db.warehouse.deleteMany();
  console.log(`  ✓ Almacenes eliminados:               ${delWH.count}`);

  console.log('\n  ✅ Limpieza completada. Listo para seed-inventario-maestro.ts');
  console.log('═══════════════════════════════════════════════════════\n');
}

main()
  .catch((e) => {
    console.error('\n❌ ERROR:', e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
