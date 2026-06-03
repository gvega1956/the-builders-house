/**
 * Ruta temporal — Carga de inventario Ponce conteo 28/05/2026.
 * Protegida por token. Idempotente: segura de llamar múltiples veces.
 * ELIMINAR después de confirmar la carga exitosa.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';

const TOKEN = 'CONTEO-PONCE-2026-05-28';

const INVENTORY = [
  // LAMA 3" ACID ETCHED
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
  // LAMA 3" BLUE GREEN
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
  // LAMA 4" ACID ETCHED
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
  // LAMA 4" BLUE GREEN
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
  // LAMA 3" BLACK (stock 0)
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
  // LAMA 4" BLACK (stock 0)
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
  // PUERTAS (stock 0)
  { sku: 'PD-L4-30X8100-AE', name: 'Puerta con Ventana Lama 4" 30x81 Acid Etched', qty: 0 },
  { sku: 'PD-L4-30X8400-AE', name: 'Puerta con Ventana Lama 4" 30x84 Acid Etched', qty: 0 },
  { sku: 'PD-L4-30X9500-AE', name: 'Puerta con Ventana Lama 4" 30x95 Acid Etched', qty: 0 },
  { sku: 'PD-L4-32X8100-AE', name: 'Puerta con Ventana Lama 4" 32x81 Acid Etched', qty: 0 },
  { sku: 'PD-L4-32X8400-AE', name: 'Puerta con Ventana Lama 4" 32x84 Acid Etched', qty: 0 },
  { sku: 'PD-L4-32X9500-AE', name: 'Puerta con Ventana Lama 4" 32x95 Acid Etched', qty: 0 },
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    if (body.token !== TOKEN) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }

    const catVentana = await db.category.findFirst({ where: { name: 'Ventanas de Seguridad' } });
    const catPuerta  = await db.category.upsert({
      where: { slug: 'puertas-cristal' },
      update: {},
      create: { name: 'Puertas de Cristal', slug: 'puertas-cristal' },
    });
    const warehouse  = await db.warehouse.findFirst({ where: { name: 'Ponce' } });
    const adminUser  = await db.user.findFirst({ where: { OR: [{ role: 'ADMIN' }, { role: 'MANAGER' }] } });
    const supplier   = await db.supplier.findFirst();

    if (!catVentana || !warehouse || !adminUser) {
      return NextResponse.json({
        error: 'Fixtures faltantes',
        details: { catVentana: !!catVentana, warehouse: !!warehouse, adminUser: !!adminUser },
      }, { status: 500 });
    }

    const colorMap: Record<string, string> = { AE: 'Acid Etched', BG: 'Blue Green', BK: 'Black' };

    let created = 0, updated = 0, totalUnits = 0;
    const errors: string[] = [];

    for (const item of INVENTORY) {
      try {
        const isPuerta   = item.sku.startsWith('PD-');
        const acabado    = item.sku.split('-').pop() ?? '';
        const color      = colorMap[acabado] ?? acabado;
        const lamaMatch  = item.sku.match(/L(\d)/);
        const model      = lamaMatch ? `Lama ${lamaMatch[1]}"` : '';
        const type       = isPuerta ? 'Puerta' : 'Ventana';
        const categoryId = isPuerta ? catPuerta.id : catVentana.id;

        const existing = await db.product.findUnique({ where: { sku: item.sku } });
        let product;
        if (!existing) {
          product = await db.product.create({
            data: {
              sku: item.sku, name: item.name, categoryId,
              supplierId: supplier?.id ?? undefined,
              color, type, model,
              unitCost: 0, retailPrice: 0, wholesalePrice: 0, minStock: 0,
            },
          });
          created++;
        } else {
          product = existing;
        }

        const existingLoc = await db.productLocation.findUnique({
          where: { productId_warehouseId: { productId: product.id, warehouseId: warehouse.id } },
        });

        if (!existingLoc) {
          const loc = await db.productLocation.create({
            data: { productId: product.id, warehouseId: warehouse.id, locationCode: 'PONCE-PRINCIPAL', quantityOnHand: item.qty, reservedQuantity: 0 },
          });
          if (item.qty > 0) {
            await db.inventoryMovement.create({
              data: {
                productId: product.id, locationId: loc.id,
                movementType: 'IN', quantity: item.qty,
                referenceType: 'DIRECT_RECEIPT', referenceId: 'CONTEO-2026-05-28',
                userId: adminUser.id,
                notes: 'Carga inicial conteo inventario Ponce 28/05/2026',
              },
            });
          }
          updated++;
          totalUnits += item.qty;
        } else {
          const diff = item.qty - existingLoc.quantityOnHand;
          if (diff !== 0) {
            await db.productLocation.update({ where: { id: existingLoc.id }, data: { quantityOnHand: item.qty } });
            await db.inventoryMovement.create({
              data: {
                productId: product.id, locationId: existingLoc.id,
                movementType: 'ADJUSTMENT', quantity: diff,
                referenceType: 'ADJUSTMENT', referenceId: 'CONTEO-2026-05-28',
                userId: adminUser.id,
                notes: `Ajuste conteo Ponce 28/05/2026 (${existingLoc.quantityOnHand} → ${item.qty})`,
              },
            });
          }
          updated++;
          totalUnits += item.qty;
        }
      } catch (e) {
        errors.push(`${item.sku}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return NextResponse.json({
      ok: true,
      skus: INVENTORY.length,
      created,
      updated,
      totalUnits,
      errors: errors.length ? errors : null,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
