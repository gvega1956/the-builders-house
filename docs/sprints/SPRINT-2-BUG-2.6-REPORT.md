# Bug 2.6 — Cierre formal

**Audit reference:** AUDIT-BUG-26
**Sprint:** 2 — Integridad Financiera
**Estado:** CERRADO (pendiente aprobación formal)
**Fecha de cierre:** 2026-05-21

---

## Hallazgo pre-implementación (requerido por scope)

Antes de codear, el usuario pidió verificar si `invoiceItemSchema` incluía `lineTotal`
como campo de input.

**Resultado:** NO lo incluye. El schema actual (líneas 11-17 de `invoicing.ts`):

```typescript
const invoiceItemSchema = z.object({
  productId: z.string().cuid(),
  locationId: z.string().cuid().optional(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().positive(),
  discountPercent: z.number().min(0).max(100).default(0),
});
```

Zod strips unknown keys por defecto: si el frontend envía `lineTotal: 999` en el objeto
de un item, ese campo es silenciosamente descartado antes de que la mutation reciba el input.
El backend nunca ve el valor del frontend.

**Consecuencia:** El bug es trivial por arquitectura. El trabajo real es:
1. Documentar la invariante con un comentario y aserción defensiva en `calcInvoiceTotals`
2. Escribir 3 tests de integración que la verifiquen contra la DB real

---

## Problema resuelto

`calcInvoiceTotals` calculaba correctamente `lineTotal` y `subtotal` desde Bug 1.5, pero
sin documentación explícita de la invariante `subtotal == sum(lineTotal)` ni aserción
defensiva que la protegiera de futuros refactors (p.ej. descuentos a nivel de orden que
cambien cómo se calcula `subtotal` independientemente de los `lineTotals`).

---

## EVIDENCIA 1 — Output literal de los tests del Bug 2.6

```
$ npx vitest run --reporter=verbose src/__tests__/integration/invoicing-bug-2-6.test.ts

RUN  v4.1.7 D:/proyectos/the-builders-house

 ✓ src/__tests__/integration/invoicing-bug-2-6.test.ts > Bug 2.6 — lineTotal consistente con subtotal > T1: lineTotal en DB es calculado por el backend — el schema no acepta lineTotal del frontend 178ms
 ✓ src/__tests__/integration/invoicing-bug-2-6.test.ts > Bug 2.6 — lineTotal consistente con subtotal > T2: sum(item.lineTotal) almacenado en DB == invoice.subtotal, exacto al centavo — 5 ítems distintos 51ms
 ✓ src/__tests__/integration/invoicing-bug-2-6.test.ts > Bug 2.6 — lineTotal consistente con subtotal > T3: discount=33.33% en 3 ítems — sum(lineTotal) == subtotal sin errores de redondeo Decimal 54ms

 Test Files  1 passed (1)
      Tests  3 passed (3)
   Start at  00:21:26
   Duration  8.39s (transform 609ms, setup 0ms, import 2.15s, tests 1.45s, environment 0ms)
```

---

## EVIDENCIA 2 — Output del suite completo (80/80)

```
$ npx vitest run

 RUN  v4.1.7 D:/proyectos/the-builders-house


 Test Files  9 passed (9)
      Tests  80 passed (80)
   Start at  00:21:44
   Duration  14.02s (transform 844ms, setup 0ms, import 3.69s, tests 5.30s, environment 2ms)
```

Acumulado del proyecto: 80 tests en 9 archivos. Sin regresiones.

---

## EVIDENCIA 3 — Lista de los 3 it() descriptions

```
describe('Bug 2.6 — lineTotal consistente con subtotal', () => {
  it('T1: lineTotal en DB es calculado por el backend — el schema no acepta lineTotal del frontend')
  it('T2: sum(item.lineTotal) almacenado en DB == invoice.subtotal, exacto al centavo — 5 ítems distintos')
  it('T3: discount=33.33% en 3 ítems — sum(lineTotal) == subtotal sin errores de redondeo Decimal')
});
```

---

## EVIDENCIA 4 — Código: calcInvoiceTotals antes y después

### ANTES (commit 8067492 — Bug 2.2)

