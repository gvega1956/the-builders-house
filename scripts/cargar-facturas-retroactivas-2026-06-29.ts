/**
 * Carga retroactiva de FAC-8162 y FAC-8161 (29/06/2026)
 * Registro contable PURO — sin movimientos de inventario.
 * Las ventas ya están reflejadas en el conteo físico del 29/06.
 *
 * Ejecutar: npx tsx scripts/cargar-facturas-retroactivas-2026-06-29.ts
 */

import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';

const db = new PrismaClient();

const SJ_WAREHOUSE_ID = 'cmpm5ell00000epvxuj4xx6c7';
const DAVID_ID        = 'cmplghmmp00065lz3z4tq0kl2';
const ISSUE_DATE      = new Date('2026-06-29T14:00:00.000Z');

// SKUs involucrados — solo para validación y snapshot (NO se toca stock)
const CHECK_SKUS = ['VS-L4-36X2175-AE', 'VS-L3-24X4675-BG', 'VS-L3-24X2275-BG'];

function genId(): string {
  return 'c' + randomBytes(15).toString('hex').slice(0, 24);
}

interface ItemSpec { sku: string; quantity: number; unitPrice: number }

interface InvoiceSpec {
  invoiceNumber: string;
  customerName: string;
  customerPhone: string;
  notes: string;
  subtotal: number;
  total: number;
  items: ItemSpec[];
}

const INVOICES: InvoiceSpec[] = [
  {
    invoiceNumber: 'FAC-8162',
    customerName: 'Carlos Civiles',
    customerPhone: '787-315-0698',
    notes: 'Factura manual del 29/06/2026 cargada retroactivamente. Operadores 1 N/C. NO se creo movimiento de inventario porque la venta ya estaba reflejada en el conteo fisico del 29/06 (stock post-venta = 0).',
    subtotal: 108,
    total: 108,
    items: [
      { sku: 'VS-L4-36X2175-AE', quantity: 1, unitPrice: 108 },
    ],
  },
  {
    invoiceNumber: 'FAC-8161',
    customerName: 'Monica Rodriguez',
    customerPhone: '787-566-5666',
    notes: 'Factura manual del 29/06/2026 cargada retroactivamente. Medida del papel "24x45 3/4" L-3 corregida a 24x46 3/4 (medida estandar). Operadores 24 N/C. NO se crearon movimientos de inventario porque las ventas ya estaban reflejadas en el conteo fisico del 29/06.',
    subtotal: 1800,
    total: 1800,
    items: [
      { sku: 'VS-L3-24X4675-BG', quantity: 11, unitPrice: 148 },
      { sku: 'VS-L3-24X2275-BG', quantity: 2,  unitPrice: 86  },
    ],
  },
];

// ── Snapshot stock (sin tocar nada) ──────────────────────────────────────────

