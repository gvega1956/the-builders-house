import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
try {
  const newHash = await bcrypt.hash('admin1234', 12);
  await db.$executeRawUnsafe(`UPDATE users SET "passwordHash"=$1, "updatedAt"=NOW() WHERE email='admin@buildershouse.pr'`, newHash);
  await db.$executeRawUnsafe(`DELETE FROM login_attempts WHERE email='admin@buildershouse.pr'`);
  console.log('✅ Password restaurado a: admin1234');
} catch(e) {
  console.error('Error:', e.message);
} finally {
  await db.$disconnect();
}
