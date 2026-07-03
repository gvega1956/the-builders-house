import { z } from 'zod';
import { createTRPCRouter, protectedProcedure, managerProcedure } from '@/server/trpc';
import { TRPCError } from '@trpc/server';
import { Prisma } from '@prisma/client';
import { getNextSequenceValue } from '@/lib/sequences';
import { toDecimal } from '@/lib/money';
import { calculateAvailableStock } from '@/lib/inventory';
import { detectInvoiceVoidAnomalies, detectInvoiceCreateAnomalies } from '@/lib/anomaly-detector';
import { sendInvoiceEmail, type InvoiceEmailData } from '@/lib/email';

// locationId es opcional a nivel de schema; superRefine en el objeto padre
// lo hace requerido cuando type === 'INVOICE' o 'CREDIT_NOTE'.
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

// Calcula totales de factura con aritmética Decimal exacta.
// itemsData NO incluye locationId — se agrega en cada path según el tipo.
// subtotal = suma exacta de lineTotals (nunca recomputado independientemente).
function calcInvoiceTotals(items: z.infer<typeof invoiceItemSchema>[], taxRate: number) {
  const itemsData = items.map((item) => {
    const discountFactor = toDecimal(1).sub(toDecimal(item.discountPercent).div(100));
    return {
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: toDecimal(item.unitPrice),
      discountPercent: toDecimal(item.discountPercent),
      lineTotal: toDecimal(item.unitPrice).mul(item.quantity).mul(discountFactor),
    };
  });

  const subtotal = itemsData.reduce((sum, i) => sum.add(i.lineTotal), toDecimal(0));
  const taxRateDecimal = toDecimal(taxRate);
  const taxAmount = subtotal.mul(taxRateDecimal);
  const total = subtotal.add(taxAmount);

  return { itemsData, subtotal, taxRateDecimal, taxAmount, total };
}

