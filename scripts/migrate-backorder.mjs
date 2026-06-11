/**
 * migrate-backorder.mjs
 * Convierte ubicaciones con quantityOnHand < 0 al nuevo modelo de backorder explícito.
 *
 * Por defecto: DRY-RUN — solo muestra el plan, sin modificar datos.
 * Para aplicar: node --env-file=.env scripts/migrate-backorder.mjs --apply
 *
 * Uso:
 *   node --env-file=.env scripts/migrate-backorder.mjs           ← dry-run
 *   node --env-file=.env scripts/migrate-backorder.mjs --apply   ← aplica cambios
 */

import { PrismaClient } from '@prisma/client';

const db = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL + '&connection_limit=2' } },
});

const DRY_RUN = !process.argv.includes('--apply');
const PR = (d) => new Date(d).toLocaleString('es-PR', { timeZone: 'America/Puerto_Rico', hour12: false });

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hr(char = '─', len = 72) { return char.repeat(len); }

function printRow(label, value, indent = 2) {
  const pad = ' '.repeat(indent);
  console.log(`${pad}${label.padEnd(30)} ${value}`);
}

// ─── Core analysis ────────────────────────────────────────────────────────────

/**
 * Para una ubicación con onHand < 0, reconstruye el historial de movimientos
 * y clasifica la deuda en:
 *   - backorderDebt: unidades autorizadas como backorder intencional (OUT con referencia a factura)
 *   - mistakeDebt:   unidades de ajustes sin justificación que empujaron a negativo
 *
 * Devuelve { backorderDebt, mistakeDebt, movements, invoiceItemsToMark }
 */
