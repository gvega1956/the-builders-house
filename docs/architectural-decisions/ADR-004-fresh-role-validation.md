# ADR-004: Validación de rol fresca en cada request (DB fetch)

**Estado:** Aceptada
**Fecha:** 2026-05-22
**Bug de origen:** A-1 — Stale Role in JWT

---

## Contexto

El JWT de NextAuth tiene vigencia de 8 horas. Antes de este cambio, el rol del usuario
y su estado `isActive` se leían exclusivamente del JWT en el middleware de autenticación.

Esto creaba una ventana crítica de seguridad:
- Un usuario degradado (ADMIN → VIEWER) seguía operando con permisos de ADMIN por
  hasta 8 horas después de la degradación en la base de datos.
- Un usuario desactivado (`isActive = false`) seguía accediendo al sistema hasta que
  su JWT expirara.
- Con 4-10 usuarios concurrentes, esta ventana es inaceptable en un sistema con
  auditoría de inventario y anti-robo.

El sistema permite sesiones de 8h porque los empleados trabajan turnos completos
sin reconectarse. Reducir el TTL del JWT incrementaría la fricción operativa.

## Decisión

`enforceUserIsAuthed` hace `db.user.findUnique({ select: { isActive, role } })`
en **cada request autenticada** para obtener rol e `isActive` frescos desde la DB.

El rol fresco se inyecta en `ctx.session.user.role` antes de pasar el contexto
a los middlewares de autorización. `adminProcedure` y `managerProcedure` encadenan
desde `protectedProcedure`, por lo que un único DB query sirve para los tres.

```
Request → enforceUserIsAuthed (1 DB query: role + isActive)
                ↓ ctx.session.user.role = dbUser.role
         → enforceIsAdmin / enforceIsManagerOrAdmin (lee del ctx inyectado)
```

Código en `src/server/trpc/index.ts` líneas 28-74.

## Consecuencias positivas

- **Degradación efectiva inmediata:** si un admin degrada a un usuario en la UI,
  el siguiente request de ese usuario ya falla con FORBIDDEN — sin esperar la
  expiración del JWT.
- **Desactivación efectiva inmediata:** si un usuario es marcado `isActive = false`,
  el siguiente request retorna UNAUTHORIZED de inmediato.
- **Sin N+1:** un solo query por request autenticada, no uno por middleware.
- **Sin infraestructura adicional:** no requiere Redis, blacklist de tokens, ni
  refresh token endpoint.

## Consecuencias negativas

- **+1 query por request autenticada:** bajo carga alta (~1000 req/s), el costo
  acumulado puede ser significativo. Para 4-10 usuarios concurrentes del sistema
  actual, el impacto es despreciable (~5-15ms por request).
- **Dependencia de disponibilidad de DB:** si la DB está caída, todos los usuarios
  autenticados pierden acceso, incluyendo operaciones que no cambiarían el resultado
  del check de rol. Esto es aceptable dado el modelo de deployment en DigitalOcean
  Managed DB con alta disponibilidad.

## Alternativas consideradas y descartadas

### 1. Cache en memoria con TTL de 30-60 segundos
- **Pros:** reduce queries a DB; solo un cache miss por usuario por minuto.
- **Cons:** introduce ventana de stale role (30-60s); requiere invalidación explícita
  al degradar usuarios; en deployment multi-instancia, los caches por instancia se
  desincronizan.
- **Decisión:** descartada. La motivación original (Bug A-1) era eliminar la ventana
  de stale role. Reducirla a 60s no la elimina.

### 2. Invalidación de JWT al cambiar rol
- **Pros:** permisos revocados instantáneamente sin overhead por request.
- **Cons:** requiere mantener una token blacklist (Redis o tabla DB); introduce
  complejidad operativa significativa; para 4-10 usuarios la relación
  costo/beneficio no se justifica.
- **Decisión:** descartada. Infraestructura rechazada explícitamente en CLAUDE.md
  (Redis: "no se justifica la carga").

### 3. Reducir TTL del JWT a 15-30 minutos + refresh silencioso
- **Pros:** ventana acotada sin overhead por request.
- **Cons:** requiere implementar refresh token flow en NextAuth, manejo de race
  conditions en refresh, UX degradada si el refresh falla.
- **Decisión:** diferida. Viable si el costo de la query por request se convierte
  en un problema real a mayor escala.

## Threshold de revisión

Si el monitoreo muestra que el overhead de la query (`user_role_check_ms`) supera
el 10% de la latencia media por request, evaluar:
1. Cache con TTL de 30s + invalidación explícita al cambiar rol (opción 1 revisada).
2. Refresh token flow con TTL corto (opción 3).

Con los 4-10 usuarios actuales del sistema, esto no es esperado en los próximos 12 meses.

## Referencias

- Bug A-1: `src/__tests__/integration/auth-role-freshness.test.ts`
- Implementación: `src/server/trpc/index.ts` L28-74
- Commit: `56ba812`
- Alternativa rechazada (Redis): `CLAUDE.md` sección "Rechazado explícitamente"
