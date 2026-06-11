import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  AUDITORÍA FORENSE — THE BUILDER\'S HOUSE ERP');
  console.log('  Período: 2026-06-01 → 2026-06-04 | Solo Lectura');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // FASE 1 — Conteos generales
  console.log('━━━ FASE 1: INVENTARIO DE DATOS ━━━\n');
  const c = (await db.$queryRawUnsafe(`
    SELECT
      (SELECT COUNT(*)::int FROM audit_log WHERE "createdAt" BETWEEN '2026-06-01' AND '2026-06-05') AS audit_logs,
      (SELECT COUNT(*)::int FROM invoices WHERE "createdAt" BETWEEN '2026-06-01' AND '2026-06-05') AS facturas,
      (SELECT COUNT(*)::int FROM payments p JOIN invoices i ON i.id=p."invoiceId" WHERE i."createdAt" BETWEEN '2026-06-01' AND '2026-06-05') AS pagos,
      (SELECT COUNT(*)::int FROM inventory_movements WHERE "createdAt" BETWEEN '2026-06-01' AND '2026-06-05') AS movimientos,
      (SELECT COUNT(*)::int FROM login_attempts WHERE "createdAt" BETWEEN '2026-06-01' AND '2026-06-05') AS logins,
      (SELECT COUNT(*)::int FROM transfers WHERE "createdAt" BETWEEN '2026-06-01' AND '2026-06-05') AS transferencias,
      (SELECT COUNT(*)::int FROM cycle_counts WHERE "createdAt" BETWEEN '2026-06-01' AND '2026-06-05') AS conteos,
      (SELECT COUNT(*)::int FROM purchase_orders WHERE "createdAt" BETWEEN '2026-06-01' AND '2026-06-05') AS ordenes_compra,
      (SELECT COUNT(*)::int FROM customers) AS clientes_total,
      (SELECT COUNT(*)::int FROM users) AS usuarios_total,
      (SELECT COUNT(*)::int FROM products) AS productos_total
  `))[0];

  console.log(`  audit_log:         ${c.audit_logs} entradas`);
  console.log(`  facturas:          ${c.facturas}`);
  console.log(`  pagos:             ${c.pagos}`);
  console.log(`  mov. inventario:   ${c.movimientos}`);
  console.log(`  login attempts:    ${c.logins}`);
  console.log(`  transferencias:    ${c.transferencias}`);
  console.log(`  conteos cíclicos:  ${c.conteos}`);
  console.log(`  órdenes de compra: ${c.ordenes_compra}`);
  console.log(`  clientes (total):  ${c.clientes_total}`);
  console.log(`  usuarios (total):  ${c.usuarios_total}`);
  console.log(`  productos (total): ${c.productos_total}`);

  // FASE 2 — Cronología audit_log
  console.log('\n━━━ FASE 2: CRONOLOGÍA COMPLETA (audit_log) ━━━\n');
  const timeline = await db.$queryRawUnsafe(`
    SELECT al."createdAt", al.action, al."entityType", al."entityId",
           al."ipAddress", al."newValues", al."oldValues",
           u.name AS usuario, u.email, u.role
    FROM audit_log al
    LEFT JOIN users u ON u.id = al."userId"
    WHERE al."createdAt" BETWEEN '2026-06-01' AND '2026-06-05'
    ORDER BY al."createdAt" ASC
  `);
  if (timeline.length === 0) { console.log('  ⚠️  audit_log vacío para este período.'); }
  else {
    timeline.forEach(e => {
      const ts = new Date(e.createdAt).toLocaleString('es-PR',{timeZone:'America/Puerto_Rico',hour12:false});
      const h = new Date(e.createdAt).toLocaleString('en-US',{timeZone:'America/Puerto_Rico',hour:'2-digit',hour12:false});
      const hr = parseInt(h);
      const flag = (hr < 7 || hr >= 20) ? ' ⚠️ [FUERA HORARIO]' : '';
      console.log(`  [${ts}]${flag}`);
      console.log(`    ${e.usuario ?? 'Sistema'} (${e.role ?? 'N/A'}) | ${e.action} | ${e.entityType} ${e.entityId}`);
      if (e.ipAddress) console.log(`    IP: ${e.ipAddress}`);
      if (e.oldValues && Object.keys(e.oldValues).length) console.log(`    Antes: ${JSON.stringify(e.oldValues).substring(0,120)}`);
      if (e.newValues && Object.keys(e.newValues).length) console.log(`    Despues: ${JSON.stringify(e.newValues).substring(0,120)}`);
    });
  }

  // FASE 3 — Análisis por usuario
  console.log('\n━━━ FASE 3: ANÁLISIS POR USUARIO ━━━\n');
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
    const activo = u.isActive ? '✓' : '✗ INACTIVO';
    console.log(`  ┌─ ${u.name} [${u.role}] ${activo}`);
    console.log(`  │  Email: ${u.email}`);
    console.log(`  │  Facturas: ${u.facturas} | Ventas: $${u.ventas.toFixed(2)} | Promedio: $${prom}`);
    console.log(`  │  Anuladas: ${u.anuladas} (${pct}%) | Ajustes: ${u.ajustes} | Daños: ${u.damages}`);
    console.log(`  │  Entradas inv.: ${u.entradas} | Audit entries: ${u.audit_entries}`);
    console.log(`  │  Login OK: ${u.login_ok} | Login fallidos: ${u.login_fallidos}`);
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
    const flag = min < 30 ? ` 🔴 ANULADA EN ${min} MIN` : '';
    console.log(`  → ${f.invoiceNumber} | $${f.totalAmount?.toFixed(2)} | ${f.usuario} | ${f.cliente}${flag}`);
    if (f.notes) console.log(`    Nota: ${f.notes}`);
  });
  if (anuladas.length === 0) console.log('  ✓ Sin facturas anuladas.');

  // Login fallidos
  console.log('\n  LOGIN FALLIDOS:');
  const fails = await db.$queryRawUnsafe(`
    SELECT email, COUNT(*)::int AS n, MAX("createdAt") AS ultimo
    FROM login_attempts WHERE success=false AND "createdAt" BETWEEN '2026-06-01' AND '2026-06-05'
    GROUP BY email ORDER BY n DESC
  `);
  if (fails.length===0) { console.log('  ✓ Ninguno.'); }
  else fails.forEach(f => {
    const flag = f.n>10 ? ' 🔴 CRÍTICO — posible brute force' : f.n>3 ? ' 🟠 ELEVADO' : '';
    console.log(`  ${f.email}: ${f.n} intentos${flag}`);
  });

  // Movimientos fuera de horario
  console.log('\n  OPERACIONES FUERA DE HORARIO (antes 7AM / después 8PM):');
  const offHours = await db.$queryRawUnsafe(`
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
  if (offHours.length===0) { console.log('  ✓ Ninguno.'); }
  else offHours.forEach(m => {
    const ts = new Date(m.createdAt).toLocaleString('es-PR',{timeZone:'America/Puerto_Rico',hour12:false});
    console.log(`  ⚠️  [${ts}] ${m.movementType} qty=${m.quantity} | ${m.usuario} | ${m.sku} | ${m.wh}`);
    if (m.notes) console.log(`       Nota: ${m.notes}`);
  });

  // Ajustes negativos
  console.log('\n  AJUSTES NEGATIVOS de inventario:');
  const negAdj = await db.$queryRawUnsafe(`
    SELECT im."createdAt", im.quantity, im.notes, im."referenceId",
           u.name AS usuario, p.sku, w.name AS wh,
           pl."quantityOnHand" AS stock_actual
    FROM inventory_movements im
    LEFT JOIN users u ON u.id=im."userId"
    LEFT JOIN products p ON p.id=im."productId"
    LEFT JOIN product_locations pl ON pl.id=im."locationId"
    LEFT JOIN warehouses w ON w.id=pl."warehouseId"
    WHERE im."movementType"='ADJUSTMENT' AND im.quantity<0
    AND im."createdAt" BETWEEN '2026-06-01' AND '2026-06-05'
    ORDER BY im."createdAt"
  `);
  if (negAdj.length===0) { console.log('  ✓ Ninguno.'); }
  else negAdj.forEach(a => {
    const ts = new Date(a.createdAt).toLocaleString('es-PR',{timeZone:'America/Puerto_Rico',hour12:false});
    console.log(`  🟠 [${ts}] qty=${a.quantity} | ${a.usuario} | ${a.sku} | ${a.wh} | stock_actual=${a.stock_actual}`);
    if (a.notes) console.log(`      Nota: ${a.notes}`);
  });

  // FASE 5 — Facturación vs Inventario
  console.log('\n━━━ FASE 5: FACTURACIÓN vs INVENTARIO ━━━\n');
  const facturas = await db.$queryRawUnsafe(`
    SELECT i."invoiceNumber", i.status, i."createdAt"::text,
           i."totalAmount"::float, u.name AS usuario, c.name AS cliente,
           COUNT(ii.id)::int AS items, SUM(ii.quantity)::int AS unidades
    FROM invoices i
    LEFT JOIN users u ON u.id=i."userId"
    LEFT JOIN customers c ON c.id=i."customerId"
    LEFT JOIN invoice_items ii ON ii."invoiceId"=i.id
    WHERE i."createdAt" BETWEEN '2026-06-01' AND '2026-06-05'
    GROUP BY i.id, i."invoiceNumber", i.status, i."createdAt", i."totalAmount", u.name, c.name
    ORDER BY i."createdAt"
  `);
  console.log(`  Total facturas: ${facturas.length}`);
  facturas.forEach(f => {
    const statusIcon = f.status==='PAID'?'✅':f.status==='VOIDED'?'❌':'⏳';
    console.log(`  ${statusIcon} ${f.invoicenumber} | $${f.totalamount?.toFixed(2)} | ${f.items} items | ${f.unidades}u | ${f.usuario} → ${f.cliente}`);
  });

  // Transferencias
  console.log('\n  TRANSFERENCIAS en período:');
  const trans = await db.$queryRawUnsafe(`
    SELECT t."transferNumber", t.status, t."createdAt",
           fw.name AS origen, tw.name AS destino,
           uc.name AS creador, ua.name AS confirmador,
           COUNT(tl.id)::int AS lineas, SUM(tl.quantity)::int AS unidades
    FROM transfers t
    LEFT JOIN warehouses fw ON fw.id=t."fromWarehouseId"
    LEFT JOIN warehouses tw ON tw.id=t."toWarehouseId"
    LEFT JOIN users uc ON uc.id=t."createdById"
    LEFT JOIN users ua ON ua.id=t."confirmedById"
    LEFT JOIN transfer_lines tl ON tl."transferId"=t.id
    WHERE t."createdAt" BETWEEN '2026-06-01' AND '2026-06-05'
    GROUP BY t.id, t."transferNumber", t.status, t."createdAt", fw.name, tw.name, uc.name, ua.name
    ORDER BY t."createdAt"
  `);
  if (trans.length===0) { console.log('  ✓ Sin transferencias.'); }
  else trans.forEach(t => {
    console.log(`  ${t.transfernumber} | ${t.status} | ${t.origen}→${t.destino} | ${t.lineas} líneas | ${t.unidades}u | Creador: ${t.creador} | Confirmador: ${t.confirmador ?? 'Pendiente'}`);
  });

  // FASE 6+7 — Score de riesgo
  console.log('\n━━━ FASE 7: SCORE DE RIESGO POR USUARIO ━━━\n');
  for (const u of users) {
    let score = 0; const r = [];
    if (u.login_fallidos > 20) { score+=30; r.push(`🔴 ${u.login_fallidos} login fallidos (+30)`); }
    else if (u.login_fallidos > 10) { score+=20; r.push(`🟠 ${u.login_fallidos} login fallidos (+20)`); }
    else if (u.login_fallidos > 3)  { score+=10; r.push(`🟡 ${u.login_fallidos} login fallidos (+10)`); }
    if (u.anuladas > 2) { score+=25; r.push(`🔴 ${u.anuladas} facturas anuladas (+25)`); }
    else if (u.anuladas > 0) { score+=10; r.push(`🟡 ${u.anuladas} factura(s) anulada(s) (+10)`); }
    if (u.ajustes > 10) { score+=20; r.push(`🟠 ${u.ajustes} ajustes manuales (+20)`); }
    else if (u.ajustes > 0) { score+=5; r.push(`🟡 ${u.ajustes} ajuste(s) (+5)`); }
    if (u.damages > 0) { score+=10; r.push(`🟡 ${u.damages} movimiento(s) DAMAGE (+10)`); }
    if (u.facturas > 0 && (u.anuladas/u.facturas) > 0.3) { score+=15; r.push(`🔴 Tasa anulación ${((u.anuladas/u.facturas)*100).toFixed(0)}% (+15)`); }
    const nivel = score<=20?'🟢 BAJO':score<=50?'🟡 MEDIO':score<=80?'🟠 ALTO':'🔴 CRÍTICO';
    console.log(`  ${nivel} — ${u.name} [${u.role}] — Score: ${score}/100`);
    if (r.length===0) console.log(`    · Sin factores de riesgo`);
    else r.forEach(x => console.log(`    · ${x}`));
    console.log('');
  }

  // FASE 8 — Reporte ejecutivo
  console.log('━━━ FASE 8: REPORTE EJECUTIVO ━━━\n');
  const tot = (await db.$queryRawUnsafe(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status='PAID')::int AS pagadas,
      COUNT(*) FILTER (WHERE status='VOIDED')::int AS anuladas,
      COUNT(*) FILTER (WHERE status='PENDING')::int AS pendientes,
      COUNT(*) FILTER (WHERE status='PARTIAL')::int AS parciales,
      COALESCE(SUM(CASE WHEN status='PAID' THEN "totalAmount"::numeric ELSE 0 END),0)::float AS total_ventas
    FROM invoices WHERE "createdAt" BETWEEN '2026-06-01' AND '2026-06-05'
  `))[0];
  
  const movTot = (await db.$queryRawUnsafe(`
    SELECT
      COUNT(*) FILTER (WHERE "movementType"='IN')::int AS entradas,
      COUNT(*) FILTER (WHERE "movementType"='OUT')::int AS salidas,
      COUNT(*) FILTER (WHERE "movementType"='ADJUSTMENT')::int AS ajustes,
      COUNT(*) FILTER (WHERE "movementType"='DAMAGE')::int AS damages,
      COUNT(*) FILTER (WHERE "movementType"='TRANSFER')::int AS transferencias,
      COUNT(*) FILTER (WHERE "movementType"='RETURN')::int AS devoluciones
    FROM inventory_movements WHERE "createdAt" BETWEEN '2026-06-01' AND '2026-06-05'
  `))[0];

  console.log('  RESUMEN GENERAL:');
  console.log(`  Facturas total:    ${tot.total} (Pagadas: ${tot.pagadas} | Anuladas: ${tot.anuladas} | Pendientes: ${tot.pendientes} | Parciales: ${tot.parciales})`);
  console.log(`  Ventas cobradas:   $${tot.total_ventas.toFixed(2)}`);
  console.log(`  Movimientos inv:   IN=${movTot.entradas} | OUT=${movTot.salidas} | ADJ=${movTot.ajustes} | DMG=${movTot.damages} | TRF=${movTot.transferencias} | RET=${movTot.devoluciones}`);
  console.log(`  Login attempts:    ${c.logins} totales`);
  console.log(`  Audit log entries: ${c.audit_logs}`);

  console.log('\n  HALLAZGOS:');
  const highFails = fails.filter(f=>f.n>10);
  const midFails = fails.filter(f=>f.n>3&&f.n<=10);
  if (highFails.length>0) highFails.forEach(f => console.log(`  🔴 CRÍTICO: ${f.email} — ${f.n} intentos fallidos (posible ataque o bloqueo)`));
  if (midFails.length>0) midFails.forEach(f => console.log(`  🟠 MEDIO: ${f.email} — ${f.n} intentos fallidos`));
  if (anuladas.length>0) console.log(`  🟠 MEDIO: ${anuladas.length} factura(s) anulada(s) en el período`);
  if (offHours.length>0) console.log(`  🟡 INFO: ${offHours.length} movimiento(s) fuera de horario laboral`);
  if (negAdj.length>0) console.log(`  🟡 INFO: ${negAdj.length} ajuste(s) negativo(s) de inventario`);
  if (highFails.length===0 && midFails.length===0 && anuladas.length===0 && offHours.length===0) 
    console.log('  ✅ Sin hallazgos críticos ni medios.');

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  FIN DE AUDITORÍA FORENSE — MODO LECTURA — SIN MODIFICACIONES');
  console.log('  Ejecutado por: Claude Sonnet 4.6 | ' + new Date().toLocaleString('es-PR',{timeZone:'America/Puerto_Rico'}));
  console.log('═══════════════════════════════════════════════════════════════\n');
}

main().catch(e => console.error('ERROR:', e.message)).finally(() => db.$disconnect());
