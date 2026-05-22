/**
 * Integration tests for Bug A-1 — Stale Role in JWT
 *
 * Validates that the enforceUserIsAuthed middleware fetches the role FRESH
 * from the database on every request, preventing a user whose role was
 * changed in the DB from operating with stale permissions for up to 8h.
 *
 * Also validates Bug A-1 corollary: a deactivated user is rejected
 * immediately on the next request, not after their JWT expires.
 *
 * Tests:
 *   - ADMIN degraded to VIEWER mid-session → next request returns FORBIDDEN
 *   - User deactivated mid-session → next request returns UNAUTHORIZED
 *   - VENDOR promoted to MANAGER mid-session → next request gains access
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createCallerFactory } from '@/server/trpc';
import { settingsRouter } from '@/server/trpc/routers/settings';
import type { Context } from '@/server/trpc/context';

const db = new PrismaClient();
const makeSettingsCaller = createCallerFactory(settingsRouter);

function makeCaller(userId: string, role: 'ADMIN' | 'MANAGER' | 'VENDOR' | 'VIEWER') {
  const ctx = {
    db,
    session: {
      user: { id: userId, name: `Test ${role}`, email: `${role.toLowerCase()}-roletest@test.invalid`, role },
      expires: new Date(Date.now() + 8 * 3600 * 1000).toISOString(),
    },
    req: { headers: { get: (_: string) => null } },
  } as unknown as Context;
  return makeSettingsCaller(ctx);
}

let adminId: string;
let targetUserId: string;
let secondAdminId: string;

beforeAll(async () => {
  const admin = await db.user.create({
    data: { name: 'Test Admin RoleTest', email: 'admin-roletest@test.invalid', role: 'ADMIN' },
  });
  adminId = admin.id;

  // Second admin so we can demote the first without triggering last-admin guard
  const secondAdmin = await db.user.create({
    data: { name: 'Test Admin2 RoleTest', email: 'admin2-roletest@test.invalid', role: 'ADMIN' },
  });
  secondAdminId = secondAdmin.id;

  const target = await db.user.create({
    data: { name: 'Test Target RoleTest', email: 'target-roletest@test.invalid', role: 'VENDOR' },
  });
  targetUserId = target.id;
});

afterAll(async () => {
  await db.auditLog.deleteMany({ where: { entityType: 'User', entityId: { in: [adminId, targetUserId, secondAdminId] } } });
  await db.user.deleteMany({ where: { id: { in: [adminId, targetUserId, secondAdminId] } } });
  await db.$disconnect();
});

describe('Bug A-1 — Rol fresco del DB en cada request', () => {
  it('A1: usuario degradado de ADMIN a VIEWER en DB → siguiente request devuelve FORBIDDEN aunque JWT diga ADMIN', async () => {
    // Caller built with ADMIN role in the session (simulates a JWT with stale ADMIN)
    const staleAdminCaller = makeCaller(adminId, 'ADMIN');

    // First call succeeds — user IS admin in DB at this point
    const usersBefore = await staleAdminCaller.users();
    expect(Array.isArray(usersBefore)).toBe(true);

    // Demote the user in the DB (simulates an admin demoting this user mid-session)
    await db.user.update({
      where: { id: adminId },
      data: { role: 'VIEWER' },
    });

    // Same caller (JWT still says ADMIN) — but middleware fetches fresh role from DB
    // enforceUserIsAuthed reads role: 'VIEWER' from DB → enforceIsManagerOrAdmin → FORBIDDEN
    await expect(
      staleAdminCaller.users() // managerProcedure — VIEWER not allowed
    ).rejects.toThrow(/FORBIDDEN|forbidden|Se requiere/i);

    // Restore for cleanup
    await db.user.update({ where: { id: adminId }, data: { role: 'ADMIN' } });
  });

  it('A2: usuario desactivado en DB → siguiente request devuelve UNAUTHORIZED aunque tenga sesión válida', async () => {
    const callerWithActiveSession = makeCaller(targetUserId, 'VENDOR');

    // Deactivate the user in the DB
    await db.user.update({ where: { id: targetUserId }, data: { isActive: false } });

    // Same session — enforceUserIsAuthed checks isActive from DB → UNAUTHORIZED
    await expect(
      callerWithActiveSession.users()
    ).rejects.toThrow(/UNAUTHORIZED|unauthorized|desactivado/i);

    // Restore
    await db.user.update({ where: { id: targetUserId }, data: { isActive: true } });
  });

  it('A3: usuario promovido de VENDOR a MANAGER en DB → siguiente request gana acceso a managerProcedure', async () => {
    // Caller built with VENDOR role in session — cannot call users() (managerProcedure)
    const callerWithStaleVendor = makeCaller(targetUserId, 'VENDOR');

    await expect(
      callerWithStaleVendor.users()
    ).rejects.toThrow(/FORBIDDEN|forbidden|MANAGER|ADMIN/i);

    // Promote in DB
    await db.user.update({ where: { id: targetUserId }, data: { role: 'MANAGER' } });

    // Same caller session says VENDOR, but middleware fetches MANAGER from DB → allowed
    const users = await callerWithStaleVendor.users();
    expect(Array.isArray(users)).toBe(true);

    // Restore
    await db.user.update({ where: { id: targetUserId }, data: { role: 'VENDOR' } });
  });
});
