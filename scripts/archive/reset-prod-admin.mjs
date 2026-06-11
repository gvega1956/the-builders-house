import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
try {
  const newHash = await bcrypt.hash('Admin2026!', 12);
  
  // Reset password
  await db.$executeRawUnsafe(
    `UPDATE users SET "passwordHash"=$1, "updatedAt"=NOW() WHERE email='admin@buildershouse.pr'`,
    newHash
  );
  
  // Clear ALL login attempts to remove rate limiting
  const deleted = await db.$executeRawUnsafe(
    `DELETE FROM login_attempts WHERE email='admin@buildershouse.pr'`
  );
  
  console.log('✅ Password reseteado a: Admin2026!');
  console.log(`✅ Login attempts borrados: ${deleted}`);
  
  // Verify
  const user = await db.$queryRawUnsafe(
    `SELECT email, name, role, "isActive" FROM users WHERE email='admin@buildershouse.pr'`
  );
  console.log('Usuario:', JSON.stringify(user[0]));
} catch(e) {
  console.error('Error:', e.message);
} finally {
  await db.$disconnect();
}
