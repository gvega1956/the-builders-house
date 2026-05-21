import { type Prisma } from '@prisma/client';
import { TRPCError } from '@trpc/server';

type SequenceRow = {
  prefix: string;
  currentValue: number;
  padding: number;
};

/**
 * Incrementa atómicamente la secuencia y devuelve el número formateado.
 * Debe llamarse SIEMPRE dentro de un $transaction activo.
 *
 * GARANTÍAS:
 * - Sin duplicados: el UPDATE adquiere lock exclusivo sobre la fila.
 *   Transacciones concurrentes esperan hasta que la actual libere el lock.
 * - Sin gaps por rollback: si la transacción hace rollback, el incremento
 *   se revierte y el siguiente llamado devuelve el mismo número.
 * - Gaps solo en crash de proceso entre UPDATE y COMMIT (extremadamente raro
 *   y aceptable).
 *
 * TRADEOFF:
 * Esta implementación serializa transacciones que llamen a la misma secuencia.
 * Bajo carga muy alta (>1000 tx/s), considerar SEQUENCE nativa de PostgreSQL.
 * Para los 4-10 usuarios concurrentes del sistema actual, el costo es despreciable.
 *
 * NO confundir con SEQUENCE nativa de PostgreSQL, que tiene semántica opuesta
 * (no bloquea, produce gaps en rollback).
 *
 * @param tx   - cliente de transacción Prisma (el argumento `tx` del callback de $transaction)
 * @param name - nombre de la secuencia: 'INVOICE' | 'PURCHASE_ORDER' | 'CUSTOMER' | 'QUOTE'
 * @returns    - string formateado, ej: 'FAC-00001', 'CLI-00042', 'OC-RD-00003', 'COT-00001'
 */
export async function getNextSequenceValue(
  tx: Prisma.TransactionClient,
  name: string,
): Promise<string> {
  const rows = await tx.$queryRaw<SequenceRow[]>`
    UPDATE sequences
    SET    "currentValue" = "currentValue" + 1,
           "updatedAt"    = NOW()
    WHERE  name = ${name}
    RETURNING prefix, "currentValue", padding
  `;

  if (rows.length === 0) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: `Secuencia '${name}' no encontrada. ¿Corriste el seed de la base de datos?`,
    });
  }

  const row = rows[0]!;
  return `${row.prefix}${String(row.currentValue).padStart(row.padding, '0')}`;
}
