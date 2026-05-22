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

---

### TD-009 — Seguridad pendiente en settingsRouter (Sprint 4 — prioridad ALTA)

**Severidad:** ALTA
**Detectado en:** Pausa estructural post-Sprint 2 (revisión de working tree)
**Archivo:** `src/server/trpc/routers/settings.ts`
**Sprint propuesto:** Sprint 4 (primer bug a abordar)

**Descripción:** Tres problemas de seguridad identificados y documentados, clasificados
por el CTO como prioridad #1 del Sprint 4:

**S3 — Password policy insuficiente:**
`createUser` valida solo `z.string().min(8)`. Sin requisito de complejidad
(mayúsculas, números, símbolos), sin lista de contraseñas comunes prohibidas
(ej. "password123"), sin política de no-reutilización.
Plan: Agregar `z.string().min(8).regex(...)` con requisito de complejidad
y rechazar passwords en lista de las 1000 más comunes.

**S4 — Sin protección "último admin":**
`updateUser` permite que un ADMIN cambie su propio rol a MANAGER o se desactive
(`isActive: false`), dejando el sistema sin ningún ADMIN. Ningún usuario podría
entonces administrar el sistema.
Plan: Antes de la actualización, verificar que si el cambio afecta al único
ADMIN activo, lanzar BAD_REQUEST con mensaje explicativo.

**S5 — `adminProcedure` no encadena `protectedProcedure`:**
`adminProcedure = t.procedure.use(enforceUserIsAdmin)`. Si en el futuro se
agrega middleware global a `protectedProcedure` (rate limiting, request logging,
IP blocking), ese middleware NO se aplicará a rutas admin.
Plan: Refactorizar a `adminProcedure = protectedProcedure.use(enforceAdminRole)`
donde `enforceAdminRole` solo verifica el rol (sin duplicar el check de auth).

**Impacto actual:** Bajo — el sistema tiene 4-10 usuarios conocidos en producción.
**Impacto si se ignora:** Alto — en producción real, S3 permite contraseñas débiles
y S4 puede dejar el sistema sin administrador.

---

## TD-010: Productos sin variantes (acabados Acid Etched / Blue Green)

**Fecha:** 2026-05-22
**Severidad:** Media
**Decisión:** Dueño eligió Camino A explícitamente

### Contexto
Los productos "Ventanas de Seguridad" tienen variantes naturales:
- 36 medidas únicas (18 por línea LAMA 3" y LAMA 4")
- 2 acabados por medida (Acid Etched, Blue Green)
- Total conceptual: 36 productos × 2 variantes = 72 SKUs

### Implementación actual
Cargados como 72 productos planos en `Product`. Cada acabado es un producto
distinto con SKU distinto y stock independiente.

### Por qué se eligió
- Schema actual no soporta variantes (no existe tabla `ProductVariant`)
- Implementar variantes correctamente requiere 1-2 días dedicados
- Dueño necesita inventario funcionando hoy
- Migración futura aceptada

### Costo futuro (cuando se implementen variantes — Sprint 5+)
1. Migración: convertir 72 productos planos en 36 productos + 72 variantes
2. Movements: re-asociar movimientos al nuevo modelo
3. Invoicing: ajustar `InvoiceItem` para referenciar variante
4. UI: agregar selector de variante en formularios
5. Riesgo de pérdida de data si la migración no se hace con cuidado

### Mitigación pre-migración
- SKUs sistemáticos permiten identificar pares de variantes programáticamente
  (regex: `^(VS-L[34]-\d+x\d+(?:¾)?)-([AB][EG])$`)
- El campo `name` incluye la descripción completa
- Categoría única ("Ventanas de Seguridad") facilita el query de migración

---

## TD-011: Carácter Unicode ¾ en SKUs

**Fecha:** 2026-05-22
**Severidad:** Baja
**Decisión:** Dueño priorizó precisión visual sobre compatibilidad universal

### Contexto
Los SKUs incluyen `¾` (U+00BE) para distinguir medidas fraccionarias
(ej: `VS-L4-24x21¾-AE`). Esto refleja la hoja de precios física del dueño
pero introduce riesgos de encoding al exportar/integrar con sistemas externos.

### Riesgos identificados
1. **Excel exports:** dependiendo del encoding (UTF-8 vs Latin-1), `¾` puede
   aparecer como `Â¾`, `?`, o vacío.
2. **URLs:** debe URL-encodearse como `%C2%BE` para uso en endpoints REST.
3. **Integraciones externas:** QuickBooks, Shopify, sistemas contables pueden
   rechazar o transformar el carácter.
4. **Etiquetas físicas:** algunas impresoras térmicas no renderizan `¾`.
5. **Búsquedas:** un usuario que tipea `21 3/4` no encontrará `21¾` sin
   normalización en el query.

### Mitigación cuando surja el problema
- Función helper `normalizeSku(sku)` que reemplace `¾` → `.75` para sistemas
  externos sin perder el SKU canónico interno.
- Búsqueda fuzzy en UI: aceptar `21 3/4`, `21.75`, `21¾` como equivalentes.

### Resolución esperada
Cuando se integre con primer sistema externo, o cuando un usuario reporte
que no puede encontrar productos por búsqueda.
