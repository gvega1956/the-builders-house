/**
 * Seed: Conteo inventario Ponce — 28/05/2026
 * Idempotente: seguro de ejecutar múltiples veces.
 * Crea productos nuevos, actualiza existencias en Ponce, no toca otras sucursales.
 */
import { readFileSync } from 'fs';

// Load .env — ONLY for variables not already set by the shell.
// This lets $env:DATABASE_URL (production) take precedence over .env (local).
const envFile = readFileSync('.env', 'utf-8');
for (const line of envFile.split('\n')) {
  const [key, ...rest] = line.split('=');
  if (key?.trim() && rest.length && !process.env[key.trim()]) {
    process.env[key.trim()] = rest.join('=').trim().replace(/^["']|["']$/g, '');
  }
}

const dbUrl = process.env.DATABASE_URL ?? '';
const isLocal = dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1');
console.log(`Base de datos: ${isLocal ? '⚠️  LOCAL (dev)' : '🟢 PRODUCCIÓN'}`);
console.log(`Host: ${dbUrl.replace(/:[^:@]+@/, ':***@').split('/').slice(0,3).join('/')}\n`);

const { PrismaClient } = await import('@prisma/client');
const db = new PrismaClient();

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const catVentana = await db.category.findFirst({ where: { name: 'Ventanas de Seguridad' } });
// Crear "Puertas de Cristal" si no existe
const catPuerta = await db.category.upsert({
  where: { slug: 'puertas-cristal' },
  update: {},
  create: { name: 'Puertas de Cristal', slug: 'puertas-cristal' },
});
const warehouse  = await db.warehouse.findFirst({ where: { name: 'Ponce' } });
const supplier   = await db.supplier.findFirst();
const adminUser  = await db.user.findFirst({ where: { OR: [{ role: 'ADMIN' }, { role: 'MANAGER' }] } });

if (!catVentana) throw new Error('Categoría "Ventanas de Seguridad" no encontrada. Verifica el seed.');
if (!warehouse)  throw new Error('Almacén "Ponce" no encontrado. Créalo en Settings antes de continuar.');
if (!adminUser)  throw new Error('No hay usuario ADMIN o MANAGER en el sistema.');

console.log('✓ Categoría Ventanas:', catVentana.id);
console.log('✓ Categoría Puertas: ', catPuerta.id);
console.log('✓ Almacén Ponce:     ', warehouse.id);
console.log('✓ Usuario:           ', adminUser.email);
console.log('');

// ─── Catálogo completo ────────────────────────────────────────────────────────

const INVENTORY = [
  // ── LAMA 3" ACID ETCHED ───────────────────────────────────────────────────
  { sku: 'VS-L3-24X2275-AE', name: 'Ventana de Seguridad Lama 3" 24x22 3/4 Acid Etched', qty: 27 },
  { sku: 'VS-L3-24X2875-AE', name: 'Ventana de Seguridad Lama 3" 24x28 3/4 Acid Etched', qty: 14 },
  { sku: 'VS-L3-24X3775-AE', name: 'Ventana de Seguridad Lama 3" 24x37 3/4 Acid Etched', qty: 12 },
  { sku: 'VS-L3-24X4675-AE', name: 'Ventana de Seguridad Lama 3" 24x46 3/4 Acid Etched', qty: 21 },
  { sku: 'VS-L3-24X5275-AE', name: 'Ventana de Seguridad Lama 3" 24x52 3/4 Acid Etched', qty: 19 },
  { sku: 'VS-L3-24X5875-AE', name: 'Ventana de Seguridad Lama 3" 24x58 3/4 Acid Etched', qty: 30 },
  { sku: 'VS-L3-30X2875-AE', name: 'Ventana de Seguridad Lama 3" 30x28 3/4 Acid Etched', qty: 17 },
  { sku: 'VS-L3-30X3775-AE', name: 'Ventana de Seguridad Lama 3" 30x37 3/4 Acid Etched', qty: 17 },
  { sku: 'VS-L3-30X4675-AE', name: 'Ventana de Seguridad Lama 3" 30x46 3/4 Acid Etched', qty: 36 },
  { sku: 'VS-L3-30X5275-AE', name: 'Ventana de Seguridad Lama 3" 30x52 3/4 Acid Etched', qty: 12 },
  { sku: 'VS-L3-36X2275-AE', name: 'Ventana de Seguridad Lama 3" 36x22 3/4 Acid Etched', qty: 14 },
  { sku: 'VS-L3-36X2875-AE', name: 'Ventana de Seguridad Lama 3" 36x28 3/4 Acid Etched', qty:  2 },
  { sku: 'VS-L3-36X4675-AE', name: 'Ventana de Seguridad Lama 3" 36x46 3/4 Acid Etched', qty:  4 },
  { sku: 'VS-L3-36X5275-AE', name: 'Ventana de Seguridad Lama 3" 36x52 3/4 Acid Etched', qty: 21 },
  { sku: 'VS-L3-36X5875-AE', name: 'Ventana de Seguridad Lama 3" 36x58 3/4 Acid Etched', qty: 71 },

  // ── LAMA 3" BLUE GREEN ────────────────────────────────────────────────────
  { sku: 'VS-L3-24X2275-BG', name: 'Ventana de Seguridad Lama 3" 24x22 3/4 Blue Green', qty: 11 },
  { sku: 'VS-L3-24X2875-BG', name: 'Ventana de Seguridad Lama 3" 24x28 3/4 Blue Green', qty: 22 },
  { sku: 'VS-L3-24X3775-BG', name: 'Ventana de Seguridad Lama 3" 24x37 3/4 Blue Green', qty:  8 },
  { sku: 'VS-L3-24X4675-BG', name: 'Ventana de Seguridad Lama 3" 24x46 3/4 Blue Green', qty: 15 },
  { sku: 'VS-L3-24X5275-BG', name: 'Ventana de Seguridad Lama 3" 24x52 3/4 Blue Green', qty: 33 },
  { sku: 'VS-L3-24X5875-BG', name: 'Ventana de Seguridad Lama 3" 24x58 3/4 Blue Green', qty:  8 },
  { sku: 'VS-L3-30X2275-BG', name: 'Ventana de Seguridad Lama 3" 30x22 3/4 Blue Green', qty: 26 },
  { sku: 'VS-L3-30X2875-BG', name: 'Ventana de Seguridad Lama 3" 30x28 3/4 Blue Green', qty:  5 },
  { sku: 'VS-L3-30X3775-BG', name: 'Ventana de Seguridad Lama 3" 30x37 3/4 Blue Green', qty: 33 },
  { sku: 'VS-L3-30X4675-BG', name: 'Ventana de Seguridad Lama 3" 30x46 3/4 Blue Green', qty: 60 },
  { sku: 'VS-L3-30X5875-BG', name: 'Ventana de Seguridad Lama 3" 30x58 3/4 Blue Green', qty: 25 },
  { sku: 'VS-L3-36X2275-BG', name: 'Ventana de Seguridad Lama 3" 36x22 3/4 Blue Green', qty: 34 },
  { sku: 'VS-L3-36X2875-BG', name: 'Ventana de Seguridad Lama 3" 36x28 3/4 Blue Green', qty: 28 },
  { sku: 'VS-L3-36X3775-BG', name: 'Ventana de Seguridad Lama 3" 36x37 3/4 Blue Green', qty:  9 },
  { sku: 'VS-L3-36X4675-BG', name: 'Ventana de Seguridad Lama 3" 36x46 3/4 Blue Green', qty:  3 },
  { sku: 'VS-L3-36X5275-BG', name: 'Ventana de Seguridad Lama 3" 36x52 3/4 Blue Green', qty: 19 },
  { sku: 'VS-L3-36X5875-BG', name: 'Ventana de Seguridad Lama 3" 36x58 3/4 Blue Green', qty: 25 },

  // ── LAMA 4" ACID ETCHED ───────────────────────────────────────────────────
  { sku: 'VS-L4-24X2175-AE', name: 'Ventana de Seguridad Lama 4" 24x21 3/4 Acid Etched', qty: 16 },
  { sku: 'VS-L4-24X3775-AE', name: 'Ventana de Seguridad Lama 4" 24x37 3/4 Acid Etched', qty: 25 },
  { sku: 'VS-L4-24X5375-AE', name: 'Ventana de Seguridad Lama 4" 24x53 3/4 Acid Etched', qty: 53 },
  { sku: 'VS-L4-24X5775-AE', name: 'Ventana de Seguridad Lama 4" 24x57 3/4 Acid Etched', qty: 40 },
  { sku: 'VS-L4-30X2175-AE', name: 'Ventana de Seguridad Lama 4" 30x21 3/4 Acid Etched', qty:  8 },
  { sku: 'VS-L4-30X2975-AE', name: 'Ventana de Seguridad Lama 4" 30x29 3/4 Acid Etched', qty:  2 },
  { sku: 'VS-L4-30X3775-AE', name: 'Ventana de Seguridad Lama 4" 30x37 3/4 Acid Etched', qty:  3 },
  { sku: 'VS-L4-30X4575-AE', name: 'Ventana de Seguridad Lama 4" 30x45 3/4 Acid Etched', qty: 42 },
  { sku: 'VS-L4-30X5375-AE', name: 'Ventana de Seguridad Lama 4" 30x53 3/4 Acid Etched', qty:  2 },
  { sku: 'VS-L4-36X2175-AE', name: 'Ventana de Seguridad Lama 4" 36x21 3/4 Acid Etched', qty: 12 },
  { sku: 'VS-L4-36X2975-AE', name: 'Ventana de Seguridad Lama 4" 36x29 3/4 Acid Etched', qty:  6 },
  { sku: 'VS-L4-36X3775-AE', name: 'Ventana de Seguridad Lama 4" 36x37 3/4 Acid Etched', qty:  2 },
  { sku: 'VS-L4-36X5375-AE', name: 'Ventana de Seguridad Lama 4" 36x53 3/4 Acid Etched', qty:  8 },
  { sku: 'VS-L4-36X5775-AE', name: 'Ventana de Seguridad Lama 4" 36x57 3/4 Acid Etched', qty: 10 },

  // ── LAMA 4" BLUE GREEN ────────────────────────────────────────────────────
  { sku: 'VS-L4-24X2175-BG', name: 'Ventana de Seguridad Lama 4" 24x21 3/4 Blue Green', qty: 13 },
  { sku: 'VS-L4-24X2975-BG', name: 'Ventana de Seguridad Lama 4" 24x29 3/4 Blue Green', qty: 20 },
  { sku: 'VS-L4-24X3775-BG', name: 'Ventana de Seguridad Lama 4" 24x37 3/4 Blue Green', qty: 16 },
  { sku: 'VS-L4-24X4575-BG', name: 'Ventana de Seguridad Lama 4" 24x45 3/4 Blue Green', qty: 10 },
  { sku: 'VS-L4-24X5775-BG', name: 'Ventana de Seguridad Lama 4" 24x57 3/4 Blue Green', qty: 49 },
  { sku: 'VS-L4-30X2175-BG', name: 'Ventana de Seguridad Lama 4" 30x21 3/4 Blue Green', qty: 19 },
  { sku: 'VS-L4-30X2975-BG', name: 'Ventana de Seguridad Lama 4" 30x29 3/4 Blue Green', qty: 43 },
  { sku: 'VS-L4-30X3775-BG', name: 'Ventana de Seguridad Lama 4" 30x37 3/4 Blue Green', qty: 31 },
  { sku: 'VS-L4-30X4575-BG', name: 'Ventana de Seguridad Lama 4" 30x45 3/4 Blue Green', qty:  5 },
  { sku: 'VS-L4-30X5375-BG', name: 'Ventana de Seguridad Lama 4" 30x53 3/4 Blue Green', qty: 39 },
  { sku: 'VS-L4-30X5775-BG', name: 'Ventana de Seguridad Lama 4" 30x57 3/4 Blue Green', qty: 19 },
  { sku: 'VS-L4-36X2175-BG', name: 'Ventana de Seguridad Lama 4" 36x21 3/4 Blue Green', qty: 11 },
  { sku: 'VS-L4-36X2975-BG', name: 'Ventana de Seguridad Lama 4" 36x29 3/4 Blue Green', qty: 16 },
  { sku: 'VS-L4-36X5375-BG', name: 'Ventana de Seguridad Lama 4" 36x53 3/4 Blue Green', qty:  5 },
  { sku: 'VS-L4-36X5775-BG', name: 'Ventana de Seguridad Lama 4" 36x57 3/4 Blue Green', qty:  5 },

  // ── LAMA 3" BLACK (qty 0 — catálogo sin stock) ────────────────────────────
  { sku: 'VS-L3-24X2275-BK', name: 'Ventana de Seguridad Lama 3" 24x22 3/4 Black', qty: 0 },
  { sku: 'VS-L3-24X2875-BK', name: 'Ventana de Seguridad Lama 3" 24x28 3/4 Black', qty: 0 },
  { sku: 'VS-L3-24X3775-BK', name: 'Ventana de Seguridad Lama 3" 24x37 3/4 Black', qty: 0 },
  { sku: 'VS-L3-24X4675-BK', name: 'Ventana de Seguridad Lama 3" 24x46 3/4 Black', qty: 0 },
  { sku: 'VS-L3-24X5275-BK', name: 'Ventana de Seguridad Lama 3" 24x52 3/4 Black', qty: 0 },
  { sku: 'VS-L3-24X5875-BK', name: 'Ventana de Seguridad Lama 3" 24x58 3/4 Black', qty: 0 },
  { sku: 'VS-L3-30X2275-BK', name: 'Ventana de Seguridad Lama 3" 30x22 3/4 Black', qty: 0 },
  { sku: 'VS-L3-30X2875-BK', name: 'Ventana de Seguridad Lama 3" 30x28 3/4 Black', qty: 0 },
  { sku: 'VS-L3-30X3775-BK', name: 'Ventana de Seguridad Lama 3" 30x37 3/4 Black', qty: 0 },
  { sku: 'VS-L3-30X4675-BK', name: 'Ventana de Seguridad Lama 3" 30x46 3/4 Black', qty: 0 },
  { sku: 'VS-L3-30X5275-BK', name: 'Ventana de Seguridad Lama 3" 30x52 3/4 Black', qty: 0 },
  { sku: 'VS-L3-30X5875-BK', name: 'Ventana de Seguridad Lama 3" 30x58 3/4 Black', qty: 0 },
  { sku: 'VS-L3-36X2275-BK', name: 'Ventana de Seguridad Lama 3" 36x22 3/4 Black', qty: 0 },
  { sku: 'VS-L3-36X2875-BK', name: 'Ventana de Seguridad Lama 3" 36x28 3/4 Black', qty: 0 },
  { sku: 'VS-L3-36X3775-BK', name: 'Ventana de Seguridad Lama 3" 36x37 3/4 Black', qty: 0 },
  { sku: 'VS-L3-36X4675-BK', name: 'Ventana de Seguridad Lama 3" 36x46 3/4 Black', qty: 0 },
  { sku: 'VS-L3-36X5275-BK', name: 'Ventana de Seguridad Lama 3" 36x52 3/4 Black', qty: 0 },
  { sku: 'VS-L3-36X5875-BK', name: 'Ventana de Seguridad Lama 3" 36x58 3/4 Black', qty: 0 },

  // ── LAMA 4" BLACK (qty 0 — catálogo sin stock) ────────────────────────────
  { sku: 'VS-L4-24X2175-BK', name: 'Ventana de Seguridad Lama 4" 24x21 3/4 Black', qty: 0 },
  { sku: 'VS-L4-24X2975-BK', name: 'Ventana de Seguridad Lama 4" 24x29 3/4 Black', qty: 0 },
  { sku: 'VS-L4-24X3775-BK', name: 'Ventana de Seguridad Lama 4" 24x37 3/4 Black', qty: 0 },
  { sku: 'VS-L4-24X4575-BK', name: 'Ventana de Seguridad Lama 4" 24x45 3/4 Black', qty: 0 },
  { sku: 'VS-L4-24X5375-BK', name: 'Ventana de Seguridad Lama 4" 24x53 3/4 Black', qty: 0 },
  { sku: 'VS-L4-24X5775-BK', name: 'Ventana de Seguridad Lama 4" 24x57 3/4 Black', qty: 0 },
  { sku: 'VS-L4-30X2175-BK', name: 'Ventana de Seguridad Lama 4" 30x21 3/4 Black', qty: 0 },
  { sku: 'VS-L4-30X2975-BK', name: 'Ventana de Seguridad Lama 4" 30x29 3/4 Black', qty: 0 },
  { sku: 'VS-L4-30X3775-BK', name: 'Ventana de Seguridad Lama 4" 30x37 3/4 Black', qty: 0 },
  { sku: 'VS-L4-30X4575-BK', name: 'Ventana de Seguridad Lama 4" 30x45 3/4 Black', qty: 0 },
  { sku: 'VS-L4-30X5375-BK', name: 'Ventana de Seguridad Lama 4" 30x53 3/4 Black', qty: 0 },
  { sku: 'VS-L4-30X5775-BK', name: 'Ventana de Seguridad Lama 4" 30x57 3/4 Black', qty: 0 },
  { sku: 'VS-L4-36X2175-BK', name: 'Ventana de Seguridad Lama 4" 36x21 3/4 Black', qty: 0 },
  { sku: 'VS-L4-36X2975-BK', name: 'Ventana de Seguridad Lama 4" 36x29 3/4 Black', qty: 0 },
  { sku: 'VS-L4-36X3775-BK', name: 'Ventana de Seguridad Lama 4" 36x37 3/4 Black', qty: 0 },
  { sku: 'VS-L4-36X4575-BK', name: 'Ventana de Seguridad Lama 4" 36x45 3/4 Black', qty: 0 },
  { sku: 'VS-L4-36X5375-BK', name: 'Ventana de Seguridad Lama 4" 36x53 3/4 Black', qty: 0 },
  { sku: 'VS-L4-36X5775-BK', name: 'Ventana de Seguridad Lama 4" 36x57 3/4 Black', qty: 0 },

  // ── PUERTAS AE (qty 0 — catálogo sin stock) ───────────────────────────────
  { sku: 'PD-L4-30X8100-AE', name: 'Puerta con Ventana Lama 4" 30x81 Acid Etched', qty: 0 },
  { sku: 'PD-L4-30X8400-AE', name: 'Puerta con Ventana Lama 4" 30x84 Acid Etched', qty: 0 },
  { sku: 'PD-L4-30X9500-AE', name: 'Puerta con Ventana Lama 4" 30x95 Acid Etched', qty: 0 },
  { sku: 'PD-L4-32X8100-AE', name: 'Puerta con Ventana Lama 4" 32x81 Acid Etched', qty: 0 },
  { sku: 'PD-L4-32X8400-AE', name: 'Puerta con Ventana Lama 4" 32x84 Acid Etched', qty: 0 },
  { sku: 'PD-L4-32X9500-AE', name: 'Puerta con Ventana Lama 4" 32x95 Acid Etched', qty: 0 },
];

// ─── Helper: parse SKU → product fields ──────────────────────────────────────

function parseSku(sku) {
  const isPuerta = sku.startsWith('PD-');
  const acabadoCode = sku.split('-').pop();
  const colorMap = { AE: 'Acid Etched', BG: 'Blue Green', BK: 'Black' };
  const color = colorMap[acabadoCode] ?? acabadoCode;
  const type  = isPuerta ? 'Puerta' : 'Ventana';
  const lamaMatch = sku.match(/L(\d)/);
  const model = lamaMatch ? `Lama ${lamaMatch[1]}"` : '';
  return { color, type, model, isPuerta };
}

// ─── Main processing loop ─────────────────────────────────────────────────────

let created = 0, updated = 0, totalUnits = 0;
const byAcabado = { AE: 0, BG: 0, BK: 0 };
const errors = [];

console.log(`Procesando ${INVENTORY.length} SKUs en Ponce...\n`);

for (const item of INVENTORY) {
  const { color, type, model, isPuerta } = parseSku(item.sku);
  const categoryId = isPuerta ? catPuerta.id : catVentana.id;

  try {
    // 1. Upsert product (create if not exists, do nothing if exists)
    const existingProduct = await db.product.findUnique({ where: { sku: item.sku } });

    let product;
    if (!existingProduct) {
      product = await db.product.create({
        data: {
          sku:            item.sku,
          name:           item.name,
          categoryId,
          supplierId:     supplier?.id ?? undefined,
          color,
          type,
          model,
          unitCost:       0,
          retailPrice:    0,
          wholesalePrice: 0,
          minStock:       0,
        },
      });
      created++;
      const ac = item.sku.split('-').pop();
      if (ac in byAcabado) byAcabado[ac]++;
    } else {
      product = existingProduct;
    }

    // 2. Upsert ProductLocation in Ponce only
    const existingLoc = await db.productLocation.findUnique({
      where: { productId_warehouseId: { productId: product.id, warehouseId: warehouse.id } },
    });

    if (!existingLoc) {
      // New location: create + movement (only if stock > 0)
      const loc = await db.productLocation.create({
        data: {
          productId:       product.id,
          warehouseId:     warehouse.id,
          locationCode:    'PONCE-PRINCIPAL',
          quantityOnHand:  item.qty,
          reservedQuantity: 0,
        },
      });

      if (item.qty > 0) {
        await db.inventoryMovement.create({
          data: {
            productId:     product.id,
            locationId:    loc.id,
            movementType:  'IN',
            quantity:      item.qty,
            referenceType: 'DIRECT_RECEIPT',
            referenceId:   'CONTEO-2026-05-28',
            userId:        adminUser.id,
            notes:         'Carga inicial conteo inventario Ponce 28/05/2026',
          },
        });
        updated++;
        totalUnits += item.qty;
      }
    } else {
      // Location already exists: update quantity and create ADJUSTMENT if changed
      const diff = item.qty - existingLoc.quantityOnHand;
      if (diff !== 0) {
        await db.productLocation.update({
          where: { id: existingLoc.id },
          data: { quantityOnHand: item.qty },
        });
        await db.inventoryMovement.create({
          data: {
            productId:     product.id,
            locationId:    existingLoc.id,
            movementType:  'ADJUSTMENT',
            quantity:      diff,
            referenceType: 'ADJUSTMENT',
            referenceId:   'CONTEO-2026-05-28',
            userId:        adminUser.id,
            notes:         `Ajuste conteo inventario Ponce 28/05/2026 (anterior: ${existingLoc.quantityOnHand}, nuevo: ${item.qty})`,
          },
        });
      }
      updated++;
      totalUnits += item.qty;
    }

  } catch (e) {
    errors.push({ sku: item.sku, error: e.message });
  }
}

// ─── Reporte de validación ────────────────────────────────────────────────────

console.log('═══════════════════════════════════════════════════════');
console.log('REPORTE DE VALIDACIÓN — Conteo Ponce 28/05/2026');
console.log('═══════════════════════════════════════════════════════');
console.log(`Total SKUs procesados:     ${INVENTORY.length}`);
console.log(`  Nuevos productos:        ${created}`);
console.log(`  Ubicaciones actualizadas: ${updated}`);
console.log('');
console.log(`Total unidades en Ponce:   ${totalUnits}`);
console.log(`  Esperado por datos:      1,211 (conteo real de la hoja)`);
console.log('');
console.log('SKUs nuevos por acabado:');
console.log(`  Acid Etched (AE): ${byAcabado.AE}`);
console.log(`  Blue Green  (BG): ${byAcabado.BG}`);
console.log(`  Black       (BK): ${byAcabado.BK}`);
console.log('');

// Verificar totales por grupo
const l3ae = INVENTORY.filter(i => i.sku.includes('-L3-') && i.sku.endsWith('-AE')).reduce((s,i)=>s+i.qty,0);
const l3bg = INVENTORY.filter(i => i.sku.includes('-L3-') && i.sku.endsWith('-BG')).reduce((s,i)=>s+i.qty,0);
const l4ae = INVENTORY.filter(i => i.sku.includes('-L4-') && i.sku.startsWith('VS') && i.sku.endsWith('-AE')).reduce((s,i)=>s+i.qty,0);
const l4bg = INVENTORY.filter(i => i.sku.includes('-L4-') && i.sku.endsWith('-BG')).reduce((s,i)=>s+i.qty,0);

console.log('Totales reales por grupo (del script):');
console.log(`  L3" AE: ${l3ae} u. (esperado 317)`);
console.log(`  L3" BG: ${l3bg} u. (esperado 374 — diferencia: ${374-l3bg})`);
console.log(`  L4" AE: ${l4ae} u. (esperado 229)`);
console.log(`  L4" BG: ${l4bg} u. (esperado 306 — diferencia: ${306-l4bg})`);
console.log('');

if (errors.length > 0) {
  console.log('⚠️  ERRORES:');
  errors.forEach(e => console.log(`  ${e.sku}: ${e.error}`));
} else {
  console.log('✅ Sin errores.');
}

console.log('═══════════════════════════════════════════════════════');

await db.$disconnect();
