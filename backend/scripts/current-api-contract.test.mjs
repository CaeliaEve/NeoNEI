import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const routeSource = fs.readFileSync('src/routes/current-api.routes.ts', 'utf8');
const namespaceSource = fs.readFileSync('src/routes/api-namespaces.routes.ts', 'utf8');

test('current API exposes semantic non-versioned runtime endpoints', () => {
  for (const route of [
    '/native-runtime/current/manifest',
    '/native-runtime/current/files/:fileName(*)',
    '/recipes/current/item/:itemId',
    '/recipes/current/usage/:itemId',
    '/health/current/runtime',
    '/metrics/current/native-surface',
  ]) {
    assert.equal(routeSource.includes(route), true, `missing ${route}`);
  }
  assert.doesNotMatch(routeSource, /\/api\/v\d/);
  assert.equal(routeSource.includes("const API_SCHEMA = 'neonei/api/current'"), true);
  assert.equal(routeSource.includes('schemaRevision: API_SCHEMA_REVISION'), true);
  assert.equal(routeSource.includes('capabilities'), true);
});

test('current API is mounted before legacy compatibility API', () => {
  const currentIndex = namespaceSource.indexOf("app.use('/api', tagApiTier('public-runtime'), currentApiRoutes)");
  const legacyIndex = namespaceSource.indexOf("app.use('/api', tagApiTier('legacy-compat'))");
  assert.notEqual(currentIndex, -1);
  assert.notEqual(legacyIndex, -1);
  assert.equal(currentIndex < legacyIndex, true, 'current API must be routed before legacy compatibility API');
});

test('runtime file endpoint is path traversal safe and relative-rooted', () => {
  assert.match(routeSource, /normalized\.includes\('\.\.'\)/);
  assert.match(routeSource, /path\.isAbsolute\(normalized\)/);
  assert.match(routeSource, /startsWith\(`\$\{runtimeRoot\}\$\{path\.sep\}`\)/);
  assert.match(routeSource, /res\.sendFile\(filePath\)/);
});
