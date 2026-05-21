# ADR-003: Estrategia de aislamiento de tests de integración

**Estado:** Aceptada (revisable a ~64 archivos / >60s)
**Fecha:** 2026-05-21
**Decisores:** Roberto (negocio), Claude Architect (revisión), Claude Code (implementación)

---

## Contexto

Al agregar el tercer archivo de tests de integración (`invoicing-bug-2-3-2-4.test.ts`), el test
A4 del archivo `invoicing-bug-2-1.test.ts` comenzó a fallar espúreamente en ejecución paralela.

Output literal del error:

```
FAIL  src/__tests__/integration/invoicing-bug-2-1.test.ts > Bug 2.1 — Factura descuenta inventario > create — type=INVOICE > A4: locationId pertenece a producto diferente → BAD_REQUEST, transacción rollback, secuencia no gastada
AssertionError: expected 71 to be 70 // Object.is equality

- Expected
+ Received

- 70
+ 71

 ❯ src/__tests__/integration/invoicing-bug-2-1.test.ts:295:38
    293|       // Sequence counter rolled back — next successful invoice gets t...
    294|       const seqAfter = await db.sequence.findUnique({ where: { name: '...
    295|       expect(seqAfter!.currentValue).toBe(valueBefore);
       |                                      ^
    296|     });

 Test Files  1 failed | 7 passed (8)
     Tests  1 failed | 75 passed (76)
  Duration  8.51s (transform 1.52s, setup 0ms, import 5.73s, tests 8.38s, environment 4ms)
```

**Diagnóstico:** A4 valida que cuando un `$transaction` hace rollback (la ubicación no pertenece
al producto), el contador de la tabla `sequences` también revierte — porque `getNextSequenceValue(tx, 'INVOICE')`
usa el mismo `tx` y por tanto es transaccional. El test lee `valueBefore = sequences.currentValue`,
provoca el rollback, y verifica `seqAfter === valueBefore`.

La falla ocurrió porque `invoicing-bug-2-3-2-4.test.ts` corriendo en paralelo en otro worker de
vitest creó una INVOICE exitosa durante la ventana de medición de A4, avanzando
`sequences.currentValue` de 70 a 71. El rollback de A4 funcionó correctamente — el fallo fue
interferencia de workers paralelos en estado global de DB, no un bug de producción.

El estado global compartido afectado es la tabla `sequences`, específicamente la fila
`WHERE name = 'INVOICE'`, cuyo campo `currentValue` es un entero absoluto que avanza con cada
INVOICE creada, independientemente del worker que la crea.

---

## Decisión

Aplicar `fileParallelism: false` en `vitest.config.ts`. Los archivos de test de integración
se ejecutan secuencialmente, eliminando la interferencia entre workers que comparten estado
global de DB.

```typescript
// vitest.config.ts
test: {
  fileParallelism: false,   // ← Bug 2.3+2.4 — previene contaminación de sequences entre workers
  environment: 'node',
  ...
}
```

---

## Alternativas consideradas

### Alternativa 1 — Reset de secuencias en `beforeAll` por archivo

```typescript
beforeAll(async () => {
  await db.sequence.update({ where: { name: 'INVOICE' }, data: { currentValue: 0 } });
});
```

**Descartada.** Si dos archivos corren en paralelo y ambos ejecutan este `beforeAll`
casi simultáneamente, ambos resetean a 0 y luego crean facturas con `INVOICE-00001`,
colisionando en la columna `invoiceNumber` (unique constraint). El reset introduce una
nueva condición de carrera peor que la original. Adicionalmente, si un worker ya avanzó
el contador antes del reset del otro, la ventana de interferencia persiste — solo se mueve.

### Alternativa 2 — Prefijos únicos por archivo de test

Usar `invoiceNumber` = `BUG21-00001`, `BUG22-00001`, `BUG2324-00001`, etc., para que
los datos en tabla `invoices` no colisionen aunque los archivos corran en paralelo.

**Descartada para este problema específico.** Esta alternativa aísla datos en tablas como
`invoices`, `payments`, `inventory_movements`. Pero el problema no es colisión de strings
de `invoiceNumber` — es colisión en `sequences.currentValue`, que es un único entero
global. No hay forma de "prefijar" un contador entero. El entero 71 ≠ 70 aunque todos
los `invoiceNumber` strings sean globalmente únicos.

Esta alternativa resuelve colisiones de filas entre tests. No resuelve colisiones de
estado global compartido.

### Alternativa 3 — Schema separado de PostgreSQL por archivo de test

Cada worker usaría su propio `search_path = test_schema_N` con su propia tabla `sequences`
y su propio contador aislado.

**Descartada por costo de infraestructura desproporcionado:**
- Requiere crear N schemas antes de correr los tests
- Prisma no soporta `search_path` dinámico nativamente — se necesitaría configurar la
  connection string completa por worker
- Las migraciones deben correrse en cada schema
- La limpieza (DROP SCHEMA) al terminar agrega complejidad de teardown
- Si un worker falla, el schema puede quedar huérfano en la DB de desarrollo

Para un ERP de 4-10 usuarios con 1-2 desarrolladores, el costo de mantenimiento
de esta infraestructura no se justifica en este momento.

---

## Consecuencias

**Positivas:**
- Tests deterministas, sin race conditions entre archivos
- Cero infraestructura adicional — cambio de una línea en `vitest.config.ts`
- Completamente reversible
- Permite que A4 valide estado global absoluto, que es la garantía que queremos: un
  `$transaction` que falla NO debe avanzar el contador de secuencia

**Negativas:**
- Suite más lento a escala, según la siguiente proyección:

| Archivos | Secuencial (est.) | Paralelo 4 workers (est.) | Factor |
|---|---|---|---|
| 8 (medido) | 14s | ~10s | 1.4x |
| 20 | ~23s | ~12s | 1.9x |
| 30 | ~32s | ~14s | 2.3x |
| 50 | ~49s | ~18s | 2.7x |
| 100 | ~91s (~1:31) | ~30s | 3.0x |

*Modelo: `T_sec(N) ≈ 6s + N × 0.85s`, `T_par(N) ≈ 6s + ceil(N/4) × 0.85s` con 4 workers.*

---

## Threshold de revisión

Revisar esta decisión cuando `npm test` supere **60 segundos consistentemente** en
el entorno de desarrollo local. Según el modelo, eso ocurre alrededor de los **64 archivos
de integración**. Al llegar a ese punto, no es necesario reescribir los tests — solo
cambiar la estrategia de aislamiento.

---

## Solución futura propuesta (en el threshold)

Evaluar en este orden de preferencia:

1. **Hacer A4 agnóstico al contador absoluto.** En lugar de comparar `seqAfter === valueBefore`,
   verificar que ninguna factura del propio test consumió la secuencia (usando `createdAt`
   timestamps o un UUID de correlación). Esto permite reactivar el paralelismo sin cambiar
   la garantía que A4 verifica.

2. **Reactivar `fileParallelism: true` + prefijos únicos** para archivos que no dependen
   de estado global absoluto. Solo los archivos que tengan tests de tipo A4 seguirían
   corriendo secuencialmente.

3. **Schemas separados de PostgreSQL por suite**, solo si el equipo crece
   significativamente y el tiempo de CI supera 5 minutos.

---

## Referencias

- Vitest docs: `fileParallelism` — https://vitest.dev/config/#fileparallelism
- Bug 2.3+2.4 — commit `3d5c274` (`fix(invoicing): Bug 2.3 + 2.4`)
- Test A4 — `src/__tests__/integration/invoicing-bug-2-1.test.ts:295`
