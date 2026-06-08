import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const routeSource = fs.readFileSync('src/routes/current-api.routes.ts', 'utf8');
const namespaceSource = fs.readFileSync('src/routes/api-namespaces.routes.ts', 'utf8');

test('current API exposes semantic non-versioned runtime endpoints', () => {
  for (const route of [
    '/runtime/current',
    '/runtime/current/manifest',
    '/runtime/current/asset/:fileName(*)',
    '/runtime/current/reports/:reportName',
    '/runtime/:runtimeId/manifest',
    '/runtime/:runtimeId/asset/:fileName(*)',
    '/runtime/:runtimeId/reports/:reportName',
    '/native-runtime/current/manifest',
    '/native-runtime/current/files/:fileName(*)',
    '/recipes/item/:itemId',
    '/recipes/usage/:itemId',
    '/recipes/current/item/:itemId',
    '/recipes/current/usage/:itemId',
    '/diagnostics/health',
    '/diagnostics/runtime-summary',
    '/health/current/runtime',
    '/metrics/current/native-surface',
    '/settings/runtime',
  ]) {
    assert.equal(routeSource.includes(route), true, `missing ${route}`);
  }
  assert.doesNotMatch(routeSource, /\/api\/v\d/);
  assert.equal(routeSource.includes("const API_SCHEMA = 'neonei/api/current'"), true);
  assert.equal(routeSource.includes('schemaRevision: API_SCHEMA_REVISION'), true);
  assert.equal(routeSource.includes('capabilities'), true);
  assert.equal(routeSource.includes("manifestUrl: '/api/runtime/current/manifest'"), true);
  assert.equal(routeSource.includes("assetBaseUrl: '/api/runtime/current/asset/'"), true);
  assert.equal(routeSource.includes('runtimeSchemaRevision'), true);
  assert.equal(routeSource.includes('runtimeManifestUrl'), true);
  assert.equal(routeSource.includes('runtimeAssetBaseUrl'), true);
  assert.equal(routeSource.includes('function assertCurrentRuntimeId'), true);
  assert.equal(routeSource.includes('function sendRuntimeReport'), true);
  assert.equal(routeSource.includes('function sendDiagnosticsHealth'), true);
  assert.equal(routeSource.includes('function sendDiagnosticsRuntimeSummary'), true);
  assert.equal(routeSource.includes('function sendRuntimeSettings'), true);
  assert.equal(routeSource.includes("allowDomGridFallback: false"), true);
  assert.equal(routeSource.includes("allowPerItemImageHotLoad: false"), true);
});

test('current API is mounted before legacy compatibility API', () => {
  const currentIndex = namespaceSource.indexOf("app.use('/api', tagApiTier('public-runtime'), currentApiRoutes)");
  const legacyIndex = namespaceSource.indexOf("app.use('/api', tagApiTier('legacy-compat'))");
  assert.notEqual(currentIndex, -1);
  assert.notEqual(legacyIndex, -1);
  assert.equal(currentIndex < legacyIndex, true, 'current API must be routed before legacy compatibility API');
});

test('runtime file endpoint is path traversal safe and relative-rooted', () => {
  assert.match(routeSource, /DIST_DATA_MANIFEST_FILE/);
  assert.match(routeSource, /files\?\.rustRuntimeManifest/);
  assert.match(routeSource, /nativeRuntime\?\.runtimeManifest/);
  assert.match(routeSource, /typeof value !== 'string'/);
  assert.match(routeSource, /function collectPortableRuntimePaths/);
  assert.match(routeSource, /Array\.isArray\(value\)/);
  assert.match(routeSource, /collectPortableRuntimePaths\(runtimeManifest\?\.files, declared\)/);
  assert.match(routeSource, /normalized\.includes\('\.\.'\)/);
  assert.match(routeSource, /path\.isAbsolute\(normalized\)/);
  assert.match(routeSource, /startsWith\(`\$\{runtimeRoot\}\$\{path\.sep\}`\)/);
  assert.match(routeSource, /getDeclaredRuntimeFilePaths/);
  assert.match(routeSource, /declaredRuntimeFiles\.has\(normalized\)/);
  assert.match(routeSource, /res\.sendFile\(filePath\)/);
});
