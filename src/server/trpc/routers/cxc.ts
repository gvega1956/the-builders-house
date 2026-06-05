/**
 * CXC — Cuentas por Cobrar
 * Módulo completo de gestión de cuentas por cobrar:
 *   - Saldos iniciales (BALANCE_FORWARD)
 *   - Estado de cuenta por cliente (ledger completo con saldo corriente)
 *   - Cobros: aplicación FIFO automática o distribución manual
 *   - Dashboard: KPIs, aging, top deudores
 */

import { z } from 'zod';
import { createTRPCRouter, protectedProcedure, managerProcedure } from '@/server/trpc';
import { TRPCError } from '@trpc/server';
import { Prisma } from '@prisma/client';
import { getNextSequenceValue } from '@/lib/sequences';
import { toDecimal } from '@/lib/money';

// ─── Tipos internos ───────────────────────────────────────────────────────────

type AgingBucket = { current: number; d30: number; d60: number; d90: number; d90plus: number; total: number };

function buildAging(invoices: Array<{ total: Prisma.Decimal; paidAmount: Prisma.Decimal; dueDate: Date | null }>): AgingBucket {
  const now = new Date();
  const bucket: AgingBucket = { current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0, total: 0 };
  for (const inv of invoices) {
    const balance = Number(inv.total) - Number(inv.paidAmount);
    if (balance <= 0) continue;
    bucket.total += balance;
    if (!inv.dueDate || inv.dueDate >= now) {
      bucket.current += balance;
    } else {
      const days = Math.floor((now.getTime() - inv.dueDate.getTime()) / 86400000);
      if (days <= 30)      bucket.d30 += balance;
      else if (days <= 60) bucket.d60 += balance;
      else if (days <= 90) bucket.d90 += balance;
      else                 bucket.d90plus += balance;
    }
  }
  return bucket;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const cxcRouter = createTRPCRouter({

  // ── Dashboard ────────────────────────────────────────────────────────────────
  dashboard: protectedProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const in7  = new Date(now.getTime() + 7  * 86400000);
    const in30 = new Date(now.getTime() + 30 * 86400000);

    // Todas las facturas abiertas (ISSUED + PARTIAL + BALANCE_FORWARD)
    const open = await ctx.db.invoice.findMany({
      where: {
        type: { in: ['INVOICE', 'BALANCE_FORWARD'] },
        status: { in: ['ISSUED', 'PARTIAL'] },
      },
      include: { customer: { select: { id: true, name: true, code: true } } },
    });

    let totalOwed = 0, totalOverdue = 0, dueSoon = 0, dueSoon30 = 0;
    const byCustomer: Record<string, { name: string; code: string; balance: number }> = {};

    for (const inv of open) {
      const bal = Number(inv.total) - Number(inv.paidAmount);
      if (bal <= 0) continue;
      totalOwed += bal;
      if (inv.dueDate && inv.dueDate < now) totalOverdue += bal;
      if (inv.dueDate && inv.dueDate >= now && inv.dueDate <= in7)  dueSoon += bal;
      if (inv.dueDate && inv.dueDate >= now && inv.dueDate <= in30) dueSoon30 += bal;

      const cid = inv.customerId;
      if (!byCustomer[cid]) byCustomer[cid] = { name: inv.customer.name, code: inv.customer.code, balance: 0 };
      byCustomer[cid]!.balance += bal;
    }

    // Aging global
    const aging = buildAging(open);

    // Top 10 deudores
    const topDebtors = Object.entries(byCustomer)
      .map(([customerId, d]) => ({ customerId, ...d }))
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 10);

    // Cobros del mes actual
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const collectedThisMonth = await ctx.db.payment.aggregate({
      _sum: { amount: true },
      where: { paidAt: { gte: startOfMonth } },
    });

    // Cobros del mes anterior (para comparativa)
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const collectedLastMonth = await ctx.db.payment.aggregate({
      _sum: { amount: true },
      where: { paidAt: { gte: startOfLastMonth, lt: startOfMonth } },
    });

    return {
      totalOwed,
      totalOverdue,
      dueSoon7: dueSoon,
      dueSoon30,
      openCount: open.length,
      aging,
      topDebtors,
      collectedThisMonth: Number(collectedThisMonth._sum.amount ?? 0),
      collectedLastMonth: Number(collectedLastMonth._sum.amount ?? 0),
    };
  }),

  // ── Lista de clientes con estado CXC ─────────────────────────────────────────
  customerSummary: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      hasBalance: z.boolean().optional(),
      paymentTermsFilter: z.enum(['ALL', 'CREDITO', 'CONTADO']).default('ALL'),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(200).default(50),
    }).optional())
    .query(async ({ ctx, input }) => {
      const { search, hasBalance, paymentTermsFilter = 'ALL', page = 1, pageSize = 50 } = input ?? {};
      const skip = (page - 1) * pageSize;

      const where: Prisma.CustomerWhereInput = {
        isActive: true,
        ...(search && {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { code: { contains: search, mode: 'insensitive' } },
          ],
        }),
        ...(hasBalance === true  && { currentBalance: { gt: 0 } }),
        ...(hasBalance === false && { currentBalance: { lte: 0 } }),
      };

      const [customers, total] = await Promise.all([
        ctx.db.customer.findMany({
          where,
          select: {
            id: true, code: true, name: true, type: true,
            creditLimit: true, currentBalance: true, phone: true, email: true,
            invoices: {
              where: {
                type: { in: ['INVOICE', 'BALANCE_FORWARD'] },
                status: { in: ['ISSUED', 'PARTIAL'] },
                ...(paymentTermsFilter !== 'ALL' && {
                  OR: [
                    { paymentTerms: paymentTermsFilter },
                    { type: 'BALANCE_FORWARD' }, // saldos iniciales siempre incluidos
                  ],
                }),
              },
              select: { total: true, paidAmount: true, dueDate: true, invoiceNumber: true, createdAt: true, paymentTerms: true, type: true },
            },
          },
          orderBy: { currentBalance: 'desc' },
          skip,
          take: pageSize,
        }),
        ctx.db.customer.count({ where }),
      ]);

      return {
        customers: customers.map((c) => {
          const aging = buildAging(c.invoices);
          const lastPayment = null; // computed separately if needed
          return {
            id: c.id,
            code: c.code,
            name: c.name,
            type: c.type,
            creditLimit: Number(c.creditLimit),
            currentBalance: Number(c.currentBalance),
            phone: c.phone,
            email: c.email,
            openInvoicesCount: c.invoices.length,
            aging,
            lastPayment,
          };
        }),
        total,
        page,
        pageSize,
      };
    }),

  // ── Estado de cuenta — ledger completo ───────────────────────────────────────
  customerStatement: protectedProcedure
    .input(z.object({
      customerId: z.string().cuid(),
      from: z.date().optional(),
      to: z.date().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { customerId, from, to } = input;

      const customer = await ctx.db.customer.findUnique({
        where: { id: customerId },
        select: {
          id: true, code: true, name: true, type: true,
          creditLimit: true, currentBalance: true, phone: true, email: true, address: true,
        },
      });
      if (!customer) throw new TRPCError({ code: 'NOT_FOUND' });

      const dateFilter = {
        ...(from && { gte: from }),
        ...(to   && { lte: new Date(to.getTime() + 86399999) }),
      };

      // Cargos: facturas (INVOICE + BALANCE_FORWARD) y notas de débito
      const invoices = await ctx.db.invoice.findMany({
        where: {
          customerId,
          type: { in: ['INVOICE', 'BALANCE_FORWARD'] },
          status: { notIn: ['VOIDED', 'DRAFT', 'CONVERTED'] },
          ...(Object.keys(dateFilter).length && { createdAt: dateFilter }),
        },
        include: {
          payments: { orderBy: { paidAt: 'asc' } },
          createdBy: { select: { name: true } },
        },
        orderBy: { createdAt: 'asc' },
      });

      // Notas de crédito
      const creditNotes = await ctx.db.invoice.findMany({
        where: {
          customerId,
          type: 'CREDIT_NOTE',
          status: { notIn: ['VOIDED'] },
          ...(Object.keys(dateFilter).length && { createdAt: dateFilter }),
        },
        include: { createdBy: { select: { name: true } } },
        orderBy: { createdAt: 'asc' },
      });

      // Construir el ledger ordenado cronológicamente
      type LedgerEntry = {
        date: Date;
        type: 'CARGO' | 'ABONO' | 'BALANCE_FORWARD';
        docType: string;
        docNumber: string;
        description: string;
        debit: number;   // cargo al cliente
        credit: number;  // abono al cliente
        balance: number; // saldo corriente (calculado)
        invoiceId?: string;
        status?: string;
      };

      const entries: Omit<LedgerEntry, 'balance'>[] = [];

      for (const inv of invoices) {
        const isBF = inv.type === 'BALANCE_FORWARD';
        entries.push({
          date: inv.createdAt,
          type: isBF ? 'BALANCE_FORWARD' : 'CARGO',
          docType: isBF ? 'SALDO INICIAL' : 'FACTURA',
          docNumber: inv.invoiceNumber,
          description: isBF ? 'Saldo inicial migrado' : `Factura de venta`,
          debit: Number(inv.total),
          credit: 0,
          invoiceId: inv.id,
          status: inv.status,
        });
        // Pagos de esta factura
        for (const pay of inv.payments) {
          entries.push({
            date: pay.paidAt,
            type: 'ABONO',
            docType: 'PAGO',
            docNumber: inv.invoiceNumber,
            description: `Pago ${pay.method.toLowerCase()} ${pay.reference ? '· ' + pay.reference : ''}`.trim(),
            debit: 0,
            credit: Number(pay.amount),
            invoiceId: inv.id,
          });
        }
      }

      for (const nc of creditNotes) {
        entries.push({
          date: nc.createdAt,
          type: 'ABONO',
          docType: 'NOTA DE CRÉDITO',
          docNumber: nc.invoiceNumber,
          description: `Nota de crédito${nc.notes ? ': ' + nc.notes : ''}`,
          debit: 0,
          credit: Number(nc.total),
          invoiceId: nc.id,
        });
      }

      // Ordenar cronológico
      entries.sort((a, b) => a.date.getTime() - b.date.getTime());

      // Calcular saldo corriente
      let running = 0;
      const ledger: LedgerEntry[] = entries.map((e) => {
        running += e.debit - e.credit;
        return { ...e, balance: running };
      });

      // Resumen
      const totalDebit  = ledger.reduce((s, e) => s + e.debit, 0);
      const totalCredit = ledger.reduce((s, e) => s + e.credit, 0);
      const currentBalance = totalDebit - totalCredit;

      // Facturas abiertas para el módulo de cobro
      const openInvoices = invoices
        .filter((inv) => ['ISSUED', 'PARTIAL'].includes(inv.status))
        .map((inv) => ({
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          type: inv.type,
          total: Number(inv.total),
          paidAmount: Number(inv.paidAmount),
          balance: Number(inv.total) - Number(inv.paidAmount),
          dueDate: inv.dueDate,
          createdAt: inv.createdAt,
          status: inv.status,
        }))
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()); // oldest first

      return {
        customer: {
          ...customer,
          creditLimit: Number(customer.creditLimit),
          currentBalance: Number(customer.currentBalance),
        },
        ledger,
        summary: { totalDebit, totalCredit, currentBalance, entryCount: ledger.length },
        openInvoices,
      };
    }),

  // ── Saldo inicial (migración) ─────────────────────────────────────────────────
  setOpeningBalance: managerProcedure
    .input(z.object({
      customerId: z.string().cuid(),
      amount: z.number().positive(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const customer = await ctx.db.customer.findUnique({
        where: { id: input.customerId },
        select: { id: true, name: true, isActive: true },
      });
      if (!customer) throw new TRPCError({ code: 'NOT_FOUND' });
      if (!customer.isActive) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cliente inactivo' });

      // Solo un BALANCE_FORWARD activo por cliente
      const existing = await ctx.db.invoice.findFirst({
        where: {
          customerId: input.customerId,
          type: 'BALANCE_FORWARD',
          status: { notIn: ['VOIDED'] },
        },
        select: { invoiceNumber: true },
      });
      if (existing) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Ya existe un saldo inicial activo para este cliente: ${existing.invoiceNumber}. Anúlalo antes de crear uno nuevo.`,
        });
      }

      const amount = toDecimal(input.amount);

      return ctx.db.$transaction(async (tx) => {
        const invoiceNumber = await getNextSequenceValue(tx, 'BALANCE_FORWARD');

        const invoice = await tx.invoice.create({
          data: {
            invoiceNumber,
            customerId: input.customerId,
            type: 'BALANCE_FORWARD',
            subtotal: amount,
            taxRate: toDecimal(0),
            taxAmount: toDecimal(0),
            total: amount,
            status: 'ISSUED',
            createdById: ctx.session!.user!.id!,
            notes: input.notes ? `[SALDO_INICIAL] ${input.notes}` : '[SALDO_INICIAL]',
          },
        });

        // Incrementar balance del cliente
        await tx.customer.update({
          where: { id: input.customerId },
          data: { currentBalance: { increment: amount } },
        });

        await tx.auditLog.create({
          data: {
            userId: ctx.session!.user!.id!,
            action: 'CREATE',
            entityType: 'Invoice',
            entityId: invoice.id,
            newValues: {
              type: 'BALANCE_FORWARD',
              invoiceNumber,
              amount: input.amount,
              customerId: input.customerId,
              customerName: customer.name,
              notes: input.notes ?? null,
            } as Prisma.InputJsonValue,
            ipAddress: ctx.req.headers.get('x-forwarded-for') ?? undefined,
          },
        });

        return invoice;
      });
    }),

  // ── Registrar cobro — FIFO automático o distribución manual ──────────────────
  recordCollection: protectedProcedure
    .input(z.object({
      customerId: z.string().cuid(),
      totalAmount: z.number().positive(),
      method: z.enum(['CASH', 'CHECK', 'TRANSFER', 'CARD', 'CREDIT']),
      reference: z.string().optional(),
      notes: z.string().optional(),
      // Si se provee, aplica a facturas específicas en los montos indicados.
      // Si no se provee, FIFO automático (oldest invoice first).
      allocations: z.array(z.object({
        invoiceId: z.string().cuid(),
        amount: z.number().positive(),
      })).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const customer = await ctx.db.customer.findUnique({
        where: { id: input.customerId },
        select: { id: true, name: true, currentBalance: true },
      });
      if (!customer) throw new TRPCError({ code: 'NOT_FOUND' });

      // Obtener facturas abiertas
      const openInvoices = await ctx.db.invoice.findMany({
        where: {
          customerId: input.customerId,
          type: { in: ['INVOICE', 'BALANCE_FORWARD'] },
          status: { in: ['ISSUED', 'PARTIAL'] },
        },
        orderBy: { createdAt: 'asc' }, // FIFO: más antigua primero
      });

      if (openInvoices.length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Este cliente no tiene facturas pendientes de cobro.',
        });
      }

      // Calcular la distribución
      let allocations: Array<{ invoiceId: string; amount: number }>;

      if (input.allocations && input.allocations.length > 0) {
        // Distribución manual provista por el usuario
        const totalAllocated = input.allocations.reduce((s, a) => s + a.amount, 0);
        if (Math.abs(totalAllocated - input.totalAmount) > 0.01) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `La suma de las asignaciones ($${totalAllocated.toFixed(2)}) debe igualar el monto total ($${input.totalAmount.toFixed(2)})`,
          });
        }
        // Validar que cada asignación no supere el balance de la factura
        for (const alloc of input.allocations) {
          const inv = openInvoices.find((i) => i.id === alloc.invoiceId);
          if (!inv) throw new TRPCError({ code: 'BAD_REQUEST', message: `Factura ${alloc.invoiceId} no encontrada o no está abierta` });
          const balance = Number(inv.total) - Number(inv.paidAmount);
          if (alloc.amount > balance + 0.01) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `El monto asignado ($${alloc.amount}) supera el balance de ${inv.invoiceNumber} ($${balance.toFixed(2)})`,
            });
          }
        }
        allocations = input.allocations;
      } else {
        // FIFO automático
        allocations = [];
        let remaining = input.totalAmount;
        for (const inv of openInvoices) {
          if (remaining <= 0) break;
          const balance = Number(inv.total) - Number(inv.paidAmount);
          const toApply = Math.min(remaining, balance);
          if (toApply > 0.001) {
            allocations.push({ invoiceId: inv.id, amount: Math.round(toApply * 100) / 100 });
            remaining -= toApply;
          }
        }
        if (remaining > 0.01) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `El monto del cobro ($${input.totalAmount.toFixed(2)}) supera el total de facturas abiertas. Balance total abierto: $${openInvoices.reduce((s, i) => s + Number(i.total) - Number(i.paidAmount), 0).toFixed(2)}`,
          });
        }
      }

      return ctx.db.$transaction(async (tx) => {
        const invoiceMap = new Map(openInvoices.map((i) => [i.id, i]));
        const payments: Array<{ invoiceNumber: string; amount: number; newStatus: string }> = [];

        for (const alloc of allocations) {
          const inv = invoiceMap.get(alloc.invoiceId)!;
          const allocAmount = toDecimal(alloc.amount);

          await tx.payment.create({
            data: {
              invoiceId: alloc.invoiceId,
              amount: allocAmount,
              method: input.method,
              reference: input.reference,
              notes: input.notes,
              receivedById: ctx.session!.user!.id!,
            },
          });

          const newPaid = inv.paidAmount.add(allocAmount);
          const newStatus = newPaid.gte(inv.total) ? 'PAID' : 'PARTIAL';

          await tx.invoice.update({
            where: { id: alloc.invoiceId },
            data: { paidAmount: newPaid, status: newStatus },
          });

          payments.push({ invoiceNumber: inv.invoiceNumber, amount: alloc.amount, newStatus });
        }

        // Decrementar balance del cliente
        await tx.customer.update({
          where: { id: input.customerId },
          data: { currentBalance: { decrement: toDecimal(input.totalAmount) } },
        });

        await tx.auditLog.create({
          data: {
            userId: ctx.session!.user!.id!,
            action: 'PAYMENT',
            entityType: 'Customer',
            entityId: input.customerId,
            newValues: {
              totalAmount: input.totalAmount,
              method: input.method,
              reference: input.reference ?? null,
              allocations: payments,
              mode: input.allocations ? 'manual' : 'fifo',
              customerName: customer.name,
            } as Prisma.InputJsonValue,
            ipAddress: ctx.req.headers.get('x-forwarded-for') ?? undefined,
          },
        });

        return { success: true, allocated: payments };
      });
    }),

  // ── Facturas abiertas de un cliente (para modal de cobro) ────────────────────
  openInvoicesForCustomer: protectedProcedure
    .input(z.string().cuid())
    .query(async ({ ctx, input }) => {
      const invoices = await ctx.db.invoice.findMany({
        where: {
          customerId: input,
          type: { in: ['INVOICE', 'BALANCE_FORWARD'] },
          status: { in: ['ISSUED', 'PARTIAL'] },
        },
        orderBy: { createdAt: 'asc' },
      });
      return invoices.map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        type: inv.type,
        paymentTerms: inv.paymentTerms,
        total: Number(inv.total),
        paidAmount: Number(inv.paidAmount),
        balance: Number(inv.total) - Number(inv.paidAmount),
        dueDate: inv.dueDate,
        createdAt: inv.createdAt,
        status: inv.status,
      }));
    }),
});
