import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const serverSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/backend/src/server.ts',
  'utf8',
).replace(/\r\n/g, '\n');

test('publish runtime keeps immutable assets but prevents active manifest staleness', () => {
  assert.match(serverSource, /isPublishMutableArtifact/, 'server should distinguish mutable publish artifacts');
  assert.match(serverSource, /maxAge: '365d',[\s\S]*immutable: true/, 'bulk publish assets should keep long immutable caching');
  assert.match(serverSource, /no-store, no-cache, must-revalidate, proxy-revalidate/, 'active manifests and build reports should force revalidation');
  assert.match(serverSource, /Surrogate-Control/, 'CDN surrogate caches should be disabled for mutable publish artifacts');
});

test('admin runtime endpoints require tokens, rate limiting, structured diagnostics, and OpenAPI surface', () => {
  assert.match(serverSource, /NEONEI_ADMIN_TOKEN/, 'admin mutation endpoints should require an explicit token');
  assert.match(serverSource, /isAdminRateLimited/, 'admin routes should apply rate limiting');
  assert.match(serverSource, /requireAdminToken/, 'admin routes should share token validation');
  assert.match(serverSource, /app\.get\('\/api\/openapi\.json'/, 'server should expose a lightweight OpenAPI document');
  assert.match(serverSource, /app\.get\('\/api\/admin\/runtime'/, 'server should expose token-protected runtime diagnostics');
  assert.match(serverSource, /app\.post\('\/api\/admin\/acceleration\/reconcile'/, 'server should expose token-protected rebuild reconcile endpoint');
  assert.match(serverSource, /logger\.info\('\[ADMIN\] acceleration reconcile requested'/, 'admin mutations should be logged');
});
