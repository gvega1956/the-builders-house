/**
 * fix-movement-refids.mjs
 * Diagnostica y corrige inventory_movements con referenceType='INVOICE' donde
 * referenceId contiene el invoiceNumber en vez del invoice.id (UUID).
 *
 * DRY-RUN por defecto. Pasar --apply para ejecutar.
 *
 * Uso:
 *   node --max_old_space_size=512 --env-file=.env scripts/fix-movement-refids.mjs
 *   node --max_old_space_size=512 --env-file=.env scripts/fix-movement-refids.mjs --apply
 */

import { PrismaClient } from '@prisma/client';

const db = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL + '&connection_limit=2' } },
});

const DRY_RUN = !process.argv.includes('--apply');
const PR = (d) => new Date(d).toLocaleString('es-PR', { timeZone: 'America/Puerto_Rico', hour12: false });

function hr(c = '─', n = 72) { return c.repeat(n); }

async function main() {
  console.log(`\n${hr('═')}`);
  console.log(`  FIX inventory_movements.referenceId — ${DRY_RUN ? 'DRY-RUN' : '⚠️  APLICANDO'}`);
  console.log(`  Ejecutado: ${PR(new Date())}`);
  console.log(`${hr('═')}\n`);

  // ── 1. Clasificar todos los movimientos con referenceType='INVOICE' ────────
  const classification = await db.$queryRaw`
    SELECT
      COUNT(*)::int                                                            AS total,
      COUNT(*) FILTER (WHERE i_by_id.id IS NOT NULL)::int                     AS already_correct,
      COUNT(*) FILTER (
        WHERE i_by_id.id IS NULL AND i_by_num.id IS NOT NULL
      )::int                                                                   AS needs_fix,
      COUNT(*) FILTER (
        WHERE i_by_id.id IS NULL AND i_by_num.id IS NULL
      )::int                                                                   AS orphan
    FROM inventory_movements im
    LEFT JOIN invoices i_by_id  ON i_by_id.id              = im."referenceId"
    LEFT JOIN invoices i_by_num ON i_by_num."invoiceNumber" = im."referenceId"
    WHERE im."referenceType" = 'INVOICE'
  `;

  const c = classification[0];
  console.log('  CONTEO GENERAL (referenceType = INVOICE):');
  console.log(`  ${'Total movimientos'.padEnd(35)} ${c.total}`);
  console.log(`  ${'Ya tienen UUID correcto'.padEnd(35)} ${c.already_correct}  ✅`);
  console.log(`  ${'Tienen invoiceNumber (a corregir)'.padEnd(35)} ${c.needs_fix}  ${c.needs_fix > 0 ? '⚠️' : '✅'}`);
  console.log(`  ${'Huérfanos (no matchean nada)'.padEnd(35)} ${c.orphan}  ${c.orphan > 0 ? '🔴' : '✅'}`);
  console.log('');

  // ── 2. Detalle de los que necesitan corrección ────────────────────────────
  const toFix = await db.$queryRaw`
    SELECT
      im.id                        AS movement_id,
      im."movementType",
      im."referenceId"             AS current_ref_id,
      im."createdAt",
      im.quantity,
      i_by_num.id                  AS correct_invoice_id,
      i_by_num."invoiceNumber"     AS invoice_number,
      i_by_num.status              AS invoice_status,
      p.sku,
      u.name                       AS user_name
    FROM inventory_movements im
    JOIN products p  ON p.id  = im."productId"
    JOIN users u     ON u.id  = im."userId"
    LEFT JOIN invoices i_by_num ON i_by_num."invoiceNumber" = im."referenceId"
    WHERE im."referenceType" = 'INVOICE'
      AND NOT EXISTS (
        SELECT 1 FROM invoices i2 WHERE i2.id = im."referenceId"
      )
      AND i_by_num.id IS NOT NULL
    ORDER BY im."createdAt" ASC
  `;

  // ── 3. Detalle de los huérfanos ───────────────────────────────────────────
  const orphans = await db.$queryRaw`
    SELECT
      im.id                   AS movement_id,
      im."movementType",
      im."referenceId"        AS stored_ref,
      im."createdAt",
      im.quantity,
      p.sku,
      u.name                  AS user_name
    FROM inventory_movements im
    JOIN products p  ON p.id = im."productId"
    JOIN users u     ON u.id = im."userId"
    WHERE im."referenceType" = 'INVOICE'
      AND NOT EXISTS (SELECT 1 FROM invoices i2 WHERE i2.id              = im."referenceId")
      AND NOT EXISTS (SELECT 1 FROM invoices i3 WHERE i3."invoiceNumber" = im."referenceId")
    ORDER BY im."createdAt" ASC
  `;

  // ── 4. Mostrar plan de corrección ─────────────────────────────────────────
  if (toFix.length > 0) {
    console.log(`${hr('─')}`);
    console.log(`  MOVIMIENTOS A CORREGIR (referenceId invoiceNumber → UUID):`);
    console.log(`${hr('─')}`);

    // Agrupar por factura para legibilidad
    const byInvoice = new Map();
    for (const row of toFix) {
      const key = row.invoice_number;
      if (!byInvoice.has(key)) byInvoice.set(key, []);
      byInvoice.get(key).push(row);
    }

    for (const [invNum, rows] of byInvoice) {
      const first = rows[0];
      console.log(`\n  Factura: ${invNum}  (estado: ${first.invoice_status})`);
      console.log(`    UUID correcto: ${first.correct_invoice_id}`);
      console.log(`    Movimientos afectados: ${rows.length}`);
      for (const r of rows) {
        console.log(`      · ${PR(r.createdAt).slice(0, 16)}  ${r.movementType.padEnd(12)}  ${String(r.quantity).padStart(4)}  ${r.sku}  ${r.user_name}`);
        console.log(`        referenceId: '${r.current_ref_id}'  →  '${r.correct_invoice_id}'`);
      }
    }
    console.log('');
  }

  if (orphans.length > 0) {
    console.log(`${hr('─')}`);
    console.log(`  🔴 HUÉRFANOS (referenceId no matchea ninguna factura):`);
    console.log(`${hr('─')}`);
    for (const r of orphans) {
      console.log(`  · ${PR(r.createdAt).slice(0, 16)}  ${r.movementType.padEnd(12)} ${String(r.quantity).padStart(4)}  ${r.sku}  ${r.user_name}`);
      console.log(`    referenceId actual: '${r.stored_ref}'`);
    }
    console.log('');
  }

  // ── 5. Resumen ────────────────────────────────────────────────────────────
  console.log(`${hr('═')}`);
  console.log('  RESUMEN');
  console.log(`${hr('─')}`);
  console.log(`  Movimientos a actualizar: ${toFix.length}`);
  console.log(`  Huérfanos (requieren revisión manual): ${orphans.length}`);
  if (orphans.length > 0) {
    console.log(`  🔴 ATENCIÓN: los huérfanos NO se tocarán — requieren análisis manual.`);
  }
  console.log('');

  if (DRY_RUN) {
    console.log(`  ✅ DRY-RUN. Ningún dato fue modificado.`);
    console.log(`  Para aplicar: node --max_old_space_size=512 --env-file=.env scripts/fix-movement-refids.mjs --apply`);
    console.log(`\n${hr('═')}\n`);
    return;
  }

  // ── 6. Aplicar (solo con --apply) ─────────────────────────────────────────
  if (toFix.length === 0) {
    console.log('  Nada que corregir.');
    console.log(`\n${hr('═')}\n`);
    return;
  }

  console.log(`  ⚠️  APLICANDO ${toFix.length} UPDATE(s)...`);
  let updated = 0;
  for (const row of toFix) {
    // inventory_movements es append-only para la lógica de negocio, pero este campo
    // es una referencia de integridad que quedó mal por el bug en invoicing.ts.
    // La corrección no altera la semántica del movimiento, solo apunta al UUID correcto.
    await db.$executeRaw`
      UPDATE inventory_movements
      SET "referenceId" = ${row.correct_invoice_id}
      WHERE id = ${row.movement_id}
    `;
    updated++;
    console.log(`    ✅ ${row.movement_id.slice(0, 16)}…  ${row.movementType}  ${row.invoice_number}  →  ${row.correct_invoice_id}`);
  }
  console.log(`\n  ✅ ${updated}/${toFix.length} filas actualizadas.`);
  if (orphans.length > 0) {
    console.log(`  ⚠️  ${orphans.length} huérfano(s) no tocados.`);
  }
  console.log(`\n${hr('═')}\n`);
}

main()
  .catch((e) => { console.error('  ERROR:', e.message); process.exit(1); })
  .finally(() => db.$disconnect());
