# Bug 2.2 — Cierre formal

**Audit reference:** AUDIT-BUG-22
**Sprint:** 2 — Integridad Financiera
**Estado:** CERRADO
**Fecha de cierre:** 2026-05-20

---

## Problema resuelto

Al anular una INVOICE con status ISSUED o PARTIAL, el sistema no creaba
movimientos RETURN ni restauraba `quantityOnHand`. El inventario quedaba
decrementado permanentemente aunque la venta se hubiera revertido.

---

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `src/server/trpc/routers/invoicing.ts` | `void`: añade `include: { items: true }` al findUnique; lógica de RETURN movements + stock increment dentro de la transacción existente; manejo de orphan items (locationId=NULL) |

## Archivos nuevos

| Archivo | Descripción |
|---|---|
| `src/__tests__/integration/invoicing-bug-2-2.test.ts` | 5 tests de integración |
| `docs/sprints/SPRINT-2-BUG-2.2-REPORT.md` | Este archivo |

---

## Tests agregados

| Test | Área cubierta |
|---|---|
| T1: anular INVOICE ISSUED restaura stock con movimiento RETURN de cantidad positiva | Flujo principal + signo correcto |
| T2: anular INVOICE PARTIAL restaura el stock completo | Pagos parciales no afectan la reversión de inventario |
| T3: anular INVOICE PENDING_AUTHORIZATION NO crea RETURN | Estado que nunca tuvo OUT movements |
| T4: anular INVOICE con item locationId=NULL — void exitoso, stock no restaurado, audit con excepción | Orphan items (ON DELETE SET NULL) |
| T5: anular INVOICE PAID → BAD_REQUEST | Regla pre-existente sin cambios |

---

## Métricas

| Métrica | Valor |
|---|---|
| Rondas de revisión | 1 |
| Tests agregados | 5 |
| Tests acumulados del proyecto | 62 |
| Archivos de producción modificados | 1 |
| Archivos nuevos | 2 |
| Migraciones | 0 |

---

## Comportamiento garantizado post-cierre

1. Anular INVOICE ISSUED o PARTIAL crea un movimiento RETURN (cantidad positiva) por cada ítem y restaura `quantityOnHand` en la misma transacción
2. Anular INVOICE PENDING_AUTHORIZATION no crea movimientos — no había stock comprometido
3. Si un ítem tiene `locationId=NULL` (ubicación eliminada), la factura se anula igualmente y el audit log registra `stockNotRestoredItems` con los ítems afectados
4. Toda la operación (void + RETURN + stock + Regla 3 + audit) es atómica

## Garantías NO cubiertas

- `currentBalance` del cliente no se actualiza al pagar ni al anular (Bug 2.3 + 2.4)
