/**
 * Elimina los 3 productos demo del seed inicial de producción.
 * Solo los elimina si no tienen movimientos ni facturas asociadas.
 */
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

const DEMO_SKUS = ['VEN-CR-3624-AL', 'VEN-BT-4836-BL', 'PUE-RD-8030-CB'];

async function main() {
  console.log('Eliminando productos demo...\n');

  for (const sku of DEMO_SKUS) {
    const product = await db.product.findUnique({
      where: { sku },
      include: { movements: true, invoiceItems: true, purchaseItems: true },
    });

    if (!product) {
      console.log(`  SKIP  ${sku}  → no existe`);
      continue;
    }

    if (product.movements.length > 0 || product.invoiceItems.length > 0 || product.purchaseItems.length > 0) {
      await db.product.update({ where: { sku }, data: { isActive: false } });
      console.log(`  DEACT ${sku}  → tiene movimientos, desactivado`);
      continue;
    }

    // Sin movimientos → eliminar location y producto
    await db.productLocation.deleteMany({ where: { productId: product.id } });
    await db.product.delete({ where: { sku } });
    console.log(`  DEL   ${sku}  → ${product.name}`);
  }

  console.log('\nListo.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
