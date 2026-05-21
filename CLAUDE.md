# CLAUDE.md — The Builder's House ERP

Leído automáticamente por Claude Code al iniciar. Contiene todo el contexto del proyecto.

---

## PROYECTO

**Nombre:** The Builder's House — Sistema ERP
**Cliente:** Empresa de venta de ventanas y puertas al detalle y al por mayor
**Ubicación:** Puerto Rico (con importación desde República Dominicana)
**Tamaño:** 4-10 usuarios concurrentes
**Estado anterior:** Operación manejada en Excel y papel

---

## STACK TECNOLÓGICO (decidido — no cambiar sin discusión)

- **Framework:** Next.js 16 con App Router
- **Lenguaje:** TypeScript estricto
- **UI:** Tailwind CSS 4 + shadcn/ui
- **API:** tRPC para type-safety end-to-end
- **ORM:** Prisma
- **Base de datos:** PostgreSQL 16 (Managed en DigitalOcean)
- **Auth:** Auth.js (NextAuth v5) con 2FA opcional
- **Validación:** Zod (compartido entre frontend y backend)
- **Estado servidor:** TanStack Query v5
- **Estado cliente:** Zustand (solo UI state, no data)
- **Gráficos:** Recharts
- **Forms:** React Hook Form + Zod
- **Escaneo:** html5-qrcode (PWA, sin app nativa)
- **Storage:** DigitalOcean Spaces (S3-compatible)
- **Background jobs:** Inngest
- **Deploy:** DigitalOcean App Platform (auto-deploy desde GitHub main)

### Rechazado explícitamente (no implementar)
- NestJS (overkill para 10 usuarios)
- Redis (no se justifica la carga)
- WebSockets (polling 15s es suficiente)
- Kubernetes (App Platform lo maneja)
- Microservicios (monolito modular)
- App móvil nativa (PWA es suficiente)
- Multi-tenant (una sola empresa)

---

## IDENTIDAD DE MARCA

**Nombre completo:** THE BUILDER'S HOUSE · Puerto Rico
**Logo:** Puerta sólida naranja + ventana de 4 paneles (forma silueta de "B")
**Tipografía:** Geist (display + body), Geist Mono (SKUs y códigos)

### Paleta de colores (tokens — usar SIEMPRE estos)

```ts
// src/lib/brand.ts
export const brand = {
  navy: {
    950: '#0A1628',  // Sidebar, headers, principal
    900: '#0F1F3A',  // Backgrounds oscuros
    800: '#1A2D4F',  // Cards oscuros
    700: '#2A3F66',  // Hover states oscuros
    600: '#3D5580',  // Borders oscuros
  },
  orange: {
    600: '#D9531E',  // Hover de CTAs
    500: '#EC6326',  // CTA principal, marca
    400: '#F47C44',  // Estados activos
    100: '#FDE4D4',  // Backgrounds suaves
    50:  '#FEF3EC',  // Highlights muy suaves
  },
  semantic: {
    success: '#059669',
    warning: '#D97706',
    danger:  '#DC2626',
    info:    '#0284C7',
  },
}
```

### Reglas de uso
- Sidebar SIEMPRE navy-950 (`#0A1628`)
- CTAs principales SIEMPRE orange-500 (`#EC6326`)
- Texto principal SIEMPRE slate-900
- Borders SIEMPRE slate-200 (claro) o navy-800 (oscuro)
- NO usar morados, cyans pastel, ni gradientes decorativos
- NO usar emojis en UI
- NO usar glassmorphism excepto en modales/drawers

---

## PRINCIPIOS DE ARQUITECTURA (no negociables)

**P1 — Inmutabilidad de auditoría.** `inventory_movements` y `audit_log` son append-only. Nunca UPDATE ni DELETE en aplicación.

**P2 — Single source of truth.** PostgreSQL es la verdad. Frontend no calcula valores que el backend ya conoce.

**P3 — Optimistic UI, pessimistic backend.** UI responde rápido, backend valida todo. Si validación falla, UI revierte.

**P4 — Mobile-first para operación** (escaneo, warehouse), **desktop-first para administración** (dashboard, reportes).