async function stockSnapshot(label: string): Promise<Record<string, number>> {
  type Row = { sku: string; qty: number };
  const rows = await db.$queryRaw<Row[]>`
    SELECT p.sku, COALESCE(pl."quantityOnHand", 0) AS qty
    FROM products p
    LEFT JOIN product_locations pl
      ON pl."productId" = p.id AND pl."warehouseId" = ${SJ_WAREHOUSE_ID}
    WHERE p.sku = ANY(${CHECK_SKUS}::text[])
    ORDER BY p.sku
  `;
  console.log(`\n${label}`);
  for (const r of rows) console.log(`  ${r.sku.padEnd(24)} qty=${r.qty}`);
  return Object.fromEntries(rows.map(r => [r.sku, r.qty]));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('FACTURAS RETROACTIVAS 29/06/2026 — SOLO CONTABLE');
  console.log('═══════════════════════════════════════════════════');

  // PASO 0 — Snapshot inicial
  const stockBefore = await stockSnapshot('PASO 0 — STOCK INICIAL (no debe cambiar):');

  // PASO 0 — Validaciones
  console.log('\nPASO 0 — VALIDACIONES');

  const warehouse = await db.warehouse.findUnique({ where: { id: SJ_WAREHOUSE_ID } });
  if (!warehouse) throw new Error('ABORT: Warehouse San Juan no encontrado');
  console.log(`  ✓ Warehouse: ${warehouse.name}`);

  const user = await db.user.findUnique({ where: { id: DAVID_ID } });
  if (!user) throw new Error('ABORT: Usuario David Morales no encontrado');
  console.log(`  ✓ Usuario: ${user.name}`);

  // Verificar SKUs
  type PRow = { sku: string; id: string; locId: string | null };
  const skuRows = await db.$queryRaw<PRow[]>`
    SELECT p.sku, p.id, pl.id AS "locId"
    FROM products p
    LEFT JOIN product_locations pl
      ON pl."productId" = p.id AND pl."warehouseId" = ${SJ_WAREHOUSE_ID}
    WHERE p.sku = ANY(${CHECK_SKUS}::text[])
  `;
  const skuMap: Record<string, { productId: string; locationId: string | null }> = {};
  for (const sku of CHECK_SKUS) {
    const row = skuRows.find(r => r.sku === sku);
    if (!row) throw new Error(`ABORT: SKU '${sku}' no existe en products`);
    skuMap[sku] = { productId: row.id, locationId: row.locId ?? null };
  }
  console.log(`  ✓ ${CHECK_SKUS.length} SKUs verificados`);

  // Verificar duplicados
  type IRow = { invoiceNumber: string };
  const dups = await db.$queryRaw<IRow[]>`
    SELECT "invoiceNumber" FROM invoices
    WHERE "invoiceNumber" IN ('FAC-8162', 'FAC-8161')
  `;
  if (dups.length > 0) {
    throw new Error(`ABORT: Ya existen facturas: ${dups.map(r => r.invoiceNumber).join(', ')}`);
  }
  console.log('  ✓ FAC-8162 y FAC-8161 no existen — nuevas');

  // PASO 1 — Resolución de clientes
  console.log('\nPASO 1 — RESOLUCION DE CLIENTES');

  const customerIds: Record<string, string> = {};
  const newCustomers: string[] = [];

  for (const inv of INVOICES) {
    const match = await db.customer.findFirst({
      where: { phone: inv.customerPhone },
      select: { id: true, name: true },
    });

    if (match) {
      customerIds[inv.invoiceNumber] = match.id;
      console.log(`  ${inv.customerName} — REUTILIZADO (${inv.customerPhone}, id: ${match.id})`);
    } else {
      // Crear cliente nuevo con código de sequence
      type SeqRow = { prefix: string; padding: number; currentValue: number };
      const [seq] = await db.$queryRaw<SeqRow[]>`
        UPDATE sequences
        SET "currentValue" = "currentValue" + 1, "updatedAt" = NOW()
        WHERE name = 'CUSTOMER'
        RETURNING prefix, padding, "currentValue"
      `;
      if (!seq) throw new Error('ABORT: Sequence CUSTOMER no encontrada');
      const code = `${seq.prefix}${String(seq.currentValue).padStart(seq.padding, '0')}`;

      const newCust = await db.customer.create({
        data: {
          id: genId(),
          code,
          name: inv.customerName,
          phone: inv.customerPhone,
          type: 'RETAIL',
          creditLimit: 0,
          currentBalance: 0,
          isActive: true,
          createdAt: ISSUE_DATE,
        },
      });
      customerIds[inv.invoiceNumber] = newCust.id;
      newCustomers.push(inv.customerName);
      console.log(`  ${inv.customerName} — CREADO (code: ${code}, id: ${newCust.id})`);
    }
  }

  // PASO 2 — Transacción única (solo facturas + items, sin stock ni movimientos)
  console.log('\nPASO 2 — TRANSACCION (facturas + items, SIN movimientos ni stock)');

  const results: Array<{ invoiceNumber: string; invoiceId: string; itemsCreated: number }> = [];

  await db.$transaction(async (tx) => {
    for (const inv of INVOICES) {
      const customerId = customerIds[inv.invoiceNumber]!;
      const invoiceId  = genId();

      // 2.1 — Crear factura
      await tx.$executeRaw`
        INSERT INTO invoices
          (id, "invoiceNumber", "customerId", "branchId", "createdById",
           type, status, subtotal, "taxRate", "taxAmount", total, "paidAmount",
           "paymentTerms", "dueDate", notes, "createdAt", "updatedAt")
        VALUES (
          ${invoiceId}, ${inv.invoiceNumber}, ${customerId},
          ${SJ_WAREHOUSE_ID}, ${DAVID_ID},
          'INVOICE', 'PAID',
          ${inv.subtotal}, 0, 0, ${inv.total}, ${inv.total},
          'CONTADO', ${ISSUE_DATE}, ${inv.notes},
          ${ISSUE_DATE}, ${ISSUE_DATE}
        )
      `;

      // 2.2 — Payment
      const paymentId = genId();
      await tx.$executeRaw`
        INSERT INTO payments
          (id, "invoiceId", amount, method, "receivedById", "paidAt", notes)
        VALUES (
          ${paymentId}, ${invoiceId}, ${inv.total},
          'CASH', ${DAVID_ID}, ${ISSUE_DATE},
          ${'Cobro efectivo — factura manual retroactiva 29/06/2026'}
        )
      `;

      let itemsCreated = 0;

      for (const item of inv.items) {
        const { productId } = skuMap[item.sku]!;
        let locationId = skuMap[item.sku]!.locationId;

        // Si no existe product_location en SJ, crearla con qty=0
        if (!locationId) {
          locationId = genId();
          await tx.$executeRaw`
            INSERT INTO product_locations
              (id, "productId", "warehouseId", "locationCode",
               "quantityOnHand", "reservedQuantity", "backorderQuantity", "updatedAt")
            VALUES (${locationId}, ${productId}, ${SJ_WAREHOUSE_ID},
              'PRINCIPAL', 0, 0, 0, NOW())
            ON CONFLICT ("productId", "warehouseId") DO UPDATE
              SET "updatedAt" = NOW()
            RETURNING id
          `;
          // Releer el id por si el ON CONFLICT actualizó uno existente
          type LRow = { id: string };
          const [existing] = await tx.$queryRaw<LRow[]>`
            SELECT id FROM product_locations
            WHERE "productId" = ${productId} AND "warehouseId" = ${SJ_WAREHOUSE_ID}
          `;
          locationId = existing!.id;
          console.log(`    ⚠️  ${item.sku}: product_location no existía en SJ → creada con qty=0`);
        }

        const lineTotal = item.quantity * item.unitPrice;
        const itemId    = genId();

        // 2.3 — Invoice item (sin movimiento de inventario)
        await tx.$executeRaw`
          INSERT INTO invoice_items
            (id, "invoiceId", "productId", "locationId", quantity,
             "unitPrice", "discountPercent", "lineTotal", "quantityBackordered")
          VALUES (
            ${itemId}, ${invoiceId}, ${productId}, ${locationId},
            ${item.quantity}, ${item.unitPrice}, 0, ${lineTotal}, 0
          )
        `;
        itemsCreated++;
      }

      results.push({ invoiceNumber: inv.invoiceNumber, invoiceId, itemsCreated });
      console.log(`  ✓ ${inv.invoiceNumber} — $${inv.total.toFixed(2)} — items: ${itemsCreated}, movs: 0`);
    }
  });

  // PASO 3 — Verificación post-ejecución
  console.log('\nPASO 3 — VERIFICACION POST-EJECUCION');
  const stockAfter = await stockSnapshot('  Stock final (debe ser idéntico al inicial):');

  let stockOk = true;
  for (const sku of CHECK_SKUS) {
    if (stockBefore[sku] !== stockAfter[sku]) {
      stockOk = false;
      console.error(`  ❌ ALERTA: ${sku} cambió de ${stockBefore[sku]} a ${stockAfter[sku]}`);
    }
  }
  if (stockOk) console.log('  ✓ Stock sin cambios — correcto');

  // ── Resumen final ────────────────────────────────────────────────────────────

  const totalItems = results.reduce((s, r) => s + r.itemsCreated, 0);
  const grandTotal = INVOICES.reduce((s, i) => s + i.total, 0);
  const totalAnterior = 8671.66;

  console.log('\n═══════════════════════════════════════════════════');
  console.log('✅ FACTURAS RETROACTIVAS CARGADAS');
  console.log('═══════════════════════════════════════════════════');
  console.log(`Facturas creadas:        2 / 2`);
  console.log(`Items creados:           ${totalItems}`);
  console.log(`Movimientos creados:     0`);
  console.log(`Clientes nuevos:         ${newCustomers.length}${newCustomers.length > 0 ? ' (' + newCustomers.join(', ') + ')' : ''}`);
  console.log(`Stock SJ sin cambios:    ${stockOk ? '✓' : '❌ REVISAR'}`);
  console.log('');
  console.log(`Total estas 2 facturas:  $${grandTotal.toFixed(2)}`);
  console.log(`Total 8 anteriores:      $${totalAnterior.toFixed(2)}`);
  console.log(`Total del dia 29/06:     $${(grandTotal + totalAnterior).toFixed(2)}`);
  console.log('');
  console.log('Stock SJ (sin cambio):');
  for (const sku of CHECK_SKUS) {
    console.log(`  ${sku.padEnd(24)} ${stockBefore[sku]} -> ${stockAfter[sku]}`);
  }
  console.log('═══════════════════════════════════════════════════');
}

main()
  .catch(e => { console.error('\n❌ ERROR:', e.message ?? e); process.exit(1); })
  .finally(() => db.$disconnect());
