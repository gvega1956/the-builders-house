import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';
import { TRPCError } from '@trpc/server';
import { Prisma } from '@prisma/client';
import { getNextSequenceValue } from '@/lib/sequences';
import { toDecimal } from '@/lib/money';
import { calculateAvailableStock } from '@/lib/inventory';

// locationId is optional at the schema level; superRefine on the parent
// object makes it required when type === 'INVOICE'.
const invoiceItemSchema = z.object({
  productId: z.string().cuid(),
  locationId: z.string().cuid().optional(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().positive(),
  discountPercent: z.number().min(0).max(100).default(0),
  discountReason: z.string().min(1).optional(),
});

type LocationRow = {
  id: string;
  productId: string;
  quantityOnHand: number;
  reservedQuantity: number;
};

// Extracted to avoid repeating Decimal arithmetic between QUOTE and INVOICE paths.
// Returns itemsData WITHOUT locationId — this is the explicit strip for QUOTE items,
// which must always have locationId=NULL in the DB.
// The INVOICE path maps itemsData → invoiceItemsData adding locationId back (see below).
//
// Bug 2.6 — lineTotal invariant:
//   invoiceItemSchema has no lineTotal field: Zod strips any lineTotal the frontend sends.
//   Every lineTotal is computed here from unitPrice × quantity × discountFactor.
//   subtotal is the exact Decimal sum of all lineTotals — never independently recomputed.
//   The assertion below guards against future refactors that compute subtotal via a
//   different code path (e.g., order-level discounts), which would silently break the
//   per-item lineTotal ↔ subtotal invariant.
function calcInvoiceTotals(items: z.infer<typeof invoiceItemSchema>[], taxRate: number) {
  const itemsData = items.map((item) => {
    const discountFactor = toDecimal(1).sub(toDecimal(item.discountPercent).div(100));
    return {
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: toDecimal(item.unitPrice),
      discountPercent: toDecimal(item.discountPercent),
      lineTotal: toDecimal(item.unitPrice).mul(item.quantity).mul(discountFactor),
      // locationId explicitly excluded: guarantees QUOTE items get locationId=NULL.
    };
  });

  const subtotal = itemsData.reduce((sum, i) => sum.add(i.lineTotal), toDecimal(0));

  // Bug 2.6: sanity — subtotal must equal sum(lineTotal).
  // Currently tautological (subtotal IS that sum); fires only if this function is
  // refactored to compute subtotal via a separate path while lineTotals stay unchanged.
  const lineTotalSum = itemsData.reduce((s, i) => s.add(i.lineTotal), toDecimal(0));
  if (!lineTotalSum.eq(subtotal)) {
    console.error(
      `[BUG-2.6] lineTotal sum (${lineTotalSum.toString()}) ≠ subtotal (${subtotal.toString()}) — calculation inconsistency detected`,
    );
  }

  const taxRateDecimal = toDecimal(taxRate);
  const taxAmount = subtotal.mul(taxRateDecimal);
  const total = subtotal.add(taxAmount);

  return { itemsData, subtotal, taxRateDecimal, taxAmount, total };
}

// Bug 2.7: minimum-price validation helper.
// VENDOR cannot create below-cost invoices or quotes.
// MANAGER/ADMIN can, but must supply discountReason per item.
// Returns the list of below-cost items for audit-log inclusion (empty = all at or above cost).
type BelowCostItem = {
  productId: string;
  productName: string;
  unitCost: string;
  soldAt: string;
  discountReason: string;
};

function validateItemPricing(
  items: Array<{ productId: string; unitPrice: Prisma.Decimal; discountReason?: string }>,
  productMap: Map<string, { name: string; unitCost: Prisma.Decimal }>,
  role: string,
): BelowCostItem[] {
  const below: BelowCostItem[] = [];
  for (const item of items) {
    const product = productMap.get(item.productId);
    if (!product) continue;
    if (product.unitCost.gt(item.unitPrice)) {
      if (role === 'VENDOR') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: `El precio $${item.unitPrice} del producto '${product.name}' es inferior al costo ($${product.unitCost}). Los VENDORs no pueden vender bajo costo.`,
        });
      }
      if (!item.discountReason) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `El precio $${item.unitPrice} del producto '${product.name}' es inferior al costo ($${product.unitCost}). Proporciona discountReason para autorizar esta venta bajo costo.`,
        });
      }
      below.push({
        productId: item.productId,
        productName: product.name,
        unitCost: product.unitCost.toString(),
        soldAt: item.unitPrice.toString(),
        discountReason: item.discountReason,
      });
    }
  }
  return below;
}

