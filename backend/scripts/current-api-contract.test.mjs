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
  const legacyIndex = namespaceSource.indexOf("app.use('/api/recipes-indexed', tagApiTier('legacy-compat'), indexedRecipesRoutes)");
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

test('runtime delivery API exposes immutable ETag asset contracts and report allowlist', () => {
  assert.match(routeSource, /createWeakEtag/);
  assert.match(routeSource, /setStaticAssetCacheHeaders/);
  assert.match(routeSource, /immutable:\s*true/);
  assert.match(routeSource, /res\.setHeader\('ETag'/);
  assert.match(routeSource, /setNoStoreHeaders\(res\);\s*\n\s*sendOk\(res, \{\s*\n\s*runtimeId:/, 'current runtime pointer must remain no-store');

  for (const report of [
    'compile-report',
    'missing-texture-report',
    'suspicious-texture-report',
    'atlas-report',
    'performance-budget-report',
    'api-contract-report',
  ]) {
    assert.equal(routeSource.includes(`'${report}'`), true, `missing report allowlist entry ${report}`);
  }
  assert.match(routeSource, /!\/\^\[a-z0-9-\]\+\$\/i\.test\(normalized\)/, 'report names must be simple slugs');
  assert.match(routeSource, /throw notFound\('Runtime report is not allowed'\)/);
});

test('current API responses are path portable and do not advertise machine roots', () => {
  assert.doesNotMatch(routeSource, /[A-Za-z]:\\\\/);
  assert.doesNotMatch(routeSource, /E:\\\\codex/);
  assert.doesNotMatch(routeSource, /assetBaseUrl:\s*['"](?:[A-Za-z]:|\\\\|\/runtime\/)/);
  assert.match(routeSource, /assetBaseUrl:\s*'\/api\/runtime\/current\/asset\/'/);
  assert.match(routeSource, /runtimeAssetBaseUrl:\s*`\/api\/runtime\/\$\{encodeURIComponent\(meta\.runtimeId\)\}\/asset\/`/);
});

test('recipe page API exposes low-frequency page details without browser hot-path ownership', () => {
  assert.equal(routeSource.includes('function sendRecipePage'), true);
  assert.equal(routeSource.includes('getRecipePageById(recipePageId)'), true);
  assert.equal(routeSource.includes("throw notFound('Recipe page not found')"), true);
  assert.match(routeSource, /'\/recipes\/page\/:recipePageId\(\*\)'/);

  const serviceSource = fs.readFileSync('src/services/recipes-indexed.service.ts', 'utf8');
  assert.match(serviceSource, /async getRecipePageById\(recipePageId: string\)/);
  assert.match(serviceSource, /const recipe = await this\.getRecipeById\(normalizedRecipePageId\)/);
  assert.match(serviceSource, /uiPayload/);
  assert.doesNotMatch(routeSource, /images\/item/, 'recipe page API must not advertise scattered item image paths');
});

test('external-runtime authority uses runtime recipe pack for item usage and page queries', () => {
  assert.match(routeSource, /resolveAccelerationCompilerAuthority/);
  assert.match(routeSource, /getRuntimeRecipePackService/);
  assert.match(routeSource, /function isExternalRuntimeAuthority/);
  assert.match(routeSource, /resolveAccelerationCompilerAuthority\(\) === 'external-runtime'/);
  assert.match(routeSource, /getRuntimeRecipePackService\(\)\.getItemProducedBy\(itemId\)/);
  assert.match(routeSource, /getRuntimeRecipePackService\(\)\.getItemUsedIn\(itemId\)/);
  assert.match(routeSource, /getRuntimeRecipePackService\(\)\.getRecipePage\(recipePageId\)/);
  assert.doesNotMatch(routeSource, /RUNTIME_PACK_QUERY_NOT_IMPLEMENTED/);
  assert.doesNotMatch(routeSource, /assertRecipeApiPackBackedOrAllowed/);
  const pageIndex = routeSource.indexOf('async function sendRecipePage');
  assert.notEqual(pageIndex, -1, 'sendRecipePage must exist');
  const pageBody = routeSource.slice(pageIndex, routeSource.indexOf('\n}', pageIndex) + 2);
  assert.match(pageBody, /isExternalRuntimeAuthority\(\)/, 'sendRecipePage must use runtime pack under external runtime');
});


test('external-runtime authority keeps legacy sqlite recipe namespaces out of production /api', () => {
  assert.match(namespaceSource, /resolveAccelerationCompilerAuthority/);
  assert.match(namespaceSource, /externalRuntimeAuthority = resolveAccelerationCompilerAuthority\(\) === 'external-runtime'/);
  assert.match(namespaceSource, /exposeLegacyApiNamespace = !PUBLIC_RUNTIME_ONLY && !externalRuntimeAuthority/);
  assert.match(namespaceSource, /if \(exposeLegacyApiNamespace\) \{/);
  assert.match(namespaceSource, /app\.use\('\/lab\/recipes', indexedRecipesRoutes\)/);
  assert.match(namespaceSource, /app\.use\('\/lab\/recipe-bootstrap', recipeBootstrapRoutes\)/);
  assert.match(namespaceSource, /app\.use\('\/api\/recipes-indexed', tagApiTier\('legacy-compat'\), indexedRecipesRoutes\)/);
  assert.match(namespaceSource, /app\.use\('\/api\/recipe-bootstrap', tagApiTier\('legacy-compat'\), recipeBootstrapRoutes\)/);

  const legacyApiGateIndex = namespaceSource.indexOf('if (exposeLegacyApiNamespace) {');
  assert.notEqual(legacyApiGateIndex, -1, 'legacy api gate must exist');
  const legacyApiGateBody = namespaceSource.slice(legacyApiGateIndex, namespaceSource.indexOf("  app.use('/api/publish'", legacyApiGateIndex));
  assert.match(legacyApiGateBody, /app\.use\('\/api\/recipes-indexed', tagApiTier\('legacy-compat'\), indexedRecipesRoutes\)/);
  assert.match(legacyApiGateBody, /app\.use\('\/api\/recipe-bootstrap', tagApiTier\('legacy-compat'\), recipeBootstrapRoutes\)/);

  const labGateIndex = namespaceSource.indexOf('if (!PUBLIC_RUNTIME_ONLY) {');
  assert.notEqual(labGateIndex, -1, 'lab api gate must exist');
  const labGateBody = namespaceSource.slice(labGateIndex, namespaceSource.indexOf("\n  app.use('/api'", labGateIndex));
  assert.match(labGateBody, /app\.use\('\/lab\/recipes', indexedRecipesRoutes\)/);
  assert.match(labGateBody, /app\.use\('\/lab\/recipe-bootstrap', recipeBootstrapRoutes\)/);
});

test('v1 runtime contracts point dev compatibility recipe APIs to lab under external runtime authority', () => {
  const v1Source = fs.readFileSync('src/routes/v1.routes.ts', 'utf8');
  assert.match(v1Source, /resolveAccelerationCompilerAuthority/);
  assert.match(v1Source, /externalRuntimeAuthority = resolveAccelerationCompilerAuthority\(\) === 'external-runtime'/);
  assert.match(v1Source, /legacyApiBase = externalRuntimeAuthority \? '\/lab' : '\/api'/);
  assert.match(v1Source, /devRecipesIndexed: externalRuntimeAuthority \? '\/lab\/recipes' : '\/api\/recipes-indexed'/);
  assert.match(v1Source, /devRecipeBootstrap: `\$\{legacyApiBase\}\/recipe-bootstrap`/);
  assert.doesNotMatch(v1Source, /devRecipesIndexed: '\/api\/recipes-indexed'/);
  assert.doesNotMatch(v1Source, /externalRuntimeAuthority \? '\/lab\/recipes-indexed'/);
  assert.doesNotMatch(v1Source, /devRecipeBootstrap: '\/api\/recipe-bootstrap'/);
});
