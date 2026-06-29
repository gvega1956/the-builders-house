import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

// LO QUE TRANSCRIBIMOS DE LAS 2 CAPTURAS
const conteoFisico = {
  // Lama 4" AE
  'VS-L4-18X1700-AE': 32, 'VS-L4-18X2200-AE': 22, 'VS-L4-24X2175-AE': 0,
  'VS-L4-24X2500-AE': 2,  'VS-L4-24X2975-AE': 0,  'VS-L4-24X3775-AE': 29,
  'VS-L4-24X4575-AE': 54, 'VS-L4-24X5375-AE': 17, 'VS-L4-24X5775-AE': 25,
  'VS-L4-30X2175-AE': 0,  'VS-L4-30X2975-AE': 8,  'VS-L4-30X3775-AE': 1,
  'VS-L4-30X4575-AE': 80, 'VS-L4-30X5375-AE': 0,  'VS-L4-30X5775-AE': 0,
  'VS-L4-36X2175-AE': 0,  'VS-L4-36X2975-AE': 0,  'VS-L4-36X3775-AE': 0,
  'VS-L4-36X4575-AE': 0,  'VS-L4-36X5375-AE': 0,  'VS-L4-36X5775-AE': 54,
  // Lama 4" BG
  'VS-L4-18X1700-BG': 24, 'VS-L4-18X2200-BG': 11, 'VS-L4-24X2175-BG': 85,
  'VS-L4-24X2500-BG': 5,  'VS-L4-24X2975-BG': 140,'VS-L4-24X3775-BG': 26,
  'VS-L4-24X4575-BG': 0,  'VS-L4-24X5375-BG': 37, 'VS-L4-24X5775-BG': 64,
  'VS-L4-30X2175-BG': 21, 'VS-L4-30X2975-BG': 27, 'VS-L4-30X3775-BG': 22,
  'VS-L4-30X4575-BG': 157,'VS-L4-30X5375-BG': 7,  'VS-L4-30X5775-BG': 3,
  'VS-L4-36X2175-BG': 10, 'VS-L4-36X2975-BG': 39, 'VS-L4-36X3775-BG': 35,
  'VS-L4-36X4575-BG': 50, 'VS-L4-36X5375-BG': 0,  'VS-L4-36X5775-BG': 0,
  // Lama 3" AE
  'VS-L3-18X1600-AE': 3,  'VS-L3-24X2275-AE': 31, 'VS-L3-24X2500-AE': 10,
  'VS-L3-24X2575-AE': 10, 'VS-L3-24X2875-AE': 54, 'VS-L3-24X3775-AE': 36,
  'VS-L3-24X4675-AE': 67, 'VS-L3-24X5275-AE': 0,  'VS-L3-24X5875-AE': 102,
  'VS-L3-30X2275-AE': 16, 'VS-L3-30X2875-AE': 2,  'VS-L3-30X3775-AE': 13,
  'VS-L3-30X4675-AE': 210,'VS-L3-30X5275-AE': 29, 'VS-L3-30X5875-AE': 2,
  'VS-L3-36X2275-AE': 16, 'VS-L3-36X2875-AE': 27, 'VS-L3-36X3775-AE': 0,
  'VS-L3-36X4675-AE': 24, 'VS-L3-36X5275-AE': 15, 'VS-L3-36X5875-AE': 152,
  // Lama 3" BG
  'VS-L3-18X1600-BG': 9,  'VS-L3-24X2275-BG': 0,  'VS-L3-24X2875-BG': 16,
  'VS-L3-24X3775-BG': 5,  'VS-L3-24X4675-BG': 44, 'VS-L3-24X5275-BG': 15,
  'VS-L3-24X5875-BG': 16, 'VS-L3-30X2275-BG': 50, 'VS-L3-30X2875-BG': 54,
  'VS-L3-30X3775-BG': 55, 'VS-L3-30X4675-BG': 101,'VS-L3-30X5275-BG': 42,
  'VS-L3-30X5875-BG': 42, 'VS-L3-36X2275-BG': 9,  'VS-L3-36X2875-BG': 22,
  'VS-L3-36X3775-BG': 0,  'VS-L3-36X4675-BG': 0,  'VS-L3-36X5275-BG': 24,
  'VS-L3-36X5875-BG': 51
};

