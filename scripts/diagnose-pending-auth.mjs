/**
 * diagnose-pending-auth.mjs
 * Lista facturas PENDING_AUTHORIZATION con detalle de reservas y detección de
 * huérfanas. Solo lectura — no modifica datos.
 *
 * Uso: node --env-file=.env scripts/diagnose-pending-auth.mjs
 */

import { PrismaClient } from '@prisma/client';

const db = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL + '&connection_limit=2' } },
});

const PR = (d) => new Date(d).toLocaleString('es-PR', { timeZone: 'America/Puerto_Rico', hour12: false });
const ageHours = (d) => ((Date.now() - new Date(d).getTime()) / 3_600_000).toFixed(1);
const ageDays  = (d) => (ageHours(d) / 24).toFixed(1);

async function main() {
  const hr = '═'.repeat(72);
  const div = '─'.repeat(72);
  console.log(`\n${hr}`);
  console.log('  DIAGNÓSTICO — FACTURAS PENDING_AUTHORIZATION');
  console.log(`  Ejecutado: ${PR(new Date())}`);
  console.log(`${hr}\n`);

  // ─── 1. Facturas PENDING_AUTH ────────────────────────────────────────────────
  const pending = await db.invoice.findMany({
    where: { status: 'PENDING_AUTHORIZATION' },
    include: {
      customer:  { select: { name: true, code: true } },
      createdBy: { select: { name: true, email: true } },
      items: {
        include: {
          product:  { select: { sku: true, name: true } },
          location: { include: { warehouse: { select: { name: true } } } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`  Total facturas PENDING_AUTHORIZATION: ${pending.length}\n`);

  for (const inv of pending) {
    const hours = Number(ageHours(inv.createdAt));
    const urgency = hours > 72 ? '🔴 CRÍTICO' : hours > 24 ? '🟠 VENCIDA' : '🟡 RECIENTE';
    console.log(`  ${urgency} ${inv.invoiceNumber}  |  ${inv.customer?.name ?? '—'}  |  $${Number(inv.total).toFixed(2)}`);
    console.log(`  Creada: ${PR(inv.createdAt)}  |  Edad: ${ageHours(inv.createdAt)}h (${ageDays(inv.createdAt)} días)`);
    console.log(`  Cajero: ${inv.createdBy?.name ?? '—'} <${inv.createdBy?.email ?? '—'}>`);
    if (inv.notes) console.log(`  Notas: ${inv.notes.slice(0, 120)}`);
    console.log(`  Stock reservado:`);
    for (const item of inv.items) {
      const loc  = item.location;
      const wh   = loc?.warehouse?.name ?? '(ubicación eliminada)';
      const flag = !item.locationId ? ' ⚠️  locationId=NULL' : '';
      console.log(`    · ${item.product?.sku ?? '—'}  ×${item.quantity}  en ${wh}${flag}`);
    }
    console.log(`  ${div}`);
  }

  // ─── 2. Reservas actuales en BD ──────────────────────────────────────────────
  const reserved = await db.productLocation.findMany({
    where: { reservedQuantity: { gt: 0 } },
    include: {
      product:   { select: { sku: true } },
      warehouse: { select: { name: true } },
    },
  });

  console.log(`\n  RESERVAS ACTIVAS en product_locations (reservedQuantity > 0): ${reserved.length}`);
  console.log(`  ${div}`);

  // Construir mapa de lo que las facturas PENDING justifican
  const justified = new Map(); // key: locationId → qty justificada
  for (const inv of pending) {
    for (const item of inv.items) {
      if (!item.locationId) continue;
      justified.set(item.locationId, (justified.get(item.locationId) ?? 0) + item.quantity);
    }
  }

  let orphanCount = 0;
  for (const r of reserved) {
    const justifiedQty = justified.get(r.id) ?? 0;
    const orphan = r.reservedQuantity - justifiedQty;
    const statusIcon = orphan > 0 ? '🔴 HUÉRFANA' : '✅ OK';
    const negStock = r.quantityOnHand < 0 ? ' ⚠️  STOCK NEGATIVO' : '';
    console.log(`  ${statusIcon}  ${r.product.sku}  ${r.warehouse.name}`);
    console.log(`        onHand=${r.quantityOnHand}  reserved=${r.reservedQuantity}  available=${r.quantityOnHand - r.reservedQuantity}${negStock}`);
    if (justifiedQty > 0) console.log(`        Justificada por PENDING_AUTH: ${justifiedQty}`);
    if (orphan > 0)        console.log(`        HUÉRFANA SIN JUSTIFICAR: ${orphan} unidades`);
    if (orphan > 0) orphanCount += orphan;
  }

  // ─── 3. Resumen ──────────────────────────────────────────────────────────────
  const overdue = pending.filter((i) => Number(ageHours(i.createdAt)) > 24);
  const critical = pending.filter((i) => Number(ageHours(i.createdAt)) > 72);
  const totalLocked = pending.reduce((s, inv) => s + inv.items.reduce((ss, it) => ss + it.quantity, 0), 0);
  const totalAmount = pending.reduce((s, inv) => s + Number(inv.total), 0);
  const negativeStock = reserved.filter((r) => r.quantityOnHand < 0);

  console.log(`\n${'═'.repeat(72)}`);
  console.log('  RESUMEN');
  console.log(`${'─'.repeat(72)}`);
  console.log(`  Facturas PENDING total:     ${pending.length}`);
  console.log(`  Con antigüedad >24h:        ${overdue.length}  ← requieren acción`);
  console.log(`  Con antigüedad >72h:        ${critical.length}  ← CRÍTICO`);
  console.log(`  Monto total retenido:       $${totalAmount.toFixed(2)}`);
  console.log(`  Unidades con stock bloqueado: ${totalLocked}`);
  console.log(`  Reservas huérfanas:         ${orphanCount === 0 ? '0 ✅ ninguna' : orphanCount + ' 🔴'}`);
  console.log(`  Ubicaciones stock negativo: ${negativeStock.length === 0 ? '0 ✅' : negativeStock.length + ' 🔴'}`);

  if (negativeStock.length > 0) {
    console.log(`\n  UBICACIONES CON STOCK NEGATIVO (corrupción de datos):`);
    for (const r of negativeStock) {
      console.log(`    🔴 ${r.product.sku}  ${r.warehouse.name}  quantityOnHand=${r.quantityOnHand}`);
    }
  }

  console.log(`\n  ACCIÓN REQUERIDA:`);
  if (critical.length > 0) {
    console.log(`  🔴 ${critical.length} factura(s) llevan >72h sin resolución.`);
    console.log(`     Un MANAGER debe autorizar o anular desde /invoicing.`);
  }
  if (overdue.length > 0 && critical.length === 0) {
    console.log(`  🟠 ${overdue.length} factura(s) llevan >24h sin resolución.`);
  }
  if (orphanCount === 0) {
    console.log(`  ✅ Sin reservas huérfanas — integridad de stock correcta.`);
  }
  console.log(`\n  NOTA: Este script es solo lectura. Ningún dato fue modificado.`);
  console.log(`${'═'.repeat(72)}\n`);
}

main()
  .catch((e) => { console.error('ERROR:', e.message); process.exit(1); })
  .finally(() => db.$disconnect());
