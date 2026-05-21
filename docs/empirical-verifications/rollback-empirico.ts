/**
 * Script empírico de verificación de rollback.
 * Corre con: npx tsx src/__tests__/integration/rollback-empirico.ts
 */

import { PrismaClient } from '@prisma/client';
import { getNextSequenceValue } from '../../lib/sequences';

const db = new PrismaClient();

async function main() {
  // Preparar: resetear INVOICE a 0 para que el output sea predecible
  await db.sequence.update({
    where: { name: 'INVOICE' },
    data: { currentValue: 0 },
  });

  // Paso 1: estado inicial
  const before = await db.sequence.findUnique({ where: { name: 'INVOICE' } });
  console.log('Antes:', before!.currentValue);

  // Paso 2: transacción que hace rollback explícito
  try {
    await db.$transaction(async (tx) => {
      const num = await getNextSequenceValue(tx, 'INVOICE');
      console.log('Generado dentro de tx:', num);
      throw new Error('rollback forzado');
    });
  } catch (e: unknown) {
    console.log('Rollback ocurrió:', (e as Error).message);
  }

  // Paso 3: estado después del rollback
  const after = await db.sequence.findUnique({ where: { name: 'INVOICE' } });
  console.log('Después:', after!.currentValue);

  // Paso 4: siguiente número generado
  const next = await db.$transaction(async (tx) =>
    getNextSequenceValue(tx, 'INVOICE')
  );
  console.log('Siguiente número:', next);

  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
