import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
// Check actual column name in invoices
const cols = await db.$queryRawUnsafe(`SELECT column_name FROM information_schema.columns WHERE table_name='invoices' ORDER BY ordinal_position`);
cols.forEach(c=>console.log(c.column_name));
await db.$disconnect();
