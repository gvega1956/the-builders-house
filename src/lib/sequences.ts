import { type Prisma } from '@prisma/client';
import { TRPCError } from '@trpc/server';

type SequenceRow = {
  prefix: string;
  currentValue: number;
  padding: number;
};

/**
 * Incrementa atómicamente la secuencia y devuelve el número formateado.
 *
 * Debe llamarse SIEMPRE dentro de un $transaction activo — nunca con ctx.db directamente.
 * El UPDATE ... RETURNING es atómico en PostgreSQL: bloquea la fila durante la escritura
 * y devuelve el valor ya incrementado en un solo round-trip.
 *
 * VENTAJA vs SEQUENCE nativa de PostgreSQL: al usar UPDATE en tabla transaccional,
 * los rollbacks también restauran el contador. Ejemplo: si la transacción que
 * creó FAC-00003 hace rollback, el siguiente número será FAC-00003 de nuevo.
 *
 * NOTA sobre gaps: pueden ocurrir si el proceso falla DESPUÉS del commit de la
 * secuencia pero ANTES del commit del registro que la usa (crash de red, OOM).
 * Ejemplo válido: FAC-00001, FAC-00003. Los gaps NO deben "corregirse" rellenando
 * huecos — intentarlo introduciría race conditions. Lo único inaceptable serían
 * DUPLICADOS, que están prevenidos por el UPDATE atómico.
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