**P5 — Costo predecible.** Si duplicamos usuarios, el costo NO debe triplicarse.

---

## ESTRUCTURA DE CARPETAS

```
the-builders-house/
├── CLAUDE.md
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
└── src/
    ├── app/
    │   ├── (auth)/login/
    │   ├── (app)/
    │   │   ├── dashboard/
    │   │   ├── inventory/
    │   │   ├── scan/
    │   │   ├── warehouse/
    │   │   ├── invoicing/
    │   │   ├── customers/
    │   │   ├── purchases/
    │   │   ├── reports/
    │   │   ├── audit/
    │   │   └── settings/
    │   └── api/trpc/[trpc]/
    ├── components/
    │   ├── brand/      ← Logo, tokens
    │   ├── ui/         ← shadcn/ui components
    │   └── shared/     ← KPICard, NavItem, etc.
    ├── server/
    │   ├── db.ts       ← Prisma client singleton
    │   ├── auth.ts     ← Auth.js config
    │   └── trpc/
    │       ├── index.ts
    │       ├── context.ts
    │       └── routers/
    └── lib/
        ├── brand.ts    ← Color tokens
        ├── utils.ts    ← cn() helper
        └── validators/ ← Zod schemas
```

---

## MODELO DE DATOS (ver prisma/schema.prisma para el completo)

Tablas clave:
- `users` — autenticación + roles
- `products` — catálogo con SKU único, barcode, QR
- `product_locations` — stock por warehouse + ubicación
- `inventory_movements` — **APPEND-ONLY**, firma anti-robo
- `customers` — RETAIL | WHOLESALE con precios diferenciados
- `invoices` + `invoice_items` + `payments` — ciclo de venta
- `purchase_orders` — importación RD → PR
- `cycle_counts` — conteo cíclico anti-robo
- `audit_log` — **APPEND-ONLY**, todas las acciones sensibles

---

## TAXONOMÍA DE MOVIMIENTOS DE INVENTARIO

Esta tabla es la fuente de verdad para el campo `movementType` en `inventory_movements`. Toda lógica de negocio, validación Zod, y UI debe respetar esta convención sin excepción.

| Tipo | Significado | Signo de `quantity` | Origen del evento |
|------|-------------|---------------------|-------------------|
| `IN` | Entrada por compra / recepción de PO | **Positivo** (`> 0`) | Llegada de mercancía nueva |
| `OUT` | Salida por venta | **Negativo** (`< 0`) | Factura emitida |
| `RETURN` | Devolución de cliente | **Positivo** (`> 0`) | Cliente devuelve producto vendido |
| `DAMAGE` | Producto dañado / descartado | **Negativo** (`< 0`) | Inspección detecta daño |
| `TRANSFER` | Movimiento entre ubicaciones | Cualquiera | Reubicación interna |
| `ADJUSTMENT` | Corrección por conteo cíclico | Cualquiera | Conteo físico ≠ sistema |

### Regla crítica — TRANSFER es siempre dos movimientos atómicos

Un `TRANSFER` nunca es un solo movimiento. Es **dos movimientos dentro de la misma transacción** con el mismo `referenceId` que los vincula:

1. Movimiento `OUT` (cantidad negativa) en la ubicación **origen**
2. Movimiento `IN` (cantidad positiva) en la ubicación **destino**

Ambos se crean en `$transaction`. Si uno falla, el otro hace rollback. Un `TRANSFER` suelto sin su espejo es un bug, no un estado válido.

### Validación de signos (enforced en Zod)

```ts
// Reglas de validación de signo por tipo de movimiento:
// IN, RETURN  → quantity DEBE ser > 0
// OUT, DAMAGE → quantity DEBE ser < 0
// TRANSFER, ADJUSTMENT → quantity puede ser cualquiera (≠ 0)
```

---

## SISTEMA ANTI-ROBO (6 capas — implementar todas)

1. **Identidad:** Login obligatorio, 2FA para admin/manager, sesiones 8h
2. **Foto obligatoria:** Salidas, entradas y ajustes requieren foto
3. **Doble confirmación:** SKUs sobre $500 requieren segundo usuario
4. **Detección de anomalías:** Jobs nocturnos (Inngest)
5. **Conteo cíclico aleatorio:** 3-5 SKUs diarios por warehouse
6. **Log inmutable visible:** Auditoría sin filtros ocultos, exportable CSV