// Valida precios mínimos por item.
// VENDOR: no puede vender bajo costo (lanza FORBIDDEN).
// MANAGER/ADMIN: puede, pero debe incluir discountReason por item.
// Retorna los items bajo costo para el audit log.
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
        type: z.enum(['INVOICE', 'QUOTE', 'CREDIT_NOTE']).optional(),
        status: z
          .enum(['DRAFT', 'ISSUED', 'PAID', 'PARTIAL', 'VOIDED', 'PENDING_AUTHORIZATION', 'CONVERTED'])
          .optional(),
        customerId: z.string().optional(),
        branchId: z.string().cuid().optional(),
        from: z.date().optional(),
        to: z.date().optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(1000).default(50),
        // Cotizaciones convertidas son referencia histórica — se ocultan por defecto
        hideConverted: z.boolean().default(true),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const { search, type, status, customerId, branchId, from, to, page = 1, pageSize = 50, hideConverted = true } = input ?? {};
      const skip = (page - 1) * pageSize;

      const where: Prisma.InvoiceWhereInput = {
        ...(type && { type }),
        // Si se pide explícitamente un status, respetarlo; si no, excluir CONVERTED
        ...(status
          ? { status }
          : hideConverted
            ? { status: { not: 'CONVERTED' } }
            : {}),
        ...(customerId && { customerId }),
        ...(branchId && { branchId }),
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

      const [invoices, total, agg] = await Promise.all([
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
        ctx.db.invoice.aggregate({
          where,
          _sum: { subtotal: true, taxAmount: true, total: true, paidAmount: true },
        }),
      ]);

      return {
        invoices, total, page, pageSize,
        totals: {
          subtotal: Number(agg._sum.subtotal ?? 0),
          tax:      Number(agg._sum.taxAmount ?? 0),
          total:    Number(agg._sum.total ?? 0),
          paid:     Number(agg._sum.paidAmount ?? 0),
        },
      };
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
          sourceInvoice: { select: { invoiceNumber: true } },
        },
      });
      if (!invoice) throw new TRPCError({ code: 'NOT_FOUND' });
      return invoice;
    }),

  create: protectedProcedure
    .input(
      z.object({
        customerId: z.string().cuid(),
        branchId: z.string().cuid().optional(),
        type: z.enum(['INVOICE', 'QUOTE', 'CREDIT_NOTE']).default('INVOICE'),
        items: z.array(invoiceItemSchema).min(1),
        taxRate: z.number().min(0).max(1).default(0.115),
        paymentTerms: z.enum(['CONTADO', 'CREDITO']).default('CONTADO'),
        dueDate: z.date().optional(),
        notes: z.string().optional(),
        sourceInvoiceId: z.string().cuid().optional(),
      }).superRefine(({ type, items, sourceInvoiceId }, ctx) => {
        // locationId requerido para INVOICE y CREDIT_NOTE
        if (type === 'INVOICE' || type === 'CREDIT_NOTE') {
          items.forEach((item, i) => {
            if (!item.locationId) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['items', i, 'locationId'],
                message: `locationId es requerido para documentos de tipo ${type}`,
              });
            }
          });
        }
        // sourceInvoiceId requerido para CREDIT_NOTE
        if (type === 'CREDIT_NOTE' && !sourceInvoiceId) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['sourceInvoiceId'],
            message: 'Una Nota de Crédito debe referenciar la factura original (sourceInvoiceId requerido)',
          });
        }
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { items, type, ...rest } = input;

      // Tasa IVU: si el cliente envía 0 → exento (se respeta).
      // Cualquier valor no-cero → se sustituye por la tasa configurada en systemConfig
      // para que el frontend no pueda manipular la tasa (solo puede habilitarla o eximirla).
      const taxConfig = await ctx.db.systemConfig.findUnique({ where: { key: 'TAX_RATE' } });
      const configuredRate = taxConfig ? Number(taxConfig.value) : 0.115;
      const taxRate = input.taxRate === 0 ? 0 : configuredRate;

      const { itemsData, subtotal, taxRateDecimal, taxAmount, total } = calcInvoiceTotals(
        items,
        taxRate,
      );

      // ── CREDIT_NOTE ────────────────────────────────────────────────────────
      if (type === 'CREDIT_NOTE') {
        return ctx.db.$transaction(async (tx) => {
          // Validar factura origen: debe existir, pertenecer al mismo cliente,
          // y estar en estado que admita devolución.
          const sourceInvoice = await tx.invoice.findUnique({
            where: { id: rest.sourceInvoiceId! },
            select: { customerId: true, status: true, type: true, invoiceNumber: true },
          });
          if (!sourceInvoice) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Factura original no encontrada' });
          }
          if (sourceInvoice.customerId !== rest.customerId) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'La factura original no pertenece al mismo cliente',
            });
          }
          if (sourceInvoice.type !== 'INVOICE') {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Solo se puede crear una NC sobre una factura de tipo INVOICE',
            });
          }
          if (!['ISSUED', 'PARTIAL', 'PAID'].includes(sourceInvoice.status)) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `No se puede crear una NC sobre una factura con estado ${sourceInvoice.status}`,
            });
          }

          const invoiceNumber = await getNextSequenceValue(tx, 'CREDIT_NOTE');
          const invoiceItemsData = itemsData.map((d, idx) => ({
            ...d,
            locationId: items[idx]!.locationId,
          }));

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

          // Crear movimientos RETURN y reponer stock
          for (const item of items) {
            await tx.inventoryMovement.create({
              data: {
                productId: item.productId,
                locationId: item.locationId!,
                movementType: 'RETURN',
                quantity: item.quantity,
                referenceType: 'INVOICE',
                referenceId: created.id,
                userId: ctx.session!.user!.id!,
                ipAddress: ctx.req.headers.get('x-forwarded-for') ?? undefined,
              },
            });
            await tx.productLocation.update({
              where: { id: item.locationId! },
              data: { quantityOnHand: { increment: item.quantity } },
            });
          }

          // Decrementar balance del cliente (la NC reduce lo que debe)
          await tx.customer.update({
            where: { id: input.customerId },
            data: { currentBalance: { decrement: total } },
          });

          await tx.auditLog.create({
            data: {
              userId: ctx.session!.user!.id!,
              action: 'CREATE_CREDIT_NOTE',
              entityType: 'Invoice',
              entityId: created.id,
              newValues: {
                invoiceNumber,
                type: 'CREDIT_NOTE',
                total: total.toString(),
                itemCount: items.length,
                sourceInvoiceId: rest.sourceInvoiceId,
                sourceInvoiceNumber: sourceInvoice.invoiceNumber,
              } as Prisma.InputJsonValue,
              ipAddress: ctx.req.headers.get('x-forwarded-for') ?? undefined,
            },
          });

          return created;
        });
      }

      const role = (ctx.session!.user as { role?: string }).role ?? 'VENDOR';
      const canOverrideStock = role === 'ADMIN' || role === 'MANAGER';

      // Validar productos activos y precios mínimos (aplica a QUOTE e INVOICE)
      const productIds = [...new Set(items.map((i) => i.productId))];
      const pricedProducts = await ctx.db.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, name: true, sku: true, unitCost: true, isActive: true },
      });
      const inactiveProducts = pricedProducts.filter((p) => !p.isActive);
      if (inactiveProducts.length > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Productos inactivos: ${inactiveProducts.map((p) => p.sku).join(', ')}`,
        });
      }
      const productMap = new Map(
        pricedProducts.map((p) => [p.id, { name: p.name, unitCost: p.unitCost }]),
      );
      const pricingItems = items.map((item) => ({
        productId: item.productId,
        unitPrice: toDecimal(item.unitPrice),
        discountReason: item.discountReason,
      }));
      const belowCostItems = validateItemPricing(pricingItems, productMap, role);

      // Validar que el cliente esté activo
      const customer = await ctx.db.customer.findUnique({
        where: { id: input.customerId },
        select: { isActive: true, name: true },
      });
      if (!customer?.isActive) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `El cliente no está activo`,
        });
      }

      // ── QUOTE: sin movimientos ni reservas ────────────────────────────────
      if (type === 'QUOTE') {
        return ctx.db.$transaction(async (tx) => {
          const invoiceNumber = await getNextSequenceValue(tx, 'QUOTE');
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
              items: { create: itemsData },
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
                type: 'QUOTE',
                status: 'ISSUED',
                itemCount: items.length,
                total: total.toString(),
                ...(belowCostItems.length > 0 && { belowCostItems, authorizedBy: role }),
              } as Prisma.InputJsonValue,
              ipAddress: ctx.req.headers.get('x-forwarded-for') ?? undefined,
            },
          });

          return created;
        });
      }

      // ── INVOICE: transacción con lock pesimista y movimientos ─────────────
      const invoiceItemsData = itemsData.map((d, idx) => ({
        ...d,
        locationId: items[idx]!.locationId,
      }));

      const invoice = await ctx.db.$transaction(async (tx) => {
        // 1. Lock de ubicaciones en orden ascendente (previene deadlocks)
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

        // 2. Verificar que cada ubicación pertenezca al producto declarado
        for (const item of items) {
          const loc = lockedLocations.get(item.locationId!)!;
          if (loc.productId !== item.productId) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `La ubicación '${item.locationId}' no pertenece al producto '${item.productId}'`,
            });
          }
        }

        // 3. Verificar disponibilidad (respeta reservedQuantity de PENDING invoices)
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

        // 4a. VENDOR con stock insuficiente → PENDING_AUTHORIZATION
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

          // B2: reserve only available stock; track deficit as backorder
          for (const item of items) {
            const loc = lockedLocations.get(item.locationId!)!;
            const available = calculateAvailableStock(loc);
            const toReserve = Math.min(available, item.quantity);
            const toBackorder = item.quantity - toReserve;

            await tx.productLocation.update({
              where: { id: item.locationId! },
              data: {
                reservedQuantity: { increment: toReserve },
                backorderQuantity: { increment: toBackorder },
              },
            });

            if (toBackorder > 0) {
              const invoiceItem = created.items.find(
                (ci) => ci.productId === item.productId && ci.locationId === item.locationId,
              );
              if (invoiceItem) {
                await tx.invoiceItem.update({
                  where: { id: invoiceItem.id },
                  data: { quantityBackordered: toBackorder },
                });
              }
            }
          }

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

        // 4b. Stock suficiente o MANAGER/ADMIN override → ISSUED
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

        for (const item of items) {
          await tx.inventoryMovement.create({
            data: {
              productId: item.productId,
              locationId: item.locationId!,
              movementType: 'OUT',
              quantity: -item.quantity,
              referenceType: 'INVOICE',
              referenceId: created.id,
              userId: ctx.session!.user!.id!,
              ipAddress: ctx.req.headers.get('x-forwarded-for') ?? undefined,
            },
          });

          await tx.productLocation.update({
            where: { id: item.locationId! },
            data: { quantityOnHand: { decrement: item.quantity } },
          });
        }

        // 5. Verificar límite de crédito (solo CREDITO con límite > 0)
        if (rest.paymentTerms === 'CREDITO') {
          const [cust] = await tx.$queryRaw<
            Array<{ currentBalance: unknown; creditLimit: unknown }>
          >`
            SELECT "currentBalance", "creditLimit"
            FROM customers
            WHERE id = ${input.customerId}
            FOR UPDATE
          `;
          if (cust && Number(cust.creditLimit) > 0) {
            const projected = Number(cust.currentBalance) + Number(total);
            if (projected > Number(cust.creditLimit)) {
              throw new TRPCError({
                code: 'BAD_REQUEST',
                message: `Límite de crédito excedido para ${customer.name}. Límite: $${Number(cust.creditLimit).toFixed(2)}, Balance actual: $${Number(cust.currentBalance).toFixed(2)}, Esta venta: $${Number(total).toFixed(2)}, Excedería en: $${(projected - Number(cust.creditLimit)).toFixed(2)}.`,
              });
            }
          }
        }

        await tx.customer.update({
          where: { id: input.customerId },
          data: { currentBalance: { increment: total } },
        });

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

      // Detección de anomalías post-creación de INVOICE
      void detectInvoiceCreateAnomalies(
        ctx.db,
        {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          status: invoice.status,
          userId: ctx.session!.user!.id!,
          total: Number(invoice.total),
        },
        ctx.req.headers.get('x-forwarded-for') ?? undefined,
      );

      // Email automático al cliente — fire-and-forget, no bloquea la respuesta
      if (invoice.status === 'ISSUED') {
        void (async () => {
          try {
            const full = await ctx.db.invoice.findUnique({
              where: { id: invoice.id },
              include: {
                customer: { select: { name: true, email: true } },
                branch: { select: { name: true } },
                items: { include: { product: { select: { name: true, sku: true } } } },
              },
            });
            if (!full?.customer.email) return;
            const emailData: InvoiceEmailData = {
              to: full.customer.email,
              customerName: full.customer.name,
              invoiceNumber: full.invoiceNumber,
              invoiceDate: full.createdAt.toLocaleDateString('es-PR'),
              dueDate: full.dueDate?.toLocaleDateString('es-PR'),
              branchName: full.branch?.name,
              items: full.items.map((it) => ({
                name: it.product.name,
                sku: it.product.sku,
                quantity: it.quantity,
                unitPrice: Number(it.unitPrice),
                discount: Number(it.discountPercent),
                lineTotal: Number(it.lineTotal),
              })),
              subtotal: Number(full.subtotal),
              taxRate: Number(full.taxRate),
              taxAmount: Number(full.taxAmount),
              total: Number(full.total),
              paymentTerms: full.paymentTerms,
              notes: full.notes ?? undefined,
            };
            await sendInvoiceEmail(emailData);
          } catch (err) {
            console.error('[invoice-email] failed:', err);
          }
        })();
      }

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

      // Solo INVOICE acepta pagos (no QUOTE ni CREDIT_NOTE)
      if (invoice.type !== 'INVOICE') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `No se pueden registrar pagos en documentos de tipo ${invoice.type}.`,
        });
      }

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

        // Decrementar balance del cliente al recibir pago
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

  // void requiere MANAGER o ADMIN — un VENDOR no puede anular sus propias facturas
  void: managerProcedure
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

      const result = await ctx.db.$transaction(async (tx) => {
        const voided = await tx.invoice.update({
          where: { id: input.id },
          data: {
            status: 'VOIDED',
            notes: `[ANULADA: ${input.reason}]${invoice.notes ? ' — ' + invoice.notes : ''}`,
          },
        });

        // Si se anula una INVOICE derivada de una QUOTE, revertir la QUOTE a ISSUED
        // cuando no quedan otras INVOICEs activas de esa cotización.
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

        // ── Reversa de inventario para INVOICE en ISSUED o PARTIAL ───────────
        const needsInvoiceReversal =
          invoice.type === 'INVOICE' &&
          (invoice.status === 'ISSUED' || invoice.status === 'PARTIAL');

        const orphanItems: Array<{ productId: string; quantity: number }> = [];

        if (needsInvoiceReversal) {
          for (const item of invoice.items) {
            if (!item.locationId) {
              orphanItems.push({ productId: item.productId, quantity: item.quantity });
              continue;
            }

            await tx.inventoryMovement.create({
              data: {
                productId: item.productId,
                locationId: item.locationId,
                movementType: 'RETURN',
                quantity: item.quantity,
                referenceType: 'INVOICE',
                referenceId: invoice.id,
                userId: ctx.session!.user!.id!,
                ipAddress: ctx.req.headers.get('x-forwarded-for') ?? undefined,
              },
            });

            await tx.productLocation.update({
              where: { id: item.locationId },
              data: { quantityOnHand: { increment: item.quantity } },
            });
          }

          // Decrement only the outstanding balance (total - paidAmount).
          // For ISSUED (paidAmount=0) this equals total. For PARTIAL, only the
          // unpaid portion remains in currentBalance — decrementing total would go negative.
          const outstandingBalance = invoice.total.sub(invoice.paidAmount);
          await tx.customer.update({
            where: { id: invoice.customerId },
            data: { currentBalance: { decrement: outstandingBalance } },
          });
        }

        // ── Liberación de reservas para INVOICE en PENDING_AUTHORIZATION ─────
        if (invoice.type === 'INVOICE' && invoice.status === 'PENDING_AUTHORIZATION') {
          for (const item of invoice.items) {
            if (!item.locationId) continue;
            // B2: revert only what was actually reserved (quantity - backordered) and the backorder portion
            const reserved = item.quantity - item.quantityBackordered;
            await tx.productLocation.update({
              where: { id: item.locationId },
              data: {
                reservedQuantity: { decrement: reserved },
                backorderQuantity: { decrement: item.quantityBackordered },
              },
            });
          }
        }

        // ── Reversa de inventario para CREDIT_NOTE ───────────────────────────
        // La CN había creado movimientos RETURN (stock aumentó y balance bajó).
        // Al anularla: revertir el stock con ADJUSTMENT negativo y restaurar el balance.
        const needsCreditNoteReversal =
          invoice.type === 'CREDIT_NOTE' && invoice.status === 'ISSUED';

        if (needsCreditNoteReversal) {
          for (const item of invoice.items) {
            if (!item.locationId) {
              orphanItems.push({ productId: item.productId, quantity: item.quantity });
              continue;
            }

            await tx.inventoryMovement.create({
              data: {
                productId: item.productId,
                locationId: item.locationId,
                movementType: 'ADJUSTMENT',
                quantity: -item.quantity, // negativo: revierte el RETURN de la CN
                referenceType: 'INVOICE',
                referenceId: invoice.id,
                userId: ctx.session!.user!.id!,
                notes: `Reversa de NC anulada ${invoice.invoiceNumber}`,
                ipAddress: ctx.req.headers.get('x-forwarded-for') ?? undefined,
              },
            });

            await tx.productLocation.update({
              where: { id: item.locationId },
              data: { quantityOnHand: { decrement: item.quantity } },
            });
          }

          // Restaurar el balance del cliente (deshacer el crédito aplicado por la CN)
          await tx.customer.update({
            where: { id: invoice.customerId },
            data: { currentBalance: { increment: invoice.total } },
          });
        }

        const auditNewValues: Record<string, unknown> = {
          reason: input.reason,
          type: invoice.type,
          previousStatus: invoice.status,
        };
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

      // Detección de anomalías post-void
      void detectInvoiceVoidAnomalies(
        ctx.db,
        {
          invoiceId: input.id,
          invoiceNumber: invoice.invoiceNumber,
          total: Number(invoice.total),
          createdAt: invoice.createdAt,
          voidedAt: new Date(),
          customerId: invoice.customerId,
          userId: ctx.session!.user!.id!,
          reason: input.reason,
        },
        ctx.req.headers.get('x-forwarded-for') ?? undefined,
      );

      return result;
    }),

  // authorizeBackorder usa managerProcedure directamente (consistente con el resto del codebase)
  authorizeBackorder: managerProcedure
    .input(
      z.object({
        id: z.string().cuid(),
        authorizationNotes: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
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

      const orphanItems = invoice.items.filter((i) => !i.locationId);
      if (orphanItems.length > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `${orphanItems.length} ítem(s) tienen la ubicación original eliminada (locationId=NULL). Recree la factura con ubicaciones válidas antes de autorizar.`,
        });
      }

      return ctx.db.$transaction(async (tx) => {
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

        for (const item of invoice.items) {
          const reservedQty = item.quantity - item.quantityBackordered;
          await tx.inventoryMovement.create({
            data: {
              productId: item.productId,
              locationId: item.locationId!,
              movementType: 'OUT',
              quantity: -reservedQty,
              referenceType: 'INVOICE',
              referenceId: invoice.id,
              userId: ctx.session!.user!.id!,
              ipAddress: ctx.req.headers.get('x-forwarded-for') ?? undefined,
            },
          });

          const loc = await tx.productLocation.findUniqueOrThrow({
            where: { id: item.locationId! },
            select: { quantityOnHand: true, reservedQuantity: true, backorderQuantity: true },
          });
          await tx.productLocation.update({
            where: { id: item.locationId! },
            data: {
              quantityOnHand: { decrement: Math.min(reservedQty, loc.quantityOnHand) },
              reservedQuantity: { decrement: Math.min(reservedQty, loc.reservedQuantity) },
              backorderQuantity: { decrement: Math.min(item.quantityBackordered, loc.backorderQuantity) },
            },
          });
        }

        const updated = await tx.invoice.update({
          where: { id: input.id },
          data: { status: 'ISSUED' },
          include: { items: true },
        });

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

  // Devuelve disponibilidad de un producto en TODAS las sucursales.
  // Usado por el frontend para sugerir ubicaciones alternativas cuando hay escasez.
  stockAvailability: protectedProcedure
    .input(z.object({ productId: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      const locations = await ctx.db.productLocation.findMany({
        where: { productId: input.productId },
        include: { warehouse: { select: { id: true, name: true } } },
        orderBy: { quantityOnHand: 'desc' },
      });
      return locations.map((loc) => ({
        locationId: loc.id,
        locationCode: loc.locationCode,
        warehouseId: loc.warehouse.id,
        warehouseName: loc.warehouse.name,
        quantityOnHand: loc.quantityOnHand,
        reservedQuantity: loc.reservedQuantity,
        available: Math.max(0, loc.quantityOnHand - loc.reservedQuantity),
      }));
    }),

  // Autoriza backorder Y registra pago en una sola transacción atómica.
  // Solo MANAGER/ADMIN. Evita el flujo de dos pasos que confundía a los usuarios.
  authorizeAndPay: managerProcedure
    .input(
      z.object({
        id: z.string().cuid(),
        authorizationNotes: z.string().min(1),
        amount: z.number().positive(),
        method: z.enum(['CASH', 'CHECK', 'TRANSFER', 'CARD', 'CREDIT']),
        reference: z.string().optional(),
        paymentNotes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
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

      const orphanItems = invoice.items.filter((i) => !i.locationId);
      if (orphanItems.length > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `${orphanItems.length} ítem(s) tienen la ubicación eliminada. Recree la factura antes de autorizar.`,
        });
      }

      const balanceDue = invoice.total.sub(invoice.paidAmount);
      if (toDecimal(input.amount).gt(balanceDue)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `El pago ($${input.amount}) excede el balance pendiente ($${balanceDue.toString()})`,
        });
      }

      return ctx.db.$transaction(async (tx) => {
        const locationIds = [...new Set(invoice.items.map((i) => i.locationId!))].sort();

        for (const locId of locationIds) {
          const rows = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT id FROM product_locations WHERE id = ${locId} FOR UPDATE
          `;
          if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND', message: `Ubicación '${locId}' no encontrada.` });
        }

        // 1. Descarga inventario y libera reservas
        for (const item of invoice.items) {
          const reservedQty = item.quantity - item.quantityBackordered;
          await tx.inventoryMovement.create({
            data: {
              productId: item.productId,
              locationId: item.locationId!,
              movementType: 'OUT',
              quantity: -reservedQty,
              referenceType: 'INVOICE',
              referenceId: invoice.id,
              userId: ctx.session!.user!.id!,
              ipAddress: ctx.req.headers.get('x-forwarded-for') ?? undefined,
            },
          });

          const loc = await tx.productLocation.findUniqueOrThrow({
            where: { id: item.locationId! },
            select: { quantityOnHand: true, reservedQuantity: true, backorderQuantity: true },
          });
          await tx.productLocation.update({
            where: { id: item.locationId! },
            data: {
              quantityOnHand: { decrement: Math.min(reservedQty, loc.quantityOnHand) },
              reservedQuantity: { decrement: Math.min(reservedQty, loc.reservedQuantity) },
              backorderQuantity: { decrement: Math.min(item.quantityBackordered, loc.backorderQuantity) },
            },
          });
        }

        // 2. Incrementa balance del cliente (ahora debe la factura)
        await tx.customer.update({
          where: { id: invoice.customerId },
          data: { currentBalance: { increment: invoice.total } },
        });

        // 3. Registra el pago
        const totalPaid = invoice.paidAmount.add(toDecimal(input.amount));
        const newStatus = totalPaid.gte(invoice.total) ? 'PAID' : 'PARTIAL';

        await tx.payment.create({
          data: {
            invoiceId: input.id,
            amount: toDecimal(input.amount),
            method: input.method,
            reference: input.reference,
            notes: input.paymentNotes,
            receivedById: ctx.session!.user!.id!,
          },
        });

        const updated = await tx.invoice.update({
          where: { id: input.id },
          data: { status: newStatus, paidAmount: totalPaid },
        });

        // 4. Decrementa balance del cliente con el pago recibido
        await tx.customer.update({
          where: { id: invoice.customerId },
          data: { currentBalance: { decrement: toDecimal(input.amount) } },
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
              newStatus,
              authorizationNotes: input.authorizationNotes,
              paymentAmount: input.amount,
              paymentMethod: input.method,
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
        taxExempt: z.boolean().default(false),
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

      // Verificar que el cliente siga activo antes de convertir
      const customer = await ctx.db.customer.findUnique({
        where: { id: quote.customerId },
        select: { isActive: true, name: true },
      });
      if (!customer?.isActive) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `El cliente no está activo. No se puede convertir la cotización.`,
        });
      }

      const existingActive = await ctx.db.invoice.findFirst({
        where: { sourceQuoteId: input.quoteId, status: { notIn: ['VOIDED'] } },
        select: { invoiceNumber: true },
      });
      if (existingActive) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Esta cotización ya fue convertida a la factura ${existingActive.invoiceNumber}. Anule esa factura primero si desea re-emitir.`,
        });
      }

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
      // Bug-fix: usar tasa de systemConfig en vez de hardcodear 0.115.
      // taxExempt=true permite conversiones exentas de IVU.
      const taxCfg = await ctx.db.systemConfig.findUnique({ where: { key: 'TAX_RATE' } });
      const appliedTaxRate = input.taxExempt ? 0 : (taxCfg ? Number(taxCfg.value) : 0.115);
      const taxRateDecimal = toDecimal(appliedTaxRate);
      const taxAmount = subtotal.mul(taxRateDecimal);
      const total = subtotal.add(taxAmount);

      const role = (ctx.session!.user as { role?: string }).role ?? 'VENDOR';
      const canOverrideStock = role === 'ADMIN' || role === 'MANAGER';

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
        await tx.$queryRaw`
          SELECT id FROM invoices WHERE id = ${input.quoteId} FOR UPDATE
        `;

        const activeUnderLock = await tx.invoice.findFirst({
          where: { sourceQuoteId: input.quoteId, status: { notIn: ['VOIDED'] } },
          select: { invoiceNumber: true },
        });
        if (activeUnderLock) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Esta cotización ya fue convertida a la factura ${activeUnderLock.invoiceNumber}. Anule esa factura primero si desea re-emitir.`,
          });
        }

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
            throw new TRPCError({ code: 'NOT_FOUND', message: `Ubicación '${locId}' no encontrada.` });
          }
          lockedLocations.set(locId, rows[0]!);
        }

        for (const item of resolvedItems) {
          const loc = lockedLocations.get(item.locationId)!;
          if (loc.productId !== item.productId) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `La ubicación '${item.locationId}' no pertenece al producto '${item.productId}'.`,
            });
          }
        }

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
            dueDate: null,
            sourceQuoteId: input.quoteId,
            items: { create: invoiceItemsData },
          },
          include: { items: true },
        });

        if (invoiceStatus === 'ISSUED') {
          for (const item of resolvedItems) {
            await tx.inventoryMovement.create({
              data: {
                productId: item.productId,
                locationId: item.locationId,
                movementType: 'OUT',
                quantity: -item.quantity,
                referenceType: 'INVOICE',
                referenceId: newInvoice.id,
                userId: ctx.session!.user!.id!,
                ipAddress: ctx.req.headers.get('x-forwarded-for') ?? undefined,
              },
            });

            await tx.productLocation.update({
              where: { id: item.locationId },
              data: { quantityOnHand: { decrement: item.quantity } },
            });
          }

          await tx.customer.update({
            where: { id: quote.customerId },
            data: { currentBalance: { increment: total } },
          });
        } else {
          // PENDING_AUTHORIZATION: reservar stock
          for (const item of resolvedItems) {
            await tx.productLocation.update({
              where: { id: item.locationId },
              data: { reservedQuantity: { increment: item.quantity } },
            });
          }
        }

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

  // ─── Update — DRAFT, QUOTE, o ISSUED sin pagos (Fortune 500 logic) ─────────

  update: managerProcedure
    .input(
      z.object({
        id: z.string().cuid(),
        customerId: z.string().cuid(),
        taxRate: z.number().min(0).max(1),
        dueDate: z.date().optional(),
        notes: z.string().optional(),
        editReason: z.string().optional(), // requerido para ISSUED
        items: z.array(invoiceItemSchema).min(1),
      }).superRefine(({ editReason }, ctx) => {
        // editReason se valida dinámicamente en el mutation según el estado
        void editReason; void ctx;
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const invoice = await ctx.db.invoice.findUnique({
        where: { id: input.id },
        include: { items: true },
      });
      if (!invoice) throw new TRPCError({ code: 'NOT_FOUND' });

      // Solo VOIDED es ineditable
      if (invoice.status === 'VOIDED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No se puede editar una factura anulada.',
        });
      }

      // Facturas INVOICE no-DRAFT requieren motivo de edición
      const isIssuedInvoice = invoice.type === 'INVOICE' && invoice.status !== 'DRAFT';
      if (isIssuedInvoice && !input.editReason?.trim()) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Se requiere el motivo de la edición para modificar esta factura.',
        });
      }

      const { itemsData, subtotal, taxRateDecimal, taxAmount, total } = calcInvoiceTotals(
        input.items,
        input.taxRate,
      );

      // Guard: no se puede bajar el total por debajo de lo ya cobrado
      if (isIssuedInvoice && Number(total) < Number(invoice.paidAmount)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `No se puede bajar el total a $${Number(total).toFixed(2)} porque el cliente ya pagó $${Number(invoice.paidAmount).toFixed(2)}. Para devolver dinero, emite una Nota de Crédito.`,
        });
      }

      await ctx.db.$transaction(async (tx) => {
        // Para ISSUED: revertir movimientos de inventario anteriores
        if (isIssuedInvoice) {
          for (const oldItem of invoice.items) {
            if (!oldItem.locationId) continue;
            // Reversa del OUT original
            await tx.inventoryMovement.create({
              data: {
                productId: oldItem.productId,
                locationId: oldItem.locationId,
                movementType: 'RETURN',
                quantity: oldItem.quantity,
                referenceType: 'INVOICE',
                referenceId: invoice.id,
                userId: ctx.session!.user!.id!,
                notes: `Reversa por edición de factura: ${input.editReason}`,
                ipAddress: ctx.req.headers.get('x-forwarded-for') ?? undefined,
              },
            });
            await tx.productLocation.update({
              where: { id: oldItem.locationId },
              data: { quantityOnHand: { increment: oldItem.quantity } },
            });
          }
          // Revertir balance del cliente con el total anterior
          await tx.customer.update({
            where: { id: invoice.customerId },
            data: { currentBalance: { decrement: invoice.total } },
          });
        }

        // Reemplazar ítems
        await tx.invoiceItem.deleteMany({ where: { invoiceId: input.id } });

        for (const [i, item] of itemsData.entries()) {
          await tx.invoiceItem.create({
            data: {
              invoiceId: input.id,
              productId: item.productId,
              locationId: input.items[i]!.locationId ?? null,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discountPercent: item.discountPercent,
              lineTotal: item.lineTotal,
            },
          });
        }

        // Para ISSUED: crear nuevos movimientos OUT con los nuevos ítems
        if (isIssuedInvoice) {
          for (const [i, item] of itemsData.entries()) {
            const locId = input.items[i]!.locationId;
            if (!locId) continue;
            await tx.inventoryMovement.create({
              data: {
                productId: item.productId,
                locationId: locId,
                movementType: 'OUT',
                quantity: -item.quantity,
                referenceType: 'INVOICE',
                referenceId: invoice.id,
                userId: ctx.session!.user!.id!,
                notes: `Reemisión por edición: ${input.editReason}`,
                ipAddress: ctx.req.headers.get('x-forwarded-for') ?? undefined,
              },
            });
            await tx.productLocation.update({
              where: { id: locId },
              data: { quantityOnHand: { decrement: item.quantity } },
            });
          }
          // Aplicar nuevo total al balance del cliente
          await tx.customer.update({
            where: { id: invoice.customerId },
            data: { currentBalance: { increment: total } },
          });
        }

        // Recalcular estado según paidAmount vs nuevo total
        let updatedStatus = invoice.status;
        if (isIssuedInvoice) {
          const paid = Number(invoice.paidAmount);
          const newTotal = Number(total);
          if (paid >= newTotal) updatedStatus = 'PAID';
          else if (paid > 0) updatedStatus = 'PARTIAL';
          else updatedStatus = 'ISSUED';
        }

        await tx.invoice.update({
          where: { id: input.id },
          data: {
            customerId: input.customerId,
            subtotal,
            taxRate: taxRateDecimal,
            taxAmount,
            total,
            status: updatedStatus,
            dueDate: input.dueDate ?? null,
            notes: input.notes ?? null,
          },
        });

        await tx.auditLog.create({
          data: {
            userId: ctx.session!.user!.id!,
            action: 'UPDATE',
            entityType: 'Invoice',
            entityId: input.id,
            oldValues: {
              invoiceNumber: invoice.invoiceNumber,
              total: invoice.total.toString(),
              itemCount: invoice.items.length,
            } as Prisma.InputJsonValue,
            newValues: {
              itemCount: input.items.length,
              total: total.toString(),
              ...(isIssuedInvoice && { editReason: input.editReason }),
            } as Prisma.InputJsonValue,
            ipAddress: ctx.req.headers.get('x-forwarded-for') ?? undefined,
          },
        });
      });

      return { id: input.id };
    }),

  // ─── Cuentas por Cobrar ───────────────────────────────────────────────────

  arSummary: protectedProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const in7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const open = await ctx.db.invoice.findMany({
      where: { type: 'INVOICE', status: { in: ['ISSUED', 'PARTIAL'] } },
      select: { total: true, paidAmount: true, dueDate: true },
    });

    let totalOwed = 0, totalOverdue = 0, dueSoon = 0;
    let overdueCount = 0, dueSoonCount = 0;

    for (const inv of open) {
      const balance = Number(inv.total) - Number(inv.paidAmount);
      totalOwed += balance;
      if (inv.dueDate && inv.dueDate < now) {
        totalOverdue += balance;
        overdueCount++;
      } else if (inv.dueDate && inv.dueDate <= in7) {
        dueSoon += balance;
        dueSoonCount++;
      }
    }

    return { totalOwed, totalOverdue, dueSoon, openCount: open.length, overdueCount, dueSoonCount };
  }),

  arOpenInvoices: protectedProcedure
    .input(z.object({ customerId: z.string().optional(), search: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const now = new Date();
      const invoices = await ctx.db.invoice.findMany({
        where: {
          type: 'INVOICE',
          status: { in: ['ISSUED', 'PARTIAL'] },
          ...(input?.customerId && { customerId: input.customerId }),
          ...(input?.search && {
            OR: [
              { invoiceNumber: { contains: input.search, mode: 'insensitive' } },
              { customer: { name: { contains: input.search, mode: 'insensitive' } } },
            ],
          }),
        },
        include: {
          customer: { select: { id: true, name: true, code: true, type: true } },
          _count: { select: { items: true } },
        },
        orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
      });

      return invoices.map((inv) => {
        const balance = Number(inv.total) - Number(inv.paidAmount);
        const daysOverdue = inv.dueDate
          ? Math.floor((now.getTime() - inv.dueDate.getTime()) / (1000 * 60 * 60 * 24))
          : null;
        return { ...inv, balance, daysOverdue };
      });
    }),

  arAging: protectedProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const invoices = await ctx.db.invoice.findMany({
      where: { type: 'INVOICE', status: { in: ['ISSUED', 'PARTIAL'] } },
      include: { customer: { select: { id: true, name: true, code: true } } },
    });

    const map: Record<string, {
      customerId: string; customerName: string; customerCode: string;
      current: number; d30: number; d60: number; d90: number; d90plus: number; total: number;
    }> = {};

    for (const inv of invoices) {
      const balance = Number(inv.total) - Number(inv.paidAmount);
      if (balance <= 0.001) continue;
      const cid = inv.customerId;
      if (!map[cid]) {
        map[cid] = { customerId: cid, customerName: inv.customer.name, customerCode: inv.customer.code, current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0, total: 0 };
      }
      map[cid].total += balance;
      if (!inv.dueDate || inv.dueDate >= now) {
        map[cid].current += balance;
      } else {
        const days = Math.floor((now.getTime() - inv.dueDate.getTime()) / (1000 * 60 * 60 * 24));
        if (days <= 30)      map[cid].d30 += balance;
        else if (days <= 60) map[cid].d60 += balance;
        else if (days <= 90) map[cid].d90 += balance;
        else                 map[cid].d90plus += balance;
      }
    }

    return Object.values(map).sort((a, b) => b.total - a.total);
  }),

  /**
   * Ventas del período agrupadas por sucursal — para reporte impreso.
   * Devuelve cada sucursal con su lista de facturas y subtotales.
   * Facturas sin branchId van en el grupo "Sin Sucursal Asignada".
   */
  salesByBranch: protectedProcedure
    .input(
      z.object({
        from: z.date().optional(),
        to:   z.date().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const invoices = await ctx.db.invoice.findMany({
        where: {
          type:   'INVOICE',
          status: { in: ['PAID', 'PARTIAL', 'ISSUED'] },
          ...(input?.from || input?.to
            ? { createdAt: { ...(input.from && { gte: input.from }), ...(input.to && { lte: input.to }) } }
            : {}),
        },
        select: {
          id: true,
          invoiceNumber: true,
          createdAt: true,
          status: true,
          subtotal: true,
          taxAmount: true,
          total: true,
          paidAmount: true,
          branchId: true,
          branch:   { select: { name: true } },
          customer: { select: { name: true, code: true } },
          _count:   { select: { items: true } },
        },
        orderBy: [{ branchId: 'asc' }, { createdAt: 'desc' }],
      });

      // Group by branch
      const branchMap = new Map<string, {
        branchId: string | null;
        branchName: string;
        invoices: typeof invoices;
      }>();

      for (const inv of invoices) {
        const key = inv.branchId ?? '__none__';
        if (!branchMap.has(key)) {
          branchMap.set(key, {
            branchId:   inv.branchId,
            branchName: inv.branch?.name ?? 'Sin Sucursal Asignada',
            invoices:   [],
          });
        }
        branchMap.get(key)!.invoices.push(inv);
      }

      return Array.from(branchMap.values()).map((b) => ({
        branchId:   b.branchId,
        branchName: b.branchName,
        invoices:   b.invoices.map((i) => ({
          id:            i.id,
          invoiceNumber: i.invoiceNumber,
          createdAt:     i.createdAt,
          status:        i.status,
          subtotal:      Number(i.subtotal),
          taxAmount:     Number(i.taxAmount),
          total:         Number(i.total),
          paidAmount:    Number(i.paidAmount),
          customerName:  i.customer.name,
          customerCode:  i.customer.code,
          itemCount:     i._count.items,
        })),
        totals: {
          invoiceCount: b.invoices.length,
          total:        b.invoices.reduce((s, i) => s + Number(i.total), 0),
          paid:         b.invoices.reduce((s, i) => s + Number(i.paidAmount), 0),
        },
      }));
    }),
});
