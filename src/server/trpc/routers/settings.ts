import { z } from 'zod';
import { createTRPCRouter, protectedProcedure, adminProcedure, managerProcedure } from '@/server/trpc';
import { TRPCError } from '@trpc/server';
import { Prisma } from '@prisma/client';
import bcryptjs from 'bcryptjs';

export const settingsRouter = createTRPCRouter({
  // ── Users ───────────────────────────────────────────────────────────────
  users: managerProcedure.query(async ({ ctx }) => {
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
      const category = await ctx.db.category.create({ data: input });
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session!.user!.id!,
          action: 'CREATE_CATEGORY',
          entityType: 'Category',
          entityId: category.id,
          newValues: { name: input.name, slug: input.slug } as Prisma.InputJsonValue,
        },
      });
      return category;
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
      const warehouse = await ctx.db.warehouse.create({ data: input });
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session!.user!.id!,
          action: 'CREATE_WAREHOUSE',
          entityType: 'Warehouse',
          entityId: warehouse.id,
          newValues: { name: input.name, address: input.address ?? null } as Prisma.InputJsonValue,
        },
      });
      return warehouse;
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
      const supplier = await ctx.db.supplier.create({
        data: { ...input, contactEmail: input.contactEmail || undefined },
      });
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session!.user!.id!,
          action: 'CREATE_SUPPLIER',
          entityType: 'Supplier',
          entityId: supplier.id,
          newValues: { name: input.name, country: input.country } as Prisma.InputJsonValue,
        },
      });
      return supplier;
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
      const previous = await ctx.db.supplier.findUnique({ where: { id: input.id } });
      const updated = await ctx.db.supplier.update({
        where: { id: input.id },
        data: { ...input.data, contactEmail: input.data.contactEmail || undefined },
      });
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session!.user!.id!,
          action: 'UPDATE_SUPPLIER',
          entityType: 'Supplier',
          entityId: input.id,
          oldValues: previous as unknown as Prisma.InputJsonValue,
          newValues: input.data as unknown as Prisma.InputJsonValue,
        },
      });
      return updated;
    }),

  createProductLocation: protectedProcedure
    .input(
      z.object({
        warehouseId: z.string().cuid(),
        productId: z.string().cuid(),
        locationCode: z.string().min(1),
        quantityOnHand: z.number().int().min(0).default(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.productLocation.findFirst({
        where: { warehouseId: input.warehouseId, productId: input.productId },
      });
      if (existing) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Ya existe una ubicación para este producto en este almacén' });
      }

      const location = await ctx.db.$transaction(async (tx) => {
        const loc = await tx.productLocation.create({
          data: {
            warehouseId: input.warehouseId,
            productId: input.productId,
            locationCode: input.locationCode,
            quantityOnHand: input.quantityOnHand,
          },
        });

        if (input.quantityOnHand > 0) {
          await tx.inventoryMovement.create({
            data: {
              productId: input.productId,
              locationId: loc.id,
              movementType: 'IN',
              quantity: input.quantityOnHand,
              referenceType: 'ADJUSTMENT',
              referenceId: 'INITIAL_STOCK',
              userId: ctx.session!.user!.id!,
            },
          });
        }

        await tx.auditLog.create({
          data: {
            userId: ctx.session!.user!.id!,
            action: 'CREATE_PRODUCT_LOCATION',
            entityType: 'ProductLocation',
            entityId: loc.id,
            newValues: {
              warehouseId: input.warehouseId,
              productId: input.productId,
              locationCode: input.locationCode,
              quantityOnHand: input.quantityOnHand,
            } as Prisma.InputJsonValue,
          },
        });

        return loc;
      });

      return location;
    }),
});
