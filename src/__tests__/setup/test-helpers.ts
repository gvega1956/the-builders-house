/**
 * Test helpers: PrismaClient apuntando a thebuilders_test, makeCtx, seed, truncate.
 *
 * GUARD: el módulo aborta en su carga si DATABASE_URL no apunta a la BD de test.
 * Esto impide que cualquier test corra accidentalmente contra producción.
 */

import { PrismaClient } from '@prisma/client';

// ── GUARD ────────────────────────────────────────────────────────────────────
const dbUrl = process.env.DATABASE_URL ?? '';
const dbName = dbUrl.split('/').pop()?.split('?')[0] ?? '';
if (!dbName.includes('_test') && dbName !== 'thebuilders_test') {
  throw new Error(
    `[TEST GUARD] DATABASE_URL apunta a "${dbName || 'desconocido'}".\n` +
      'Los tests solo se ejecutan contra una BD con "_test" en el nombre.\n' +
      'Nunca apuntes los tests a producción.',
  );
}

// ── Prisma Client para tests ─────────────────────────────────────────────────
export const testDb = new PrismaClient({
  datasources: { db: { url: dbUrl } },
});

// ── Context factory ───────────────────────────────────────────────────────────
// El middleware enforceUserIsAuthed hace un DB lookup del usuario y sobreescribe
// el rol en ctx. Lo importante es que userId apunte a un usuario real en la BD
// de test con el rol correcto.
// Devuelve `any` para evitar la importación de tipos de NextRequest en el entorno
// de test (Next.js no está disponible en el contexto de Vitest).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function makeCtx(db: PrismaClient, userId: string): any {
  return {
    db,
    session: {
      user: {
        id: userId,
        name: 'Test User',
        email: 'test@internal',
      },
    },
    req: {
      headers: { get: (_: string) => null as string | null },
    },
  };
}

// ── Seed return type ──────────────────────────────────────────────────────────
export interface TestSeed {
  adminUser: { id: string };
  managerUser: { id: string };
  vendorUser: { id: string };
  warehouse: { id: string };
  warehouse2: { id: string };
  supplier: { id: string };
  product: { id: string };
  location: { id: string };
  customer: { id: string };
}

// ── Truncate (preserva usuarios — se crean con upsert y se reutilizan) ────────
export async function truncateAll(db: PrismaClient): Promise<void> {
  // La cláusula CASCADE trunca automáticamente las tablas dependientes
  // (invoice_items, payments, product_locations, purchase_order_items, transfer_lines, etc.)
  await db.$executeRaw`
    TRUNCATE TABLE
      audit_log,
      login_attempts,
      invoices,
      inventory_movements,
      transfers,
      purchase_orders,
      products,
      categories,
      customers,
      suppliers,
      warehouses,
      sequences,
      system_config
    CASCADE
  `;
}

// ── Seed mínimo por test ──────────────────────────────────────────────────────
export async function seedTestDb(db: PrismaClient): Promise<TestSeed> {
  // Usuarios: upsert para IDs estables entre tests (no se truncan)
  const [adminUser, managerUser, vendorUser] = await Promise.all([
    db.user.upsert({
      where: { email: 'admin@test.internal' },
      create: {
        email: 'admin@test.internal',
        name: 'Admin Test',
        role: 'ADMIN',
        isActive: true,
        passwordHash: '$2a$10$test_placeholder_hash_not_valid',
      },
      update: {},
    }),
    db.user.upsert({
      where: { email: 'manager@test.internal' },
      create: {
        email: 'manager@test.internal',
        name: 'Manager Test',
        role: 'MANAGER',
        isActive: true,
        passwordHash: '$2a$10$test_placeholder_hash_not_valid',
      },
      update: {},
    }),
    db.user.upsert({
      where: { email: 'vendor@test.internal' },
      create: {
        email: 'vendor@test.internal',
        name: 'Vendor Test',
        role: 'VENDOR',
        isActive: true,
        passwordHash: '$2a$10$test_placeholder_hash_not_valid',
      },
      update: {},
    }),
  ]);

  // System config
  await db.systemConfig.create({ data: { key: 'TAX_RATE', value: '0.115' } });

  // Secuencias
  const now = new Date();
  await Promise.all([
    db.sequence.create({ data: { name: 'INVOICE',        prefix: 'FAC-', padding: 5, currentValue: 0, updatedAt: now } }),
    db.sequence.create({ data: { name: 'QUOTE',          prefix: 'COT-', padding: 5, currentValue: 0, updatedAt: now } }),
    db.sequence.create({ data: { name: 'CREDIT_NOTE',    prefix: 'NC-',  padding: 5, currentValue: 0, updatedAt: now } }),
    db.sequence.create({ data: { name: 'PURCHASE_ORDER', prefix: 'OC-',  padding: 5, currentValue: 0, updatedAt: now } }),
    db.sequence.create({ data: { name: 'TRANSFER',       prefix: 'TRF-', padding: 4, currentValue: 0, updatedAt: now } }),
  ]);

  // Almacenes
  const [warehouse, warehouse2] = await Promise.all([
    db.warehouse.create({ data: { name: 'Almacén Test 1' } }),
    db.warehouse.create({ data: { name: 'Almacén Test 2' } }),
  ]);

  // Proveedor
  const supplier = await db.supplier.create({
    data: { name: 'Proveedor Test' },
  });

  // Categoría (requerida por Product)
  const category = await db.category.create({
    data: { name: 'Categoría Test', slug: 'categoria-test', isActive: true },
  });

  // Producto: costo $50, precio retail $100
  const product = await db.product.create({
    data: {
      sku: 'TEST-001',
      name: 'Ventana Test 24x22',
      categoryId: category.id,
      supplierId: supplier.id,
      unitCost: 50,
      retailPrice: 100,
      wholesalePrice: 85,
      isActive: true,
    },
  });

  // Ubicación en almacén 1: 10 unidades en mano
  const location = await db.productLocation.create({
    data: {
      productId: product.id,
      warehouseId: warehouse.id,
      locationCode: 'A-01',
      quantityOnHand: 10,
      reservedQuantity: 0,
      backorderQuantity: 0,
    },
  });

  // Cliente
  const customer = await db.customer.create({
    data: {
      code: 'CLI-TEST-001',
      name: 'Cliente Test S.A.',
      type: 'RETAIL',
      isActive: true,
    },
  });

  return {
    adminUser:   { id: adminUser.id },
    managerUser: { id: managerUser.id },
    vendorUser:  { id: vendorUser.id },
    warehouse:   { id: warehouse.id },
    warehouse2:  { id: warehouse2.id },
    supplier:    { id: supplier.id },
    product:     { id: product.id },
    location:    { id: location.id },
    customer:    { id: customer.id },
  };
}
