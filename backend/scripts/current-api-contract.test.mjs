import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const routeSource = fs.readFileSync('src/routes/current-api.routes.ts', 'utf8');
const namespaceSource = fs.readFileSync('src/routes/api-namespaces.routes.ts', 'utf8');
const currentRuntimeSnapshotSource = fs.readFileSync('src/services/current-runtime-snapshot.service.ts', 'utf8');
const currentRuntimeApiSource = fs.readFileSync('src/services/current-runtime-api.service.ts', 'utf8');
const currentRuntimeRecipeApiSource = fs.readFileSync('src/services/current-runtime-recipe-api.service.ts', 'utf8');
const currentRuntimeReportRegistrySource = fs.readFileSync('src/services/current-runtime-report-registry.service.ts', 'utf8');
const currentRuntimeSettingsSource = fs.readFileSync('src/services/current-runtime-settings.service.ts', 'utf8');

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
  assert.equal(currentRuntimeApiSource.includes("const API_SCHEMA = 'neonei/api/current'"), true);
  assert.equal(currentRuntimeApiSource.includes('schemaRevision: API_SCHEMA_REVISION'), true);
  assert.equal(currentRuntimeApiSource.includes('capabilities'), true);
  assert.equal(currentRuntimeApiSource.includes("manifestUrl: '/api/runtime/current/manifest'"), true);
  assert.equal(currentRuntimeApiSource.includes("assetBaseUrl: '/api/runtime/current/asset/'"), true);
  assert.equal(currentRuntimeApiSource.includes('runtimeSchemaRevision'), true);
  assert.equal(currentRuntimeApiSource.includes('runtimeManifestUrl'), true);
  assert.equal(currentRuntimeApiSource.includes('runtimeAssetBaseUrl'), true);
  assert.equal(currentRuntimeApiSource.includes('function assertCurrentRuntimeId'), true);
  assert.equal(routeSource.includes('function sendRuntimeReport'), true);
  assert.equal(routeSource.includes('function sendDiagnosticsHealth'), true);
  assert.equal(routeSource.includes('function sendDiagnosticsRuntimeSummary'), true);
  assert.equal(routeSource.includes('function sendRuntimeSettings'), true);
  assert.equal(routeSource.includes('getCurrentRuntimeSettings()'), true);
  assert.equal(currentRuntimeSettingsSource.includes("allowDomGridFallback: false"), true);
  assert.equal(currentRuntimeSettingsSource.includes("allowPerItemImageHotLoad: false"), true);
  assert.equal(currentRuntimeSettingsSource.includes('NEONEI_DEBUG_PANELS'), true);
  assert.doesNotMatch(routeSource, /process\.env\.NEONEI_DEBUG_PANELS/);
});

test('current API is mounted before legacy compatibility API', () => {
  const currentIndex = namespaceSource.indexOf("app.use('/api', tagApiTier('public-runtime'), currentApiRoutes)");
  const legacyIndex = namespaceSource.indexOf("app.use('/api/recipes-indexed', tagApiTier('legacy-compat'), indexedRecipesRoutes)");
  assert.notEqual(currentIndex, -1);
  assert.notEqual(legacyIndex, -1);
  assert.equal(currentIndex < legacyIndex, true, 'current API must be routed before legacy compatibility API');
});

test('runtime file endpoint is path traversal safe and relative-rooted', () => {
  assert.match(currentRuntimeSnapshotSource, /DIST_DATA_MANIFEST_FILE/);
  assert.match(currentRuntimeSnapshotSource, /files\?\.rustRuntimeManifest/);
  assert.match(currentRuntimeSnapshotSource, /nativeRuntime\?\.runtimeManifest/);
  assert.match(currentRuntimeSnapshotSource, /typeof value !== 'string'/);
  assert.match(currentRuntimeSnapshotSource, /function addPortableRuntimePath/);
  assert.match(currentRuntimeSnapshotSource, /function collectEntrypointRuntimePaths/);
  assert.match(currentRuntimeSnapshotSource, /function collectManifestRuntimeFiles/);
  assert.match(currentRuntimeSnapshotSource, /Array\.isArray\(value\)/);
  assert.match(currentRuntimeSnapshotSource, /addPortableRuntimePath\(record\.path, output\)/);
  assert.match(currentRuntimeSnapshotSource, /collectManifestRuntimeFiles\(runtimeManifest\.files, declared\)/);
  assert.match(currentRuntimeSnapshotSource, /normalized\.includes\('\.\.'\)/);
  assert.match(currentRuntimeSnapshotSource, /path\.isAbsolute\(normalized\)/);
  assert.match(currentRuntimeSnapshotSource, /startsWith\(`\$\{runtimeRoot\}\$\{path\.sep\}`\)/);
  assert.match(currentRuntimeSnapshotSource, /collectDeclaredRuntimeFilePaths/);
  assert.match(currentRuntimeSnapshotSource, /snapshot\.declaredFiles\.includes\(normalized\)/);
  assert.match(currentRuntimeApiSource, /function normalizeRequiredCurrentRuntimeParam/);
  assert.match(currentRuntimeApiSource, /export function getCurrentRuntimeAssetDelivery/);
  assert.match(currentRuntimeApiSource, /isPortableRuntimePath\(raw\)/);
  assert.match(currentRuntimeApiSource, /normalizeRuntimePath\(raw\)/);
  assert.match(currentRuntimeApiSource, /context\.snapshot\.artifactsByPath\[normalized\]/);
  assert.match(routeSource, /res\.sendFile\(asset\.artifact\.absolutePath\)/);
});

