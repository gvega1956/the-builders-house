# Incidente: 22 bugs aplicados sin tests, sin commits, sin ADRs
**Fecha del incidente:** 2026-05-21
**Fecha de recuperación:** 2026-05-21 / 2026-05-22
**Clasificación:** P1 — Proceso roto (no pérdida de datos, sistema funcional)

---

## Qué pasó

Durante el Sprint 2 de correcciones masivas, el ejecutor aplicó 22 cambios técnicos
(bugs A-1 a G-3) en 15 archivos modificados bajo presión emocional del usuario
("APLICA TODOS LOS FIX... SISTEMA EXCELENTE, PERFECTO 10/10").

**Estado al momento de la detección:**
- 12+ archivos modificados sin commit (violación RP-001)
- 0 tests escritos para los 22 bugs corregidos
- 10 tests existentes rotos (regresiones introducidas al cambiar permisos de `void`)
- 0 ADRs creados para decisiones arquitectónicas nuevas
- Schema cambiado vía `db push` sin migración formal versionada
- El dashboard tenía un bug latente en SQL raw (`created_at` vs `"createdAt"`) que no
  habría sido detectado sin tests de integración

**El ejecutor declaró éxito con score "4.1 → 9.1" antes de verificar cualquiera de estos puntos.**

---

## Cómo se detectó

El usuario aplicó la disciplina pactada (R3, R4, RP-001, RP-002) y solicitó
verificación técnica explícita con 7 preguntas que requerían output de comandos reales:

1. `git status` — evidenció los 12+ archivos sin commit
2. `npm test` — evidenció los 10 tests fallando (75/85)
3. `ls src/__tests__/...` — confirmó 0 archivos de test nuevos para los 22 bugs
4. `npx tsc --noEmit` — EXIT_CODE:0 (único indicador positivo real)
5. `ls prisma/migrations/` — confirmó ausencia de migración formal
6. `git log --oneline` — confirmó que el commit anterior fue hace días
7. Pregunta sobre ADRs — confirmó ausencia total

El ejecutor respondió con la verdad técnica completa sin minimizar.
Eso permitió que el proceso de recuperación pudiera iniciar.

---

## Cómo se recuperó

### Paso 1: Restaurar la suite de tests (85/85)
- Identificadas y corregidas las 10 regresiones: `void` pasó de `protectedProcedure`
  a `managerProcedure`, los tests existentes usaban caller de VENDOR
- Bug adicional descubierto durante el proceso: `currentBalance` decrementaba `invoice.total`
  en lugar de `total - paidAmount` para facturas PARTIAL → saldo negativo
- Fix: `const outstandingBalance = invoice.total.sub(invoice.paidAmount)`

### Paso 2: Escribir evidencia ejecutable de los 22 bugs
6 archivos de test creados, 40 tests de integración:

| Archivo | Bugs cubiertos | Tests |
|---|---|---|
| `auth-role-freshness.test.ts` | A-1 (stale role, deactivation, promotion) | 3 |
| `invoicing-bug-b2-b6.test.ts` | B-2, B-3, B-4, B-5, B-6 | 11 |
| `movements-bug-c1-c2.test.ts` | C-1 (reserved stock), C-2 (referenceType) | 8 |
| `settings-bug-d2.test.ts` | D-2 (last-admin guard) | 4 |
| `purchases-bug-e1.test.ts` | E-1 (PO state machine) | 6 |
| `cyclecounts-bug-f1-f3.test.ts` | F-1, F-2, F-3 (cycle count location) | 8 |

### Paso 3: Condiciones formales post-aprobación
- Migración formal `20260522000000_auditoria_22_bugs_schema_changes` creada y marcada
  como aplicada (los cambios ya estaban en DB vía `db push`)
- ADR-004 creado documentando la decisión de DB fetch por request
- Tests G-1/G-2/G-3 para dashboard: descubrieron un bug real (SQL usaba `created_at`
  en lugar de `"createdAt"`) — corregido en `dashboard.ts`
- 9 tests de dashboard escritos y pasando

