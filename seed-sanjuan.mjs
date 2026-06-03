/**
 * SEED SAN JUAN — equivalente JS de prisma/seed-inventario-maestro.ts
 * Fuente: Inventario físico auditado San Juan + Factura No.30
 * 94 productos, ~2,175 unidades en San Juan
 */
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

function hcode(h) {
  return Math.round(h * 100).toString();
}
function skuV(lama, width, height, acabado) {
  return `VS-L${lama}-${width}X${hcode(height)}-${acabado}`;
}
function skuP(width, height) {
  return `PD-L4-${width}X${hcode(height)}-AE`;
}

const LAMA4 = [
  { width: 18, h: 17,    hd: '17',     ae: 32,  bg: 28 },
  { width: 18, h: 22,    hd: '22',     ae: 23,  bg: 10 },
  { width: 24, h: 21.75, hd: '21 3/4', ae: 46,  bg: 26 },
  { width: 24, h: 25,    hd: '25',     ae: 16,  bg: 4  },
  { width: 24, h: 29.75, hd: '29 3/4', ae: 1,   bg: 8  },
  { width: 24, h: 37.75, hd: '37 3/4', ae: 51,  bg: 26 },
  { width: 24, h: 45.75, hd: '45 3/4', ae: 105, bg: 96,  aeCost: 26.69 },
  { width: 24, h: 53.75, hd: '53 3/4', ae: 75,  bg: 50,  aeCost: 31.35 },
  { width: 24, h: 56,    hd: '56',     ae: 6,   bg: 0  },
  { width: 24, h: 57.75, hd: '57 3/4', ae: 22,  bg: 14 },
  { width: 30, h: 21.75, hd: '21 3/4', ae: 1,   bg: 23 },
  { width: 30, h: 29.75, hd: '29 3/4', ae: 6,   bg: 2  },
  { width: 30, h: 37.75, hd: '37 3/4', ae: 8,   bg: 25 },
  { width: 30, h: 45.75, hd: '45 3/4', ae: 87,  bg: 43 },
  { width: 30, h: 53.75, hd: '53 3/4', ae: 22,  bg: 31, aeCost: 39.19, bgCost: 39.19 },
  { width: 30, h: 57.75, hd: '57 3/4', ae: 0,   bg: 15 },
  { width: 36, h: 21.75, hd: '21 3/4', ae: 8,   bg: 13 },
  { width: 36, h: 29.75, hd: '29 3/4', ae: 7,   bg: 28 },
  { width: 36, h: 37.75, hd: '37 3/4', ae: 33,  bg: 20 },
  { width: 36, h: 45.75, hd: '45 3/4', ae: 0,   bg: 0  },
  { width: 36, h: 53.75, hd: '53 3/4', ae: 2,   bg: 0  },
  { width: 36, h: 57.75, hd: '57 3/4', ae: 62,  bg: 32, bgCost: 50.53 },
];

const LAMA3 = [
  { width: 18, h: 16,    hd: '16',     ae: 16,  bg: 0  },
  { width: 18, h: 16.75, hd: '16 3/4', ae: 30,  bg: 30, aeCost: 7.33, bgCost: 7.33 },
  { width: 24, h: 22.75, hd: '22 3/4', ae: 43,  bg: 0  },
  { width: 24, h: 28.75, hd: '28 3/4', ae: 67,  bg: 16 },
  { width: 24, h: 32,    hd: '32',     ae: 1,   bg: 0  },
  { width: 24, h: 37.75, hd: '37 3/4', ae: 0,   bg: 13 },
  { width: 24, h: 46.75, hd: '46 3/4', ae: 93,  bg: 28, aeCost: 27.27, bgCost: 27.27 },
  { width: 24, h: 47,    hd: '47',     ae: 1,   bg: 0  },
  { width: 24, h: 52.75, hd: '52 3/4', ae: 4,   bg: 13 },
  { width: 24, h: 58.75, hd: '58 3/4', ae: 62,  bg: 2  },
  { width: 30, h: 22.75, hd: '22 3/4', ae: 38,  bg: 30 },
  { width: 30, h: 28.75, hd: '28 3/4', ae: 3,   bg: 24 },
  { width: 30, h: 37.75, hd: '37 3/4', ae: 28,  bg: 22 },
  { width: 30, h: 46.75, hd: '46 3/4', ae: 65,  bg: 38 },
  { width: 30, h: 52.75, hd: '52 3/4', ae: 0,   bg: 40 },
  { width: 30, h: 58.75, hd: '58 3/4', ae: 26,  bg: 23 },
  { width: 36, h: 22.75, hd: '22 3/4', ae: 20,  bg: 14 },
  { width: 36, h: 28.75, hd: '28 3/4', ae: 0,   bg: 48 },
  { width: 36, h: 37.75, hd: '37 3/4', ae: 2,   bg: 1  },
  { width: 36, h: 46.75, hd: '46 3/4', ae: 0,   bg: 18 },
  { width: 36, h: 52.75, hd: '52 3/4', ae: 31,  bg: 14 },
  { width: 36, h: 58.75, hd: '58 3/4', ae: 104, bg: 54 },
];

