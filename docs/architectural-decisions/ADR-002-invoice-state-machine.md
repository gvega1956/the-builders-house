# ADR-002 — Máquina de estados de Invoice

**Fecha:** 2026-05-20
**Sprint:** 2 (Integridad Financiera)
**Bug:** AUDIT-BUG-21 (Bug 2.1)
**Estado:** Aceptado

---

## Contexto

Con la adición de `PENDING_AUTHORIZATION` y `CONVERTED` al enum `InvoiceStatus`,
el modelo `Invoice` ahora puede representar tanto facturas reales (type=`INVOICE`)
como cotizaciones (type=`QUOTE`) y eventualmente notas de crédito (type=`CREDIT_NOTE`).
Las transiciones válidas no son evidentes del enum solo — este documento es la
fuente de verdad.

---

## Transiciones válidas por status

```
DRAFT               → ISSUED, VOIDED
ISSUED              → PARTIAL, PAID, VOIDED
PARTIAL             → PAID, VOIDED
PAID                → (terminal — no hay transición saliente)
VOIDED              → (terminal — no hay transición saliente)
PENDING_AUTHORIZATION → ISSUED (via authorizeBackorder), VOIDED
CONVERTED           → (terminal — solo aplica a type=QUOTE)
```

### Diagrama de flujo

```
                   ┌─────────┐
                   │  DRAFT  │
                   └────┬────┘
                        │ create (INVOICE, VENDOR+stock OK / MANAGER)
              ┌─────────┴──────────┐
              │                    │
              ▼                    ▼
       ┌────────────┐    ┌───────────────────────┐
       │   ISSUED   │    │  PENDING_AUTHORIZATION │
       └─────┬──────┘    └──────────┬────────────┘
             │                      │ authorizeBackorder (MANAGER)
             │           ┌──────────┘
             │           │
             ◄───────────┘
             │
      addPayment (parcial)
             │
             ▼
       ┌─────────┐
       │ PARTIAL │
       └────┬────┘
            │ addPayment (completa)
            ▼
        ┌──────┐
        │ PAID │  (terminal)
        └──────┘

  Desde ISSUED, PARTIAL, PENDING_AUTHORIZATION:
        ┌────────┐
        │ VOIDED │  (terminal)
        └────────┘

  Solo type=QUOTE:
  ISSUED ──convertQuoteToInvoice──► CONVERTED  (terminal)
```

---

## Restricciones por type

| Status                 | type=INVOICE | type=QUOTE | type=CREDIT_NOTE |
|------------------------|:------------:|:----------:|:----------------:|
| DRAFT                  | ✓            | ✓          | ✓                |
| ISSUED                 | ✓            | ✓ (*)      | ✓                |
| PARTIAL                | ✓            | ✗          | ✓                |
| PAID                   | ✓            | ✗          | ✓                |
| VOIDED                 | ✓            | ✓          | ✓                |
| PENDING_AUTHORIZATION  | ✓            | ✗          | ✗                |
| CONVERTED              | ✗            | ✓          | ✗                |

(*) Una QUOTE con status=ISSUED está en espera de aceptación por el cliente.
    No puede recibir pagos — use `addPayment` solo con type=INVOICE.

---

## Reglas de negocio asociadas a cada transición

### DRAFT → ISSUED
Ocurre cuando un VENDOR crea una factura con stock suficiente, o cuando
un MANAGER/ADMIN crea cualquier factura (con o sin stock).

### DRAFT → PENDING_AUTHORIZATION
Ocurre cuando un VENDOR crea una factura con stock insuficiente. El stock
NO se toca. La factura espera aprobación de MANAGER.

### PENDING_AUTHORIZATION → ISSUED (`authorizeBackorder`)
Solo MANAGER o ADMIN pueden ejecutar esta transición. Crea los movimientos
OUT y decrementa `quantityOnHand` en ese momento. El stock puede quedar
negativo — es la decisión explícita del MANAGER.

### PENDING_AUTHORIZATION → VOIDED
Un MANAGER puede rechazar la factura en lugar de autorizarla. Como nunca
se tocó el stock, no hay movimientos de reversión que crear.

### ISSUED → PARTIAL (`addPayment`, pago parcial)
El `paidAmount` aumenta pero no alcanza el `total`. El balance pendiente
(`total - paidAmount`) debe ser mayor que cero. Un pago que excedería el
balance pendiente es rechazado (`BAD_REQUEST`).

### ISSUED / PARTIAL → PAID (`addPayment`, pago completo)
El `paidAmount` iguala o supera el `total`. Status cambia a PAID.
Una vez PAID, la factura es terminal — no puede anularse.

### ISSUED / PARTIAL / PENDING_AUTHORIZATION → VOIDED (`void`)
El endpoint requiere un `reason` de mínimo 1 carácter. La razón se
prepende al campo `notes` de la factura. Las facturas PAID y CONVERTED
no pueden anularse.

### ISSUED (QUOTE) → CONVERTED (`convertQuoteToInvoice`)
La cotización original queda marcada como CONVERTED (terminal). Se crea
una nueva factura con type=INVOICE. El vínculo se preserva en
`Invoice.sourceQuoteId` de la nueva factura.

