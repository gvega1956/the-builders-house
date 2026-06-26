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
        name: z.string().min(1).max(100),
        email: z.string().email().max(254),
        password: z.string().min(8).max(128),
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
          name: z.string().min(1).max(100).optional(),
          role: z.enum(['ADMIN', 'MANAGER', 'VENDOR', 'WAREHOUSE', 'VIEWER']).optional(),
          isActive: z.boolean().optional(),
        }),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const previous = await ctx.db.user.findUnique({
        where: { id: input.id },
        select: { role: true, isActive: true, name: true },
      });
      if (!previous) throw new TRPCError({ code: 'NOT_FOUND', message: 'Usuario no encontrado' });

      // Proteger el último ADMIN activo del sistema
      const isDegradingRole = input.data.role && input.data.role !== 'ADMIN' && previous.role === 'ADMIN';
      const isDeactivating = input.data.isActive === false && previous.isActive;

      if (isDegradingRole || isDeactivating) {
        const activeAdminCount = await ctx.db.user.count({
          where: { role: 'ADMIN', isActive: true, id: { not: input.id } },
        });
        if (activeAdminCount === 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'No puedes degradar o desactivar al único administrador activo del sistema. Asigna otro ADMIN primero.',
          });
        }
      }

      const updated = await ctx.db.user.update({
        where: { id: input.id },
        data: input.data,
        select: { id: true, name: true, email: true, role: true, isActive: true },
      });

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

  createCategory: managerProcedure
    .input(z.object({ name: z.string().min(1).max(100), slug: z.string().min(1).max(100) }))
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

  updateCategory: managerProcedure
    .input(
      z.object({
        id: z.string().cuid(),
        data: z.object({
          name: z.string().min(1).max(100).optional(),
          slug: z.string().min(1).max(100).optional(),
          isActive: z.boolean().optional(),
        }),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const previous = await ctx.db.category.findUnique({ where: { id: input.id } });
      if (!previous) throw new TRPCError({ code: 'NOT_FOUND', message: 'Categoría no encontrada' });

      if (input.data.name && input.data.name !== previous.name) {
        const nameConflict = await ctx.db.category.findFirst({
          where: { name: input.data.name, id: { not: input.id } },
        });
        if (nameConflict) throw new TRPCError({ code: 'CONFLICT', message: 'Nombre de categoría ya existe' });
      }

      const updated = await ctx.db.category.update({
        where: { id: input.id },
        data: input.data,
      });

      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session!.user!.id!,
          action: 'UPDATE_CATEGORY',
          entityType: 'Category',
          entityId: input.id,
          oldValues: { name: previous.name, slug: previous.slug, isActive: previous.isActive } as Prisma.InputJsonValue,
          newValues: input.data as Prisma.InputJsonValue,
        },
      });

      return updated;
    }),

  // ── Warehouses ──────────────────────────────────────────────────────────

  warehouses: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.warehouse.findMany({
      select: {
        id: true, name: true, address: true, isActive: true,
        legalName: true, displayName: true, city: true, state: true,
        zipCode: true, phone: true, email: true, website: true,
        ein: true, merchantRegistration: true,
        _count: { select: { locations: true } },
        locations: {
          include: { product: { select: { name: true, sku: true } } },
          orderBy: { locationCode: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });
  }),

  createWarehouse: managerProcedure
    .input(z.object({ name: z.string().min(1).max(200), address: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.warehouse.findFirst({ where: { name: input.name } });
      if (existing) throw new TRPCError({ code: 'CONFLICT', message: 'Ya existe un almacén con ese nombre' });

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

  updateWarehouse: managerProcedure
    .input(
      z.object({
        id: z.string().cuid(),
        data: z.object({
          name: z.string().min(1).max(200).optional(),
          address: z.string().optional(),
          isActive: z.boolean().optional(),
        }),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const previous = await ctx.db.warehouse.findUnique({ where: { id: input.id } });
      if (!previous) throw new TRPCError({ code: 'NOT_FOUND', message: 'Almacén no encontrado' });

      const updated = await ctx.db.warehouse.update({
        where: { id: input.id },
        data: input.data,
      });

      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session!.user!.id!,
          action: 'UPDATE_WAREHOUSE',
          entityType: 'Warehouse',
          entityId: input.id,
          oldValues: { name: previous.name, address: previous.address, isActive: previous.isActive } as Prisma.InputJsonValue,
          newValues: input.data as Prisma.InputJsonValue,
        },
      });

      return updated;
    }),

  updateWarehouseProfile: adminProcedure
    .input(
      z.object({
        id:                   z.string().cuid(),
        legalName:            z.string().max(200).optional().or(z.literal('')),
        displayName:          z.string().max(100).optional().or(z.literal('')),
        city:                 z.string().max(100).optional().or(z.literal('')),
        state:                z.string().max(50).optional().or(z.literal('')),
        zipCode:              z.string().max(10).optional().or(z.literal('')),
        phone:                z.string().max(20).optional().or(z.literal('')),
        email:                z.string().email().max(254).optional().or(z.literal('')),
        website:              z.string().max(200).optional().or(z.literal('')),
        ein:                  z.string().max(20).optional().or(z.literal('')),
        merchantRegistration: z.string().max(50).optional().or(z.literal('')),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...fields } = input;
      const previous = await ctx.db.warehouse.findUnique({ where: { id } });
      if (!previous) throw new TRPCError({ code: 'NOT_FOUND', message: 'Almacén no encontrado' });

      const data = Object.fromEntries(
        Object.entries(fields).map(([k, v]) => [k, v === '' ? null : v])
      );

      const updated = await ctx.db.warehouse.update({ where: { id }, data });

      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session!.user!.id!,
          action: 'UPDATE_WAREHOUSE_PROFILE',
          entityType: 'Warehouse',
          entityId: id,
          oldValues: {
            legalName: previous.legalName, displayName: previous.displayName,
            city: previous.city, state: previous.state, zipCode: previous.zipCode,
            phone: previous.phone, email: previous.email, website: previous.website,
            ein: previous.ein, merchantRegistration: previous.merchantRegistration,
          } as Prisma.InputJsonValue,
          newValues: data as Prisma.InputJsonValue,
        },
      });

      return updated;
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

  createSupplier: managerProcedure
    .input(
      z.object({
        name: z.string().min(1).max(200),
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

  updateSupplier: managerProcedure
    .input(
      z.object({
        id: z.string().cuid(),
        data: z.object({
          name: z.string().min(1).max(200).optional(),
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
      if (!previous) throw new TRPCError({ code: 'NOT_FOUND', message: 'Proveedor no encontrado' });

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

  // ── Product Locations ────────────────────────────────────────────────────

  createProductLocation: managerProcedure
    .input(
      z.object({
        warehouseId: z.string().cuid(),
        productId: z.string().cuid(),
        locationCode: z.string().min(1).max(50),
        quantityOnHand: z.number().int().min(0).default(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.productLocation.findFirst({
        where: { warehouseId: input.warehouseId, productId: input.productId },
      });
      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Ya existe una ubicación para este producto en este almacén',
        });
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

  updateProductLocation: managerProcedure
    .input(
      z.object({
        id: z.string().cuid(),
        locationCode: z.string().min(1).max(50),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const previous = await ctx.db.productLocation.findUnique({ where: { id: input.id } });
      if (!previous) throw new TRPCError({ code: 'NOT_FOUND', message: 'Ubicación no encontrada' });

      const updated = await ctx.db.productLocation.update({
        where: { id: input.id },
        data: { locationCode: input.locationCode },
      });

      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session!.user!.id!,
          action: 'UPDATE_PRODUCT_LOCATION',
          entityType: 'ProductLocation',
          entityId: input.id,
          oldValues: { locationCode: previous.locationCode } as Prisma.InputJsonValue,
          newValues: { locationCode: input.locationCode } as Prisma.InputJsonValue,
        },
      });

      return updated;
    }),

  // ── System Config ────────────────────────────────────────────────────────

  getSystemConfig: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.systemConfig.findMany();
    return Object.fromEntries(rows.map((r) => [r.key, r.value])) as Record<string, string>;
  }),

  setSystemConfig: managerProcedure
    .input(z.object({ key: z.string().min(1), value: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const previous = await ctx.db.systemConfig.findUnique({ where: { key: input.key } });

      const updated = await ctx.db.systemConfig.upsert({
        where: { key: input.key },
        update: { value: input.value },
        create: { key: input.key, value: input.value },
      });

      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session!.user!.id!,
          action: 'UPDATE',
          entityType: 'SystemConfig',
          entityId: input.key,
          oldValues: { value: previous?.value ?? null } as Prisma.InputJsonValue,
          newValues: { value: input.value } as Prisma.InputJsonValue,
        },
      });

      return updated;
    }),
});
