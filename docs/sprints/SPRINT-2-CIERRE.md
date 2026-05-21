# Sprint 2 — Cierre Formal

**Período:** 2026-05-20 a 2026-05-21
**Sprint:** 2 — Integridad Financiera
**Estado:** COMPLETO

## Bugs resueltos

| Bug | Estado | Tests | Rondas |
|---|---|---|---|
| 2.1 — Factura descuenta inventario | ✅ | 17 | 7 |
| 2.2 — Anulación revierte inventario | ✅ | 5 | 1 |
| 2.3 — Pago no excede balance | ✅ | 8 (con 2.4) | 3 |
| 2.4 — currentBalance del cliente | ✅ | 7 (con 2.3) | (junto con 2.3) |
| 2.5 — Anulación con auditoría atómica | ✅ | (cubierto en 2.1) | 0 (de paso) |
| 2.6 — lineTotal consistente con subtotal | ✅ | 3 | 1 |
| 2.7 — Validación precio mínimo | ✅ | 5 | 1 |

## Métricas del Sprint

| Métrica | Valor |
|---|---|
| Bugs cerrados | 7 |
| Tests agregados en Sprint 2 | 52 (de 33 a 85) |
| Total acumulado del proyecto | 85 tests, 10 archivos |
| Migraciones aplicadas | 2 |
| ADRs creados | ADR-002, ADR-003 |
| Deuda técnica nueva documentada | TD-003 a TD-008 (6 entradas) |
| Reportes individuales generados | 6 |

## Migraciones aplicadas

1. `add_pending_authorization_and_converted_to_invoice_status` — extensión del enum InvoiceStatus
2. `add_locationid_to_items_and_quote_invoice_relation` — relación 1:N + FK + índices parciales

## ADRs creados

- **ADR-002:** Máquina de estados de Invoice + reglas QuoteToInvoice 1:N
- **ADR-003:** Estrategia de aislamiento de tests (fileParallelism: false)

## Comportamiento garantizado post-Sprint 2

1. **Atomicidad transaccional:** todas las operaciones que tocan dinero o inventario son transacciones con lock pesimista. Imposible estado inconsistente.

2. **Numeración secuencial:** sin duplicados ni gaps bajo concurrencia (Sprint 1).

3. **Aritmética financiera:** Decimal en todos los cálculos. Sin drift de IEEE-754 (Bug 1.5 + Bug 2.6).

4. **Inventario y facturación conectados:**
   - Factura crea movimientos OUT + decrementa stock
   - Anulación crea movimientos RETURN + restaura stock
   - currentBalance del cliente se actualiza en create/payment/void

5. **Autorización por rol:**
   - VENDOR no puede vender bajo costo
   - MANAGER puede vender bajo costo con discountReason auditado
   - VENDOR sin stock → PENDING_AUTHORIZATION
   - MANAGER+ con stock insuficiente → ISSUED con override auditado

6. **Cotizaciones:**
   - QUOTE no descuenta stock
   - Conversión a INVOICE valida stock y precios al momento (no al momento de cotización)
   - QUOTE bajo costo también requiere autorización (Opción A)
   - Relación 1:N permite re-emisión si la INVOICE derivada se anula

7. **Auditoría completa:**
   - Log inmutable de todos los movimientos
   - Razones de override registradas (managerStockOverride, belowCostSale)
   - previousBalance/newBalance en pagos

## Garantías NO cubiertas (Sprint 3+)

- Dashboard con datos reales (Bug del Sprint 3)
- Sistema de reservedQuantity para DRAFT invoices (TD-004, Bug 2.1b)
- Notas de crédito (TD-005)
- Roles granulares en middleware tRPC (TD-006, SEG-1)
- 2FA implementación TOTP (SEG-8)
- Formato consistente schema.prisma (TD-007)
- dueDate automático en conversión (TD-008)

## Próximo paso

Sprint 3 — Dashboard y experiencia real (conectar UI a datos reales, optimizar queries, índices PostgreSQL).
