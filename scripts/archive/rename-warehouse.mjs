import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
try {
  const updated = await db.warehouse.update({
    where: { name: 'Negras' },
    data: { name: 'Próxima Sucursal' },
  });
  console.log('✅ Renombrado:', updated.name);
} catch(e) {
  console.error('Error:', e.message);
} finally {
  await db.$disconnect();
}