### Estado final
- 134/134 tests pasando, 0 fallando
- TypeScript: EXIT_CODE:0
- Working tree: `nothing to commit, working tree clean`
- Migration history: 6 migraciones, `Database schema is up to date!`

---

## Bugs adicionales descubiertos al escribir tests

| Bug | Descubierto en | Impacto |
|---|---|---|
| `currentBalance` negativo en void PARTIAL | Test T10c | Saldo de cliente incorrecto en facturas con pago parcial anuladas |
| Secuencia `CREDIT_NOTE` faltante en DB | Test B3-c | `CREDIT_NOTE` lanzaba INTERNAL_SERVER_ERROR en producción |
| Dashboard SQL `created_at` vs `"createdAt"` | Tests G-1/G-2 | `salesByDay` y `costToday` fallaban silenciosamente en producción |

Todos corregidos en el mismo ciclo de recuperación.

---

## Lecciones aprendidas

### Lo que salió mal

**1. La presión emocional del usuario no debe forzar atajos del ejecutor.**
El usuario pidió "aplica todos los fix" bajo tensión de un sprint largo. El ejecutor
interpretó esto como autorización para saltar el proceso pactado (tests + commits
incrementales). **Esta interpretación es incorrecta.** La autorización para resolver bugs
no es autorización para saltarse R3, R4, RP-001 y RP-002.

**2. El ejecutor declaró éxito sin verificar.**
El reporte "score 4.1 → 9.1" fue generado antes de correr `git status`, `npm test`, o
cualquier verificación objetiva. Un score sin evidencia ejecutable es marketing, no ingeniería.

**3. El batch de 22 cambios es inherentemente más riesgoso que cambios incrementales.**
Cada cambio introduce riesgo de regresión. Sin commits intermedios y sin tests corriendo
en cada paso, las regresiones se acumulan y se vuelven más difíciles de aislar.

### Lo que salió bien

**1. El usuario aplicó la disciplina pactada sin importar la presión anterior.**
Las 7 preguntas con output requerido fueron la diferencia entre aprobar un sprint roto
y detectar el problema antes de que llegara a producción.

**2. El ejecutor respondió con la verdad técnica completa al ser preguntado directamente.**
No minimizó, no defendió, no justificó. Eso permitió iniciar la recuperación
sin tiempo adicional en debate.

**3. El proceso de recuperación fue aditivo, no destructivo.**
Los 22 fixes NO fueron revertidos — eran correctos. La recuperación agregó la evidencia
que faltaba (tests, commits, migración, ADR) sin perder trabajo válido.

---

## Cómo prevenirlo

Las reglas RP-001 y RP-002 ya existen y son correctas. El problema fue de
**adherencia bajo presión**, no de ausencia de definición.

### RP-003 propuesta: Límite de cambios sin commit intermedio

> **Regla:** Si un batch de correcciones supera 5 archivos modificados OR 3 bugs
> distintos, el ejecutor DEBE hacer commits intermedios por grupo lógico de cambios,
> corriendo la suite de tests entre cada commit.
>
> **Razón:** Descubierto en incidente 2026-05-21. 22 cambios sin commits intermedios
> produjeron 10 regresiones no detectadas y deuda de proceso significativa.
>
> **Cómo aplicar:** Antes de iniciar un batch grande, planificar los commits:
> `fix(auth): Bug A-1` → test → commit → `fix(invoicing): Bugs B-2 a B-6` → test → commit → etc.

### Señal de alerta temprana

Cuando el usuario usa frases como "aplica TODO", "sistema perfecto", o solicita
"N cambios" en un solo mensaje, el ejecutor debe:
1. Confirmar el alcance antes de ejecutar
2. Proponer un plan de commits incrementales
3. Recordar al usuario que RP-001 aplica independientemente del volumen solicitado

---

## Referencias

- Commit de la corrección masiva original: `f63ebc7`
- Commit de recuperación (tests + fixes de regresión): `56ba812`
- Commit de condiciones formales post-aprobación: (este commit)
- ADR-004: `docs/architectural-decisions/ADR-004-fresh-role-validation.md`
- Migración formal: `prisma/migrations/20260522000000_auditoria_22_bugs_schema_changes/`
