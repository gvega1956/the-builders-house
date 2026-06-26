import { z } from 'zod';
import { createTRPCRouter, protectedProcedure, adminProcedure } from '@/server/trpc';
import { TRPCError } from '@trpc/server';
import type { Prisma } from '@prisma/client';
import { getNextSequenceValue } from '@/lib/sequences';

const customerSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.enum(['RETAIL', 'WHOLESALE']).default('RETAIL'),
  taxId: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().optional(),
  municipality: z.string().optional(),
  creditLimit: z.number().min(0).default(0),
  notes: z.string().optional(),
});

export const customersRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        type: z.enum(['RETAIL', 'WHOLESALE']).optional(),
        includeInactive: z.boolean().optional(),
        searchFields: z.enum(['all', 'name_code']).default('all'),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(1000).default(50),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const { search, type, includeInactive, searchFields = 'all', page = 1, pageSize = 50 } = input ?? {};
      const skip = (page - 1) * pageSize;

      const where: Prisma.CustomerWhereInput = {
        ...(includeInactive ? {} : { isActive: true }),
        ...(type && { type }),
        ...(search && {
          OR: searchFields === 'name_code'
            ? [
                { name: { contains: search, mode: 'insensitive' } },
                { code: { contains: search, mode: 'insensitive' } },
              ]
            : [
                { name: { contains: search, mode: 'insensitive' } },
                { code: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
                { municipality: { contains: search, mode: 'insensitive' } },
              ],
        }),
      };

      const [customers, total] = await Promise.all([
        ctx.db.customer.findMany({
          where,
          include: {
            _count: { select: { invoices: true } },
          },
          orderBy: { name: 'asc' },
          skip,
          take: pageSize,
        }),
        ctx.db.customer.count({ where }),
      ]);

      return { customers, total, page, pageSize };
    }),

  byId: protectedProcedure
    .input(z.string().cuid())
    .query(async ({ ctx, input }) => {
      const customer = await ctx.db.customer.findUnique({
        where: { id: input },
        include: {
          invoices: {
            orderBy: { createdAt: 'desc' },
            take: 20,
            include: { _count: { select: { items: true } } },
          },
        },
      });
      if (!customer) throw new TRPCError({ code: 'NOT_FOUND' });
      return customer;
    }),

  create: protectedProcedure
    .input(customerSchema)
    .mutation(async ({ ctx, input }) => {
      const customer = await ctx.db.$transaction(async (tx) => {
        const code = await getNextSequenceValue(tx, 'CUSTOMER');

        const created = await tx.customer.create({
          data: { ...input, code, email: input.email || undefined },
        });

        await tx.auditLog.create({
          data: {
            userId: ctx.session!.user!.id!,
            action: 'CREATE',
            entityType: 'Customer',
            entityId: created.id,
            newValues: { code: created.code, name: created.name } as Prisma.InputJsonValue,
            ipAddress: ctx.req.headers.get('x-forwarded-for') ?? undefined,
          },
        });

        return created;
      });

      return customer;
    }),

  update: protectedProcedure
    .input(z.object({ id: z.string().cuid(), data: customerSchema.partial() }))
    .mutation(async ({ ctx, input }) => {
      const before = await ctx.db.customer.findUnique({ where: { id: input.id } });
      if (!before) throw new TRPCError({ code: 'NOT_FOUND' });

      const updated = await ctx.db.customer.update({
        where: { id: input.id },
        data: { ...input.data, email: input.data.email || undefined },
      });

      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session!.user!.id!,
          action: 'UPDATE',
          entityType: 'Customer',
          entityId: updated.id,
          oldValues: {
            name: before.name,
            type: before.type,
            email: before.email,
            phone: before.phone,
            creditLimit: before.creditLimit?.toString() ?? null,
            municipality: before.municipality,
          } as Prisma.InputJsonValue,
          newValues: {
            name: updated.name,
            type: updated.type,
            email: updated.email,
            phone: updated.phone,
            creditLimit: updated.creditLimit?.toString() ?? null,
            municipality: updated.municipality,
          } as Prisma.InputJsonValue,
          ipAddress: ctx.req.headers.get('x-forwarded-for') ?? undefined,
        },
      });

      return updated;
    }),

  deactivate: protectedProcedure
    .input(z.string().cuid())
    .mutation(async ({ ctx, input }) => {
      const customer = await ctx.db.customer.findUnique({ where: { id: input }, select: { name: true, code: true } });
      if (!customer) throw new TRPCError({ code: 'NOT_FOUND' });

      const updated = await ctx.db.customer.update({
        where: { id: input },
        data: { isActive: false },
      });

      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session!.user!.id!,
          action: 'DEACTIVATE',
          entityType: 'Customer',
          entityId: input,
          newValues: { name: customer.name, code: customer.code, isActive: false } as Prisma.InputJsonValue,
          ipAddress: ctx.req.headers.get('x-forwarded-for') ?? undefined,
        },
      });

      return updated;
    }),

  reconcileBalance: adminProcedure
    .input(z.string().cuid())
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db.$queryRaw<[{ balance: Prisma.Decimal }]>`
        SELECT COALESCE(SUM(i.total - i."paidAmount"), 0) as balance
        FROM invoices i
        WHERE i."customerId" = ${input}
          AND i.status IN ('ISSUED', 'PARTIAL')
      `;
      const newBalance = result[0]!.balance;
      const updated = await ctx.db.customer.update({
        where: { id: input },
        data: { currentBalance: newBalance },
      });
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session!.user!.id!,
          action: 'RECONCILE_BALANCE',
          entityType: 'Customer',
          entityId: input,
          newValues: { currentBalance: newBalance?.toString() ?? '0' } as Prisma.InputJsonValue,
          ipAddress: ctx.req.headers.get('x-forwarded-for') ?? undefined,
        },
      });
      return updated;
    }),
});