---

## REGLAS DE CÓDIGO

1. **TypeScript estricto.** `any` prohibido salvo comentario de justificación.
2. **Zod schemas** son la verdad. Tipos derivan de ellos con `z.infer<>`.
3. **Server Components por defecto.** `'use client'` solo para interactividad.
4. **No fetch directo en componentes.** Usa tRPC + TanStack Query.
5. **Nombres en inglés en código**, UI y comentarios en español.
6. **Commits conventional:** `feat:`, `fix:`, `refactor:`, `docs:`, etc.
7. **Sin tests, sin PR** para lógica de negocio (precios, stock, auditoría).
8. **Migraciones Prisma** siempre revisadas antes de aplicar a producción.

---

## CONSIDERACIONES PUERTO RICO

- **IVU 11.5%** (10.5% estatal + 1% municipal) configurable por municipio
- **Bilingüe:** UI en español, exports disponibles en inglés
- **Importación RD:** compras en DOP, ventas en USD, conversión automática
- **SURI:** integración futura (fase 5)

---

## ROADMAP

### Fase 1 — Fundación (semanas 1-6) ← AQUÍ ESTAMOS
- [x] Decisiones de arquitectura y branding
- [x] Setup Next.js + Tailwind + estructura
- [x] Schema Prisma completo
- [ ] Setup tRPC + Auth.js + Prisma client
- [ ] CRUD productos + ubicaciones
- [ ] Movimientos manuales con foto
- [ ] Escaneo móvil PWA
- [ ] Conteo cíclico + auditoría

### Fase 2 — Comercial (semanas 7-10)
### Fase 3 — Importación (semanas 11-13)
### Fase 4 — Inteligencia (semanas 14-16)

---

## REGLAS DE PROCESO ADQUIRIDAS DURANTE DESARROLLO

Reglas aprendidas de incidentes reales durante el desarrollo. Son no-negociables.

### RP-001 — Working tree limpio es condición de cierre

**Regla:** Al cerrar cualquier bug o sprint, el primer check es siempre `git status`.
Si el output no es `nothing to commit, working tree clean`, el cierre es **inválido**.

**Razón:** Descubierto en la pausa estructural post-Sprint 2. El Sprint 2 fue declarado
cerrado con 7 bugs y 85 tests, pero el working tree tenía 3,300+ líneas de código
sin versionar (UI scaffolding, 2 routers backend, 1 reporte faltante). Código sin
commit es código que se puede perder. Un sprint "cerrado" con uncommitted work no
está cerrado.

**Cómo aplicar:** Antes de escribir cualquier mensaje de cierre o reporte final,
ejecutar `git status` y confirmar output limpio. Si hay archivos sin commit,
clasificarlos primero (¿pertenecen al bug? ¿son scaffolding? ¿son huérfanos?)
y committearlos con mensaje apropiado antes de cerrar.

### RP-002 — Revisión de seguridad obligatoria antes de committear código de autenticación

**Regla:** Cualquier código que toque passwords, roles, o creación de usuarios
requiere revisión explícita de los siguientes puntos antes de commit:
1. ¿El endpoint está protegido por el procedimiento correcto (`adminProcedure`)?
2. ¿Se crea un `auditLog` para la operación?
3. ¿El query de respuesta excluye `passwordHash`?
4. ¿Hay protección contra el estado "sin administradores"?

**Razón:** Descubierto al revisar `settings.ts` antes de committear. El código
estaba funcionalmente correcto pero le faltaban `auditLog.create` en `createUser`
y `updateUser` — violando el Principio P1 (inmutabilidad de auditoría). Los bugs
de seguridad no se descubren en tests porque los tests no piensan en adversarios.

**Cómo aplicar:** El checklist de 4 puntos se verifica manualmente antes de
cada commit que toque `src/server/trpc/routers/settings.ts` o cualquier otro
router que maneje usuarios y autenticación.