```typescript
// Extracted to avoid repeating Decimal arithmetic between QUOTE and INVOICE paths.
// Returns itemsData WITHOUT locationId — this is the explicit strip for QUOTE items,
// which must always have locationId=NULL in the DB.
// The INVOICE path maps itemsData → invoiceItemsData adding locationId back (see below).
function calcInvoiceTotals(items: z.infer<typeof invoiceItemSchema>[], taxRate: number) {
  const itemsData = items.map((item) => {
    const discountFactor = toDecimal(1).sub(toDecimal(item.discountPercent).div(100));
    return {
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: toDecimal(item.unitPrice),
      discountPercent: toDecimal(item.discountPercent),
      lineTotal: toDecimal(item.unitPrice).mul(item.quantity).mul(discountFactor),
      // locationId explicitly excluded: guarantees QUOTE items get locationId=NULL.
    };
  });

  const subtotal = itemsData.reduce((sum, i) => sum.add(i.lineTotal), toDecimal(0));
  const taxRateDecimal = toDecimal(taxRate);
  const taxAmount = subtotal.mul(taxRateDecimal);
  const total = subtotal.add(taxAmount);

  return { itemsData, subtotal, taxRateDecimal, taxAmount, total };
}
```

### DESPUÉS (commit 2f2cd20 — Bug 2.6)

```typescript
// Extracted to avoid repeating Decimal arithmetic between QUOTE and INVOICE paths.
// Returns itemsData WITHOUT locationId — this is the explicit strip for QUOTE items,
// which must always have locationId=NULL in the DB.
// The INVOICE path maps itemsData → invoiceItemsData adding locationId back (see below).
//
// Bug 2.6 — lineTotal invariant:
//   invoiceItemSchema has no lineTotal field: Zod strips any lineTotal the frontend sends.
//   Every lineTotal is computed here from unitPrice × quantity × discountFactor.
//   subtotal is the exact Decimal sum of all lineTotals — never independently recomputed.
//   The assertion below guards against future refactors that compute subtotal via a
//   different code path (e.g., order-level discounts), which would silently break the
//   per-item lineTotal ↔ subtotal invariant.
function calcInvoiceTotals(items: z.infer<typeof invoiceItemSchema>[], taxRate: number) {
  const itemsData = items.map((item) => {
    const discountFactor = toDecimal(1).sub(toDecimal(item.discountPercent).div(100));
    return {
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: toDecimal(item.unitPrice),
      discountPercent: toDecimal(item.discountPercent),
      lineTotal: toDecimal(item.unitPrice).mul(item.quantity).mul(discountFactor),
      // locationId explicitly excluded: guarantees QUOTE items get locationId=NULL.
    };
  });

  const subtotal = itemsData.reduce((sum, i) => sum.add(i.lineTotal), toDecimal(0));

  // Bug 2.6: sanity — subtotal must equal sum(lineTotal).
  // Currently tautological (subtotal IS that sum); fires only if this function is
  // refactored to compute subtotal via a separate path while lineTotals stay unchanged.
  const lineTotalSum = itemsData.reduce((s, i) => s.add(i.lineTotal), toDecimal(0));
  if (!lineTotalSum.eq(subtotal)) {
    console.error(
      `[BUG-2.6] lineTotal sum (${lineTotalSum.toString()}) ≠ subtotal (${subtotal.toString()}) — calculation inconsistency detected`,
    );
  }

  const taxRateDecimal = toDecimal(taxRate);
  const taxAmount = subtotal.mul(taxRateDecimal);
  const total = subtotal.add(taxAmount);

  return { itemsData, subtotal, taxRateDecimal, taxAmount, total };
}
```

### Diff real (git diff)

```diff
@@ -26,6 +26,12 @@ type LocationRow = {
 // Extracted to avoid repeating Decimal arithmetic between QUOTE and INVOICE paths.
 // Returns itemsData WITHOUT locationId — this is the explicit strip for QUOTE items,
 // which must always have locationId=NULL in the DB.
 // The INVOICE path maps itemsData → invoiceItemsData adding locationId back (see below).
+//
+// Bug 2.6 — lineTotal invariant:
+//   invoiceItemSchema has no lineTotal field: Zod strips any lineTotal the frontend sends.
+//   Every lineTotal is computed here from unitPrice × quantity × discountFactor.
+//   subtotal is the exact Decimal sum of all lineTotals — never independently recomputed.
+//   The assertion below guards against future refactors that compute subtotal via a
+//   different code path (e.g., order-level discounts), which would silently break the
+//   per-item lineTotal ↔ subtotal invariant.
 function calcInvoiceTotals(...) {
   ...
   const subtotal = itemsData.reduce((sum, i) => sum.add(i.lineTotal), toDecimal(0));
+
+  // Bug 2.6: sanity — subtotal must equal sum(lineTotal).
+  // Currently tautological (subtotal IS that sum); fires only if this function is
+  // refactored to compute subtotal via a separate path while lineTotals stay unchanged.
+  const lineTotalSum = itemsData.reduce((s, i) => s.add(i.lineTotal), toDecimal(0));
+  if (!lineTotalSum.eq(subtotal)) {
+    console.error(
+      `[BUG-2.6] lineTotal sum (${lineTotalSum.toString()}) ≠ subtotal (${subtotal.toString()}) — calculation inconsistency detected`,
+    );
+  }
+
   const taxRateDecimal = toDecimal(taxRate);
```

