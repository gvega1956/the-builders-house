import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

const db = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Crear categorías
  const categories = await Promise.all([
    db.category.upsert({ where: { slug: 'corredizas' }, update: {}, create: { name: 'Corredizas', slug: 'corredizas' } }),
    db.category.upsert({ where: { slug: 'batientes' }, update: {}, create: { name: 'Batientes', slug: 'batientes' } }),
    db.category.upsert({ where: { slug: 'proyectantes' }, update: {}, create: { name: 'Proyectantes', slug: 'proyectantes' } }),
    db.category.upsert({ where: { slug: 'fijas' }, update: {}, create: { name: 'Fijas', slug: 'fijas' } }),
    db.category.upsert({ where: { slug: 'puertas' }, update: {}, create: { name: 'Puertas', slug: 'puertas' } }),
  ]);
  console.log(`✓ ${categories.length} categorías`);

  // Crear warehouse principal
  const warehouse = await db.warehouse.upsert({
    where: { name: 'Almacén Principal' },
    update: {},
    create: { name: 'Almacén Principal', address: 'Puerto Rico' },
  });
  console.log('✓ Warehouse principal');

  // Crear proveedor RD
  const supplier = await db.supplier.upsert({
    where: { id: 'supplier-rd-001' },
    update: {},
    create: {
      id: 'supplier-rd-001',
      name: 'Ventanas RD S.A.',
      country: 'DO',
      contactName: 'Juan García',
      paymentTerms: 'Net 30',
    },
  });
  console.log('✓ Proveedor RD');

  // Crear usuario admin
  const adminPassword = await hash('admin1234', 12);
  const admin = await db.user.upsert({
    where: { email: 'admin@buildershouse.pr' },
    update: {},
    create: {
      email: 'admin@buildershouse.pr',
      name: 'Roberto Martínez',
      passwordHash: adminPassword,
      role: 'ADMIN',
    },
  });
  console.log('✓ Usuario admin:', admin.email);

  // Productos reales se cargan via prisma/seed-ventanas-seguridad.ts y scripts similares.
  void warehouse; // se usa en scripts de seed de productos

  // Crear secuencias de numeración correlativa
  // update: {} intencional — no resetear currentValue si ya existen registros en producción
  const sequenceData = [
    { name: 'INVOICE',        prefix: 'FAC-',   padding: 5 },
    { name: 'PURCHASE_ORDER', prefix: 'OC-RD-', padding: 5 },
    { name: 'CUSTOMER',       prefix: 'CLI-',   padding: 5 },
    { name: 'QUOTE',          prefix: 'COT-',   padding: 5 },
    { name: 'CREDIT_NOTE',    prefix: 'NC-',    padding: 5 },
  ];

  for (const seq of sequenceData) {
    await db.sequence.upsert({
      where:  { name: seq.name },
      update: {},
      create: { ...seq, currentValue: 0 },
    });
  }
  console.log(`✓ ${sequenceData.length} secuencias (INVOICE, PURCHASE_ORDER, CUSTOMER, QUOTE, CREDIT_NOTE)`);

  console.log('✅ Seed completado');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