async function analyzeLocation(loc) {
  // Note: authorizeBackorder stores invoice.invoiceNumber (not invoice.id) in referenceId.
  // The JOIN covers both cases: direct UUID match OR invoice number match.
  const movements = await db.$queryRaw`
    SELECT
      im.id,
      im."movementType",
      im.quantity,
      im."referenceId",
      im."referenceType",
      im.notes,
      im."createdAt",
      u.name                AS "userName",
      i.id                  AS "invoiceUuid",
      i."invoiceNumber"     AS "invoiceNumber",
      i.status              AS "invoiceStatus"
    FROM inventory_movements im
    JOIN users u ON u.id = im."userId"
    LEFT JOIN invoices i
      ON i.id = im."referenceId"           -- normal path: referenceId = invoice UUID
      OR i."invoiceNumber" = im."referenceId"  -- bug path: referenceId = invoice number
    WHERE im."locationId" = ${loc.id}
    ORDER BY im."createdAt" ASC
  `;

  // Reconstruct running balance
  let runningBalance = 0;
  let backorderDebt  = 0;
  let mistakeDebt    = 0;
  const invoiceItemsToMark = []; // { invoiceId, productId, locationId, qty }

  for (const mv of movements) {
    const before = runningBalance;
    runningBalance += mv.quantity;

    // Only care about transitions that caused or worsened the negative state
    if (runningBalance < 0 || (before < 0 && mv.quantity < 0)) {
      const absQty = Math.abs(mv.quantity);

      if (mv.movementType === 'OUT' && mv.referenceId) {
        // Authorized backorder sale — intentional, models as backorderQuantity.
        // Use invoiceUuid (resolved by the JOIN) — NOT mv.referenceId, which may be
        // the invoice number string due to the authorizeBackorder bug.
        const contribution = Math.min(absQty, Math.abs(Math.min(runningBalance, 0)));
        backorderDebt += contribution;
        invoiceItemsToMark.push({
          invoiceId: mv.invoiceUuid,      // UUID from JOIN (handles both bug and normal path)
          invoiceNumber: mv.invoiceNumber,
          productId: loc.productId,
          locationId: loc.id,
          quantityBackordered: contribution,
        });
      } else if (mv.movementType === 'ADJUSTMENT' && !mv.referenceId && mv.quantity < 0) {
        // Undocumented negative adjustment — likely mistake, should be reversed
        const contribution = Math.min(absQty, Math.abs(Math.min(runningBalance, 0)));
        mistakeDebt += contribution;
      }
      // DAMAGE with referenceId: treat similarly to OUT (intentional). Not seen in this dataset.
    }
  }

  return { backorderDebt, mistakeDebt, movements, invoiceItemsToMark };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const sep = hr('═');
  const div = hr('─');

  console.log(`\n${sep}`);
  console.log(`  MIGRACIÓN BACKORDER — ${DRY_RUN ? 'DRY-RUN (solo lectura)' : '⚠️  APLICANDO CAMBIOS'}`);
  console.log(`  Ejecutado: ${PR(new Date())}`);
  console.log(`${sep}\n`);

  if (DRY_RUN) {
    console.log('  MODO DRY-RUN: ningún dato será modificado.');
    console.log('  Para aplicar: node --env-file=.env scripts/migrate-backorder.mjs --apply\n');
  } else {
    console.log('  ⚠️  MODO APPLY: los cambios se escribirán en la BD.\n');
  }

  // ── 1. Encontrar todas las ubicaciones con stock negativo ─────────────────
  const negativeLocations = await db.productLocation.findMany({
    where: { quantityOnHand: { lt: 0 } },
    include: {
      product:   { select: { sku: true, name: true } },
      warehouse: { select: { name: true } },
    },
    orderBy: { quantityOnHand: 'asc' },
  });

  console.log(`${div}`);
  console.log(`  UBICACIONES CON quantityOnHand < 0: ${negativeLocations.length}`);
  console.log(`${div}\n`);

  if (negativeLocations.length === 0) {
    console.log('  ✅ Ninguna ubicación con stock negativo. Nada que migrar.\n');
    return;
  }

  // Buscar un usuario ADMIN para atribuir los movimientos de corrección
  const adminUser = await db.user.findFirst({
    where: { role: 'ADMIN', isActive: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, email: true },
  });

  if (!adminUser) {
    throw new Error('No hay usuario ADMIN activo. La migración necesita atribuir movimientos a alguien.');
  }

  console.log(`  Movimientos de corrección atribuidos a: ${adminUser.name} (${adminUser.email})\n`);

  // ── 2. Analizar cada ubicación y construir el plan ─────────────────────────
  const plans = [];

  for (const loc of negativeLocations) {
    const { backorderDebt, mistakeDebt, movements, invoiceItemsToMark } =
      await analyzeLocation(loc);

    const totalDebt      = Math.abs(loc.quantityOnHand);  // e.g. 4 for onHand=-4
    const recoveredDebt  = backorderDebt + mistakeDebt;    // sanity check
    const unexplained    = totalDebt - recoveredDebt;       // should be 0

    const plan = {
      loc,
      movements,
      backorderDebt,
      mistakeDebt,
      unexplained,
      invoiceItemsToMark,
      // Correction movements needed:
      correctionMovements: [],
    };

    // Revert mistake adjustments (ADJUSTMENT +mistakeDebt)
    if (mistakeDebt > 0) {
      plan.correctionMovements.push({
        type: 'ADJUSTMENT',
        quantity: mistakeDebt,  // positive = entry, corrects the erroneous negative
        notes: `Reversión de ajuste(s) manual(es) sin justificación que empujaron stock a negativo. ` +
               `Análisis forense 2026-06-11: ${mistakeDebt}u son error de operación, no deuda de backorder. ` +
               `Ver scripts/migrate-backorder.mjs.`,
        purpose: `REVERSA DE AJUSTE ERRÓNEO (+${mistakeDebt}u)`,
      });
    }

    // Convert backorder debt to backorderQuantity (ADJUSTMENT +backorderDebt)
    if (backorderDebt > 0) {
      plan.correctionMovements.push({
        type: 'ADJUSTMENT',
        quantity: backorderDebt,  // positive = brings onHand back to 0
        notes: `Corrección de modelo backorder: ${backorderDebt}u vendidas sin stock físico son ` +
               `deuda de backorder explícita (backorderQuantity). Corresponde a ` +
               `${invoiceItemsToMark.map(i => i.invoiceNumber).join(', ')}. ` +
               `Ver scripts/migrate-backorder.mjs.`,
        purpose: `CORRECCIÓN BACKORDER (+${backorderDebt}u → backorderQuantity=${backorderDebt})`,
      });
    }

    plans.push(plan);

    // ── Imprimir análisis de esta ubicación ──────────────────────────────────
    console.log(`${hr('═')}`);
    console.log(`  SKU:      ${loc.product.sku}`);
    console.log(`  Almacén:  ${loc.warehouse.name}`);
    console.log(`  ID:       ${loc.id}`);
    console.log(`${div}`);
    console.log(`\n  ESTADO ACTUAL:`);
    printRow('quantityOnHand',   `${loc.quantityOnHand}  ← NEGATIVO, debe ser ≥ 0`);
    printRow('reservedQuantity', `${loc.reservedQuantity}`);
    printRow('backorderQuantity','(campo nuevo — actualmente no existe)');
    console.log('');

    // Historial de movimientos
    console.log(`  HISTORIAL DE MOVIMIENTOS (${movements.length} total):`);
    let runBal = 0;
    for (const mv of movements) {
      const before = runBal;
      runBal += mv.quantity;
      const flag = runBal < 0 && before >= 0 ? ' ← CRUZA A NEGATIVO' :
                   runBal < before && runBal < 0 ? ' ← EMPEORA' : '';
      const ref = mv.invoiceNumber ? `FAC ${mv.invoiceNumber}` :
                  mv.referenceId   ? `ref:${mv.referenceId.slice(0, 8)}` : '(sin ref)';
      console.log(`    ${PR(mv.createdAt).slice(0, 16)}  ${mv.movementType.padEnd(12)} ${String(mv.quantity).padStart(4)}  bal:${String(runBal).padStart(4)}  ${ref}  ${mv.userName}${flag}`);
    }
    console.log('');

    // Clasificación de la deuda
    console.log(`  CLASIFICACIÓN DE LA DEUDA (onHand=${loc.quantityOnHand}, total=${totalDebt}u):`);
    printRow('Backorder intencional', `${backorderDebt}u   (OUT autorizado sin stock, modelar como backorderQuantity)`);
    printRow('Error de operación',    `${mistakeDebt}u   (ADJUSTMENT negativo sin ref, revertir con ADJUSTMENT+)`);
    printRow('No explicado',          `${unexplained}u   ${unexplained === 0 ? '✅ OK' : '⚠️ REVISAR MANUALMENTE'}`);
    console.log('');

    // Plan de corrección
    console.log(`  PLAN DE CORRECCIÓN — ${plan.correctionMovements.length} movimiento(s) + ${invoiceItemsToMark.length} item(s) de factura:`);
    let simBal = loc.quantityOnHand;
    for (const cm of plan.correctionMovements) {
      simBal += cm.quantity;
      console.log(`\n    [${cm.purpose}]`);
      console.log(`      Nuevo movimiento ADJUSTMENT +${cm.quantity} en esta ubicación`);
      console.log(`      quantityOnHand: ${simBal - cm.quantity} → ${simBal}`);
      console.log(`      Nota: "${cm.notes.slice(0, 120)}..."`);
    }
    if (plan.correctionMovements.length > 0) {
      console.log(`\n    Resultado final: quantityOnHand=${simBal} (esperado: 0)`);
    }
    if (backorderDebt > 0) {
      console.log(`\n    [CAMPO NUEVO: backorderQuantity]`);
      console.log(`      product_locations WHERE id = '${loc.id}'`);
      console.log(`      backorderQuantity: 0 → ${backorderDebt}`);
    }
    if (invoiceItemsToMark.length > 0) {
      console.log(`\n    [INVOICE_ITEMS — quantityBackordered]`);
      for (const item of invoiceItemsToMark) {
        console.log(`      invoice_items WHERE invoiceId = '${item.invoiceId}' AND productId = '${item.productId}'`);
        console.log(`        quantityBackordered: 0 → ${item.quantityBackordered}  (factura ${item.invoiceNumber})`);
      }
    }
    console.log('');
  }

  // ── 3. Resumen global ─────────────────────────────────────────────────────
  const totalLocations   = plans.length;
  const totalBackorder   = plans.reduce((s, p) => s + p.backorderDebt, 0);
  const totalMistake     = plans.reduce((s, p) => s + p.mistakeDebt, 0);
  const totalUnexplained = plans.reduce((s, p) => s + p.unexplained, 0);
  const totalMovements   = plans.reduce((s, p) => s + p.correctionMovements.length, 0);
  const totalItems       = plans.reduce((s, p) => s + p.invoiceItemsToMark.length, 0);

  console.log(`${hr('═')}`);
  console.log(`  RESUMEN GLOBAL`);
  console.log(`${div}`);
  printRow('Ubicaciones a corregir',     totalLocations.toString());
  printRow('Unidades → backorderQty',    `${totalBackorder}u`);
  printRow('Unidades → revertir (error)',`${totalMistake}u`);
  printRow('Unidades no explicadas',     `${totalUnexplained}  ${totalUnexplained === 0 ? '✅' : '🔴 ABORTAR'}`);
  printRow('Movimientos a crear',        totalMovements.toString());
  printRow('Invoice items a marcar',     totalItems.toString());
  console.log('');

  if (totalUnexplained > 0) {
    console.log(`  🔴 ABORTO: hay ${totalUnexplained}u de deuda no explicada. Revisar manualmente.`);
    console.log(`     La migración NO se ejecutará hasta resolver las discrepancias.\n`);
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log(`  ✅ DRY-RUN completado. Los datos mostrados arriba reflejan exactamente`);
    console.log(`     los cambios que se aplicarían con --apply.`);
    console.log(`\n  Para ejecutar: node --env-file=.env scripts/migrate-backorder.mjs --apply\n`);
    return;
  }

  // ── 4. Aplicar cambios (solo con --apply) ────────────────────────────────
  console.log(`  ⚠️  APLICANDO CAMBIOS...\n`);

  await db.$transaction(async (tx) => {
    for (const plan of plans) {
      const { loc, correctionMovements, backorderDebt, invoiceItemsToMark } = plan;

      // Crear movimientos de corrección
      for (const cm of correctionMovements) {
        await tx.inventoryMovement.create({
          data: {
            productId:     loc.productId,
            locationId:    loc.id,
            movementType:  'ADJUSTMENT',
            quantity:      cm.quantity,
            referenceType: 'ADJUSTMENT',
            referenceId:   null,
            userId:        adminUser.id,
            notes:         cm.notes,
          },
        });
        console.log(`    ✅ Movimiento creado: ADJUSTMENT +${cm.quantity} para ${loc.product.sku} (${loc.warehouse.name})`);
      }

      // Actualizar quantityOnHand y backorderQuantity en la ubicación
      const totalAdjustment = correctionMovements.reduce((s, cm) => s + cm.quantity, 0);
      await tx.productLocation.update({
        where: { id: loc.id },
        data: {
          quantityOnHand:    { increment: totalAdjustment },
          backorderQuantity: backorderDebt,
        },
      });
      console.log(`    ✅ productLocation actualizado: quantityOnHand ${loc.quantityOnHand} → ${loc.quantityOnHand + totalAdjustment}, backorderQuantity → ${backorderDebt}`);

      // Marcar invoice_items con quantityBackordered
      for (const item of invoiceItemsToMark) {
        const updated = await tx.invoiceItem.updateMany({
          where: {
            invoiceId:  item.invoiceId,
            productId:  item.productId,
            locationId: item.locationId,
          },
          data: { quantityBackordered: item.quantityBackordered },
        });
        console.log(`    ✅ invoice_items marcados: ${updated.count} fila(s) con quantityBackordered=${item.quantityBackordered} (factura ${item.invoiceNumber})`);
      }
    }
  });

  console.log(`\n  ✅ MIGRACIÓN COMPLETADA. Verifica con scripts/diagnose-pending-auth.mjs.\n`);
  console.log(`${hr('═')}\n`);
}

main()
  .catch((e) => {
    console.error('\n  ERROR:', e.message);
    if (e.stack) console.error(e.stack);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
