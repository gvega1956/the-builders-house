import { z } from 'zod';
import { createTRPCRouter, protectedProcedure, adminProcedure } from '@/server/trpc';
import { TRPCError } from '@trpc/server';
import { Prisma } from '@prisma/client';
import bcryptjs from 'bcryptjs';

export const settingsRouter = createTRPCRouter({
  // ── Users ───────────────────────────────────────────────────────────────
  users: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: { name: 'asc' },
    });
  }),

  createUser: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        email: z.string().email(),
        password: z.string().min(8),
        role: z.enum(['ADMIN', 'MANAGER', 'VENDOR', 'WAREHOUSE', 'VIEWER']),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.user.findUnique({ where: { email: input.email } });
      if (existing) throw new TRPCError({ code: 'CONFLICT', message: 'Email ya existe' });

      const passwordHash = await bcryptjs.hash(input.password, 12);
      const created = await ctx.db.user.create({
        data: { name: input.name, email: input.email, passwordHash, role: input.role },
        select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
      });

      // P1 — immutable audit: user creation is a security-critical event.
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session!.user!.id!,
          action: 'CREATE_USER',
          entityType: 'User',
          entityId: created.id,
          newValues: {
            name: input.name,
            email: input.email,
            role: input.role,
            createdById: ctx.session!.user!.id!,
          } as Prisma.InputJsonValue,
        },
      });

      return created;
    }),

  updateUser: adminProcedure
    .input(
      z.object({
        id: z.string().cuid(),
        data: z.object({
          name: z.string().min(1).optional(),
          role: z.enum(['ADMIN', 'MANAGER', 'VENDOR', 'WAREHOUSE', 'VIEWER']).optional(),
          isActive: z.boolean().optional(),
        }),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Read previous values before update for audit log (role changes are security-critical).
      const previous = await ctx.db.user.findUnique({
        where: { id: input.id },
        select: { role: true, isActive: true, name: true },
      });

      const updated = await ctx.db.user.update({
        where: { id: input.id },
        data: input.data,
        select: { id: true, name: true, email: true, role: true, isActive: true },
      });

      // P1 — immutable audit: role and activation changes are security-critical events.
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session!.user!.id!,
          action: 'UPDATE_USER',
          entityType: 'User',
          entityId: input.id,
          newValues: {
            changes: input.data,
            previous: previous ?? null,
            changedById: ctx.session!.user!.id!,
          } as Prisma.InputJsonValue,
        },
      });

      return updated;
    }),

  // ── Categories ──────────────────────────────────────────────────────────
  categories: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.category.findMany({
      include: { _count: { select: { products: true } } },
      orderBy: { name: 'asc' },
    });
  }),

  createCategory: protectedProcedure
    .input(z.object({ name: z.string().min(1), slug: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.category.findFirst({
        where: { OR: [{ name: input.name }, { slug: input.slug }] },
      });
      if (existing) throw new TRPCError({ code: 'CONFLICT', message: 'Categoría ya existe' });
      return ctx.db.category.create({ data: input });
    }),

  // ── Warehouses ──────────────────────────────────────────────────────────
  warehouses: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.warehouse.findMany({
      include: {
        _count: { select: { locations: true } },
        locations: {
          include: { product: { select: { name: true, sku: true } } },
          orderBy: { locationCode: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });
  }),

  createWarehouse: protectedProcedure
    .input(z.object({ name: z.string().min(1), address: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.warehouse.create({ data: input });
    }),

  // ── Suppliers ────────────────────────────────────────────────────────────
  suppliers: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.supplier.findMany({
      include: {
        _count: { select: { products: true, purchaseOrders: true } },
      },
      orderBy: { name: 'asc' },
    });
  }),

  createSupplier: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        country: z.enum(['DO', 'PR', 'US']).default('DO'),
        contactName: z.string().optional(),
        contactEmail: z.string().email().optional().or(z.literal('')),
        contactPhone: z.string().optional(),
        paymentTerms: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.supplier.create({
        data: { ...input, contactEmail: input.contactEmail || undefined },
      });
    }),

  updateSupplier: protectedProcedure
    .input(
      z.object({
        id: z.string().cuid(),
        data: z.object({
          name: z.string().optional(),
          contactName: z.string().optional(),
          contactEmail: z.string().email().optional().or(z.literal('')),
          contactPhone: z.string().optional(),
          paymentTerms: z.string().optional(),
          notes: z.string().optional(),
          isActive: z.boolean().optional(),
        }),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.supplier.update({
        where: { id: input.id },
        data: { ...input.data, contactEmail: input.data.contactEmail || undefined },
      });
    }),
});
