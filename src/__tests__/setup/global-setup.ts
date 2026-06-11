/**
 * Vitest globalSetup — runs once before any test worker is spawned.
 *
 * 1. Derives the test DB URL from DATABASE_URL (production) by replacing
 *    the DB name with 'thebuilders_test'.
 * 2. GUARD: refuses to proceed if the derived URL does not contain '_test'.
 * 3. Mutates process.env.DATABASE_URL to the test URL so that worker threads
 *    spawned after this function inherit the correct URL.
 * 4. Creates the test DB on the DO cluster (idempotent — skips if exists).
 * 5. Runs `prisma migrate deploy` to bring the test schema up to date.
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import path from 'path';

// globalSetup runs before Vitest loads envFile for workers, so we load .env manually.
// dotenv is not installed; parse it with a simple regex that handles the common cases.
function loadEnvFile(filePath: string): void {
  try {
    const raw = readFileSync(filePath, 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx < 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      // Strip surrounding quotes (single or double)
      if ((val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (key && !(key in process.env)) {
        process.env[key] = val;
      }
    }
  } catch {
    // .env might not exist in CI — that's OK if DATABASE_URL is already set
  }
}

loadEnvFile(path.resolve(process.cwd(), '.env'));

function deriveTestUrl(prodUrl: string): string {
  const qmark = prodUrl.indexOf('?');
  const base = qmark >= 0 ? prodUrl.slice(0, qmark) : prodUrl;
  const params = qmark >= 0 ? prodUrl.slice(qmark) : '';
  const lastSlash = base.lastIndexOf('/');
  const origin = base.slice(0, lastSlash);
  return `${origin}/thebuilders_test${params}`;
}

export async function setup(): Promise<void> {
  const prodUrl = process.env.DATABASE_URL;
  if (!prodUrl) {
    throw new Error(
      '[test-setup] DATABASE_URL is not set. ' +
        'Run tests with the .env file loaded (vitest.config.ts sets envFile: .env).',
    );
  }

  const testUrl = deriveTestUrl(prodUrl);

  // GUARD — never run against a DB that does not have _test in its name
  const testDbName = testUrl.split('/').pop()?.split('?')[0] ?? '';
  if (!testDbName.includes('_test') && testDbName !== 'thebuilders_test') {
    throw new Error(
      `[test-setup] GUARD ACTIVADO: la URL de test apunta a "${testDbName}".\n` +
        'Los tests solo corren contra una BD con "_test" en el nombre.\n' +
        'La URL de producción nunca debe usarse para tests.',
    );
  }

  // Override DATABASE_URL before workers spawn so they inherit the test URL
  process.env.DATABASE_URL = testUrl;
  console.log(`[test-setup] DATABASE_URL → ${testDbName}`);

  // Parse credentials for psql from the ORIGINAL prod URL
  const withoutParams = prodUrl.split('?')[0]!;
  const parsed = new URL(withoutParams);
  const host = parsed.hostname;
  const port = parsed.port;
  const user = parsed.username;
  const pass = parsed.password;
  const prodDb = parsed.pathname.slice(1);

  // Create test DB (idempotent)
  try {
    execSync(
      `psql -h ${host} -p ${port} -U ${user} -d ${prodDb} -c "CREATE DATABASE thebuilders_test"`,
      { env: { ...process.env, PGPASSWORD: pass }, stdio: 'pipe' },
    );
    console.log('[test-setup] BD thebuilders_test creada');
  } catch (err) {
    const msg = String(err);
    if (msg.includes('already exists')) {
      console.log('[test-setup] BD thebuilders_test ya existe');
    } else {
      throw err;
    }
  }

  // Apply all pending migrations to test DB
  console.log('[test-setup] Aplicando migraciones a thebuilders_test...');
  execSync(
    'node --max_old_space_size=512 node_modules/prisma/build/index.js migrate deploy',
    { env: { ...process.env, DATABASE_URL: testUrl }, stdio: 'inherit' },
  );
  console.log('[test-setup] Migraciones aplicadas ✓');
}
