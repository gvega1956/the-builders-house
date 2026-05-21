# Deuda Técnica — The Builder's House ERP

Registro de problemas conocidos no resueltos. Cada entrada debe tener:
contexto, severidad, sprint propuesto para resolución, y referencia al código.

## Pendientes

### TD-001 — Lock pesimista faltante en purchases.receive

**Severidad:** Media
**Detectado en:** Sprint 1 (durante Bug 1.2)
**Archivo:** `src/server/trpc/routers/purchases.ts > receive`
**Sprint propuesto:** Sprint 2

**Descripción:** La operación de recepción de mercancía no usa SELECT FOR
UPDATE sobre productLocation antes de incrementar quantityOnHand. Bajo
recepciones concurrentes del mismo PO, podría haber lost updates.

**Plan:** Aplicar el mismo patrón del Bug 1.2 (transacción + lock pesimista
+ validación + update).

---

### TD-002 — Audit log incompleto en customers.update

**Severidad:** Baja
**Detectado en:** Sprint 1
**Archivo:** `src/server/trpc/routers/customers.ts > update`
**Sprint propuesto:** Sprint 3

**Descripción:** El audit log solo captura el campo `name` en oldValues/newValues.
Cambios en creditLimit, type, taxId, o cualquier otro campo no quedan registrados.

**Plan:** Implementar helper `diffEntities(before, after)` que capture todos
los campos cambiados. Aplicar en customers.update y otros endpoints similares.
