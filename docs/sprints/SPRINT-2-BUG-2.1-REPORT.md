# Bug 2.1 — Cierre formal

**Audit reference:** AUDIT-BUG-21
**Sprint:** 2 — Integridad Financiera
**Estado:** CERRADO
**Fecha de cierre:** 2026-05-20

---

## Alcance final

Bug 2.1 se subdividió en 3 sub-bugs durante implementación:

| Sub-bug | Descripción | Estado |
|---|---|---|
| 2.1a | Factura INVOICE descuenta inventario atómicamente | CERRADO |
| 2.1b | Sistema de reservedQuantity para DRAFT invoices | DIFERIDO — ver TD-004 |
| 2.1c | Endpoints authorizeBackorder y convertQuoteToInvoice | CERRADO |

---

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `prisma/schema.prisma` | InvoiceItem.locationId (FK nullable, ON DELETE SET NULL); Invoice.sourceQuoteId (FK nullable, ON DELETE SET NULL); relación 1:N QuoteToInvoice; invoiceItems en ProductLocation |
| `src/server/trpc/routers/invoicing.ts` | Reescritura completa: 5 endpoints finales (list, byId, create, addPayment, void, authorizeBackorder, convertQuoteToInvoice) con lógica de negocio completa |
| `src/server/trpc/index.ts` | Export `createCallerFactory` para testing server-side |
| `src/server/trpc/root.ts` | Registro del invoicingRouter |
| `docs/technical-debt.md` | Entradas TD-003 a TD-008 |
| `tsconfig.json` | Exclusión de `docs/**/*` para corregir error tsc pre-existente |

---

## Archivos nuevos

| Archivo | Descripción |
|---|---|
| `docs/architectural-decisions/ADR-002-invoice-state-machine.md` | Máquina de estados de Invoice: transiciones válidas, restricciones por type, reglas QuoteToInvoice (1:N) |
| `src/__tests__/integration/invoicing-bug-2-1.test.ts` | 17 tests de integración cubriendo 8 áreas funcionales |
| `docs/sprints/SPRINT-2-BUG-2.1-REPORT.md` | Este archivo |

---

## Migraciones aplicadas

| Migración | Descripción |
|---|---|
| `20260520000001_add_pending_authorization_and_converted_to_invoice_status` | Extiende el enum `InvoiceStatus` con `PENDING_AUTHORIZATION` y `CONVERTED` |
| `20260520000002_add_locationid_to_items_and_quote_invoice_relation` | Añade `invoice_items.locationId` (FK, ON DELETE SET NULL), `invoices.sourceQuoteId` (FK, ON DELETE SET NULL), índices parciales en ambas columnas |

---

## ADRs creados

| ADR | Contenido |
|---|---|
| ADR-002 | Máquina de estados de Invoice: 7 estados, 9 transiciones válidas, restricciones por `type` (INVOICE/QUOTE/CREDIT_NOTE), 4 reglas de la relación QuoteToInvoice (1:N), decisiones de diseño con rationale |

---

## Deuda técnica generada

| ID | Descripción | Sprint propuesto |
|---|---|---|
| TD-003 | Campo `type` en Invoice es String plano, no enum Prisma | Sprint 3 |
| TD-004 | Sistema de reservedQuantity no implementado (Bug 2.1b diferido) | Sprint 2 |
| TD-005 | CREDIT_NOTE no implementado | Sprint 6+ |
| TD-006 | Role cast duplicado en invoicing.ts (create y authorizeBackorder) | Sprint 4 (SEG-3) |
| TD-007 | Formato inconsistente en schema.prisma | Sprint 5 |
| TD-008 | convertQuoteToInvoice no calcula dueDate automáticamente | Sprint 3 |

---

## Tests agregados

**Archivo:** `src/__tests__/integration/invoicing-bug-2-1.test.ts`

| Sección | Tests | Área cubierta |
|---|---|---|
| A (create INVOICE) | 5 | Stock decrement, PENDING_AUTHORIZATION, MANAGER override, rollback, secuencia |
| B (create QUOTE) | 2 | locationId=NULL, prefijo COT- |
| C (create CREDIT_NOTE) | 1 | METHOD_NOT_SUPPORTED + TD-005 |
| D (authorizeBackorder) | 3 | MANAGER autoriza, VENDOR rechazado, estado inválido |
| E (convertQuoteToInvoice) | 3 | Conversión exitosa, producto ausente, QUOTE CONVERTED |
| F (void + Regla 3) | 1 | QUOTE revierte a ISSUED al anular única INVOICE derivada |
| G (addPayment guard) | 1 | Pago a QUOTE rechazado |
| H (concurrencia) | 1 | TOCTOU prevention bajo carga concurrente real |
| **Total** | **17** | |

---

## Métricas

| Métrica | Valor |
|---|---|
| Rondas de revisión | 7 |
| Tests agregados | 17 |
| Tests acumulados del proyecto | 57 |
| Archivos de producción modificados | 5 |
| Archivos nuevos | 3 |
| Migraciones aplicadas | 2 |
| Decisiones arquitectónicas registradas | 1 (ADR-002) |
| Deuda técnica documentada | 6 entradas (TD-003 a TD-008) |

---

## Comportamiento garantizado post-cierre

1. Crear factura INVOICE descuenta stock atómicamente o falla limpiamente (rollback completo incluyendo secuencia)
2. Crear factura como VENDOR con stock insuficiente queda en PENDING_AUTHORIZATION — stock no se toca
3. MANAGER/ADMIN puede crear con override de stock (stock puede quedar negativo — decisión explícita registrada en audit)
4. MANAGER/ADMIN puede autorizar backorder existente via `authorizeBackorder`
5. Cotizaciones (QUOTE) nunca descuentan stock; invoice_items.locationId queda NULL en DB
6. Convertir QUOTE a INVOICE re-valida stock al momento de conversión y respeta lógica de rol
7. Anular INVOICE derivada de QUOTE puede revertir el QUOTE de CONVERTED a ISSUED (Regla 3 — ADR-002)
8. Ninguna race condition produce conversión doble (TOCTOU prevention: SELECT FOR UPDATE + re-check bajo lock)
9. CREDIT_NOTE rechazado con error claro referenciando TD-005

---

## Garantías NO cubiertas (siguientes bugs del sprint)

| Garantía faltante | Bug |
|---|---|
| Stock NO se restaura al anular factura | Bug 2.2 |
| currentBalance del cliente no se actualiza | Bugs 2.3 + 2.4 |
| addPayment no valida tope completo de balance | Bug 2.3 (parcial) |
| lineTotal puede divergir del subtotal | Bug 2.6 |
| Precios sin validación de margen mínimo | Bug 2.7 |