test('current runtime snapshot service owns immutable manifest and artifact inventory', () => {
  assert.match(currentRuntimeSnapshotSource, /export type CurrentRuntimeSnapshot = Readonly/);
  assert.match(currentRuntimeSnapshotSource, /revision: number/);
  assert.match(currentRuntimeSnapshotSource, /artifactsByPath: Readonly<Record<string, CurrentRuntimeArtifact>>/);
  assert.match(currentRuntimeSnapshotSource, /Object\.freeze\(\{/);
  assert.match(currentRuntimeSnapshotSource, /function publishCurrentRuntimeSnapshot/);
  assert.match(currentRuntimeSnapshotSource, /export function getCurrentRuntimeSnapshot/);
  assert.match(currentRuntimeSnapshotSource, /export function getCurrentRuntimeArtifact/);
  assert.match(currentRuntimeSnapshotSource, /export function normalizeRuntimePath/);
  assert.match(currentRuntimeApiSource, /getCurrentRuntimeSnapshot/);
  assert.match(currentRuntimeApiSource, /export function createCurrentRuntimeApiContext/);
  assert.match(currentRuntimeApiSource, /export type CurrentRuntimeApiContext/);
  assert.match(currentRuntimeApiSource, /export function getCurrentRuntimeOverview/);
  assert.match(currentRuntimeApiSource, /export function getCurrentRuntimeManifestDelivery/);
  assert.match(currentRuntimeApiSource, /export function getCurrentRuntimeDiagnosticsHealth/);
  assert.match(currentRuntimeApiSource, /export function getCurrentRuntimeDiagnosticsSummary/);
  assert.match(currentRuntimeApiSource, /export function getCurrentRuntimeNativeSurfaceMetrics/);
  assert.match(routeSource, /sendOk\(res: Response, data: unknown, context = createCurrentRuntimeApiContext\(\)\)/);
  assert.doesNotMatch(routeSource, /function getCurrentMeta/);
  assert.doesNotMatch(routeSource, /getCurrentRuntimeSnapshot/);
  assert.doesNotMatch(routeSource, /function getDeclaredRuntimeFilePaths/);
  assert.doesNotMatch(routeSource, /function resolveRuntimeFile/);
  assert.doesNotMatch(routeSource, /context\.snapshot\.artifactsByPath/);

  const assetIndex = routeSource.indexOf('function sendRuntimeAsset');
  assert.notEqual(assetIndex, -1, 'sendRuntimeAsset must exist');
  const assetBody = routeSource.slice(assetIndex, routeSource.indexOf('\n}', assetIndex) + 2);
  assert.doesNotMatch(assetBody, /fs\.statSync/);
  assert.doesNotMatch(assetBody, /fs\.existsSync/);
});

test('runtime delivery API exposes immutable ETag asset contracts and report allowlist', () => {
  assert.match(currentRuntimeApiSource, /createWeakEtag/);
  assert.match(routeSource, /setStaticAssetCacheHeaders/);
  assert.match(routeSource, /immutable:\s*true/);
  assert.match(routeSource, /res\.setHeader\('ETag'/);
  assert.match(routeSource, /setNoStoreHeaders\(res\);\s*\n\s*sendOk\(res, getCurrentRuntimeOverview\(context\), context\)/, 'current runtime pointer must remain no-store');
  assert.match(currentRuntimeApiSource, /runtimeId: meta\.runtimeId/);
  assert.match(routeSource, /resolveCurrentRuntimeReport\(reportName\)/);
  assert.match(routeSource, /res\.sendFile\(report\.absolutePath\)/);
  assert.doesNotMatch(routeSource, /const allowedReports/);
  assert.doesNotMatch(routeSource, /function resolveRuntimeReport/);
  assert.doesNotMatch(routeSource, /fs\.existsSync/);
  assert.doesNotMatch(routeSource, /fs\.statSync/);
  assert.match(currentRuntimeReportRegistrySource, /const CURRENT_RUNTIME_REPORTS = Object\.freeze/);
  assert.match(currentRuntimeReportRegistrySource, /export function resolveCurrentRuntimeReport/);
  assert.match(currentRuntimeReportRegistrySource, /resolveDistDataRuntimeFile\(relativePath\)/);
  assert.match(currentRuntimeReportRegistrySource, /fs\.statSync\(absolutePath\)/);
  assert.match(currentRuntimeReportRegistrySource, /stat\.isFile\(\)/);
  assert.match(currentRuntimeReportRegistrySource, /bytes: stat\.size/);
  assert.match(currentRuntimeReportRegistrySource, /mtimeMs: stat\.mtimeMs/);

  for (const report of [
    'compile-report',
    'missing-texture-report',
    'suspicious-texture-report',
    'atlas-report',
    'performance-budget-report',
    'api-contract-report',
    'deployment-report',
    'semantic-validation-report',
  ]) {
    assert.equal(currentRuntimeReportRegistrySource.includes(`'${report}'`), true, `missing report allowlist entry ${report}`);
  }
  assert.match(currentRuntimeReportRegistrySource, /!\/\^\[a-z0-9-\]\+\$\/i\.test\(normalized\)/, 'report names must be simple slugs');
  assert.match(currentRuntimeReportRegistrySource, /throw notFound\('Runtime report is not allowed'\)/);
});

test('current API responses are path portable and do not advertise machine roots', () => {
  assert.doesNotMatch(routeSource, /[A-Za-z]:\\\\/);
  assert.doesNotMatch(routeSource, /E:\\\\codex/);
  assert.doesNotMatch(currentRuntimeApiSource, /[A-Za-z]:\\\\/);
  assert.doesNotMatch(currentRuntimeApiSource, /E:\\\\codex/);
  assert.doesNotMatch(currentRuntimeSettingsSource, /[A-Za-z]:\\\\/);
  assert.doesNotMatch(currentRuntimeSettingsSource, /E:\\\\codex/);
  assert.doesNotMatch(currentRuntimeApiSource, /assetBaseUrl:\s*['"](?:[A-Za-z]:|\\\\|\/runtime\/)/);
  assert.match(currentRuntimeApiSource, /assetBaseUrl:\s*'\/api\/runtime\/current\/asset\/'/);
  assert.match(currentRuntimeApiSource, /runtimeAssetBaseUrl:\s*`\/api\/runtime\/\$\{encodeURIComponent\(meta\.runtimeId\)\}\/asset\/`/);
  assert.doesNotMatch(currentRuntimeSettingsSource, /assetBaseUrl:\s*['"](?:[A-Za-z]:|\\\\|\/runtime\/)/);
  assert.match(currentRuntimeSettingsSource, /assetBaseUrl:\s*'\/api\/runtime\/current\/asset\/'/);
});

test('recipe page API exposes low-frequency page details without browser hot-path ownership', () => {
  assert.equal(routeSource.includes('function sendRecipePage'), true);
  assert.equal(routeSource.includes('getCurrentRecipePage(recipePageIdParam)'), true);
  assert.equal(currentRuntimeRecipeApiSource.includes('getRecipePageById(recipePageId)'), true);
  assert.equal(currentRuntimeRecipeApiSource.includes("throw notFound('Recipe page not found')"), true);
  assert.match(routeSource, /'\/recipes\/page\/:recipePageId\(\*\)'/);

  const serviceSource = fs.readFileSync('src/services/recipes-indexed.service.ts', 'utf8');
  assert.match(serviceSource, /async getRecipePageById\(recipePageId: string\)/);
  assert.match(serviceSource, /const recipe = await this\.getRecipeById\(normalizedRecipePageId\)/);
  assert.match(serviceSource, /uiPayload/);
  assert.doesNotMatch(routeSource, /images\/item/, 'recipe page API must not advertise scattered item image paths');
  assert.doesNotMatch(currentRuntimeRecipeApiSource, /images\/item/, 'recipe API service must not advertise scattered item image paths');
});

test('external-runtime authority uses runtime recipe pack for item usage and page queries', () => {
  assert.match(currentRuntimeRecipeApiSource, /resolveAccelerationCompilerAuthority/);
  assert.match(currentRuntimeRecipeApiSource, /getRuntimeRecipePackService/);
  assert.match(currentRuntimeRecipeApiSource, /function isExternalRuntimeRecipeAuthority/);
  assert.match(currentRuntimeRecipeApiSource, /resolveAccelerationCompilerAuthority\(\) === 'external-runtime'/);
  assert.match(currentRuntimeRecipeApiSource, /getRuntimeRecipePackService\(\)\.getItemProducedBy\(itemId\)/);
  assert.match(currentRuntimeRecipeApiSource, /getRuntimeRecipePackService\(\)\.getItemUsedIn\(itemId\)/);
  assert.match(currentRuntimeRecipeApiSource, /getRuntimeRecipePackService\(\)\.getRecipePage\(recipePageId\)/);
  assert.doesNotMatch(routeSource, /resolveAccelerationCompilerAuthority/);
  assert.doesNotMatch(routeSource, /getRuntimeRecipePackService/);
  assert.doesNotMatch(routeSource, /function isExternalRuntimeAuthority/);
  assert.doesNotMatch(routeSource, /RUNTIME_PACK_QUERY_NOT_IMPLEMENTED/);
  assert.doesNotMatch(routeSource, /assertRecipeApiPackBackedOrAllowed/);
  const pageIndex = routeSource.indexOf('async function sendRecipePage');
  assert.notEqual(pageIndex, -1, 'sendRecipePage must exist');
  const pageBody = routeSource.slice(pageIndex, routeSource.indexOf('\n}', pageIndex) + 2);
  assert.match(pageBody, /getCurrentRecipePage\(recipePageIdParam\)/, 'sendRecipePage must delegate runtime recipe authority');
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
