/**
 * Integration tests for Bug D-2 — Last-admin guard in updateUser.
 *
 * Validates that the system prevents demoting or deactivating the last ADMIN
 * user, which would leave the system unmanageable.
 *
 * Tests:
 *   D2-a: Demoting the sole ADMIN to VIEWER → BAD_REQUEST
 *   D2-b: Deactivating the sole ADMIN → BAD_REQUEST
 *   D2-c: With 2 ADMINs — demoting one is allowed
 *   D2-d: Non-admin fields update (name/email) on sole ADMIN → allowed
 *
 * NOTE: This test temporarily demotes all pre-existing ADMIN users to isolate
 * the "sole admin" scenario. This is safe because fileParallelism=false means
 * test files run serially.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createCallerFactory } from '@/server/trpc';
import { settingsRouter } from '@/server/trpc/routers/settings';
import type { Context } from '@/server/trpc/context';

const db = new PrismaClient();
const makeSettingsCaller = createCallerFactory(settingsRouter);

function makeCaller(userId: string) {
  const ctx = {
    db,
    session: {
      user: { id: userId, name: 'Test Admin D2', email: 'admin-d2@test.invalid', role: 'ADMIN' },
      expires: new Date(Date.now() + 8 * 3600 * 1000).toISOString(),
    },
    req: { headers: { get: (_: string) => null } },
  } as unknown as Context;
  return makeSettingsCaller(ctx);
}

let soloAdminId: string;
let secondAdminId: string;
let preExistingAdminIds: string[] = []; // IDs of admins that existed before this test

beforeAll(async () => {
  // Capture all currently active ADMINs so we can temporarily demote them
  // and restore them after the test. This isolates the "sole admin" scenario.
  const preExisting = await db.user.findMany({
    where: { role: 'ADMIN', isActive: true },
    select: { id: true },
  });
  preExistingAdminIds = preExisting.map((u) => u.id);

  const solo = await db.user.create({
    data: { name: 'Solo Admin D2', email: 'solo-admin-d2@test.invalid', role: 'ADMIN' },
  });
  soloAdminId = solo.id;

  const second = await db.user.create({
    data: { name: 'Second Admin D2', email: 'second-admin-d2@test.invalid', role: 'ADMIN' },
  });
  secondAdminId = second.id;

  // Temporarily demote ALL pre-existing admins to isolate admin count for these tests
  if (preExistingAdminIds.length > 0) {
    await db.user.updateMany({
      where: { id: { in: preExistingAdminIds } },
      data: { role: 'MANAGER' },
    });
  }
});

afterAll(async () => {
  // Restore all pre-existing admins first
  if (preExistingAdminIds.length > 0) {
    await db.user.updateMany({
      where: { id: { in: preExistingAdminIds } },
      data: { role: 'ADMIN' },
    });
  }

  // Ensure test users are ADMIN before cleanup (in case tests left them in another state)
  await db.user.updateMany({
    where: { id: { in: [soloAdminId, secondAdminId] } },
    data: { role: 'ADMIN', isActive: true },
  }).catch(() => {});

  await db.auditLog.deleteMany({
    where: { entityType: 'User', entityId: { in: [soloAdminId, secondAdminId] } },
  });
  await db.user.deleteMany({ where: { id: { in: [soloAdminId, secondAdminId] } } });
  await db.$disconnect();
});

describe('Bug D-2 — Último admin protegido contra degradación/desactivación', () => {
  it('D2-a: degradar el único ADMIN a VIEWER → BAD_REQUEST', async () => {
    // Temporarily demote secondAdmin so soloAdmin is the only one
    await db.user.update({ where: { id: secondAdminId }, data: { role: 'MANAGER' } });

    const caller = makeCaller(soloAdminId);
    await expect(
      caller.updateUser({ id: soloAdminId, data: { role: 'VIEWER' } })
    ).rejects.toThrow(/último.*admin|administrador|BAD_REQUEST/i);

    // Role must remain ADMIN in the DB
    const user = await db.user.findUnique({ where: { id: soloAdminId } });
    expect(user!.role).toBe('ADMIN');

    // Restore secondAdmin
    await db.user.update({ where: { id: secondAdminId }, data: { role: 'ADMIN' } });
  });

  it('D2-b: desactivar el único ADMIN → BAD_REQUEST', async () => {
    // Demote secondAdmin so soloAdmin is sole ADMIN
    await db.user.update({ where: { id: secondAdminId }, data: { role: 'MANAGER' } });

    const caller = makeCaller(soloAdminId);
    await expect(
      caller.updateUser({ id: soloAdminId, data: { isActive: false } })
    ).rejects.toThrow(/último.*admin|administrador|BAD_REQUEST/i);

    const user = await db.user.findUnique({ where: { id: soloAdminId } });
    expect(user!.isActive).toBe(true);

    await db.user.update({ where: { id: secondAdminId }, data: { role: 'ADMIN' } });
  });

  it('D2-c: con 2 ADMINs — degradar uno a MANAGER está permitido', async () => {
    // Both soloAdminId and secondAdminId are ADMIN at this point
    const caller = makeCaller(soloAdminId);

    await expect(
      caller.updateUser({ id: secondAdminId, data: { role: 'MANAGER' } })
    ).resolves.not.toThrow();

    const user = await db.user.findUnique({ where: { id: secondAdminId } });
    expect(user!.role).toBe('MANAGER');

    // Restore
    await db.user.update({ where: { id: secondAdminId }, data: { role: 'ADMIN' } });
  });

  it('D2-d: actualizar nombre del único ADMIN → permitido (campo no sensible)', async () => {
    // Demote secondAdmin so soloAdmin is sole ADMIN
    await db.user.update({ where: { id: secondAdminId }, data: { role: 'MANAGER' } });

    const caller = makeCaller(soloAdminId);
    await expect(
      caller.updateUser({ id: soloAdminId, data: { name: 'Solo Admin D2 Updated' } })
    ).resolves.not.toThrow();

    const user = await db.user.findUnique({ where: { id: soloAdminId } });
    expect(user!.name).toBe('Solo Admin D2 Updated');
    expect(user!.role).toBe('ADMIN'); // Role unchanged

    await db.user.update({ where: { id: secondAdminId }, data: { role: 'ADMIN' } });
  });
});