const PUERTAS = [
  { width: 30, h: 81, hd: '81', stock: 1, cost: 59.06 },
  { width: 30, h: 84, hd: '84', stock: 1, cost: 61.25 },
  { width: 30, h: 95, hd: '95', stock: 1, cost: 69.27 },
  { width: 32, h: 81, hd: '81', stock: 1, cost: 63.00 },
  { width: 32, h: 84, hd: '84', stock: 1, cost: 65.33 },
  { width: 32, h: 95, hd: '95', stock: 1, cost: 73.89 },
];

async function main() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  SEED SAN JUAN — The Builder\'s House');
  console.log('═══════════════════════════════════════════════════════\n');

  // 1. Warehouses
  const sjWh = await db.warehouse.upsert({ where: { name: 'San Juan' }, update: {}, create: { name: 'San Juan' } });
  await db.warehouse.upsert({ where: { name: 'Negras' }, update: {}, create: { name: 'Negras' } });
  await db.warehouse.upsert({ where: { name: 'Ponce' }, update: {}, create: { name: 'Ponce' } });
  console.log(`✓ Warehouses — San Juan ID: ${sjWh.id}`);

  // 2. Categorías
  const catV = await db.category.upsert({ where: { slug: 'ventanas-de-seguridad' }, update: {}, create: { name: 'Ventanas de Seguridad', slug: 'ventanas-de-seguridad' } });
  const catP = await db.category.upsert({ where: { slug: 'puertas-cristal' }, update: {}, create: { name: 'Puertas de Cristal', slug: 'puertas-cristal' } });
  console.log(`✓ Categorías: ${catV.name}, ${catP.name}`);

  // 3-4. Ventanas
  let l4ae = 0, l4bg = 0, l3ae = 0, l3bg = 0, pTotal = 0;

  console.log('\n── Ventanas Lama 4" ──');
  for (const row of LAMA4) {
    for (const [ac, stock, cost] of [['AE', row.ae, row.aeCost ?? 0], ['BG', row.bg, row.bgCost ?? 0]]) {
      const sku = skuV('4', row.width, row.h, ac);
      const color = ac === 'AE' ? 'Acid Etched' : 'Blue Green';
      const name = `Ventana Seguridad Lama 4" ${row.width}x${row.hd} ${color}`;
      const dims = { width: row.width, height: row.h, heightDisplay: row.hd, unit: 'in' };

      const prod = await db.product.upsert({
        where: { sku },
        update: { unitCost: cost, dimensions: dims },
        create: { sku, name, categoryId: catV.id, color, model: 'Lama 4"', type: 'Ventana', unitCost: cost, retailPrice: 0, wholesalePrice: 0, minStock: 0, dimensions: dims },
      });
      await db.productLocation.upsert({
        where: { productId_warehouseId: { productId: prod.id, warehouseId: sjWh.id } },
        update: { quantityOnHand: stock },
        create: { productId: prod.id, warehouseId: sjWh.id, locationCode: 'PRINCIPAL', quantityOnHand: stock, reservedQuantity: 0 },
      });
      if (ac === 'AE') l4ae += stock; else l4bg += stock;
      console.log(`  ${stock > 0 ? 'OK' : '--'}  ${sku.padEnd(26)} ${String(stock).padStart(3)}`);
    }
  }

  console.log('\n── Ventanas Lama 3" ──');
  for (const row of LAMA3) {
    for (const [ac, stock, cost] of [['AE', row.ae, row.aeCost ?? 0], ['BG', row.bg, row.bgCost ?? 0]]) {
      const sku = skuV('3', row.width, row.h, ac);
      const color = ac === 'AE' ? 'Acid Etched' : 'Blue Green';
      const name = `Ventana Seguridad Lama 3" ${row.width}x${row.hd} ${color}`;
      const dims = { width: row.width, height: row.h, heightDisplay: row.hd, unit: 'in' };

      const prod = await db.product.upsert({
        where: { sku },
        update: { unitCost: cost, dimensions: dims },
        create: { sku, name, categoryId: catV.id, color, model: 'Lama 3"', type: 'Ventana', unitCost: cost, retailPrice: 0, wholesalePrice: 0, minStock: 0, dimensions: dims },
      });
      await db.productLocation.upsert({
        where: { productId_warehouseId: { productId: prod.id, warehouseId: sjWh.id } },
        update: { quantityOnHand: stock },
        create: { productId: prod.id, warehouseId: sjWh.id, locationCode: 'PRINCIPAL', quantityOnHand: stock, reservedQuantity: 0 },
      });
      if (ac === 'AE') l3ae += stock; else l3bg += stock;
      console.log(`  ${stock > 0 ? 'OK' : '--'}  ${sku.padEnd(26)} ${String(stock).padStart(3)}`);
    }
  }

  console.log('\n── Puertas de Cristal ──');
  for (const row of PUERTAS) {
    const sku = skuP(row.width, row.h);
    const name = `Puerta Cristal Lama 4" ${row.width}x${row.hd} Acid Etched`;
    const dims = { width: row.width, height: row.h, heightDisplay: row.hd, unit: 'in' };

    const prod = await db.product.upsert({
      where: { sku },
      update: { unitCost: row.cost, dimensions: dims },
      create: { sku, name, categoryId: catP.id, color: 'Acid Etched', model: 'Lama 4"', type: 'Puerta', unitCost: row.cost, retailPrice: 0, wholesalePrice: 0, minStock: 0, dimensions: dims },
    });
    await db.productLocation.upsert({
      where: { productId_warehouseId: { productId: prod.id, warehouseId: sjWh.id } },
      update: { quantityOnHand: row.stock },
      create: { productId: prod.id, warehouseId: sjWh.id, locationCode: 'PRINCIPAL', quantityOnHand: row.stock, reservedQuantity: 0 },
    });
    pTotal += row.stock;
    console.log(`  OK   ${sku.padEnd(26)} ${row.stock}  costo=$${row.cost.toFixed(2)}`);
  }

  // Validación
  const EXPECTED = { L4AE: 613, L4BG: 494, L3AE: 634, L3BG: 428, P: 6, TOTAL: 2175 };
  const grand = l4ae + l4bg + l3ae + l3bg + pTotal;
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  VALIDACIÓN');
  console.log('═══════════════════════════════════════════════════════');
  const chk = (l, got, exp) => console.log(`  ${got === exp ? '✓' : '✗'} ${l.padEnd(28)} ${String(got).padStart(5)} / ${exp}${got !== exp ? ` (diff: ${got-exp > 0 ? '+' : ''}${got-exp})` : ''}`);
  chk('L4 AE', l4ae, EXPECTED.L4AE);
  chk('L4 BG', l4bg, EXPECTED.L4BG);
  chk('L3 AE', l3ae, EXPECTED.L3AE);
  chk('L3 BG', l3bg, EXPECTED.L3BG);
  chk('Puertas', pTotal, EXPECTED.P);
  chk('GRAN TOTAL', grand, EXPECTED.TOTAL);

  // Estado final
  const stats = await db.$queryRawUnsafe(`
    SELECT w.name, COUNT(pl.id)::int AS locs, COALESCE(SUM(pl."quantityOnHand"),0)::int AS units
    FROM warehouses w
    LEFT JOIN product_locations pl ON pl."warehouseId" = w.id
    GROUP BY w.name ORDER BY w.name
  `);
  const totalProds = await db.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM products`);
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  ESTADO FINAL');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Productos en catálogo: ${totalProds[0].n}`);
  stats.forEach(s => console.log(`  ${s.name}: ${s.locs} ubicaciones, ${s.units} unidades`));
  console.log(grand === EXPECTED.TOTAL ? '\n  ✅ SAN JUAN CARGADO CORRECTAMENTE\n' : '\n  ⚠️  DISCREPANCIA — revisar datos\n');
}

main()
  .catch(e => { console.error('❌ ERROR:', e.message); process.exit(1); })
  .finally(() => db.$disconnect());
