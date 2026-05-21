import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';
import { TRPCError } from '@trpc/server';
import type { Prisma } from '@prisma/client';
import { getNextSequenceValue } from '@/lib/sequences';
import { toDecimal } from '@/lib/money';

const invoiceItemSchema = z.object({
  productId: z.string().cuid(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().positive(),
  discountPercent: z.number().min(0).max(100).default(0),
});

export const invoicingRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        status: z.enum(['DRAFT', 'ISSUED', 'PAID', 'PARTIAL', 'VOIDED']).optional(),
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
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { items, taxRate, ...rest } = input;

      // All arithmetic uses Prisma.Decimal to avoid IEEE-754 rounding errors.
      // IVU 11.5% in float: 0.115 * 99.99 = 11.498849999... → stored as 11.50 with Decimal.
      const subtotal = items.reduce((sum, item) => {
        const discountFactor = toDecimal(1).sub(toDecimal(item.discountPercent).div(100));
        const lineTotal = toDecimal(item.unitPrice).mul(item.quantity).mul(discountFactor);
        return sum.add(lineTotal);
      }, toDecimal(0));

      const taxRateDecimal = toDecimal(taxRate);
      const taxAmount = subtotal.mul(taxRateDecimal);
      const total = subtotal.add(taxAmount);

      const invoice = await ctx.db.$transaction(async (tx) => {
        const invoiceNumber = await getNextSequenceValue(tx, 'INVOICE');

        const created = await tx.invoice.create({
          data: {
            ...rest,
            invoiceNumber,
            subtotal,
            taxRate: taxRateDecimal,
            taxAmount,
            total,
            createdById: ctx.session!.user!.id!,
            status: 'ISSUED',
            items: {
              create: items.map((item) => {
                const discountFactor = toDecimal(1).sub(toDecimal(item.discountPercent).div(100));
                return {
                  productId: item.productId,
                  quantity: item.quantity,
                  unitPrice: toDecimal(item.unitPrice),
                  discountPercent: toDecimal(item.discountPercent),
                  lineTotal: toDecimal(item.unitPrice).mul(item.quantity).mul(discountFactor),
                };
              }),
            },
          },
          include: { items: true },
        });

        await tx.auditLog.create({
          data: {
            userId: ctx.session!.user!.id!,
            action: 'CREATE',
            entityType: 'Invoice',
            entityId: created.id,
            newValues: { invoiceNumber, total, status: 'ISSUED' } as Prisma.InputJsonValue,
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
      if (invoice.status === 'VOIDED')
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Factura anulada' });

      const totalPaid = invoice.paidAmount.add(toDecimal(input.amount));
      const newStatus = totalPaid.gte(invoice.total) ? 'PAID' : 'PARTIAL';

      const [payment] = await ctx.db.$transaction([
        ctx.db.payment.create({
          data: {
            invoiceId: input.invoiceId,
            amount: toDecimal(input.amount),
            method: input.method,
            reference: input.reference,
            notes: input.notes,
            receivedById: ctx.session!.user!.id!,
          },
        }),
        ctx.db.invoice.update({
          where: { id: input.invoiceId },
          data: { paidAmount: totalPaid, status: newStatus },
        }),
      ]);

      return payment;
    }),

  void: protectedProcedure
    .input(z.object({ id: z.string().cuid(), reason: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const invoice = await ctx.db.invoice.findUnique({ where: { id: input.id } });
      if (!invoice) throw new TRPCError({ code: 'NOT_FOUND' });
      if (invoice.status === 'VOIDED')
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Ya está anulada' });
      if (invoice.status === 'PAID')
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No se puede anular una factura pagada' });

      const voided = await ctx.db.invoice.update({
        where: { id: input.id },
        data: {
          status: 'VOIDED',
          notes: `[ANULADA: ${input.reason}]${invoice.notes ? ' — ' + invoice.notes : ''}`,
        },
      });

      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session!.user!.id!,
          action: 'VOID',
          entityType: 'Invoice',
          entityId: input.id,
          newValues: { reason: input.reason } as Prisma.InputJsonValue,
          ipAddress: ctx.req.headers.get('x-forwarded-for') ?? undefined,
        },
      });

      return voided;
    }),
});
