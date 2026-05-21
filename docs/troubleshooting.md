# Troubleshooting — Issues Conocidos

Registro de problemas operacionales y sus resoluciones.

## TS-001 — Vitest "failed to find the runner" después de git stash

**Síntoma:**
```
Test Files  N failed (N)
Tests  no tests
Duration  XXs (import 0ms, tests 0ms)
TypeError: Cannot read properties of undefined (reading 'config')
Error: Vitest failed to find the runner.
```

**Diagnóstico:**
`git stash + git stash pop` puede dejar caché de Vitest en estado inconsistente.
El indicador clave es `import 0ms` — ningún archivo fue importado, el runner no llegó a inicializar.
El error aparece en la línea donde se llama `describe()` o `beforeAll()` al nivel de módulo,
aunque el archivo test esté sintácticamente correcto.

**Resolución:**
Re-ejecutar `npm test`. El estado suele resolverse solo en la segunda ejecución.
Si persiste:
1. `rm -rf node_modules/.vite`
2. `rm -rf node_modules/.vitest`
3. Re-ejecutar `npm test`

**Detectado en:** Sprint 2 (Bug 2.7), Claude Code
**Frecuencia:** Ocasional, ambiental