export const invoicingRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        status: z
          .enum(['DRAFT', 'ISSUED', 'PAID', 'PARTIAL', 'VOIDED', 'PENDING_AUTHORIZATION', 'CONVERTED'])
          .optional(),
        customerId: z.string().optional(),
        from: z.date().optional(),
        to: z.date().optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(1000).default(50),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const { search, status, customerId, from, to, page = 1, pageSize = 50 } = input ?? {};
      const skip = (page - 1) * pageSize;

      const where: Prisma.InvoiceWhereInput = {
        ...(status && { status }),
        ...(customerId && { customerId }),
        ...(from || to
          ? { createdAt: { ...(from && { gte: from }), ...(to && { lte: to }) } }
          : {}),
        ...(search && {
          OR: [
            { invoiceNumber: { contains: search, mode: 'insensitive' } },
            { customer: { name: { contains: search, mode: 'insensitive' } } },
          ],
        }),
      };

      const [invoices, total] = await Promise.all([
        ctx.db.invoice.findMany({
          where,
          include: {
            customer: { select: { name: true, code: true, type: true } },
            createdBy: { select: { name: true } },
            _count: { select: { items: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: pageSize,
        }),
        ctx.db.invoice.count({ where }),
      ]);

      return { invoices, total, page, pageSize };
    }),

  byId: protectedProcedure
    .input(z.string().cuid())
    .query(async ({ ctx, input }) => {
      const invoice = await ctx.db.invoice.findUnique({
        where: { id: input },
        include: {
          customer: true,
          createdBy: { select: { name: true, email: true } },
          items: {
            include: { product: { select: { name: true, sku: true } } },
          },
          payments: {
            include: { receivedBy: { select: { name: true } } },
            orderBy: { paidAt: 'desc' },
          },
        },
      });
      if (!invoice) throw new TRPCError({ code: 'NOT_FOUND' });
      return invoice;
    }),

  create: protectedProcedure
    .input(
      z.object({
        customerId: z.string().cuid(),
        type: z.enum(['INVOICE', 'QUOTE', 'CREDIT_NOTE']).default('INVOICE'),
        items: z.array(invoiceItemSchema).min(1),
        taxRate: z.number().min(0).max(1).default(0.115),
        dueDate: z.date().optional(),
        notes: z.string().optional(),
      }).superRefine(({ type, items }, ctx) => {
        // locationId is required for INVOICE items; QUOTE skips location selection
        if (type === 'INVOICE') {
          items.forEach((item, i) => {
            if (!item.locationId) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['items', i, 'locationId'],
                message: 'locationId es requerido para facturas de tipo INVOICE',
              });
            }
          });
        }
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { items, taxRate, type, ...rest } = input;
      const { itemsData, subtotal, taxRateDecimal, taxAmount, total } = calcInvoiceTotals(
        items,
        taxRate,
      );

      // ── CREDIT_NOTE: pendiente de implementación (ver TD-005) ──────────────
      if (type === 'CREDIT_NOTE') {
        throw new TRPCError({
          code: 'METHOD_NOT_SUPPORTED',
          message: 'CREDIT_NOTE no implementado — ver TD-005 en docs/technical-debt.md',
        });
      }

      // Role declared here (not in INVOICE-only block) so Bug 2.7 pricing applies to both paths.
      const role = (ctx.session!.user as { role?: string }).role ?? 'VENDOR';
      const canOverrideStock = role === 'ADMIN' || role === 'MANAGER';

      // Bug 2.7: validate minimum price (Option A — applies to QUOTE and INVOICE).
      const productIds = [...new Set(items.map((i) => i.productId))];
      const pricedProducts = await ctx.db.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, name: true, unitCost: true },
      });
      const productMap = new Map(
        pricedProducts.map((p) => [p.id, { name: p.name, unitCost: p.unitCost }]),
      );
      const pricingItems = items.map((item) => ({
        productId: item.productId,
        unitPrice: toDecimal(item.unitPrice),
        discountReason: item.discountReason,
      }));
      const belowCostItems = validateItemPricing(pricingItems, productMap, role);

      // ── QUOTE: sin movimientos de inventario ──────────────────────────────
      // Cotizaciones no descuentan stock ni bloquean ubicaciones.
      // Usan la secuencia QUOTE (COT-XXXXX), no la secuencia INVOICE.
      if (type === 'QUOTE') {
        return ctx.db.$transaction(async (tx) => {
          const invoiceNumber = await getNextSequenceValue(tx, 'QUOTE');
          return tx.invoice.create({
            data: {
              ...rest,
              type,
              invoiceNumber,
              subtotal,
              taxRate: taxRateDecimal,
              taxAmount,
              total,
              createdById: ctx.session!.user!.id!,
              status: 'ISSUED',
              items: { create: itemsData },
            },
            include: { items: true },
          });
        });
      }

      // ── INVOICE: transacción completa con lock pesimista y movimientos ─────
      // Añade locationId a cada item — necesario para que authorizeBackorder
      // pueda releer la ubicación original desde invoice_items al autorizar.
      const invoiceItemsData = itemsData.map((d, idx) => ({
        ...d,
        locationId: items[idx]!.locationId,
      }));

      const invoice = await ctx.db.$transaction(async (tx) => {
        // 1. Lock todas las ubicaciones afectadas, en orden ascendente por ID.
        //    El orden consistente previene deadlocks cuando dos facturas concurrentes
        //    bloquean los mismos productos en distinto orden de items.
        const locationIds = [...new Set(items.map((i) => i.locationId!))].sort();
        const lockedLocations = new Map<string, LocationRow>();

        for (const locId of locationIds) {
          const rows = await tx.$queryRaw<LocationRow[]>`
            SELECT id, "productId", "quantityOnHand", "reservedQuantity"
            FROM product_locations
            WHERE id = ${locId}
            FOR UPDATE
          `;
          if (!rows[0]) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: `Ubicación '${locId}' no encontrada`,
            });
          }
          lockedLocations.set(locId, rows[0]!);
        }

        // 2. Validar que cada ubicación pertenece al producto declarado en el item.
        for (const item of items) {
          const loc = lockedLocations.get(item.locationId!)!;
          if (loc.productId !== item.productId) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `La ubicación '${item.locationId}' no pertenece al producto '${item.productId}'`,
            });
          }
        }

        // 3. Verificar disponibilidad. Usa calculateAvailableStock (quantityOnHand -
        //    reservedQuantity) para respetar reservas de facturas DRAFT en vuelo.
        const shortages: Array<{ productId: string; requested: number; available: number }> = [];
        for (const item of items) {
          const loc = lockedLocations.get(item.locationId!)!;
          const available = calculateAvailableStock(loc);
          if (available < item.quantity) {
            shortages.push({ productId: item.productId, requested: item.quantity, available });
          }
        }

        const hasShortage = shortages.length > 0;
        const invoiceNumber = await getNextSequenceValue(tx, 'INVOICE');

        // 4a. VENDOR con stock insuficiente → PENDING_AUTHORIZATION, sin movimientos.
        //     El stock NO se toca hasta que un MANAGER autorice la factura.
        if (hasShortage && !canOverrideStock) {
          const created = await tx.invoice.create({
            data: {
              ...rest,
              type,
              invoiceNumber,
              subtotal,
              taxRate: taxRateDecimal,
              taxAmount,
              total,
              createdById: ctx.session!.user!.id!,
              status: 'PENDING_AUTHORIZATION',
              items: { create: invoiceItemsData },
            },
            include: { items: true },
          });

          await tx.auditLog.create({
            data: {
              userId: ctx.session!.user!.id!,
              action: 'CREATE',
              entityType: 'Invoice',
              entityId: created.id,
              newValues: {
                invoiceNumber,
                status: 'PENDING_AUTHORIZATION',
                reason: 'Stock insuficiente — requiere autorización de MANAGER',
                shortages,
              } as Prisma.InputJsonValue,
              ipAddress: ctx.req.headers.get('x-forwarded-for') ?? undefined,
            },
          });

          return created;
        }

        // 4b. Stock suficiente, o MANAGER/ADMIN override → ISSUED con movimientos.
        const created = await tx.invoice.create({
          data: {
            ...rest,
            type,
            invoiceNumber,
            subtotal,
            taxRate: taxRateDecimal,
            taxAmount,
            total,
            createdById: ctx.session!.user!.id!,
            status: 'ISSUED',
            items: { create: invoiceItemsData },
          },
          include: { items: true },
        });

        // 5. Movimientos OUT y decremento de stock por cada item.
        //    quantity negativo: convención de signos del Bug 1.3 (OUT → quantity < 0).
        for (const item of items) {
          await tx.inventoryMovement.create({
            data: {
              productId: item.productId,
              locationId: item.locationId!,
              movementType: 'OUT',
              quantity: -item.quantity,
              referenceType: 'INVOICE',
              referenceId: invoiceNumber,
              userId: ctx.session!.user!.id!,
              ipAddress: ctx.req.headers.get('x-forwarded-for') ?? undefined,
            },
          });

          await tx.productLocation.update({
            where: { id: item.locationId! },
            data: { quantityOnHand: { decrement: item.quantity } },
          });
        }

        // 6. Bug 2.4: increment customer.currentBalance by the invoice total.
        await tx.customer.update({
          where: { id: input.customerId },
          data: { currentBalance: { increment: total } },
        });

        // 7. Audit log. Si MANAGER forzó stock negativo, lo registra explícitamente
        //    para que quede trazabilidad del override en el log de auditoría.
        const auditValues: Record<string, unknown> = {
          invoiceNumber,
          status: 'ISSUED',
          itemCount: items.length,
          total: total.toString(),
        };
        if (hasShortage && canOverrideStock) {
          auditValues.managerStockOverride = true;
          auditValues.shortagesOverridden = shortages;
          auditValues.authorizedBy = role;
        }
        if (belowCostItems.length > 0) {
          auditValues.belowCostSale = true;
          auditValues.belowCostItems = belowCostItems;
          auditValues.authorizedBy = role;
        }

        await tx.auditLog.create({
          data: {
            userId: ctx.session!.user!.id!,
            action: 'CREATE',
            entityType: 'Invoice',
            entityId: created.id,
            newValues: auditValues as Prisma.InputJsonValue,
            ipAddress: ctx.req.headers.get('x-forwarded-for') ?? undefined,
          },
        });

        return created;
      });

      return invoice;
    }),

  addPayment: protectedProcedure
    .input(
      z.object({
        invoiceId: z.string().cuid(),
        amount: z.number().positive(),
        method: z.enum(['CASH', 'CHECK', 'TRANSFER', 'CARD', 'CREDIT']),
        reference: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const invoice = await ctx.db.invoice.findUnique({ where: { id: input.invoiceId } });
      if (!invoice) throw new TRPCError({ code: 'NOT_FOUND' });

      // Type guard: QUOTE cannot receive payments
      if (invoice.type === 'QUOTE') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No se pueden registrar pagos a cotizaciones. Convierte a factura primero.',
        });
      }

      // Status guards: only ISSUED and PARTIAL accept payments
      if (invoice.status === 'VOIDED')
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'La factura está anulada.' });
      if (invoice.status === 'PAID')
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'La factura ya está completamente pagada.' });
      if (invoice.status === 'PENDING_AUTHORIZATION')
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'La factura está pendiente de autorización. Autorízala antes de registrar pagos.',
        });
      if (invoice.status === 'DRAFT')
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'La factura en borrador debe emitirse antes de recibir pagos.',
        });
      if (invoice.status === 'CONVERTED')
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Esta cotización ya fue convertida a factura. El pago debe aplicarse a la factura derivada.',
        });

      const balanceDue = invoice.total.sub(invoice.paidAmount);
      if (toDecimal(input.amount).gt(balanceDue)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `El pago ($${input.amount}) excede el balance pendiente ($${balanceDue.toString()})`,
        });
      }

      const totalPaid = invoice.paidAmount.add(toDecimal(input.amount));
      const newStatus = totalPaid.gte(invoice.total) ? 'PAID' : 'PARTIAL';

      return ctx.db.$transaction(async (tx) => {
        const payment = await tx.payment.create({
          data: {
            invoiceId: input.invoiceId,
            amount: toDecimal(input.amount),
            method: input.method,
            reference: input.reference,
            notes: input.notes,
            receivedById: ctx.session!.user!.id!,
          },
        });

        await tx.invoice.update({
          where: { id: input.invoiceId },
          data: { paidAmount: totalPaid, status: newStatus },
        });

        // Bug 2.4: decrement customer.currentBalance by the payment amount
        await tx.customer.update({
          where: { id: invoice.customerId },
          data: { currentBalance: { decrement: toDecimal(input.amount) } },
        });

        await tx.auditLog.create({
          data: {
            userId: ctx.session!.user!.id!,
            action: 'PAYMENT',
            entityType: 'Invoice',
            entityId: input.invoiceId,
            newValues: {
              amount: input.amount,
              method: input.method,
              reference: input.reference ?? null,
              previousBalance: balanceDue.toString(),
              newBalance: balanceDue.sub(toDecimal(input.amount)).toString(),
              previousStatus: invoice.status,
              newStatus,
            } as Prisma.InputJsonValue,
            ipAddress: ctx.req.headers.get('x-forwarded-for') ?? undefined,
          },
        });

        return payment;
      });
    }),

  void: protectedProcedure
    .input(z.object({ id: z.string().cuid(), reason: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const invoice = await ctx.db.invoice.findUnique({
        where: { id: input.id },
        include: { items: true },
      });
      if (!invoice) throw new TRPCError({ code: 'NOT_FOUND' });
      if (invoice.status === 'VOIDED')
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Ya está anulada' });
      if (invoice.status === 'PAID')
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No se puede anular una factura pagada' });
      if (invoice.status === 'CONVERTED')
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No se puede anular una cotización ya convertida a factura.',
        });

      return ctx.db.$transaction(async (tx) => {
        const voided = await tx.invoice.update({
          where: { id: input.id },
          data: {
            status: 'VOIDED',
            notes: `[ANULADA: ${input.reason}]${invoice.notes ? ' — ' + invoice.notes : ''}`,
          },
        });

        // Regla 3 (ADR-002): if voiding an INVOICE derived from a QUOTE, revert the
        // QUOTE from CONVERTED back to ISSUED when no other active INVOICEs remain.
        if (invoice.sourceQuoteId) {
          const otherActive = await tx.invoice.count({
            where: {
              sourceQuoteId: invoice.sourceQuoteId,
              id: { not: input.id },
              status: { notIn: ['VOIDED'] },
            },
          });
          if (otherActive === 0) {
            await tx.invoice.update({
              where: { id: invoice.sourceQuoteId },
              data: { status: 'ISSUED' },
            });
          }
        }

        // Bug 2.2: restore inventory when voiding a stock-decremented INVOICE.
        // Only ISSUED and PARTIAL had OUT movements created (PENDING_AUTHORIZATION did not).
        // QUOTE never creates OUT movements so it is excluded by type check.
        const needsInventoryReversal =
          invoice.type === 'INVOICE' &&
          (invoice.status === 'ISSUED' || invoice.status === 'PARTIAL');

        const orphanItems: Array<{ productId: string; quantity: number }> = [];

        if (needsInventoryReversal) {
          for (const item of invoice.items) {
            if (!item.locationId) {
              // ON DELETE SET NULL nullified this item's location — cannot restore stock.
              // Log for traceability; do not block the void.
              orphanItems.push({ productId: item.productId, quantity: item.quantity });
              continue;
            }

            await tx.inventoryMovement.create({
              data: {
                productId: item.productId,
                locationId: item.locationId,
                movementType: 'RETURN',
                quantity: item.quantity, // positive: stock re-entry (sign convention)
                referenceType: 'INVOICE',
                referenceId: invoice.invoiceNumber,
                userId: ctx.session!.user!.id!,
                ipAddress: ctx.req.headers.get('x-forwarded-for') ?? undefined,
              },
            });

            await tx.productLocation.update({
              where: { id: item.locationId },
              data: { quantityOnHand: { increment: item.quantity } },
            });
          }
        }

        // Bug 2.4: remove the outstanding balance of this invoice from customer.currentBalance.
        // Formula: total - paidAmount covers both ISSUED (paidAmount=0) and PARTIAL cases.
        if (needsInventoryReversal) {
          await tx.customer.update({
            where: { id: invoice.customerId },
            data: { currentBalance: { decrement: invoice.total.sub(invoice.paidAmount) } },
          });
        }

        const auditNewValues: Record<string, unknown> = { reason: input.reason };
        if (orphanItems.length > 0) {
          auditNewValues.stockNotRestoredItems = orphanItems;
          auditNewValues.stockNotRestoredReason =
            'locationId=NULL — ubicación eliminada; stock de estos ítems no fue restaurado';
        }

        await tx.auditLog.create({
          data: {
            userId: ctx.session!.user!.id!,
            action: 'VOID',
            entityType: 'Invoice',
            entityId: input.id,
            newValues: auditNewValues as Prisma.InputJsonValue,
            ipAddress: ctx.req.headers.get('x-forwarded-for') ?? undefined,
          },
        });

        return voided;
      });
    }),

  authorizeBackorder: protectedProcedure
    .input(
      z.object({
        id: z.string().cuid(),
        authorizationNotes: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const role = (ctx.session!.user as { role?: string }).role ?? 'VENDOR';
      if (role !== 'ADMIN' && role !== 'MANAGER') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Solo MANAGER o ADMIN pueden autorizar backorders.',
        });
      }

      const invoice = await ctx.db.invoice.findUnique({
        where: { id: input.id },
        include: { items: true },
      });
      if (!invoice) throw new TRPCError({ code: 'NOT_FOUND' });
      if (invoice.status !== 'PENDING_AUTHORIZATION') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Estado actual: ${invoice.status}. Solo facturas PENDING_AUTHORIZATION pueden autorizarse.`,
        });
      }

      // ON DELETE SET NULL could have nulled locationId if the ProductLocation was
      // deleted between invoice creation and authorization. We cannot create a movement
      // to a non-existent location — fail explicitly so the manager knows to recreate
      // the invoice with valid locations.
      const orphanItems = invoice.items.filter((i) => !i.locationId);
      if (orphanItems.length > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `${orphanItems.length} ítem(s) tienen la ubicación original eliminada (locationId=NULL). Recree la factura con ubicaciones válidas antes de autorizar.`,
        });
      }

      return ctx.db.$transaction(async (tx) => {
        // Lock all affected locations in ascending ID order to prevent deadlocks.
        const locationIds = [...new Set(invoice.items.map((i) => i.locationId!))].sort();

        for (const locId of locationIds) {
          const rows = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT id FROM product_locations WHERE id = ${locId} FOR UPDATE
          `;
          if (!rows[0]) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: `Ubicación '${locId}' no encontrada. Puede haber sido eliminada después de crear la factura.`,
            });
          }
        }

        // Create OUT movements and decrement stock per item.
        // Stock may go negative — that is the explicit MANAGER decision being recorded here.
        for (const item of invoice.items) {
          await tx.inventoryMovement.create({
            data: {
              productId: item.productId,
              locationId: item.locationId!,
              movementType: 'OUT',
              quantity: -item.quantity,
              referenceType: 'INVOICE',
              referenceId: invoice.invoiceNumber,
              userId: ctx.session!.user!.id!,
              ipAddress: ctx.req.headers.get('x-forwarded-for') ?? undefined,
            },
          });

          await tx.productLocation.update({
            where: { id: item.locationId! },
            data: { quantityOnHand: { decrement: item.quantity } },
          });
        }

        const updated = await tx.invoice.update({
          where: { id: input.id },
          data: { status: 'ISSUED' },
          include: { items: true },
        });

        // Bug 2.4: now that stock is committed, add to customer.currentBalance.
        await tx.customer.update({
          where: { id: invoice.customerId },
          data: { currentBalance: { increment: invoice.total } },
        });

        await tx.auditLog.create({
          data: {
            userId: ctx.session!.user!.id!,
            action: 'AUTHORIZE_BACKORDER',
            entityType: 'Invoice',
            entityId: input.id,
            newValues: {
              invoiceNumber: invoice.invoiceNumber,
              previousStatus: 'PENDING_AUTHORIZATION',
              newStatus: 'ISSUED',
              authorizationNotes: input.authorizationNotes,
              authorizedById: ctx.session!.user!.id!,
              managerStockOverride: true,
            } as Prisma.InputJsonValue,
            ipAddress: ctx.req.headers.get('x-forwarded-for') ?? undefined,
          },
        });

        return updated;
      });
    }),

  convertQuoteToInvoice: protectedProcedure
    .input(
      z.object({
        quoteId: z.string().cuid(),
        // Each item must carry locationId — QUOTE items have locationId=NULL in DB.
        // If undefined, the frontend must provide it; there is no auto-selection yet.
        items: z
          .array(
            z.object({
              productId: z.string().cuid(),
              locationId: z.string().cuid(),
              quantity: z.number().int().positive(),
              discountReason: z.string().min(1).optional(),
            })
          )
          .min(1)
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!input.items) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message:
            'Se requiere especificar la ubicación (locationId) de cada ítem. Proporciona el array items con productId, locationId y quantity.',
        });
      }
      const resolvedItems = input.items;

      const quote = await ctx.db.invoice.findUnique({
        where: { id: input.quoteId },
        include: { items: true },
      });
      if (!quote) throw new TRPCError({ code: 'NOT_FOUND' });
      if (quote.type !== 'QUOTE') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `El documento ${quote.invoiceNumber} no es una cotización.`,
        });
      }
      if (quote.status !== 'ISSUED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Estado actual: ${quote.status}. Solo cotizaciones ISSUED pueden convertirse.`,
        });
      }

      // Regla 4 (ADR-002): fast-path check before entering the transaction.
      // Authoritative re-check happens under pessimistic lock inside the transaction.
      const existingActive = await ctx.db.invoice.findFirst({
        where: {
          sourceQuoteId: input.quoteId,
          status: { notIn: ['VOIDED'] },
        },
        select: { invoiceNumber: true },
      });
      if (existingActive) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Esta cotización ya fue convertida a la factura ${existingActive.invoiceNumber}. Anule esa factura primero si desea re-emitir.`,
        });
      }

      // Option A: inherit unit prices and discounts from original QUOTE items.
      // Cotizaciones son compromisos comerciales — el precio acordado no cambia al convertir.
      const quotePriceMap = new Map(
        quote.items.map((qi) => [
          qi.productId,
          { unitPrice: qi.unitPrice, discountPercent: qi.discountPercent },
        ])
      );

      for (const item of resolvedItems) {
        if (!quotePriceMap.has(item.productId)) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `El producto '${item.productId}' no estaba en la cotización original ${quote.invoiceNumber}.`,
          });
        }
      }

      // Build invoice items with inherited prices. quantity comes from resolvedItems
      // (may differ from quote — client may buy partial quantities).
      const invoiceItemsData = resolvedItems.map((item) => {
        const price = quotePriceMap.get(item.productId)!;
        const discountFactor = toDecimal(1).sub(price.discountPercent.div(100));
        return {
          productId: item.productId,
          locationId: item.locationId,
          quantity: item.quantity,
          unitPrice: price.unitPrice,
          discountPercent: price.discountPercent,
          lineTotal: price.unitPrice.mul(item.quantity).mul(discountFactor),
        };
      });

      const subtotal = invoiceItemsData.reduce(
        (sum, i) => sum.add(i.lineTotal),
        toDecimal(0)
      );
      // Tax rate is NOT inherited — IVU is a legal obligation at the time of sale,
      // not a commercial commitment like price. Use current default rate.
      // If multi-municipality IVU is implemented later, derive from customer.municipality.
      const taxRateDecimal = toDecimal(0.115); // Current PR IVU
      const taxAmount = subtotal.mul(taxRateDecimal);
      const total = subtotal.add(taxAmount);

      const role = (ctx.session!.user as { role?: string }).role ?? 'VENDOR';
      const canOverrideStock = role === 'ADMIN' || role === 'MANAGER';

      // Bug 2.7: validate minimum price at conversion time (prices inherited from QUOTE).
      const productIdsForCost = [...new Set(resolvedItems.map((i) => i.productId))];
      const pricedProductsForConvert = await ctx.db.product.findMany({
        where: { id: { in: productIdsForCost } },
        select: { id: true, name: true, unitCost: true },
      });
      const productCostMap = new Map(
        pricedProductsForConvert.map((p) => [p.id, { name: p.name, unitCost: p.unitCost }]),
      );
      const convertPricingItems = resolvedItems.map((item) => {
        const price = quotePriceMap.get(item.productId)!;
        return {
          productId: item.productId,
          unitPrice: price.unitPrice,
          discountReason: item.discountReason,
        };
      });
      const belowCostItems = validateItemPricing(convertPricingItems, productCostMap, role);

      return ctx.db.$transaction(async (tx) => {
        // Lock the QUOTE row first to serialize concurrent convertQuoteToInvoice calls.
        // A second concurrent call waits here; once it acquires the lock, the QUOTE
        // status will be CONVERTED and the status check below will fail cleanly.
        await tx.$queryRaw`
          SELECT id FROM invoices WHERE id = ${input.quoteId} FOR UPDATE
        `;

        // Authoritative Regla 4 re-check under lock (prevents TOCTOU race).
        const activeUnderLock = await tx.invoice.findFirst({
          where: {
            sourceQuoteId: input.quoteId,
            status: { notIn: ['VOIDED'] },
          },
          select: { invoiceNumber: true },
        });
        if (activeUnderLock) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Esta cotización ya fue convertida a la factura ${activeUnderLock.invoiceNumber}. Anule esa factura primero si desea re-emitir.`,
          });
        }

        // Lock all product locations in ascending ID order to prevent deadlocks.
        const locationIds = [...new Set(resolvedItems.map((i) => i.locationId))].sort();
        const lockedLocations = new Map<string, LocationRow>();

        for (const locId of locationIds) {
          const rows = await tx.$queryRaw<LocationRow[]>`
            SELECT id, "productId", "quantityOnHand", "reservedQuantity"
            FROM product_locations
            WHERE id = ${locId}
            FOR UPDATE
          `;
          if (!rows[0]) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: `Ubicación '${locId}' no encontrada.`,
            });
          }
          lockedLocations.set(locId, rows[0]!);
        }

        // Validate each location belongs to the declared product.
        for (const item of resolvedItems) {
          const loc = lockedLocations.get(item.locationId)!;
          if (loc.productId !== item.productId) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `La ubicación '${item.locationId}' no pertenece al producto '${item.productId}'.`,
            });
          }
        }

        // Re-validate stock availability at conversion time.
        // The QUOTE may have been created weeks ago; stock may have changed.
        const shortages: Array<{ productId: string; requested: number; available: number }> = [];
        for (const item of resolvedItems) {
          const loc = lockedLocations.get(item.locationId)!;
          const available = calculateAvailableStock(loc);
          if (available < item.quantity) {
            shortages.push({ productId: item.productId, requested: item.quantity, available });
          }
        }

        const hasShortage = shortages.length > 0;
        const invoiceNumber = await getNextSequenceValue(tx, 'INVOICE');
        const invoiceStatus =
          hasShortage && !canOverrideStock ? 'PENDING_AUTHORIZATION' : 'ISSUED';

        // Create the new INVOICE derived from the QUOTE.
        const newInvoice = await tx.invoice.create({
          data: {
            customerId: quote.customerId,
            type: 'INVOICE',
            invoiceNumber,
            subtotal,
            taxRate: taxRateDecimal,
            taxAmount,
            total,
            createdById: ctx.session!.user!.id!,
            status: invoiceStatus,
            // dueDate is NOT inherited — QUOTE.dueDate means "quote validity",
            // INVOICE.dueDate means "payment due date". Different concepts.
            // Future: derive from customer.paymentTerms (NET-30, etc.) — see TD-008.
            dueDate: null,
            sourceQuoteId: input.quoteId,
            items: { create: invoiceItemsData },
          },
          include: { items: true },
        });

        // Create OUT movements only when ISSUED (stock confirmed or MANAGER override).
        if (invoiceStatus === 'ISSUED') {
          for (const item of resolvedItems) {
            await tx.inventoryMovement.create({
              data: {
                productId: item.productId,
                locationId: item.locationId,
                movementType: 'OUT',
                quantity: -item.quantity,
                referenceType: 'INVOICE',
                referenceId: invoiceNumber,
                userId: ctx.session!.user!.id!,
                ipAddress: ctx.req.headers.get('x-forwarded-for') ?? undefined,
              },
            });

            await tx.productLocation.update({
              where: { id: item.locationId },
              data: { quantityOnHand: { decrement: item.quantity } },
            });
          }

          // Bug 2.4: INVOICE is now committed — add to customer.currentBalance.
          await tx.customer.update({
            where: { id: quote.customerId },
            data: { currentBalance: { increment: total } },
          });
        }

        // Mark original QUOTE as CONVERTED (Regla 2, ADR-002).
        await tx.invoice.update({
          where: { id: input.quoteId },
          data: { status: 'CONVERTED' },
        });

        const auditValues: Record<string, unknown> = {
          quoteId: input.quoteId,
          quoteNumber: quote.invoiceNumber,
          invoiceNumber,
          status: invoiceStatus,
          itemCount: resolvedItems.length,
          total: total.toString(),
          priceInheritedFromQuote: true,
          taxRateInheritedFromQuote: false,
          taxRateApplied: taxRateDecimal.toString(),
        };
        if (hasShortage && !canOverrideStock) {
          auditValues.reason = 'Stock insuficiente — requiere autorización de MANAGER';
          auditValues.shortages = shortages;
        }
        if (hasShortage && canOverrideStock) {
          auditValues.managerStockOverride = true;
          auditValues.shortagesOverridden = shortages;
          auditValues.authorizedBy = role;
        }
        if (invoiceStatus === 'ISSUED' && belowCostItems.length > 0) {
          auditValues.belowCostSale = true;
          auditValues.belowCostItems = belowCostItems;
          auditValues.authorizedBy = role;
        }

        await tx.auditLog.create({
          data: {
            userId: ctx.session!.user!.id!,
            action: 'CONVERT_QUOTE',
            entityType: 'Invoice',
            entityId: newInvoice.id,
            newValues: auditValues as Prisma.InputJsonValue,
            ipAddress: ctx.req.headers.get('x-forwarded-for') ?? undefined,
          },
        });

        return newInvoice;
      });
    }),
});
