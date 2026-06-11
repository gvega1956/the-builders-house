import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const tbls = ['inventory_movements','payments','audit_log','customers','login_attempts'];
for (const t of tbls) {
  const cols = await db.$queryRawUnsafe(`SELECT STRING_AGG(column_name,', ' ORDER BY ordinal_position) AS c FROM information_schema.columns WHERE table_name='${t}'`);
  console.log(`${t}: ${cols[0].c}`);
}
await db.$disconnect();
