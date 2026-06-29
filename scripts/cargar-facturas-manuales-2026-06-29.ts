/**
 * Carga retroactiva de 8 facturas manuales del 29/06/2026
 * F07 (FAC-8162) y F10 (FAC-8161) POSPUESTAS por stock insuficiente.
 *
 * Ejecutar: npx tsx scripts/cargar-facturas-manuales-2026-06-29.ts
 */

import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';

const db = new PrismaClient();

// ── Constantes ───────────────────────────────────────────────────────────────

const SJ_WAREHOUSE_ID = 'cmpm5ell00000epvxuj4xx6c7';
const DAVID_ID        = 'cmplghmmp00065lz3z4tq0kl2';
const ISSUE_DATE      = new Date('2026-06-29T12:00:00.000Z');

const TARGET_SKUS = [
  'VS-L4-36X5775-AE',
  'VS-L3-36X5875-BG',
  'VS-L4-30X4575-BG',
  'VS-L4-30X2975-BG',
  'VS-L4-36X2975-BG',
  'VS-L4-24X5775-BG',
];

function genId(): string {
  return 'c' + randomBytes(15).toString('hex').slice(0, 24);
}

// ── Specs de facturas ─────────────────────────────────────────────────────────

interface ItemSpec {
  sku: string;
  quantity: number;
  unitPrice: number;
}

interface InvoiceSpec {
  invoiceNumber: string;
  label: string;
  customerName: string;
  customerPhone: string | null;
  customerAddress: string | null;
  customerExtraNotes: string | null;
  notes: string;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  items: ItemSpec[];
}

const INVOICES: InvoiceSpec[] = [
  {
    invoiceNumber: 'FAC-8167', label: 'F01',
    customerName: 'Gonzales', customerPhone: null, customerAddress: null,
    customerExtraNotes: 'Sin telefono registrado.',
    notes: 'Acabado Acid Etched. Sin telefono registrado.',
    subtotal: 496, taxRate: 0, taxAmount: 0, total: 496,
    items: [
      { sku: 'VS-L4-36X5775-AE', quantity: 2, unitPrice: 248 },
    ],
  },
  {
    invoiceNumber: 'FAC-8164', label: 'F02',
    customerName: 'Paulita Paublino', customerPhone: null, customerAddress: null,
    customerExtraNotes: null,
    notes: 'Operadores 4 N/C.',
    subtotal: 556, taxRate: 0, taxAmount: 0, total: 556,
    items: [
      { sku: 'VS-L3-36X5875-BG', quantity: 2, unitPrice: 278 },
    ],
  },
  {
    invoiceNumber: 'FAC-8159', label: 'F03',
    customerName: 'Jorge Nevares', customerPhone: '787-458-6091',
    customerAddress: 'Dorado, PR', customerExtraNotes: null,
    // $80 entrega incluida en subtotal/total — no hay item de producto para ello
    notes: 'Incluye cargo entrega/envio $80. Jose entregara. Operadores 22 N/C.',
    subtotal: 2808, taxRate: 0, taxAmount: 0, total: 2808,
    items: [
      { sku: 'VS-L4-36X5775-AE', quantity: 11, unitPrice: 248 },
    ],
  },
  {
    invoiceNumber: 'FAC-8158', label: 'F04',
    customerName: 'William Cruz', customerPhone: '787-237-0665',
    customerAddress: 'Toa Baja, PR', customerExtraNotes: null,
    notes: 'Vendedor DM. Tornillos 2 N/C. Operadores 4 N/C.',
    subtotal: 326, taxRate: 0, taxAmount: 0, total: 326,
    items: [
      { sku: 'VS-L4-30X4575-BG', quantity: 2, unitPrice: 163 },
    ],
  },
  {
    invoiceNumber: 'FAC-8160', label: 'F05',
    customerName: 'Josefina Aquino', customerPhone: '787-405-9470',
    customerAddress: null, customerExtraNotes: null,
    notes: 'Operadores 19 N/C. AH. IVU 11.5% aplicado.',
    subtotal: 1684, taxRate: 0.115, taxAmount: 193.66, total: 1877.66,
    items: [
      { sku: 'VS-L4-30X4575-BG', quantity: 8, unitPrice: 163 },
      { sku: 'VS-L4-30X2975-BG', quantity: 2, unitPrice: 119 },
      { sku: 'VS-L4-36X2975-BG', quantity: 1, unitPrice: 142 },
    ],
  },
  {
    invoiceNumber: 'FAC-8163', label: 'F06',
    customerName: 'Norberto', customerPhone: '787-512-2664',
    customerAddress: null, customerExtraNotes: null,
    notes: 'Operadores 4 N/C.',
    subtotal: 326, taxRate: 0, taxAmount: 0, total: 326,
    items: [
      { sku: 'VS-L4-30X4575-BG', quantity: 2, unitPrice: 163 },
    ],
  },
  {
    invoiceNumber: 'FAC-8166', label: 'F08',
    customerName: 'Gustavo Moraza', customerPhone: '787-318-6926',
    customerAddress: null, customerExtraNotes: 'Contacto alterno Wilda 787-640-3126.',
    notes: 'Contacto alterno Wilda 787-640-3126. Operadores 16 N/C.',
    subtotal: 1304, taxRate: 0, taxAmount: 0, total: 1304,
    items: [
      { sku: 'VS-L4-24X5775-BG', quantity: 8, unitPrice: 163 },
    ],
  },
  {
    invoiceNumber: 'FAC-8165', label: 'F09',
    customerName: 'Damir Pacheco', customerPhone: '939-264-1100',
    customerAddress: null, customerExtraNotes: null,
    notes: 'Operadores 12 N/C.',
    subtotal: 978, taxRate: 0, taxAmount: 0, total: 978,
    items: [
      { sku: 'VS-L4-30X4575-BG', quantity: 6, unitPrice: 163 },
    ],
  },
];

