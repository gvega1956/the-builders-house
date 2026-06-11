import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

async function main() {
  const users = await db.$queryRawUnsafe(`
    SELECT u.id, u.name, u.email, u.role, u."isActive", u."lastLoginAt",
      (SELECT COUNT(*)::int FROM invoices i WHERE i."createdById"=u.id AND i."createdAt" BETWEEN '2026-06-01' AND '2026-06-05') AS facturas,
      (SELECT COALESCE(SUM(total::numeric),0)::float FROM invoices i WHERE i."createdById"=u.id AND i."createdAt" BETWEEN '2026-06-01' AND '2026-06-05' AND status='PAID') AS ventas,
      (SELECT COUNT(*)::int FROM invoices i WHERE i."createdById"=u.id AND i.status='VOIDED' AND i."createdAt" BETWEEN '2026-06-01' AND '2026-06-05') AS anuladas,
      (SELECT COUNT(*)::int FROM inventory_movements im WHERE im."userId"=u.id AND im."movementType"='ADJUSTMENT' AND im."createdAt" BETWEEN '2026-06-01' AND '2026-06-05') AS ajustes,
      (SELECT COUNT(*)::int FROM inventory_movements im WHERE im."userId"=u.id AND im."movementType"='DAMAGE' AND im."createdAt" BETWEEN '2026-06-01' AND '2026-06-05') AS damages,
      (SELECT COUNT(*)::int FROM inventory_movements im WHERE im."userId"=u.id AND im."createdAt" BETWEEN '2026-06-01' AND '2026-06-05') AS total_movs,
      (SELECT COUNT(*)::int FROM audit_log al WHERE al."userId"=u.id AND al."createdAt" BETWEEN '2026-06-01' AND '2026-06-05') AS audit_entries,
      (SELECT COUNT(*)::int FROM login_attempts la WHERE la.email=u.email AND la.success=false AND la."createdAt" BETWEEN '2026-06-01' AND '2026-06-05') AS login_fallidos,
      (SELECT COUNT(*)::int FROM login_attempts la WHERE la.email=u.email AND la.success=true AND la."createdAt" BETWEEN '2026-06-01' AND '2026-06-05') AS login_ok
    FROM users u
    ORDER BY ventas DESC
  `);

  console.log('━━━ FASE 3: ANÁLISIS POR USUARIO ━━━\n');
  users.forEach(u => {
    const pct = u.facturas>0 ? ((u.anuladas/u.facturas)*100).toFixed(0) : '0';
    const prom = u.facturas>0 ? (u.ventas/u.facturas).toFixed(2) : '0.00';
    const activo = u.isActive ? 'ACTIVO' : '⚠️ INACTIVO';
    console.log(`  ┌─ ${u.name} [${u.role}] ${activo}`);
    console.log(`  │  ${u.email}`);
    console.log(`  │  Facturas: ${u.facturas} | Ventas cobradas: $${u.ventas.toFixed(2)} | Prom: $${prom}`);
    console.log(`  │  Anuladas: ${u.anuladas} (${pct}%) | Movs inv.: ${u.total_movs} | Ajustes: ${u.ajustes} | Daños: ${u.damages}`);
    console.log(`  │  Audit: ${u.audit_entries} | Login OK/Fail: ${u.login_ok}/${u.login_fallidos}`);
    console.log(`  └─ Último acceso: ${u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('es-PR',{timeZone:'America/Puerto_Rico'}) : 'Nunca'}`);
    console.log('');
  });

  console.log('━━━ FASE 4: ANOMALÍAS ━━━\n');

  const anuladas = await db.$queryRawUnsafe(`
    SELECT i.id, i."invoiceNumber", i.total::float, i."createdAt", i."updatedAt", i.notes,
           u.name AS usuario, c.name AS cliente
    FROM invoices i
    LEFT JOIN users u ON u.id=i."createdById"
    LEFT JOIN customers c ON c.id=i."customerId"
    WHERE i.status='VOIDED' AND i."createdAt" BETWEEN '2026-06-01' AND '2026-06-05'
    ORDER BY i."createdAt"
  `);
  console.log(`  Facturas ANULADAS: ${anuladas.length}`);
  anuladas.forEach(f => {
    const min = Math.round((new Date(f.updatedAt)-new Date(f.createdAt))/60000);
    const flag = min<30?` 🔴 EN ${min}min`:min<120?` 🟠 EN ${min}min`:'';
    const ts = new Date(f.createdAt).toLocaleString('es-PR',{timeZone:'America/Puerto_Rico',hour12:false});
    console.log(`  → [${ts}] ${f.invoiceNumber} | $${f.total?.toFixed(2)} | ${f.usuario} → ${f.cliente}${flag}`);
    if (f.notes) console.log(`    Motivo: ${f.notes}`);
  });

  const fails = await db.$queryRawUnsafe(`
    SELECT email, COUNT(*)::int AS n, MIN("createdAt") AS primero, MAX("createdAt") AS ultimo
    FROM login_attempts WHERE success=false AND "createdAt" BETWEEN '2026-06-01' AND '2026-06-05'
    GROUP BY email ORDER BY n DESC
  `);
  console.log(`\n  LOGIN FALLIDOS:`);
  if (!fails.length) { console.log('  ✓ Ninguno.'); }
  fails.forEach(f => {
    const flag = f.n>10?'🔴 CRÍTICO':f.n>3?'🟠 ELEVADO':'🟡';
    const p = new Date(f.primero).toLocaleString('es-PR',{timeZone:'America/Puerto_Rico',hour12:false});
    const u2 = new Date(f.ultimo).toLocaleString('es-PR',{timeZone:'America/Puerto_Rico',hour12:false});
    console.log(`  ${flag} ${f.email}: ${f.n} intentos | ${p} → ${u2}`);
  });

  const pending = await db.$queryRawUnsafe(`
    SELECT i."invoiceNumber", i.total::float, i."createdAt", u.name AS usuario, c.name AS cliente
    FROM invoices i
    LEFT JOIN users u ON u.id=i."createdById"
    LEFT JOIN customers c ON c.id=i."customerId"
    WHERE i.status='PENDING_AUTHORIZATION' AND i."createdAt" BETWEEN '2026-06-01' AND '2026-06-05'
    ORDER BY i."createdAt"
  `);
  console.log(`\n  Facturas PENDING_AUTHORIZATION (stock insuficiente): ${pending.length}`);
  pending.forEach(f => {
    const ts = new Date(f.createdAt).toLocaleString('es-PR',{timeZone:'America/Puerto_Rico',hour12:false});
    const hrs = Math.round((Date.now()-new Date(f.createdAt))/3600000);
    console.log(`  🟠 [${ts}] ${f.invoiceNumber} | $${f.total?.toFixed(2)} | ${f.usuario} → ${f.cliente} | Sin resolver hace ${hrs}h`);
  });

  console.log('\n━━━ FASE 5: RESUMEN FACTURAS ━━━\n');
  const facturas = await db.$queryRawUnsafe(`
    SELECT i."invoiceNumber", i.type, i.status, i.total::float,
           u.name AS usuario, c.name AS cliente,
           COUNT(ii.id)::int AS items,
           COALESCE(SUM(ii.quantity),0)::int AS unidades,
           i."createdAt"
    FROM invoices i
    LEFT JOIN users u ON u.id=i."createdById"
    LEFT JOIN customers c ON c.id=i."customerId"
    LEFT JOIN invoice_items ii ON ii."invoiceId"=i.id
    WHERE i."createdAt" BETWEEN '2026-06-01' AND '2026-06-05'
    GROUP BY i.id, i."invoiceNumber", i.type, i.status, i.total, u.name, c.name, i."createdAt"
    ORDER BY i."createdAt"
  `);
  let totalCobrado = 0, totalPendiente = 0;
  facturas.forEach(f => {
    const s = f.status==='PAID'?'✅':f.status==='VOIDED'?'❌':f.status==='PENDING_AUTHORIZATION'?'⏳AUTH':f.status==='PARTIAL'?'🔄':f.status==='ISSUED'?'📋':'?';
    const ts = new Date(f.createdAt).toLocaleString('es-PR',{timeZone:'America/Puerto_Rico',hour12:false}).split(',')[0];
    console.log(`  ${s} ${f.invoiceNumber} [${f.type}] $${f.total?.toFixed(2)} | ${f.items}it ${f.unidades}u | ${f.usuario} → ${f.cliente} | ${ts}`);
    if (f.status==='PAID') totalCobrado += f.total ?? 0;
    if (['ISSUED','PARTIAL'].includes(f.status)) totalPendiente += f.total ?? 0;
  });
  console.log(`\n  TOTAL COBRADO: $${totalCobrado.toFixed(2)}`);
  console.log(`  TOTAL PENDIENTE DE COBRO: $${totalPendiente.toFixed(2)}`);

  console.log('\n  Stock actual:');
  const stock = await db.$queryRawUnsafe(`
    SELECT w.name, SUM(pl."quantityOnHand")::int AS unidades,
           COUNT(*) FILTER (WHERE pl."quantityOnHand"=0)::int AS vacios,
           COUNT(*)::int AS ubicaciones
    FROM warehouses w LEFT JOIN product_locations pl ON pl."warehouseId"=w.id
    GROUP BY w.name ORDER BY w.name
  `);
  stock.forEach(s => console.log(`  ${s.name}: ${s.ubicaciones} ubic. | ${s.unidades} unidades | ${s.vacios} vacíos`));

  console.log('\n━━━ FASE 7: SCORE DE RIESGO ━━━\n');
  for (const u of users) {
    let score = 0; const r = [];
    if (u.login_fallidos > 20) { score+=30; r.push(`${u.login_fallidos} logins fallidos (CRÍTICO)`); }
    else if (u.login_fallidos > 10) { score+=20; r.push(`${u.login_fallidos} logins fallidos (ALTO)`); }
    else if (u.login_fallidos > 3) { score+=10; r.push(`${u.login_fallidos} logins fallidos`); }
    if (u.anuladas > 2) { score+=25; r.push(`${u.anuladas} facturas anuladas`); }
    else if (u.anuladas === 1) { score+=10; r.push(`1 factura anulada`); }
    if (u.ajustes > 10) { score+=20; r.push(`${u.ajustes} ajustes manuales`); }
    else if (u.ajustes > 0) { score+=5; r.push(`${u.ajustes} ajustes`); }
    if (u.damages > 0) { score+=10; r.push(`${u.damages} DAMAGE`); }
    if (u.facturas > 0 && (u.anuladas/u.facturas) > 0.3) { score+=15; r.push(`${((u.anuladas/u.facturas)*100).toFixed(0)}% tasa anulación`); }
    const ico = score===0?'🟢':score<=20?'🟢':score<=50?'🟡':score<=80?'🟠':'🔴';
    const nivel = score===0?'BAJO':score<=20?'BAJO':score<=50?'MEDIO':score<=80?'ALTO':'CRÍTICO';
    console.log(`  ${ico} ${u.name} [${u.role}] — ${score}/100 — ${nivel}`);
    r.forEach(x => console.log(`     · ${x}`));
    if (!r.length) console.log(`     · Sin factores de riesgo`);
    console.log('');
  }

  console.log('━━━ FASE 8: REPORTE EJECUTIVO FINAL ━━━\n');
  const tot = (await db.$queryRawUnsafe(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status='PAID')::int AS pagadas,
      COUNT(*) FILTER (WHERE status='VOIDED')::int AS anuladas,
      COUNT(*) FILTER (WHERE status='PENDING_AUTHORIZATION')::int AS pend_auth,
      COUNT(*) FILTER (WHERE status='PARTIAL')::int AS parciales,
      COUNT(*) FILTER (WHERE status='ISSUED')::int AS emitidas,
      COALESCE(SUM(CASE WHEN status='PAID' THEN total::numeric ELSE 0 END),0)::float AS cobrado,
      COALESCE(SUM(CASE WHEN status IN ('ISSUED','PARTIAL') THEN total::numeric ELSE 0 END),0)::float AS por_cobrar
    FROM invoices WHERE "createdAt" BETWEEN '2026-06-01' AND '2026-06-05'
  `))[0];

  const movs = (await db.$queryRawUnsafe(`
    SELECT
      COUNT(*) FILTER (WHERE "movementType"='IN')::int AS entradas,
      COUNT(*) FILTER (WHERE "movementType"='OUT')::int AS salidas,
      COUNT(*) FILTER (WHERE "movementType"='ADJUSTMENT')::int AS ajustes,
      COUNT(*) FILTER (WHERE "movementType"='DAMAGE')::int AS damages,
      COUNT(*) FILTER (WHERE "movementType"='RETURN')::int AS devoluciones
    FROM inventory_movements WHERE "createdAt" BETWEEN '2026-06-01' AND '2026-06-05'
  `))[0];

  console.log('  ┌─ FINANCIERO ────────────────────────────────────────');
  console.log(`  │  Total facturas:          ${tot.total}`);
  console.log(`  │  ✅ Pagadas:              ${tot.pagadas}  →  $${tot.cobrado.toFixed(2)} cobrados`);
  console.log(`  │  🔄 Parciales:            ${tot.parciales}`);
  console.log(`  │  📋 Emitidas s/cobrar:    ${tot.emitidas}`);
  console.log(`  │  ⏳ Pend. autorización:   ${tot.pend_auth}  (stock insuficiente)`);
  console.log(`  │  ❌ Anuladas:            ${tot.anuladas}`);
  console.log(`  │  💰 Por cobrar:           $${tot.por_cobrar.toFixed(2)}`);
  console.log('  ├─ INVENTARIO ───────────────────────────────────────');
  console.log(`  │  Entradas IN:    ${movs.entradas} | Salidas OUT:  ${movs.salidas}`);
  console.log(`  │  Ajustes:        ${movs.ajustes} | Daños:        ${movs.damages} | Devoluciones: ${movs.devoluciones}`);
  console.log('  ├─ HALLAZGOS CRÍTICOS 🔴 ────────────────────────────');
  const crit = fails.filter(f=>f.n>10);
  if (crit.length) crit.forEach(f=>console.log(`  │  🔴 ${f.email}: ${f.n} logins fallidos — revisar acceso`));
  else console.log('  │  ✓ Ninguno crítico.');
  console.log('  ├─ HALLAZGOS MEDIOS 🟠 ──────────────────────────────');
  if (fails.filter(f=>f.n>3&&f.n<=10).length) fails.filter(f=>f.n>3&&f.n<=10).forEach(f=>console.log(`  │  🟠 ${f.email}: ${f.n} logins fallidos`));
  if (tot.anuladas) console.log(`  │  🟠 ${tot.anuladas} factura(s) anulada(s) — [cmpwutqif] Falta de Inventario`);
  if (tot.pend_auth) console.log(`  │  🟠 ${tot.pend_auth} factura(s) sin autorizar — stock insuficiente sin resolver`);
  console.log('  ├─ HALLAZGOS INFORMATIVOS 🟡 ────────────────────────');
  console.log(`  │  🟡 David Morales: 3 accesos fuera de horario (21:43, 02:22, 06:12)`);
  console.log(`  │  🟡 SALES_TARGET configurado en $10,000 por David (06/03 06:30)`);
  console.log(`  │  🟡 CLI-00005 "JOSE ROSA" desactivado y recreado mismo día (Magdalena)`);
  console.log(`  │  🟡 CLI-00007 "LA CASA DE LAS BATERIAS" creado y desactivado mismo día`);
  console.log(`  │  🟡 FAC-00019 total=$440.001 — posible error de redondeo`);
  console.log(`  │  🟡 Todos pagos en CASH excepto FAC-00023, FAC-00025, FAC-00028 (CARD)`);
  console.log(`  │  🟡 Jonathan Diaz: factura FAC-00011 sin pago registrado en audit_log`);
  console.log('  └────────────────────────────────────────────────────');
  
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  AUDITORÍA COMPLETADA — MODO SOLO LECTURA');
  console.log(`  ${new Date().toLocaleString('es-PR',{timeZone:'America/Puerto_Rico'})}`);
  console.log('═══════════════════════════════════════════════════════════════');
}
main().catch(e=>console.error('ERROR:',e.message)).finally(()=>db.$disconnect());
