import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';

const MIN_SKUS = 3;
const MAX_SKUS = 5;

// POST /api/cron/cycle-counts
// Llamado diariamente por el scheduler (DigitalOcean App Platform Jobs u otro cron HTTP).
// Protegido con Authorization: Bearer <CRON_SECRET>.
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [warehouses, managers] = await Promise.all([
    db.warehouse.findMany({ select: { id: true, name: true } }),
    db.user.findMany({
      where: { role: { in: ['MANAGER', 'ADMIN'] }, isActive: true },
      select: { id: true },
    }),
  ]);

  if (managers.length === 0) {
    return NextResponse.json({ skipped: true, reason: 'no_managers' });
  }

  const created: Array<{ warehouseId: string; productId: string; cycleCountId: string }> = [];

  for (const warehouse of warehouses) {
    const locations = await db.productLocation.findMany({
      where: { warehouseId: warehouse.id, quantityOnHand: { gt: 0 } },
      select: { id: true, productId: true, quantityOnHand: true },
    });

    if (locations.length === 0) continue;

    const shuffled = [...locations].sort(() => Math.random() - 0.5);
    const count = MIN_SKUS + Math.floor(Math.random() * (MAX_SKUS - MIN_SKUS + 1));
    const selected = shuffled.slice(0, Math.min(count, shuffled.length));

    for (const loc of selected) {
      const assignedUser = managers[Math.floor(Math.random() * managers.length)]!;

      const cycleCount = await db.cycleCount.create({
        data: {
          productId: loc.productId,
          locationId: loc.id,
          assignedUserId: assignedUser.id,
          scheduledDate: today,
          systemQuantity: loc.quantityOnHand,
        },
      });

      created.push({
        warehouseId: warehouse.id,
        productId: loc.productId,
        cycleCountId: cycleCount.id,
      });
    }
  }

  return NextResponse.json({ created: created.length, detail: created });
}
