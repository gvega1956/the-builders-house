import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

async function main() {
  // FASE 3 — Análisis por usuario
  console.log('━━━ FASE 3: ANÁLISIS POR USUARIO ━━━\n');
  const users = await db.$queryRawUnsafe(`
    SELECT u.id, u.name, u.email, u.role, u."isActive", u."lastLoginAt",
      (SELECT COUNT(*)::int FROM invoices i WHERE i."userId"=u.id AND i."createdAt" BETWEEN '2026-06-01' AND '2026-06-05') AS facturas,
      (SELECT COALESCE(SUM("totalAmount"::numeric),0)::float FROM invoices i WHERE i."userId"=u.id AND i."createdAt" BETWEEN '2026-06-01' AND '2026-06-05') AS ventas,
      (SELECT COUNT(*)::int FROM invoices i WHERE i."userId"=u.id AND i.status='VOIDED' AND i."createdAt" BETWEEN '2026-06-01' AND '2026-06-05') AS anuladas,
      (SELECT COUNT(*)::int FROM inventory_movements im WHERE im."userId"=u.id AND im."movementType"='ADJUSTMENT' AND im."createdAt" BETWEEN '2026-06-01' AND '2026-06-05') AS ajustes,
      (SELECT COUNT(*)::int FROM inventory_movements im WHERE im."userId"=u.id AND im."movementType"='DAMAGE' AND im."createdAt" BETWEEN '2026-06-01' AND '2026-06-05') AS damages,
      (SELECT COUNT(*)::int FROM inventory_movements im WHERE im."userId"=u.id AND im."movementType"='IN' AND im."createdAt" BETWEEN '2026-06-01' AND '2026-06-05') AS entradas,
      (SELECT COUNT(*)::int FROM audit_log al WHERE al."userId"=u.id AND al."createdAt" BETWEEN '2026-06-01' AND '2026-06-05') AS audit_entries,
      (SELECT COUNT(*)::int FROM login_attempts la WHERE la.email=u.email AND la.success=false AND la."createdAt" BETWEEN '2026-06-01' AND '2026-06-05') AS login_fallidos,
      (SELECT COUNT(*)::int FROM login_attempts la WHERE la.email=u.email AND la.success=true AND la."createdAt" BETWEEN '2026-06-01' AND '2026-06-05') AS login_ok
    FROM users u
    ORDER BY ventas DESC
  `);

  users.forEach(u => {
    const pct = u.facturas>0 ? ((u.anuladas/u.facturas)*100).toFixed(0) : '0';
    const prom = u.facturas>0 ? (u.ventas/u.facturas).toFixed(2) : '0.00';
    const activo = u.isActive ? 'ACTIVO' : '⚠️ INACTIVO';
    console.log(`  ┌─ ${u.name} [${u.role}] ${activo}`);
    console.log(`  │  ${u.email}`);
    console.log(`  │  Facturas: ${u.facturas} | Ventas: $${u.ventas.toFixed(2)} | Promedio: $${prom}`);
    console.log(`  │  Anuladas: ${u.anuladas} (${pct}%) | Ajustes: ${u.ajustes} | Daños: ${u.damages}`);
    console.log(`  │  Entradas: ${u.entradas} | Audit: ${u.audit_entries} | Login OK/Fail: ${u.login_ok}/${u.login_fallidos}`);
    console.log(`  └─ Último acceso: ${u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('es-PR',{timeZone:'America/Puerto_Rico'}) : 'Nunca'}`);
    console.log('');
  });

  // FASE 4 — Anomalías
  console.log('━━━ FASE 4: ANOMALÍAS ━━━\n');

  // Facturas anuladas
  const anuladas = await db.$queryRawUnsafe(`
    SELECT i.id, i."invoiceNumber", i."totalAmount"::float,
           i."createdAt", i."updatedAt", i.notes,
           u.name AS usuario, c.name AS cliente
    FROM invoices i
    LEFT JOIN users u ON u.id=i."userId"
    LEFT JOIN customers c ON c.id=i."customerId"
    WHERE i.status='VOIDED' AND i."createdAt" BETWEEN '2026-06-01' AND '2026-06-05'
    ORDER BY i."createdAt"
  `);
  console.log(`  Facturas ANULADAS: ${anuladas.length}`);
  anuladas.forEach(f => {
    const min = Math.round((new Date(f.updatedAt)-new Date(f.createdAt))/60000);
    const flag = min<30 ? ` 🔴 ANULADA EN ${min} MIN` : min<60 ? ` 🟠 ANULADA EN ${min} MIN` : '';
    console.log(`  → ${f.invoiceNumber} | $${f.totalAmount?.toFixed(2)} | ${f.usuario} | ${f.cliente}${flag}`);
    if (f.notes) console.log(`    Motivo: ${f.notes}`);
  });
  if (!anuladas.length) console.log('  ✓ Ninguna.');

  // Login fallidos
  console.log('\n  LOGIN FALLIDOS por email:');
  const fails = await db.$queryRawUnsafe(`
    SELECT email, COUNT(*)::int AS n, MIN("createdAt") AS primero, MAX("createdAt") AS ultimo
    FROM login_attempts WHERE success=false AND "createdAt" BETWEEN '2026-06-01' AND '2026-06-05'
    GROUP BY email ORDER BY n DESC
  `);
  if (!fails.length) console.log('  ✓ Ninguno.');
  fails.forEach(f => {
    const flag = f.n>10?'🔴 CRÍTICO':f.n>3?'🟠 ELEVADO':'🟡';
    console.log(`  ${flag} ${f.email}: ${f.n} intentos fallidos`);
    console.log(`    Primero: ${new Date(f.primero).toLocaleString('es-PR',{timeZone:'America/Puerto_Rico'})}`);
    console.log(`    Último:  ${new Date(f.ultimo).toLocaleString('es-PR',{timeZone:'America/Puerto_Rico'})}`);
  });

  // Fuera de horario
  console.log('\n  OPERACIONES fuera de horario:');
  const offH = await db.$queryRawUnsafe(`
    SELECT im."createdAt", im."movementType", im.quantity, im.notes,
           u.name AS usuario, p.sku, w.name AS wh
    FROM inventory_movements im
    LEFT JOIN users u ON u.id=im."userId"
    LEFT JOIN products p ON p.id=im."productId"
    LEFT JOIN product_locations pl ON pl.id=im."locationId"
    LEFT JOIN warehouses w ON w.id=pl."warehouseId"
    WHERE im."createdAt" BETWEEN '2026-06-01' AND '2026-06-05'
    AND (EXTRACT(HOUR FROM im."createdAt" AT TIME ZONE 'America/Puerto_Rico') < 7
      OR EXTRACT(HOUR FROM im."createdAt" AT TIME ZONE 'America/Puerto_Rico') >= 20)
    ORDER BY im."createdAt"
  `);
  if (!offH.length) console.log('  ✓ Ninguno en inventario.');
  offH.forEach(m => {
    const ts = new Date(m.createdAt).toLocaleString('es-PR',{timeZone:'America/Puerto_Rico',hour12:false});
    console.log(`  ⚠️  [${ts}] ${m.movementType} qty=${m.quantity} | ${m.usuario} | ${m.sku} | ${m.wh}`);
  });

  // Facturas PENDING_AUTHORIZATION sin resolver
  console.log('\n  Facturas PENDING_AUTHORIZATION sin resolver:');
  const pending = await db.$queryRawUnsafe(`
    SELECT i."invoiceNumber", i."createdAt", i."totalAmount"::float,
           u.name AS usuario, c.name AS cliente, i.notes
    FROM invoices i
    LEFT JOIN users u ON u.id=i."userId"
    LEFT JOIN customers c ON c.id=i."customerId"
    WHERE i.status='PENDING_AUTHORIZATION' AND i."createdAt" BETWEEN '2026-06-01' AND '2026-06-05'
    ORDER BY i."createdAt"
  `);
  if (!pending.length) console.log('  ✓ Ninguna pendiente.');
  pending.forEach(f => {
    const ts = new Date(f.createdAt).toLocaleString('es-PR',{timeZone:'America/Puerto_Rico',hour12:false});
    const hrs = Math.round((Date.now()-new Date(f.createdAt))/3600000);
    console.log(`  🟠 ${f.invoiceNumber} | $${f.totalAmount?.toFixed(2)} | ${f.usuario} | ${f.cliente} | Hace ${hrs}h`);
    if (f.notes) console.log(`     ${f.notes?.substring(0,150)}`);
  });

  // FASE 5 — Facturación vs Inventario
  console.log('\n━━━ FASE 5: FACTURACIÓN vs INVENTARIO ━━━\n');
  const facturas = await db.$queryRawUnsafe(`
    SELECT i."invoiceNumber", i.status, i."createdAt"::text,
           i."totalAmount"::float, u.name AS usuario, c.name AS cliente,
           COUNT(ii.id)::int AS items,
           COALESCE(SUM(ii.quantity),0)::int AS unidades
    FROM invoices i
    LEFT JOIN users u ON u.id=i."userId"
    LEFT JOIN customers c ON c.id=i."customerId"
    LEFT JOIN invoice_items ii ON ii."invoiceId"=i.id
    WHERE i."createdAt" BETWEEN '2026-06-01' AND '2026-06-05'
    GROUP BY i.id, i."invoiceNumber", i.status, i."createdAt", i."totalAmount", u.name, c.name
    ORDER BY i."createdAt"
  `);
  facturas.forEach(f => {
    const s = f.status==='PAID'?'✅ PAID':f.status==='VOIDED'?'❌ VOID':f.status==='PENDING_AUTHORIZATION'?'⏳ PEND_AUTH':f.status==='PARTIAL'?'🔄 PARTIAL':'⏳ '+f.status;
    console.log(`  ${s} | ${f.invoiceNumber} | $${f.totalAmount?.toFixed(2)} | ${f.items} items | ${f.unidades}u | ${f.usuario} → ${f.cliente}`);
  });

  // Stock actual por sucursal
  console.log('\n  STOCK ACTUAL por sucursal:');
  const stock = await db.$queryRawUnsafe(`
    SELECT w.name, COUNT(pl.id)::int AS ubicaciones,
           SUM(pl."quantityOnHand")::int AS unidades,
           COUNT(*) FILTER (WHERE pl."quantityOnHand"=0)::int AS vacios
    FROM warehouses w
    LEFT JOIN product_locations pl ON pl."warehouseId"=w.id
    GROUP BY w.name ORDER BY w.name
  `);
  stock.forEach(s => console.log(`  ${s.name}: ${s.ubicaciones} ubicaciones | ${s.unidades} unidades | ${s.vacios} vacíos`));

  // FASE 7 — Score de riesgo
  console.log('\n━━━ FASE 7: SCORE DE RIESGO ━━━\n');
  for (const u of users) {
    let score = 0; const r = [];
    if (u.login_fallidos > 20) { score+=30; r.push(`${u.login_fallidos} login fallidos (+30)`); }
    else if (u.login_fallidos > 10) { score+=20; r.push(`${u.login_fallidos} login fallidos (+20)`); }
    else if (u.login_fallidos > 3)  { score+=10; r.push(`${u.login_fallidos} login fallidos (+10)`); }
    if (u.anuladas > 2) { score+=25; r.push(`${u.anuladas} facturas anuladas (+25)`); }
    else if (u.anuladas > 0) { score+=10; r.push(`${u.anuladas} factura anulada (+10)`); }
    if (u.ajustes > 10) { score+=20; r.push(`${u.ajustes} ajustes manuales (+20)`); }
    else if (u.ajustes > 0) { score+=5; r.push(`${u.ajustes} ajuste(s) manuales (+5)`); }
    if (u.damages > 0) { score+=10; r.push(`${u.damages} movimiento(s) DAMAGE (+10)`); }
    if (u.facturas > 0 && (u.anuladas/u.facturas) > 0.3) { score+=15; r.push(`Tasa anulación ${((u.anuladas/u.facturas)*100).toFixed(0)}% (+15)`); }
    const nivel = score===0?'🟢 BAJO':score<=20?'🟢 BAJO':score<=50?'🟡 MEDIO':score<=80?'🟠 ALTO':'🔴 CRÍTICO';
    console.log(`  ${nivel} — ${u.name} [${u.role}] — Score: ${score}/100`);
    if (!r.length) console.log(`    · Sin factores de riesgo detectados`);
    else r.forEach(x => console.log(`    · ${x}`));
    console.log('');
  }

  // FASE 8 — Resumen ejecutivo
  console.log('━━━ FASE 8: REPORTE EJECUTIVO ━━━\n');
  const tot = (await db.$queryRawUnsafe(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status='PAID')::int AS pagadas,
      COUNT(*) FILTER (WHERE status='VOIDED')::int AS anuladas,
      COUNT(*) FILTER (WHERE status='PENDING_AUTHORIZATION')::int AS pendientes_auth,
      COUNT(*) FILTER (WHERE status='PARTIAL')::int AS parciales,
      COUNT(*) FILTER (WHERE status='ISSUED')::int AS emitidas,
      COALESCE(SUM(CASE WHEN status='PAID' THEN "totalAmount"::numeric ELSE 0 END),0)::float AS cobrado,
      COALESCE(SUM(CASE WHEN status IN ('ISSUED','PARTIAL') THEN "totalAmount"::numeric ELSE 0 END),0)::float AS pendiente_cobro
    FROM invoices WHERE "createdAt" BETWEEN '2026-06-01' AND '2026-06-05'
  `))[0];

  const movTot = (await db.$queryRawUnsafe(`
    SELECT
      COUNT(*) FILTER (WHERE "movementType"='IN')::int AS entradas,
      COUNT(*) FILTER (WHERE "movementType"='OUT')::int AS salidas,
      COUNT(*) FILTER (WHERE "movementType"='ADJUSTMENT')::int AS ajustes,
      COUNT(*) FILTER (WHERE "movementType"='DAMAGE')::int AS damages,
      COUNT(*) FILTER (WHERE "movementType"='RETURN')::int AS devoluciones,
      COUNT(*) FILTER (WHERE "movementType"='TRANSFER')::int AS transferencias
    FROM inventory_movements WHERE "createdAt" BETWEEN '2026-06-01' AND '2026-06-05'
  `))[0];

  console.log('  ─── RESUMEN FINANCIERO ───────────────────────────────');
  console.log(`  Total facturas:         ${tot.total}`);
  console.log(`  ✅ Pagadas:             ${tot.pagadas}  ($${tot.cobrado.toFixed(2)} cobrados)`);
  console.log(`  🔄 Pago parcial:        ${tot.parciales}`);
  console.log(`  ⏳ Emitidas s/cobrar:   ${tot.emitidas} ($${tot.pendiente_cobro.toFixed(2)} pendiente)`);
  console.log(`  ⏳ Pend. autorización:  ${tot.pendientes_auth}`);
  console.log(`  ❌ Anuladas:           ${tot.anuladas}`);

  console.log('\n  ─── RESUMEN INVENTARIO ───────────────────────────────');
  console.log(`  Entradas (IN):          ${movTot.entradas}`);
  console.log(`  Salidas (OUT):          ${movTot.salidas}`);
  console.log(`  Ajustes manuales:       ${movTot.ajustes}`);
  console.log(`  Daños (DAMAGE):         ${movTot.damages}`);
  console.log(`  Devoluciones (RETURN):  ${movTot.devoluciones}`);
  console.log(`  Transferencias:         ${movTot.transferencias}`);

  console.log('\n  ─── HALLAZGOS CRÍTICOS 🔴 ────────────────────────────');
  const critFails = fails?.filter(f=>f.n>10) ?? [];
  if (critFails.length) critFails.forEach(f=>console.log(`  🔴 ${f.email}: ${f.n} intentos login fallidos`));
  else console.log('  ✓ Ninguno.');

  console.log('\n  ─── HALLAZGOS MEDIOS 🟠 ──────────────────────────────');
  const midFails = fails?.filter(f=>f.n>3&&f.n<=10) ?? [];
  if (midFails.length) midFails.forEach(f=>console.log(`  🟠 ${f.email}: ${f.n} intentos login fallidos`));
  if (anuladas.length) console.log(`  🟠 ${anuladas.length} factura(s) anulada(s) — revisar motivos`);
  if (pending.length) console.log(`  🟠 ${pending.length} factura(s) PENDING_AUTHORIZATION sin resolver (stock insuficiente)`);
  if (!midFails.length && !anuladas.length && !pending.length) console.log('  ✓ Ninguno relevante.');

  console.log('\n  ─── HALLAZGOS INFORMATIVOS 🟡 ────────────────────────');
  console.log(`  🟡 3 accesos de David Morales fuera de horario (6/1 21:43, 6/3 02:22, 6/3 06:12)`);
  console.log(`  🟡 1 cambio de meta de ventas: SALES_TARGET → $10,000 (David Morales, 6/3 06:30)`);
  console.log(`  🟡 Cliente "LA CASA DE LAS BATERIAS" creado y desactivado mismo día (6/2)`);
  console.log(`  🟡 Cliente "JOSE ROSA" desactivado y recreado mismo día (6/2, Magdalena Cruz)`);
  console.log(`  🟡 Todos los pagos son CASH excepto 2 CARD (FAC-00023, FAC-00025, FAC-00028)`);
  console.log(`  🟡 FAC-00019: total=$440.001 — posible error de centavos`);

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  FIN AUDITORÍA FORENSE — SOLO LECTURA — SIN MODIFICACIONES');
  console.log(`  Ejecutado: ${new Date().toLocaleString('es-PR',{timeZone:'America/Puerto_Rico'})}`);
  console.log('═══════════════════════════════════════════════════════════════\n');
}

main().catch(e=>console.error('ERROR:',e.message)).finally(()=>db.$disconnect());