try {
  // Estado actual en BD para San Juan
  const enBD = await db.$queryRawUnsafe(`
    SELECT p.sku, pl."quantityOnHand"
    FROM product_locations pl
    JOIN products p ON p.id = pl."productId"
    JOIN warehouses w ON w.id = pl."warehouseId"
    WHERE w.name = 'San Juan'
  `);
  
  const enBDMap = {};
  enBD.forEach(r => enBDMap[r.sku] = r.quantityOnHand);
  
  let coinciden = 0, difieren = [], faltanEnBD = [], extraEnBD = [];
  let totalPapel = 0, totalBD = 0;
  
  // Comparar cada SKU del papel con lo que hay en BD
  for (const [sku, qtyPapel] of Object.entries(conteoFisico)) {
    totalPapel += qtyPapel;
    const qtyBD = enBDMap[sku];
    
    if (qtyBD === undefined) {
      faltanEnBD.push({ sku, qtyPapel });
    } else if (qtyBD === qtyPapel) {
      coinciden++;
    } else {
      difieren.push({ sku, qtyPapel, qtyBD, diff: qtyBD - qtyPapel });
    }
  }
  
  // Buscar SKUs que están en BD pero NO en el papel
  for (const [sku, qtyBD] of Object.entries(enBDMap)) {
    totalBD += qtyBD;
    if (!(sku in conteoFisico)) {
      extraEnBD.push({ sku, qtyBD });
    }
  }
  
  console.log('═══════════════════════════════════════════════════════');
  console.log('VALIDACIÓN CRUZADA — Papel vs BD (San Juan)');
  console.log('═══════════════════════════════════════════════════════\n');
  
  console.log(`📊 SKUs del papel: ${Object.keys(conteoFisico).length}`);
  console.log(`📊 SKUs en BD (SJ): ${Object.keys(enBDMap).length}\n`);
  
  console.log(`✅ Coinciden exactamente: ${coinciden}`);
  console.log(`⚠️  Difieren en cantidad: ${difieren.length}`);
  console.log(`❌ Faltan en BD (papel los tiene): ${faltanEnBD.length}`);
  console.log(`➕ Extra en BD (papel no los tiene): ${extraEnBD.length}\n`);
  
  if (difieren.length > 0) {
    console.log('━━━ Diferencias en cantidad ━━━');
    difieren.forEach(d => {
      const signo = d.diff > 0 ? '+' : '';
      console.log(`   ${d.sku.padEnd(22)} | Papel: ${String(d.qtyPapel).padStart(3)} | BD: ${String(d.qtyBD).padStart(3)} | Diff: ${signo}${d.diff}`);
    });
    console.log('');
  }
  
  if (faltanEnBD.length > 0) {
    console.log('━━━ SKUs en papel pero NO en BD (San Juan) ━━━');
    faltanEnBD.forEach(f => console.log(`   ${f.sku.padEnd(22)} | Papel: ${f.qtyPapel} u.`));
    console.log('');
  }
  
  if (extraEnBD.length > 0) {
    console.log('━━━ SKUs en BD pero NO en papel ━━━');
    extraEnBD.forEach(e => console.log(`   ${e.sku.padEnd(22)} | BD: ${e.qtyBD} u.`));
    console.log('');
  }
  
  console.log('━━━ TOTALES ━━━');
  console.log(`   Suma del papel:      ${totalPapel.toString().padStart(5)} unidades`);
  console.log(`   Suma en BD (SJ):     ${totalBD.toString().padStart(5)} unidades`);
  console.log(`   Diferencia:          ${(totalBD - totalPapel).toString().padStart(5)} unidades\n`);
  
  if (coinciden === Object.keys(conteoFisico).length && faltanEnBD.length === 0) {
    console.log('🎉 PERFECTO — Todo el conteo del papel está correctamente cargado en BD');
  } else {
    console.log('⚠️  Hay diferencias — revisar arriba');
  }
} catch (e) {
  console.error('Error:', e.message);
} finally {
  await db.$disconnect();
}