---

## EVIDENCIA 5 — Por qué la aserción es tautológica y por qué vale la pena igual

### Estado actual

`subtotal` se define exactamente como `itemsData.reduce((sum, i) => sum.add(i.lineTotal), toDecimal(0))`.
La aserción que verifica lo mismo usando `lineTotalSum` es computacionalmente idéntica.
Mientras la función no cambie, `lineTotalSum.eq(subtotal)` siempre es `true`.

### Por qué la aserción tiene valor de todos modos

La aserción es una **cláusula de invariante escrita en código ejecutable**. Su valor no
está en la rama `if (!lineTotalSum.eq(subtotal))` — que nunca se ejecuta hoy —  sino en
lo que documenta sobre el contrato de esta función y lo que protege en el futuro.

El escenario concreto que protege: un desarrollador agrega un descuento a nivel de orden
(p.ej. `-10%` a todo el pedido). Lo implementa modificando `subtotal`:

```typescript
// Hipotético refactor futuro — INCORRECTO
const orderDiscount = toDecimal(0.10);
const subtotal = itemsData.reduce(...).mul(toDecimal(1).sub(orderDiscount));
// Los lineTotals individuales NO se modificaron
// subtotal YA NO es igual a sum(lineTotal)
// La factura mostraría subtotal correcto pero líneas individuales incorrectas
```

En ese momento, `lineTotalSum.eq(subtotal)` sería `false` y el `console.error` dispararía
en cada factura creada. Sin la aserción, la divergencia pasaría silenciosamente a producción.

### Alternativa considerada y descartada: `assert(false)` con throw

Lanzar un error en lugar de loggear hubiera bloqueado la creación de facturas si
algún escenario legítimo produjera diferencias de centavo por redondeo intermedio.
`console.error` con prefijo `[BUG-2.6]` es la respuesta correcta: el backend siempre
gana (usa su subtotal), y el log permite investigar sin interrumpir operaciones.

---

## EVIDENCIA 6 — Confirmación de que invoiceItemSchema no acepta lineTotal

### El schema completo tal como existe hoy:

```typescript
const invoiceItemSchema = z.object({
  productId: z.string().cuid(),
  locationId: z.string().cuid().optional(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().positive(),
  discountPercent: z.number().min(0).max(100).default(0),
});
```

Cinco campos. `lineTotal` no está.

### Comportamiento de Zod con campos desconocidos:

`z.object()` en modo `strip` (default). Si el frontend envía:
```json
{ "productId": "...", "quantity": 1, "unitPrice": 100, "discountPercent": 0, "lineTotal": 999 }
```

Zod produce:
```typescript
{ productId: "...", quantity: 1, unitPrice: 100, discountPercent: 0 }
// lineTotal: 999 descartado silenciosamente antes de que la mutation lo vea
```

La mutation recibe el objeto ya limpio. No hay forma de que el frontend corrompa `lineTotal`.

### Para que el backend aceptara `lineTotal` del frontend se necesitaría:

```typescript
const invoiceItemSchema = z.object({
  ...
  lineTotal: z.number().positive().optional(), // ← agregarla explícitamente
});
```

Esto NO existe y no se agrega en Bug 2.6. Si en el futuro se quiere aceptar `lineTotal`
como hint del frontend (con validación de delta < $0.01), se haría en ese momento con
su propio bug y tests.

---

## EVIDENCIA 7 — T3: math de 33.33% discount con Decimal

### Código del test T3:

