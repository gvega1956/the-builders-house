import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';
import { TRPCError } from '@trpc/server';
import type { Prisma } from '@prisma/client';
import { getNextSequenceValue } from '@/lib/sequences';

export const purchasesRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        status: z.enum(['DRAFT', 'SENT', 'IN_TRANSIT', 'RECEIVED', 'CLOSED']).optional(),
        supplierId: z.string().optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(1000).default(50),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const { status, supplierId, page = 1, pageSize = 50 } = input ?? {};
      const skip = (page - 1) * pageSize;

      const where: Prisma.PurchaseOrderWhereInput = {
        ...(status && { status }),
        ...(supplierId && { supplierId }),
      };

      const [orders, total] = await Promise.all([
        ctx.db.purchaseOrder.findMany({
          where,
          include: {
            supplier: { select: { name: true, country: true } },
            _count: { select: { items: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: pageSize,
        }),
        ctx.db.purchaseOrder.count({ where }),
      ]);

      return { orders, total, page, pageSize };
    }),

  byId: protectedProcedure
    .input(z.string().cuid())
    .query(async ({ ctx, input }) => {
      const order = await ctx.db.purchaseOrder.findUnique({
        where: { id: input },
        include: {
          supplier: true,
          items: {
            include: { product: { select: { name: true, sku: true } } },
          },
        },
      });
      if (!order) throw new TRPCError({ code: 'NOT_FOUND' });
      return order;
    }),

  create: protectedProcedure
    .input(
      z.object({
        supplierId: z.string().cuid(),
        items: z
          .array(
            z.object({
              productId: z.string().cuid(),
              quantityOrdered: z.number().int().positive(),
              unitCostUsd: z.number().positive(),
              unitCostDop: z.number().optional(),
            })
          )
          .min(1),
        expectedDate: z.date().optional(),
        freightCost: z.number().min(0).default(0),
        customsCost: z.number().min(0).default(0),
        exchangeRate: z.number().positive().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { items, freightCost, customsCost, ...rest } = input;

      const subtotal = items.reduce(
        (sum, item) => sum + item.quantityOrdered * item.unitCostUsd,
        0
      );
      const totalLandedCost = subtotal + freightCost + customsCost;

      const order = await ctx.db.$transaction(async (tx) => {
        const poNumber = await getNextSequenceValue(tx, 'PURCHASE_ORDER');

        return tx.purchaseOrder.create({
          data: {
            ...rest,
            poNumber,
            freightCost,
            customsCost,
            totalLandedCost,
            items: { create: items },
          },
          include: { items: true, supplier: true },
        });
      });

      return order;
    }),

  updateStatus: protectedProcedure
    .input(
      z.object({
        id: z.string().cuid(),
        status: z.enum(['DRAFT', 'SENT', 'IN_TRANSIT', 'RECEIVED', 'CLOSED']),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const data: Prisma.PurchaseOrderUpdateInput = { status: input.status };
      if (input.status === 'RECEIVED') data.receivedDate = new Date();

      return ctx.db.purchaseOrder.update({ where: { id: input.id }, data });
    }),

  receive: protectedProcedure
    .input(
      z.object({
        id: z.string().cuid(),
        items: z.array(
          z.object({
            itemId: z.string().cuid(),
            quantityReceived: z.number().int().min(0),
            locationId: z.string().cuid(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const order = await ctx.db.purchaseOrder.findUnique({
        where: { id: input.id },
        include: { items: true },
      });
      if (!order) throw new TRPCError({ code: 'NOT_FOUND' });

      await ctx.db.$transaction(async (tx) => {
        for (const recv of input.items) {
          const item = order.items.find((i) => i.id === recv.itemId);
          if (!item || recv.quantityReceived === 0) continue;

          await tx.purchaseOrderItem.update({
            where: { id: recv.itemId },
            data: { quantityReceived: { increment: recv.quantityReceived } },
          });

          await tx.inventoryMovement.create({
            data: {
              productId: item.productId,
              locationId: recv.locationId,
              movementType: 'IN',
              quantity: recv.quantityReceived,
              referenceType: 'PURCHASE_ORDER',
              referenceId: order.poNumber,
              userId: ctx.session!.user!.id!,
              ipAddress: ctx.req.headers.get('x-forwarded-for') ?? undefined,
            },
          });

          await tx.productLocation.update({
            where: { id: recv.locationId },
            data: { quantityOnHand: { increment: recv.quantityReceived } },
          });
        }

        await tx.purchaseOrder.update({
          where: { id: input.id },
          data: { status: 'RECEIVED', receivedDate: new Date() },
        });
      });

      return { success: true };
    }),
});
