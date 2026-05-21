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

  // Crear productos de ejemplo
  const productos = [
    {
      sku: 'VEN-CR-3624-AL',
      name: 'Ventana Corrediza 36x24 Aluminum',
      categoryId: categories[0]!.id,
      supplierId: supplier.id,
      dimensions: { width: 36, height: 24, unit: 'in' },
      color: 'Aluminum',
      model: 'CR',
      type: 'Corrediza',
      unitCost: 85.00,
      retailPrice: 145.00,
      wholesalePrice: 120.00,
      minStock: 5,
    },
    {
      sku: 'VEN-BT-4836-BL',
      name: 'Ventana Batiente 48x36 Blanco',
      categoryId: categories[1]!.id,
      supplierId: supplier.id,
      dimensions: { width: 48, height: 36, unit: 'in' },
      color: 'Blanco',
      model: 'BT',
      type: 'Batiente',
      unitCost: 120.00,
      retailPrice: 210.00,
      wholesalePrice: 175.00,
      minStock: 3,
    },
    {
      sku: 'PUE-RD-8030-CB',
      name: 'Puerta Residencial 80x30 Caoba',
      categoryId: categories[4]!.id,
      supplierId: supplier.id,
      dimensions: { width: 30, height: 80, unit: 'in' },
      color: 'Caoba',
      model: 'RD',
      type: 'Puerta',
      unitCost: 280.00,
      retailPrice: 495.00,
      wholesalePrice: 420.00,
      minStock: 2,
    },
  ];

  for (const p of productos) {
    const product = await db.product.upsert({
      where: { sku: p.sku },
      update: {},
      create: p,
    });

    // Crear location con stock inicial
    await db.productLocation.upsert({
      where: { productId_warehouseId: { productId: product.id, warehouseId: warehouse.id } },
      update: {},
      create: {
        productId: product.id,
        warehouseId: warehouse.id,
        locationCode: 'A-01-01',
        quantityOnHand: 10,
      },
    });
  }
  console.log(`✓ ${productos.length} productos con stock inicial`);

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
