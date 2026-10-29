import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
export async function createWsh2LocalRuntime({ persist = false, codeOnly = false } = {}) {
  // Explicit local-only harness. This wrapper is never included in the production Functions bundle.
  const { Miniflare } = await import(process.env.WSH2_MINIFLARE_ENTRY || 'miniflare');
  const authUser = codeOnly
    ? { email: '', memberHash: 'a'.repeat(64), tokenHash: 'b'.repeat(64), name: 'Code-only access' }
    : { email: 'local-preview@example.invalid' };
  const { outputFiles } = await build({
    stdin: { contents: `import { onRequest } from './functions/api/wsh2.js'; export default { fetch(request, env) { return onRequest({ request, env, data: { authUser: ${JSON.stringify(authUser)} } }); } };`, resolveDir: root },
    bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022',
  });
  const runtime = new Miniflare({
    modules: true, script: outputFiles[0].text, compatibilityDate: '2026-05-26',
    d1Databases: { DB: 'wsh2-local-only' }, r2Buckets: { WSH2_FILES: 'wsh2-local-only' },
    ...(persist ? { d1Persist: path.join(root, '.wrangler/wsh2-local/d1'), r2Persist: path.join(root, '.wrangler/wsh2-local/r2') } : {}),
  });
  const db = await runtime.getD1Database('DB');
  const migration = await fs.readFile(path.join(root, 'migrations/0004_wsh2.sql'), 'utf8');
  await db.batch(migration.split(';').map((sql) => sql.trim()).filter(Boolean).map((sql) => db.prepare(sql)));
  return runtime;
}
