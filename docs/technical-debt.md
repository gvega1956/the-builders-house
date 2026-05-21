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

---

### TD-003 — Campo `type` en Invoice es String plano, no enum Prisma

**Severidad:** Baja
**Detectado en:** Sprint 2 (durante análisis del Bug 2.1)
**Archivo:** `prisma/schema.prisma > Invoice.type`
**Sprint propuesto:** Sprint 3

**Descripción:** `Invoice.type` está declarado como `String @default("INVOICE")`
con un comentario `// INVOICE | QUOTE | CREDIT_NOTE`. No hay enforcement a
nivel de base de datos ni type-safety en TypeScript más allá de las validaciones
Zod del router.

**Riesgo concreto:** Una inserción directa a la DB (seed, script de migración,
CLI de admin) puede escribir cualquier string en `type` sin que Prisma ni
PostgreSQL lo rechacen. Esto haría que `if (type === 'QUOTE')` en el router
nunca coincida, sin error visible.

**Plan:** Crear enum `InvoiceType { INVOICE QUOTE CREDIT_NOTE }` en schema.prisma,
hacer migration `ALTER TABLE invoices ALTER COLUMN type TYPE "InvoiceType" USING type::"InvoiceType"`,
actualizar Zod schemas y código del router. Requiere aprobación de migración (R8).
