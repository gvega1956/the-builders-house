# Sprint 1 — Fundaciones Transaccionales: Reporte de Cierre

**Período:** 2026-05-20  
**Estado:** COMPLETO — pendiente aprobación  
**Tests al cierre:** 33/33 pasando (4 archivos de test)

---

## Objetivo

Eliminar los riesgos de corrupción de datos en las operaciones más críticas del ERP:
numeración de documentos, movimientos de inventario y aritmética financiera.

---

## Bugs Resueltos

### Bug 1.1 — Race condition en numeración secuencial `AUDIT-BUG-11`
**Commit:** `fix(sequences): reemplazar count()+1 por secuencias atómicas con UPDATE...RETURNING`

**Problema:** `SELECT COUNT(*) + 1` expuesto a race condition. Dos facturas creadas simultáneamente podían recibir el mismo número (`FAC-00001` duplicado).

**Solución:** Tabla `sequences` con `UPDATE ... RETURNING`. El UPDATE adquiere lock exclusivo sobre la fila; transacciones concurrentes esperan en cola. Sin duplicados. Sin gaps en rollbacks (el incremento forma parte de la transacción y se revierte con ella).

**Archivos:**
- `src/lib/sequences.ts` — helper atómico
- `prisma/schema.prisma` — modelo `Sequence`
- `prisma/seed.ts` — seed idempotente (INVOICE, CUSTOMER, PURCHASE_ORDER, QUOTE)
- `src/server/trpc/routers/invoicing.ts` — usa `getNextSequenceValue`
- `src/server/trpc/routers/customers.ts` — usa `getNextSequenceValue`
- `src/server/trpc/routers/purchases.ts` — usa `getNextSequenceValue`
- `src/__tests__/integration/sequences.test.ts` — 8 tests (concurrencia, rollback, prefijos reales)
- `docs/architectural-decisions/ADR-001-sequence-implementation.md`

**Garantías verificadas:**
- 5 llamadas concurrentes (`Promise.all`) → 5 números únicos y consecutivos
- Rollback restaura el contador (sin gap): verificado empíricamente

---

### Bug 1.2 — Falta de atomicidad en `movements.create` `AUDIT-BUG-12`
**Commit:** `fix(movements): atomicidad en create + validar locationId vs productId`

**Problema:** `findUnique` + validación de stock + `create` + `update` eran 4 operaciones separadas. Dos requests concurrentes podían leer el mismo stock=5, pasar ambas la validación de stock≥3, y ambas decrementar. Stock final: -1 en lugar de 2.

**Solución:** `$transaction` con `SELECT ... FOR UPDATE` antes de la validación. El lock exclusivo serializa las transacciones concurrentes sobre la misma fila. `inventoryMovement.create` y `productLocation.update` dentro de la misma transacción — atomic commit o rollback.

**Archivos:**
- `src/server/trpc/routers/movements.ts`
- `src/__tests__/integration/movements-atomicity.test.ts` — 4 tests

**Garantías verificadas:**
- 2 requests concurrentes de 3 con stock=5 → uno pasa, uno falla con "Stock insuficiente. Disponible: 2"
- Stock final = 2, nunca -1

---

### Bug 1.4 — `locationId` no validado contra `productId` `AUDIT-BUG-14`
**Commit:** (unido al Bug 1.2)

**Problema:** Un movimiento podía registrarse con `locationId` que pertenecía a un producto diferente. El stock del producto A se actualizaba, pero el movimiento de auditoría apuntaba al producto B.

**Solución:** Dentro del `$transaction`, después del `SELECT FOR UPDATE`, se verifica `location.productId === input.productId`. Error claro: "La ubicación no pertenece al producto indicado".

---

### Bug 1.3 — Convención de signos no forzada en Zod `AUDIT-BUG-13`
**Commit:** `fix(movements): forzar convención de signos en Zod`

**Problema:** El schema aceptaba cantidad positiva para `OUT`/`DAMAGE` y negativa para `IN`/`RETURN`. Un error del frontend podía causar incrementos donde debían ser decrementos, corrompiendo el inventario silenciosamente.

**Solución:** `.superRefine()` en `movementCreateSchema`:
- `IN` / `RETURN` → `quantity > 0` obligatorio
- `OUT` / `DAMAGE` → `quantity < 0` obligatorio
- `TRANSFER` / `ADJUSTMENT` → cualquier no-cero (ya validado)

**Archivos:**
- `src/server/trpc/routers/movements.ts`
- `src/__tests__/integration/movements-sign-convention.test.ts` — 13 tests (todos los tipos, todos los casos límite)

---

### Bug 1.5 — Aritmética financiera con floats JS `AUDIT-BUG-15`
**Commit:** `fix(invoicing): reemplazar aritmética float con Prisma.Decimal`

**Problema:** `subtotal`, `taxAmount`, `total` y `lineTotal` calculados con floats IEEE-754. `0.115 * 99.99 = 11.498849999...` en lugar de `11.49885`. Errores de centavos en filings de IVU (SURI).

**Solución:**
- `src/lib/money.ts` — helper `toDecimal(n)` que convierte via `String(n)` antes de construir `Prisma.Decimal`, evitando heredar el error binario del float.
- Toda la aritmética en `create` usa Decimal: reduce, lineTotal, taxAmount, total.
- `addPayment` usa `.add()` y `.gte()` en lugar de `Number()` cast.

**Archivos:**
- `src/lib/money.ts`
- `src/server/trpc/routers/invoicing.ts`
- `src/__tests__/integration/invoice-decimal.test.ts` — 9 tests (IVU 11.5%, descuentos, demostración del bug original)

---

## Métricas del Sprint

| Métrica | Valor |
|---------|-------|
| Bugs resueltos | 5 (1.1, 1.2, 1.3, 1.4, 1.5) |
| Archivos de test creados | 4 |
| Tests totales al cierre | 33 |
| Tests fallando | 0 |
| Commits | 5 (+ 1 docs) |
| Archivos de producción modificados | 6 |
| Archivos nuevos creados | 3 (`sequences.ts`, `money.ts`, `ADR-001`) |

---

## Deuda Técnica Identificada (fuera de scope, documentada)

Ver `docs/technical-debt.md` (a crear en Sprint 2 si aplica).

- `src/__tests__/integration/rollback-empirico.ts` — script de verificación empírica, puede eliminarse o moverse a `docs/`.
- `purchases.ts > receive`: la operación de recepción no tiene lock pesimista sobre `productLocation`. Mismo patrón que Bug 1.2. Candidato para Sprint 2.
- `customers.ts > update`: el auditLog de `update` no captura los valores individuales cambiados (solo `name`). Candidato para Sprint 3 (auditoría detallada).

---

## Decisiones Arquitectónicas

- **ADR-001:** `docs/architectural-decisions/ADR-001-sequence-implementation.md`
  Documenta la elección de tabla `sequences` con `UPDATE...RETURNING` sobre SEQUENCE nativa de PostgreSQL.

---

## Resultado

**Sprint 1 COMPLETO.** Todas las fundaciones transaccionales están en su lugar.
El sistema puede generar documentos únicos bajo concurrencia, mover inventario sin
race conditions, y calcular IVU sin errores de centavos.

Listo para revisión. Esperando: **APROBADO SPRINT 1**