// ── Helpers de snapshot ───────────────────────────────────────────────────────

async function printSkuStock(label: string) {
  type Row = { sku: string; qty: number };
  const rows = await db.$queryRaw<Row[]>`
    SELECT p.sku, pl."quantityOnHand" AS qty
    FROM products p
    JOIN product_locations pl ON pl."productId" = p.id
    WHERE pl."warehouseId" = ${SJ_WAREHOUSE_ID}
      AND p.sku = ANY(${TARGET_SKUS}::text[])
    ORDER BY p.sku
  `;
  console.log(`\n${label}`);
  for (const r of rows) console.log(`  ${r.sku.padEnd(22)} qty=${r.qty}`);
  return Object.fromEntries(rows.map(r => [r.sku, r.qty]));
}

// ── PASO 0 — Snapshot inicial ─────────────────────────────────────────────────

async function paso0() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('PASO 0 — SNAPSHOT INICIAL');

  const [{ count: totalInvoices }] = await db.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*)::bigint AS count FROM invoices
  `;
  console.log(`\n  Total facturas en BD: ${totalInvoices}`);

  const stockBefore = await printSkuStock('  Stock actual de SKUs afectados:');

  // Buscar clientes por teléfono para info
  const phones = INVOICES.map(i => i.customerPhone).filter(Boolean) as string[];
  if (phones.length > 0) {
    type CRow = { name: string; phone: string; id: string };
    const existing = await db.$queryRaw<CRow[]>`
      SELECT name, phone, id FROM customers
      WHERE phone = ANY(${phones}::text[])
    `;
    console.log(`\n  Clientes en BD que coinciden por telefono (${existing.length} encontrados):`);
    for (const c of existing) console.log(`    [${c.phone}] ${c.name} — id: ${c.id}`);
  }

  return stockBefore;
}

// ── PASO 1 — Validaciones pre-ejecución ──────────────────────────────────────

async function paso1() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('PASO 1 — VALIDACIONES');

  // Warehouse
  const warehouse = await db.warehouse.findUnique({ where: { id: SJ_WAREHOUSE_ID } });
  if (!warehouse) throw new Error('ABORT: Warehouse San Juan no encontrado');
  console.log(`  ✓ Warehouse: ${warehouse.name} (${SJ_WAREHOUSE_ID})`);

  // Usuario David
  const user = await db.user.findUnique({ where: { id: DAVID_ID } });
  if (!user) throw new Error('ABORT: Usuario David Morales no encontrado');
  console.log(`  ✓ Usuario: ${user.name} (${DAVID_ID})`);

  // SKUs
  type PRow = { sku: string; id: string; locId: string | null };
  const skuRows = await db.$queryRaw<PRow[]>`
    SELECT p.sku, p.id, pl.id AS "locId"
    FROM products p
    LEFT JOIN product_locations pl
      ON pl."productId" = p.id AND pl."warehouseId" = ${SJ_WAREHOUSE_ID}
    WHERE p.sku = ANY(${TARGET_SKUS}::text[])
  `;
  const skuMap: Record<string, { productId: string; locationId: string }> = {};
  for (const sku of TARGET_SKUS) {
    const row = skuRows.find(r => r.sku === sku);
    if (!row) throw new Error(`ABORT: SKU '${sku}' no existe en products`);
    if (!row.locId) throw new Error(`ABORT: SKU '${sku}' existe pero sin ubicacion en San Juan`);
    skuMap[sku] = { productId: row.id, locationId: row.locId };
  }
  console.log(`  ✓ ${TARGET_SKUS.length} SKUs verificados con ubicacion en San Juan`);

  // Duplicados de invoiceNumber
  const invoiceNumbers = INVOICES.map(i => i.invoiceNumber);
  type IRow = { invoiceNumber: string };
  const existing = await db.$queryRaw<IRow[]>`
    SELECT "invoiceNumber" FROM invoices
    WHERE "invoiceNumber" = ANY(${invoiceNumbers}::text[])
  `;
  if (existing.length > 0) {
    console.log(`  ⚠️  Facturas ya existentes: ${existing.map(r => r.invoiceNumber).join(', ')}`);
    for (const row of existing) {
      const idx = INVOICES.findIndex(i => i.invoiceNumber === row.invoiceNumber);
      if (idx >= 0) INVOICES.splice(idx, 1);
    }
    console.log(`  ℹ  Se saltarán esas facturas. Quedan ${INVOICES.length} por crear.`);
  } else {
    console.log(`  ✓ Ninguna de las ${invoiceNumbers.length} facturas existe — todas son nuevas`);
  }

  return skuMap;
}

// ── PASO 2 — Resolución de clientes ──────────────────────────────────────────

interface CustomerResolution {
  invoiceNumber: string;
  customerId: string;
  action: 'REUTILIZADO' | 'CREADO';
  name: string;
}

async function paso2(): Promise<CustomerResolution[]> {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('PASO 2 — RESOLUCION DE CLIENTES');

  const resolutions: CustomerResolution[] = [];

  for (const inv of INVOICES) {
    let customerId: string | null = null;
    let action: 'REUTILIZADO' | 'CREADO' = 'CREADO';

    // a) Buscar por teléfono exacto
    if (inv.customerPhone) {
      const match = await db.customer.findFirst({
        where: { phone: inv.customerPhone },
        select: { id: true, name: true },
      });
      if (match) {
        customerId = match.id;
        action = 'REUTILIZADO';
        console.log(`  ${inv.label} ${inv.customerName} — REUTILIZADO por telefono ${inv.customerPhone} (id: ${customerId})`);
      }
    }

    // b) Si no: buscar por nombre (prefijo, case-insensitive)
    if (!customerId) {
      type CRow = { id: string; name: string };
      const nameMatches = await db.$queryRaw<CRow[]>`
        SELECT id, name FROM customers
        WHERE name ILIKE ${inv.customerName + '%'}
        LIMIT 5
      `;
      if (nameMatches.length === 1) {
        customerId = nameMatches[0]!.id;
        action = 'REUTILIZADO';
        console.log(`  ${inv.label} ${inv.customerName} — REUTILIZADO por nombre (id: ${customerId})`);
      } else if (nameMatches.length > 1) {
        throw new Error(
          `ABORT: multiples clientes coinciden con '${inv.customerName}':\n` +
          nameMatches.map(m => `  ${m.id} — ${m.name}`).join('\n') +
          '\nEspecificar cual usar antes de continuar.'
        );
      }
    }

    // c) Crear si no hay match
    if (!customerId) {
      // Generar code desde sequence atómicamente
      type SeqRow = { prefix: string; padding: number; currentValue: number };
      const [seq] = await db.$queryRaw<SeqRow[]>`
        UPDATE sequences
        SET "currentValue" = "currentValue" + 1, "updatedAt" = NOW()
        WHERE name = 'CUSTOMER'
        RETURNING prefix, padding, "currentValue"
      `;
      if (!seq) throw new Error('ABORT: Sequence CUSTOMER no encontrada');
      const code = `${seq.prefix}${String(seq.currentValue).padStart(seq.padding, '0')}`;

      const notesArr = [inv.customerExtraNotes].filter(Boolean);
      const newCustomer = await db.customer.create({
        data: {
          id: genId(),
          code,
          name: inv.customerName,
          phone: inv.customerPhone ?? undefined,
          address: inv.customerAddress ?? undefined,
          notes: notesArr.length > 0 ? notesArr.join(' ') : undefined,
          type: 'RETAIL',
          creditLimit: 0,
          currentBalance: 0,
          isActive: true,
          createdAt: ISSUE_DATE,
        },
      });
      customerId = newCustomer.id;
      action = 'CREADO';
      console.log(`  ${inv.label} ${inv.customerName} — CREADO (code: ${code}, id: ${customerId})`);
    }

    resolutions.push({ invoiceNumber: inv.invoiceNumber, customerId, action, name: inv.customerName });
  }

  return resolutions;
}

// ── PASO 3 — Transacción principal ───────────────────────────────────────────

interface InvoiceResult {
  invoiceNumber: string;
  invoiceId: string;
  total: number;
  itemsCreated: number;
  movementsCreated: number;
}

async function paso3(
  skuMap: Record<string, { productId: string; locationId: string }>,
  resolutions: CustomerResolution[],
): Promise<InvoiceResult[]> {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('PASO 3 — TRANSACCION PRINCIPAL');

  const results: InvoiceResult[] = [];

  await db.$transaction(async (tx) => {
    for (const inv of INVOICES) {
      const resolution = resolutions.find(r => r.invoiceNumber === inv.invoiceNumber)!;
      const invoiceId = genId();

      // 3.1 — Crear invoice
      await tx.$executeRaw`
        INSERT INTO invoices
          (id, "invoiceNumber", "customerId", "branchId", "createdById",
           type, status, subtotal, "taxRate", "taxAmount", total, "paidAmount",
           "paymentTerms", notes, "createdAt", "updatedAt")
        VALUES (
          ${invoiceId}, ${inv.invoiceNumber}, ${resolution.customerId},
          ${SJ_WAREHOUSE_ID}, ${DAVID_ID},
          'INVOICE', 'PAID',
          ${inv.subtotal}, ${inv.taxRate}, ${inv.taxAmount}, ${inv.total}, ${inv.total},
          'CONTADO', ${inv.notes}, ${ISSUE_DATE}, ${ISSUE_DATE}
        )
      `;

      let itemsCreated = 0;
      let movementsCreated = 0;

      // 3.2 + 3.3 + 3.4 — Items, movimientos y stock por cada línea de producto
      for (const item of inv.items) {
        const { productId, locationId } = skuMap[item.sku]!;
        const lineTotal = item.quantity * item.unitPrice;
        const itemId = genId();
        const movId  = genId();

        // Invoice item
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

        // Guard anti-stock-negativo + actualización
        type LocRow = { qty: number };
        const [loc] = await tx.$queryRaw<LocRow[]>`
          SELECT "quantityOnHand" AS qty
          FROM product_locations
          WHERE id = ${locationId}
          FOR UPDATE
        `;
        if (!loc) throw new Error(`ABORT: product_location no encontrada para ${item.sku}`);
        if (loc.qty - item.quantity < 0) {
          throw new Error(
            `ABORT: ${item.sku} quedaría negativo — stock actual: ${loc.qty}, se intenta sacar: ${item.quantity}`
          );
        }

        await tx.$executeRaw`
          UPDATE product_locations
          SET "quantityOnHand" = "quantityOnHand" - ${item.quantity}, "updatedAt" = NOW()
          WHERE id = ${locationId}
        `;

        // Movimiento OUT (cantidad negativa per convención)
        await tx.$executeRaw`
          INSERT INTO inventory_movements
            (id, "productId", "locationId", "movementType", quantity,
             "referenceType", "referenceId", "userId", notes,
             "requiresApproval", "createdAt")
          VALUES (
            ${movId}, ${productId}, ${locationId},
            'OUT', ${-item.quantity},
            'INVOICE', ${invoiceId}, ${DAVID_ID},
            ${'Venta ' + inv.invoiceNumber + ', factura manual 29/06/2026'},
            false, ${ISSUE_DATE}
          )
        `;
        movementsCreated++;
      }

      // 3.5 — Payment (factura PAID = cash recibido ese día)
      const paymentId = genId();
      await tx.$executeRaw`
        INSERT INTO payments
          (id, "invoiceId", amount, method, "receivedById", "paidAt", notes)
        VALUES (
          ${paymentId}, ${invoiceId}, ${inv.total},
          'CASH', ${DAVID_ID}, ${ISSUE_DATE},
          ${'Cobro efectivo — factura manual 29/06/2026'}
        )
      `;

      results.push({
        invoiceNumber: inv.invoiceNumber,
        invoiceId,
        total: inv.total,
        itemsCreated,
        movementsCreated,
      });

      console.log(`  ✓ ${inv.label} ${inv.invoiceNumber} — $${inv.total.toFixed(2)} — items: ${itemsCreated}, movs: ${movementsCreated}`);
    }
  });

  return results;
}

// ── PASO 4 — Snapshot final y reporte ────────────────────────────────────────

async function paso4(
  stockBefore: Record<string, number>,
  resolutions: CustomerResolution[],
  results: InvoiceResult[],
) {
  console.log('\n═══════════════════════════════════════════════════');
  const stockAfter = await printSkuStock('PASO 4 — STOCK FINAL:');

  const created  = resolutions.filter(r => r.action === 'CREADO').length;
  const reused   = resolutions.filter(r => r.action === 'REUTILIZADO').length;
  const totalItems = results.reduce((s, r) => s + r.itemsCreated, 0);
  const totalMovs  = results.reduce((s, r) => s + r.movementsCreated, 0);
  const grandTotal = results.reduce((s, r) => s + r.total, 0);
  const subtotalSum = INVOICES.reduce((s, i) => s + i.subtotal, 0);
  const ivuSum      = INVOICES.reduce((s, i) => s + i.taxAmount, 0);

  console.log('\n═══════════════════════════════════════════════════');
  console.log('✅ CARGA DE FACTURAS MANUALES 29/06/2026');
  console.log('═══════════════════════════════════════════════════');
  console.log(`Facturas creadas:    ${results.length} / ${INVOICES.length}`);
  console.log(`Items creados:       ${totalItems}`);
  console.log(`Movimientos OUT:     ${totalMovs}`);
  console.log(`Clientes creados:    ${created}`);
  console.log(`Clientes reusados:   ${reused}`);
  console.log(`Subtotal:            $${subtotalSum.toFixed(2)}`);
  console.log(`IVU:                 $${ivuSum.toFixed(2)}`);
  console.log(`Total general:       $${grandTotal.toFixed(2)}`);
  console.log('\nStock final:');
  for (const sku of TARGET_SKUS) {
    const before = stockBefore[sku] ?? '?';
    const after  = stockAfter[sku]  ?? '?';
    console.log(`  ${sku.padEnd(22)} ${String(after).padStart(4)}  (era ${before})`);
  }
  console.log('\nPENDIENTES (no aplicadas):');
  console.log('  FAC-8162 Carlos Civiles     — esperando verificacion stock');
  console.log('  FAC-8161 Monica Rodriguez   — esperando verificacion stock');
  console.log('═══════════════════════════════════════════════════');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const stockBefore = await paso0();
  const skuMap      = await paso1();
  const resolutions = await paso2();
  const results     = await paso3(skuMap, resolutions);
  await paso4(stockBefore, resolutions, results);
}

main()
  .catch(e => { console.error('\n❌ ERROR:', e.message ?? e); process.exit(1); })
  .finally(() => db.$disconnect());
