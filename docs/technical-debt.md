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

---

### TD-004 — Sistema de reservedQuantity no implementado

**Severidad:** Media
**Detectado en:** Sprint 2 (durante Bug 2.1)
**Archivo:** `src/server/trpc/routers/invoicing.ts`
**Sprint propuesto:** Sprint 2 — Bug 2.1b

**Descripción:** El campo `ProductLocation.reservedQuantity` existe en el schema
pero no se actualiza en ningún flujo. `calculateAvailableStock` funciona
correctamente pero siempre opera con `reservedQuantity=0` en la práctica.

**Riesgo concreto:** Dos vendedores creando facturas DRAFT simultáneas del
mismo producto pueden "vender" más stock del disponible cuando ambas se
committan. No es un bug ahora porque las facturas se crean como ISSUED
directo, pero es un bug en cuanto se implemente el flujo DRAFT.

**Plan:** Implementar como Bug 2.1b en este mismo sprint:
1. Modificar `invoicing.create`: si status sería `DRAFT`, hacer `reservedQuantity += quantity`
2. Crear endpoint `invoicing.commitDraft`: `reservedQuantity -= q`, `quantityOnHand -= q`, status `DRAFT → ISSUED`
3. Modificar `invoicing.void` para facturas `DRAFT`: `reservedQuantity -= q` (sin tocar `quantityOnHand`)

---

### TD-005 — CREDIT_NOTE no implementado

**Severidad:** Baja
**Detectado en:** Sprint 2 (Bug 2.1)
**Archivo:** `src/server/trpc/routers/invoicing.ts > create`
**Sprint propuesto:** Sprint 6 o posterior

**Descripción:** Las notas de crédito (devoluciones formales con efecto fiscal)
requieren reglas específicas de PR (SURI), reversión de IVU, y vínculo a
factura original. No están en scope del MVP.

El endpoint `invoicing.create` lanza `METHOD_NOT_SUPPORTED` para `type === 'CREDIT_NOTE'`
con referencia a esta entrada (`ver TD-005`).

**Plan:** Definir requerimientos con contador externo antes de implementar.
Una nota de crédito requiere lógica inversa: movimientos de tipo IN (devolución
al inventario), referencia a la factura original que se acredita, y lógica
de IVU inverso. Decidir con el negocio si puede exceder el monto de la
factura original. Implementar como módulo separado después de que el resto
del flujo financiero esté estable.

---

### TD-008 — convertQuoteToInvoice no calcula dueDate automáticamente

**Severidad:** Baja
**Detectado en:** Sprint 2 (Bug 2.1c)
**Archivo:** `src/server/trpc/routers/invoicing.ts > convertQuoteToInvoice`
**Sprint propuesto:** Sprint 3 (Clientes y Cuentas por Cobrar)

**Descripción:** La factura derivada de una cotización nace con `dueDate=null`.
Debería derivarse de los términos de pago del cliente (NET-15, NET-30, etc.).
`QUOTE.dueDate` NO se hereda porque tiene semántica distinta: en una cotización
significa "vigencia de la oferta"; en una factura significa "fecha límite de pago".

**Plan:** Cuando se implemente `Customer.paymentTerms` (campo aún no existente),
calcular `dueDate = invoiceCreatedAt + paymentTermDays`.

---

### TD-007 — Formato inconsistente en schema.prisma

**Severidad:** Cosmética
**Detectado en:** Sprint 2 (Bug 2.1c)
**Archivo:** `prisma/schema.prisma`
**Sprint propuesto:** Sprint 5 (cleanup de DB)

**Descripción:** Inconsistencia en alineación de columnas entre campos
antiguos y campos agregados en migraciones recientes. No afecta funcionalidad
ni Prisma. Sólo legibilidad.

**Plan:** Correr `npx prisma format` durante el cleanup del Sprint 5.

---

### TD-006 — Role cast duplicado en invoicing.ts (Sprint 4 — SEG-3)

**Severidad:** Baja
**Detectado en:** Sprint 2 (Bug 2.1)
**Archivo:** `src/server/trpc/routers/invoicing.ts > create`, `> authorizeBackorder`
**Sprint propuesto:** Sprint 4 (junto con SEG-3)

**Descripción:** El cast `(ctx.session!.user as { role?: string }).role ?? 'VENDOR'`
aparece en dos lugares del mismo archivo: `create` y `authorizeBackorder`.
Cuando Sprint 4 implemente el tipado correcto del JWT (SEG-3), ambos lugares
deben actualizarse simultáneamente. Si se arregla solo uno, el otro sigue
usando el cast inseguro.

**Plan:** En Sprint 4 (SEG-3), buscar `as { role?: string }` en todo el
codebase y reemplazar por el tipo real del token JWT. No parchear solo uno.