La relación QUOTE → INVOICE es **1:N** (una cotización puede generar múltiples
INVOICEs en su historia). Ver "Reglas de la relación QuoteToInvoice" a continuación.

---

## Reglas de la relación QuoteToInvoice (1:N)

La relación entre QUOTE e INVOICE derivadas es deliberadamente 1:N, no 1:1.
Esto soporta el ciclo de re-emisión: si la única INVOICE activa derivada de
un QUOTE se anula, el QUOTE vuelve a estar disponible para conversión.

### Regla 1 — Un QUOTE puede tener múltiples INVOICEs derivadas en su historia

`Invoice.sourceQuoteId` apunta al QUOTE origen. Un mismo QUOTE puede aparecer
como `sourceQuoteId` en varias INVOICEs (una activa, las demás VOIDED).
Esto es normal y esperado en el ciclo de re-emisión.

### Regla 2 — Cuándo se marca el QUOTE como CONVERTED

Un QUOTE pasa a `CONVERTED` en el momento en que `convertQuoteToInvoice` crea
una INVOICE derivada con cualquier status que no sea `VOIDED`.

Estados que cuentan como "activa derivada" (mantienen el QUOTE en CONVERTED):
- `ISSUED`
- `PARTIAL`
- `PAID`
- `PENDING_AUTHORIZATION` — cuenta porque el QUOTE ya se "consumió" comercialmente,
  aunque el stock aún no se descontó. Si el MANAGER rechaza el backorder (PENDING →
  VOIDED), Regla 3 puede devolver el QUOTE a ISSUED si no quedan otras activas.

Estados que NO cuentan como activa derivada (Regla 3 puede devolver el QUOTE a ISSUED):
- `VOIDED`

### Regla 3 — Si se anula la única INVOICE activa derivada, el QUOTE vuelve a ISSUED

El endpoint `void`, cuando anula una INVOICE que tiene `sourceQuoteId != null`,
debe ejecutar en la misma transacción:
1. Verificar si el QUOTE tiene otras INVOICEs derivadas con `status NOT IN ('VOIDED')`
2. Si NO existen otras activas → cambiar el QUOTE de `CONVERTED` a `ISSUED`
3. Si SÍ existen otras activas → no tocar el QUOTE (sigue CONVERTED)

Esto garantiza que un QUOTE cancelado pueda re-convertirse sin inconsistencias.

### Regla 4 — `convertQuoteToInvoice` rechaza si ya existe una INVOICE activa derivada

Antes de crear la nueva INVOICE, el endpoint verifica:
```
EXISTS (SELECT 1 FROM invoices
        WHERE sourceQuoteId = $quoteId
        AND status NOT IN ('VOIDED'))
```
Si la condición es verdadera, error claro:
`"Esta cotización ya fue convertida a la factura FAC-XXXXX. Anule esa factura primero si desea re-emitir."`

Esto previene el bug donde un usuario convierte la misma cotización dos veces
accidentalmente, resultando en stock descontado dos veces.

---

## Endpoints que realizan transiciones

| Endpoint                        | Transición realizada                         |
|---------------------------------|----------------------------------------------|
| `invoicing.create` (INVOICE)    | → ISSUED o → PENDING_AUTHORIZATION           |
| `invoicing.create` (QUOTE)      | → ISSUED (status de cotización activa)       |
| `invoicing.addPayment`          | ISSUED → PARTIAL, ISSUED/PARTIAL → PAID      |
| `invoicing.void`                | → VOIDED                                     |
| `invoicing.authorizeBackorder`  | PENDING_AUTHORIZATION → ISSUED               |
| `invoicing.convertQuoteToInvoice` | QUOTE ISSUED → CONVERTED + nueva ISSUED    |

---

## Decisiones de diseño

**Por qué QUOTE usa status=ISSUED y no un status dedicado:**
Simplifica el enum. Una cotización "activa" (en espera de aceptación) es
funcionalmente equivalente a "emitida". El campo `type` distingue si es
cotización o factura, no el status. El guard en `addPayment` previene que
una QUOTE reciba pagos accidentalmente.

**Por qué la relación QUOTE→INVOICE es 1:N y no 1:1:**
Con 1:1, una INVOICE anulada bloquearía permanentemente al QUOTE — el cliente
no podría re-emitir. Con 1:N, la anulación de la única INVOICE activa restaura
el QUOTE a ISSUED. La invariante "un QUOTE no puede estar activo si ya tiene
una INVOICE no-anulada" la mantiene el endpoint `convertQuoteToInvoice` con
una verificación de existencia antes de crear (Regla 4 arriba).

**Por qué CONVERTED no siempre es terminal para el QUOTE:**
Es terminal solo mientras la INVOICE derivada esté activa. Si la INVOICE se
anula, el QUOTE vuelve a ISSUED (Regla 3). El estado CONVERTED es mejor leído
como "tiene una conversión activa en este momento", no como "nunca más puede
convertirse".

**Por qué PENDING_AUTHORIZATION no toca stock:**
El principio de menor privilegio: el sistema no debe comprometer inventario
hasta tener autorización explícita. Un VENDOR con acceso limitado no debe
poder crear hechos consumados que luego el MANAGER no pueda revertir sin
afectar contabilidad.