```typescript
it('T3: discount=33.33% en 3 ítems — sum(lineTotal) == subtotal sin errores de redondeo Decimal', async () => {
  const vendor = makeCaller(vendorId, 'VENDOR');

  const invoice = await vendor.create({
    customerId,
    type: 'INVOICE',
    items: [
      { productId, locationId, quantity: 1, unitPrice: 100, discountPercent: 33.33 },
      { productId, locationId, quantity: 1, unitPrice: 100, discountPercent: 33.33 },
      { productId, locationId, quantity: 1, unitPrice: 100, discountPercent: 33.33 },
    ],
    taxRate: 0,
  });

  const items = await db.invoiceItem.findMany({ where: { invoiceId: invoice.id } });
  expect(items).toHaveLength(3);

  // Each item: 100 × 1 × (1 - 33.33/100) = 100 × 0.6667 = 66.67
  for (const item of items) {
    expect(Number(item.lineTotal)).toBeCloseTo(66.67, 2);
  }

  const lineTotalSum = items.reduce((acc, item) => acc + Number(item.lineTotal), 0);

  // sum = 3 × 66.67 = 200.01
  expect(lineTotalSum).toBeCloseTo(200.01, 2);

  // Invariant: sum(lineTotal) == subtotal within $0.01
  expect(Math.abs(lineTotalSum - Number(invoice.subtotal))).toBeLessThan(0.01);
});
```

### Math paso a paso:

```
discountPercent = 33.33 (número JavaScript → toDecimal("33.33") = Decimal exacto)

discountFactor = toDecimal(1).sub(toDecimal(33.33).div(100))
              = Decimal(1) - Decimal(33.33) / Decimal(100)
              = Decimal(1) - Decimal(0.3333)
              = Decimal(0.6667)

lineTotal = toDecimal(100).mul(1).mul(Decimal(0.6667))
          = Decimal(66.67)

Stored in DB: @db.Decimal(12,4) → 66.6700

sum(lineTotal) = Decimal(66.67) + Decimal(66.67) + Decimal(66.67)
             = Decimal(200.01)

subtotal (en calcInvoiceTotals) = itemsData.reduce → misma suma → Decimal(200.01)

lineTotalSum.eq(subtotal) → true → console.error NO dispara
```

### Por qué 33.33% no genera drift de punto flotante:

`33.33` en JavaScript es `33.33` como número de punto flotante IEEE-754. Cuando se pasa
a `toDecimal(33.33)`, Decimal.js lo convierte al decimal más cercano: `33.33` (exacto
— `33.33` sí es representable con precisión finita en base 10). `33.33 / 100 = 0.3333`
— también exacto en base 10. `1 - 0.3333 = 0.6667` — exacto. `100 × 0.6667 = 66.67`
— exacto.

Si el descuento fuera `33.3333...%` (1/3 exacto), la historia sería diferente: la
representación decimal sería periódica y Decimal.js tendría que truncarla en algún
dígito. Ese no es el caso aquí — `33.33` es finito en base 10.

### Output literal de T3:

```
✓ Bug 2.6 — lineTotal consistente con subtotal > T3: discount=33.33% en 3 ítems — sum(lineTotal) == subtotal sin errores de redondeo Decimal 54ms
```

---

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `src/server/trpc/routers/invoicing.ts` | `calcInvoiceTotals`: añade comentario de invariante + aserción defensiva `lineTotalSum.eq(subtotal)` con `console.error` |

## Archivos nuevos

| Archivo | Descripción |
|---|---|
| `src/__tests__/integration/invoicing-bug-2-6.test.ts` | 3 tests de integración |
| `docs/sprints/SPRINT-2-BUG-2.6-REPORT.md` | Este archivo |

---

## Métricas

| Métrica | Valor |
|---|---|
| Rondas de revisión | 1 |
| Tests agregados | 3 |
| Tests acumulados del proyecto | 80 |
| Archivos de producción modificados | 1 |
| Archivos nuevos | 2 |
| Migraciones | 0 |

---

## Comportamiento garantizado post-cierre

1. El schema `invoiceItemSchema` no acepta `lineTotal` como campo de input. Cualquier `lineTotal` enviado por el frontend es descartado por Zod antes de entrar a la mutation.
2. Cada `item.lineTotal` en la DB es calculado por `calcInvoiceTotals` como `unitPrice × quantity × (1 - discountPercent/100)` en aritmética Decimal (sin punto flotante).
3. `invoice.subtotal` es la suma exacta de los `item.lineTotal` — no se calcula por ninguna ruta alternativa.
4. Si una futura refactorización rompe la invariante `subtotal == sum(lineTotal)`, `console.error([BUG-2.6] ...)` disparará en cada factura creada, visible en logs de producción.
5. `discountPercent=33.33%` produce `lineTotal=66.67` y `sum=200.01` sin drift de punto flotante.

## Garantías NO cubiertas

- Validación de margen mínimo de precio (Bug 2.7)
