# ADR-001: Implementación de Numeración Secuencial

**Estado:** Aceptada
**Fecha:** 2026-05-20
**Decisores:** Roberto (negocio), Claude Architect (planificación), Claude Code (implementación)

---

## Contexto

El sistema requiere números de factura, orden de compra, cliente y cotización que sean:

- **Únicos:** Sin duplicados bajo concurrencia (4-10 usuarios simultáneos).
- **Consecutivos:** Sin saltos visibles para efectos de auditoría y SURI.
- **Formateados:** Prefijo legible + número con ceros (`FAC-00001`, `CLI-00042`).

La implementación original usaba `COUNT(*) + 1` para calcular el siguiente número. Esto crea una race condition clásica: dos transacciones concurrentes pueden leer el mismo COUNT y generar números duplicados.

---

## Decisión

Usar una **tabla `sequences` con UPDATE transaccional** (`UPDATE ... RETURNING`) dentro del `$transaction` activo de Prisma.

```sql
UPDATE sequences
SET    "currentValue" = "currentValue" + 1,
       "updatedAt"    = NOW()
WHERE  name = $1
RETURNING prefix, "currentValue", padding
```

El UPDATE de PostgreSQL adquiere un **lock exclusivo sobre la fila** durante la transacción. Las transacciones concurrentes que intenten actualizar la misma fila ESPERAN hasta que la transacción actual haga COMMIT o ROLLBACK. Esto serializa la generación de números sin código adicional de bloqueo.

---

## Alternativas Consideradas

### 1. SEQUENCE nativa de PostgreSQL

```sql
CREATE SEQUENCE invoice_seq;
SELECT nextval('invoice_seq');
```

**Rechazada.** `nextval()` nunca hace rollback: si la transacción falla, el número se pierde permanentemente. Esto crea gaps (`FAC-00001`, `FAC-00003` — falta el 2) que deben ser explicados a auditores y a SURI. Inaceptable para contabilidad.

### 2. UUID como número de documento

**Rechazado.** Los UUIDs no son legibles para humanos. Los clientes y el equipo necesitan poder referirse a `FAC-00042` verbalmente y en papel. Un UUID como número de factura es inusable operacionalmente.

### 3. SELECT FOR UPDATE + UPDATE separado

```sql
SELECT * FROM sequences WHERE name = $1 FOR UPDATE;
UPDATE sequences SET "currentValue" = "currentValue" + 1 WHERE name = $1;
```

**Rechazado.** Dos round-trips a la base de datos vs. uno. El `UPDATE ... RETURNING` logra el mismo lock exclusivo en una sola operación.

### 4. UPDATE ... RETURNING (ELEGIDA)

Un solo statement que atómicamente incrementa y devuelve el valor nuevo. El lock exclusivo del UPDATE serializa transacciones concurrentes. El rollback de la transacción revierte el incremento.

---

## Consecuencias

### Positivas

- **Sin duplicados:** Garantizado por el lock exclusivo de PostgreSQL sobre la fila.
- **Sin gaps por rollback:** El incremento es parte de la transacción; si ésta hace rollback, el contador vuelve al valor anterior. El siguiente llamado devuelve el mismo número.
- **Un solo round-trip:** Más eficiente que SELECT FOR UPDATE + UPDATE.
- **Auditable:** `updatedAt` registra cuándo se generó cada número.
- **Extensible:** Agregar una nueva secuencia es insertar una fila en `sequences`.

### Negativas

- **Serialización:** Las transacciones que usan la misma secuencia se ejecutan en serie (una espera a la otra). Bajo carga muy alta (>1000 facturas/min), esto crea un cuello de botella.
- **Cuello de botella aceptable:** Para 4-10 usuarios concurrentes, el tiempo de espera es despreciable (microsegundos). El costo de la serialización es irrelevante a esta escala.

---

## Validación

Verificado empíricamente con `src/__tests__/integration/sequences.test.ts`:

- **Test de concurrencia:** 5 llamadas concurrentes (`Promise.all`) generan 5 números únicos y consecutivos. Sin duplicados. Sin saltos.
- **Test de rollback:** Una transacción que hace rollback restaura el contador a su valor previo. El siguiente llamado genera el mismo número (sin gap).
- **Test de secuencias reales:** `INVOICE`, `CUSTOMER`, `PURCHASE_ORDER` y `QUOTE` tienen los prefijos y paddings correctos en la base de datos.

Verificación empírica directa contra la DB (script `rollback-empirico.ts`):
```
Antes: 0
Generado dentro de tx: FAC-00001
Rollback ocurrió: rollback forzado
Después: 0
Siguiente número: FAC-00001
```

---

## Cuándo Reconsiderar

Migrar a SEQUENCE nativa de PostgreSQL (aceptando gaps) si:

- El volumen supera **100 facturas por minuto de forma sostenida**, o
- El sistema se expande a **múltiples sucursales con tráfico alto simultáneo** que compitan por la misma secuencia.

En ese escenario, la serialización del UPDATE se convertiría en un cuello de botella medible. Los gaps deberían ser documentados y aceptados por el área contable.
