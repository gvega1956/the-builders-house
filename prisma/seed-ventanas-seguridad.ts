/**
 * Seed: Ventanas de Seguridad
 * Crea 72 productos (18 medidas × 2 lamas × 2 acabados) sin precio ni stock.
 * Ejecutar: tsx prisma/seed-ventanas-seguridad.ts
 */
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

// Medidas por tipo de lama (pulgadas, fracción ¾ = 0.75)
const LAMA4_HEIGHTS = [21.75, 29.75, 37.75, 45.75, 53.75, 57.75];
const LAMA3_HEIGHTS = [22.75, 28.75, 37.75, 46.75, 52.75, 58.75];
const WIDTHS = [24, 30, 36];

const FINISHES = [
  { code: 'AE', label: 'Acid Etched' },
  { code: 'BG', label: 'Blue Green' },
] as const;

function formatHeight(h: number): string {
  const whole = Math.floor(h);
  const frac = Math.round((h - whole) * 100);
  return frac === 75 ? `${whole}¾` : frac === 50 ? `${whole}½` : `${h}`;
}

function heightCode(h: number): string {
  // e.g. 21.75 → "2175", 29.75 → "2975"
  return String(Math.round(h * 100));
}

async function main() {
  console.log('Seeding ventanas de seguridad...\n');

  // Crear / verificar categoría (maneja slug o name ya existentes)
  let category = await db.category.findFirst({
    where: { OR: [{ slug: 'ventanas-seguridad' }, { name: 'Ventanas de Seguridad' }] },
  });
  if (!category) {
    category = await db.category.create({
      data: { name: 'Ventanas de Seguridad', slug: 'ventanas-seguridad' },
    });
  }
  console.log(`Categoría: ${category.name}`);

  // Buscar proveedor existente (opcional)
  const supplier = await db.supplier.findFirst({ where: { isActive: true } });
  const supplierId = supplier?.id;

  // Construir lista de productos
  type ProductInput = {
    sku: string;
    name: string;
    description: string;
    categoryId: string;
    supplierId?: string;
    dimensions: object;
    color: string;
    model: string;
    type: string;
    unitCost: number;
    retailPrice: number;
    wholesalePrice: number;
    minStock: number;
  };

  const products: ProductInput[] = [];

  for (const w of WIDTHS) {
    for (const h of LAMA4_HEIGHTS) {
      for (const finish of FINISHES) {
        products.push({
          sku: `VS-L4-${w}X${heightCode(h)}-${finish.code}`,
          name: `Ventana Seguridad Lama 4" ${w}x${formatHeight(h)} ${finish.label}`,
          description: `Ventana de seguridad jalousie. Lama 4". Medidas: ${w}"×${formatHeight(h)}". Acabado: ${finish.label}. Acid Etched o Blue Green.`,
          categoryId: category.id,
          ...(supplierId && { supplierId }),
          dimensions: { width: w, height: h, unit: 'in' },
          color: finish.label,
          model: 'Lama 4"',
          type: 'Seguridad',
          unitCost: 0,
          retailPrice: 0,
          wholesalePrice: 0,
          minStock: 0,
        });
      }
    }

    for (const h of LAMA3_HEIGHTS) {
      for (const finish of FINISHES) {
        products.push({
          sku: `VS-L3-${w}X${heightCode(h)}-${finish.code}`,
          name: `Ventana Seguridad Lama 3" ${w}x${formatHeight(h)} ${finish.label}`,
          description: `Ventana de seguridad jalousie. Lama 3". Medidas: ${w}"×${formatHeight(h)}". Acabado: ${finish.label}. Acid Etched o Blue Green.`,
          categoryId: category.id,
          ...(supplierId && { supplierId }),
          dimensions: { width: w, height: h, unit: 'in' },
          color: finish.label,
          model: 'Lama 3"',
          type: 'Seguridad',
          unitCost: 0,
          retailPrice: 0,
          wholesalePrice: 0,
          minStock: 0,
        });
      }
    }
  }

  console.log(`\nProductos a crear: ${products.length}`);
  console.log('─'.repeat(50));

  let created = 0;
  let skipped = 0;

  for (const p of products) {
    const exists = await db.product.findUnique({ where: { sku: p.sku } });
    if (exists) {
      console.log(`  SKIP  ${p.sku}`);
      skipped++;
      continue;
    }
    await db.product.create({ data: p });
    console.log(`  OK    ${p.sku}  →  ${p.name}`);
    created++;
  }

  console.log('\n' + '─'.repeat(50));
  console.log(`Completado: ${created} creados, ${skipped} ya existían.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
