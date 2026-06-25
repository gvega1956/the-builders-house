// Zona horaria oficial del sistema — Puerto Rico, UTC-4, sin DST
export const APP_TZ = 'America/Puerto_Rico';
const PR_OFFSET_MS = 4 * 60 * 60 * 1000;

// Retorna el inicio de "hoy" en hora PR expresado como Date UTC.
// Ejemplo: llamado a las 2026-06-26T02:30Z → retorna 2026-06-25T04:00Z
// (la factura de las 10:30 PM PR del 25 pertenece al día 25, no al 26).
export function prDayStart(utcNow: Date = new Date()): Date {
  const prDate = new Date(utcNow.getTime() - PR_OFFSET_MS);
  return new Date(
    Date.UTC(prDate.getUTCFullYear(), prDate.getUTCMonth(), prDate.getUTCDate())
    + PR_OFFSET_MS,
  );
}

// Retorna el inicio del mes actual en hora PR expresado como Date UTC.
export function prMonthStart(utcNow: Date = new Date()): Date {
  const prDate = new Date(utcNow.getTime() - PR_OFFSET_MS);
  return new Date(
    Date.UTC(prDate.getUTCFullYear(), prDate.getUTCMonth(), 1)
    + PR_OFFSET_MS,
  );
}
