import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const routeSource = fs.readFileSync('src/routes/current-api.routes.ts', 'utf8');
const namespaceSource = fs.readFileSync('src/routes/api-namespaces.routes.ts', 'utf8');
const namespaceRegistrySource = fs.readFileSync('src/routes/api-namespace-registry.ts', 'utf8');
const currentRuntimeEndpointRegistrySource = fs.readFileSync('src/routes/current-runtime-endpoint-registry.ts', 'utf8');
const currentRuntimeTransportSource = fs.readFileSync('src/routes/current-runtime-transport.ts', 'utf8');
const currentRuntimeSnapshotSource = fs.readFileSync('src/services/current-runtime-snapshot.service.ts', 'utf8');
const currentRuntimeArtifactIndexSource = fs.readFileSync('src/services/current-runtime-artifact-index.service.ts', 'utf8');
const currentRuntimeApiSource = fs.readFileSync('src/services/current-runtime-api.service.ts', 'utf8');
const currentRuntimeObservabilitySource = fs.readFileSync('src/services/current-runtime-observability.service.ts', 'utf8');
const currentRuntimeRecipeApiSource = fs.readFileSync('src/services/current-runtime-recipe-api.service.ts', 'utf8');
const currentRuntimeReportRegistrySource = fs.readFileSync('src/services/current-runtime-report-registry.service.ts', 'utf8');
const currentRuntimeSettingsSource = fs.readFileSync('src/services/current-runtime-settings.service.ts', 'utf8');
const currentRuntimeSpecialDataSource = fs.readFileSync('src/services/current-runtime-special-data.service.ts', 'utf8');

test('current API exposes semantic non-versioned runtime endpoints', () => {
  for (const route of [
    '/runtime/current',
    '/runtime/current/manifest',
    '/runtime/current/asset/:fileName(*)',
    '/runtime/current/reports/:reportName',
    '/runtime/:runtimeId/manifest',
    '/runtime/:runtimeId/asset/:fileName(*)',
    '/runtime/:runtimeId/reports/:reportName',
    '/recipes/item/:itemId',
    '/recipes/usage/:itemId',
    '/recipes/current/item/:itemId',
    '/recipes/current/usage/:itemId',
    '/diagnostics/health',
    '/diagnostics/runtime-summary',
    '/health/current/runtime',
    '/metrics/current/native-surface',
    '/settings/runtime',
    '/runtime/current/data/gt-diagrams/overview',
    '/runtime/current/data/forestry-genetics/overview',
    '/runtime/current/data/multiblocks/:controllerItemId',
  ]) {
    assert.equal(currentRuntimeEndpointRegistrySource.includes(route), true, `missing ${route}`);
  }
  assert.match(currentRuntimeEndpointRegistrySource, /export const CURRENT_RUNTIME_ENDPOINTS = Object\.freeze/);
  assert.match(currentRuntimeEndpointRegistrySource, /plane: 'controlfs'/);
  assert.match(currentRuntimeEndpointRegistrySource, /plane: 'datafs'/);
  assert.match(currentRuntimeEndpointRegistrySource, /plane: 'debugfs'/);
  assert.match(currentRuntimeEndpointRegistrySource, /plane: 'recipefs'/);
  assert.doesNotMatch(currentRuntimeEndpointRegistrySource, /plane: 'compatfs'/);
  assert.doesNotMatch(currentRuntimeEndpointRegistrySource, /nativeManifestCompat|nativeFileCompat/);
  assert.doesNotMatch(currentRuntimeEndpointRegistrySource, /\/native-runtime\/current/);
  assert.doesNotMatch(routeSource, /nativeManifestCompat|nativeFileCompat/);
  assert.match(currentRuntimeEndpointRegistrySource, /export function mountCurrentRuntimeEndpoint/);
  assert.match(routeSource, /mountCurrentRuntimeEndpoint/);
  assert.doesNotMatch(routeSource, /router\.get\('/);
  assert.doesNotMatch(routeSource, /router\.use\('/);
  assert.doesNotMatch(routeSource, /\/api\/v\d/);
  assert.equal(currentRuntimeApiSource.includes("const API_SCHEMA = 'neonei/api/current'"), true);
  assert.equal(currentRuntimeApiSource.includes('schemaRevision: API_SCHEMA_REVISION'), true);
  assert.equal(currentRuntimeApiSource.includes('capabilities'), true);
  assert.equal(currentRuntimeApiSource.includes("manifestUrl: '/api/runtime/current/manifest'"), true);
  assert.equal(currentRuntimeApiSource.includes("assetBaseUrl: '/api/runtime/current/asset/'"), true);
  assert.equal(currentRuntimeApiSource.includes('runtimeSchemaRevision'), true);
  assert.equal(currentRuntimeApiSource.includes('runtimeManifestUrl'), true);
  assert.equal(currentRuntimeApiSource.includes('runtimeAssetBaseUrl'), true);
  assert.equal(currentRuntimeApiSource.includes('legacyManifestUrl'), false);
  assert.doesNotMatch(currentRuntimeApiSource, /\/api\/native-runtime\/current/);
  assert.equal(currentRuntimeApiSource.includes('function assertCurrentRuntimeId'), true);
  assert.equal(currentRuntimeTransportSource.includes('function sendCurrentRuntimeReport'), true);
  assert.equal(routeSource.includes('function sendDiagnosticsHealth'), true);
  assert.equal(routeSource.includes('function sendDiagnosticsRuntimeSummary'), true);
  assert.equal(routeSource.includes('function sendRuntimeSettings'), true);
  assert.equal(routeSource.includes('function sendGTDiagramsOverview'), true);
  assert.equal(routeSource.includes('function sendForestryGeneticsOverview'), true);
  assert.equal(routeSource.includes('function sendMultiblockBlueprint'), true);
  assert.equal(routeSource.includes('getCurrentRuntimeSettings()'), true);
  assert.equal(routeSource.includes('getCurrentRuntimeGTDiagramsOverview()'), true);
  assert.equal(routeSource.includes('getCurrentRuntimeForestryGeneticsOverview()'), true);
  assert.equal(routeSource.includes('getCurrentRuntimeMultiblockBlueprint(controllerItemIdParam)'), true);
  assert.equal(currentRuntimeSpecialDataSource.includes("from './gt-diagrams.service'"), true);
  assert.equal(currentRuntimeSpecialDataSource.includes("from './forestry-genetics.service'"), true);
  assert.equal(currentRuntimeSpecialDataSource.includes("from './multiblocks.service'"), true);
  assert.equal(currentRuntimeSettingsSource.includes("allowDomGridFallback: false"), true);
  assert.equal(currentRuntimeSettingsSource.includes("allowPerItemImageHotLoad: false"), true);
  assert.equal(currentRuntimeSettingsSource.includes('NEONEI_DEBUG_PANELS'), true);
  assert.doesNotMatch(routeSource, /process\.env\.NEONEI_DEBUG_PANELS/);
});

test('current API owns /api without legacy dynamic namespace shadow mounts', () => {
  const currentIndex = namespaceRegistrySource.indexOf('namespaces.push(CURRENT_API_NAMESPACE)');
  assert.notEqual(currentIndex, -1);
  assert.match(namespaceSource, /mountApiNamespaces/);
  assert.match(namespaceSource, /getApiNamespacePlan/);
  assert.doesNotMatch(namespaceSource, /app\.use\('\/api'/);
  assert.doesNotMatch(namespaceRegistrySource, /LEGACY_COMPAT_NAMESPACES/);
  assert.doesNotMatch(namespaceRegistrySource, /legacy-compat/);
  assert.doesNotMatch(namespaceRegistrySource, /mountPath: '\/api\/(?:items|patterns|recipes-indexed|recipe-bootstrap|multiblocks|ecosystem|gt-diagrams|forestry-genetics|render-contract)'/);
});

test('runtime file endpoint is path traversal safe and relative-rooted', () => {
  assert.match(currentRuntimeArtifactIndexSource, /CURRENT_RUNTIME_DIST_MANIFEST_FILE/);
  assert.match(currentRuntimeArtifactIndexSource, /files\?\.rustRuntimeManifest/);
  assert.match(currentRuntimeArtifactIndexSource, /nativeRuntime\?\.runtimeManifest/);
  assert.match(currentRuntimeArtifactIndexSource, /typeof value !== 'string'/);
  assert.match(currentRuntimeArtifactIndexSource, /function addPortableRuntimePath/);
  assert.match(currentRuntimeArtifactIndexSource, /function collectEntrypointRuntimePaths/);
  assert.match(currentRuntimeArtifactIndexSource, /function collectManifestRuntimeFiles/);
  assert.match(currentRuntimeArtifactIndexSource, /Array\.isArray\(value\)/);
  assert.match(currentRuntimeArtifactIndexSource, /addPortableRuntimePath\(record\.path, output\)/);
  assert.match(currentRuntimeArtifactIndexSource, /collectManifestRuntimeFiles\(runtimeManifest\.files, declared\)/);
  assert.match(currentRuntimeArtifactIndexSource, /normalized\.includes\('\.\.'\)/);
  assert.match(currentRuntimeArtifactIndexSource, /path\.isAbsolute\(normalized\)/);
  assert.match(currentRuntimeArtifactIndexSource, /startsWith\(`\$\{runtimeRoot\}\$\{path\.sep\}`\)/);
  assert.match(currentRuntimeArtifactIndexSource, /collectDeclaredRuntimeFilePaths/);
  assert.match(currentRuntimeSnapshotSource, /snapshot\.declaredFiles\.includes\(normalized\)/);
  assert.match(currentRuntimeApiSource, /function normalizeRequiredCurrentRuntimeParam/);
  assert.match(currentRuntimeApiSource, /export function getCurrentRuntimeAssetDelivery/);
  assert.match(currentRuntimeApiSource, /isPortableRuntimePath\(raw\)/);
  assert.match(currentRuntimeApiSource, /normalizeRuntimePath\(raw\)/);
  assert.match(currentRuntimeApiSource, /context\.snapshot\.artifactsByPath\[normalized\]/);
  assert.match(currentRuntimeTransportSource, /export function sendCurrentRuntimeAsset/);
  assert.match(currentRuntimeTransportSource, /getCurrentRuntimeAssetDelivery\(fileName, context\)/);
  assert.match(currentRuntimeTransportSource, /res\.sendFile\(asset\.artifact\.absolutePath\)/);
  assert.match(currentRuntimeTransportSource, /export function assetPathFromMountedRuntimeRequest/);
  assert.match(currentRuntimeTransportSource, /decodeURIComponent\(req\.path\.replace/);
});

test('current runtime snapshot service owns immutable manifest and artifact inventory', () => {
  assert.match(currentRuntimeSnapshotSource, /export type CurrentRuntimeSnapshot = Readonly/);
  assert.match(currentRuntimeSnapshotSource, /revision: number/);
  assert.match(currentRuntimeSnapshotSource, /artifactsByPath: Readonly<Record<string, CurrentRuntimeArtifact>>/);
  assert.match(currentRuntimeSnapshotSource, /Object\.freeze\(\{/);
  assert.match(currentRuntimeSnapshotSource, /function publishCurrentRuntimeSnapshot/);
  assert.match(currentRuntimeSnapshotSource, /function refreshCurrentRuntimeSnapshot/);
  assert.match(currentRuntimeSnapshotSource, /export type CurrentRuntimeSnapshotHandle = Readonly/);
  assert.match(currentRuntimeSnapshotSource, /release: \(\) => void/);
  assert.match(currentRuntimeSnapshotSource, /activeSnapshotReaders/);
  assert.match(currentRuntimeSnapshotSource, /totalSnapshotAcquires/);
  assert.match(currentRuntimeSnapshotSource, /export function acquireCurrentRuntimeSnapshot/);
  assert.match(currentRuntimeSnapshotSource, /export function withCurrentRuntimeSnapshot/);
  assert.match(currentRuntimeSnapshotSource, /export function getCurrentRuntimeSnapshotReadStats/);
  assert.doesNotMatch(currentRuntimeSnapshotSource, /export function getCurrentRuntimeSnapshot\(/);
  assert.match(currentRuntimeSnapshotSource, /export function getCurrentRuntimeArtifact/);
  assert.match(currentRuntimeArtifactIndexSource, /export function normalizeRuntimePath/);
  assert.match(currentRuntimeArtifactIndexSource, /export function buildCurrentRuntimeArtifactInventory/);
  assert.match(currentRuntimeArtifactIndexSource, /export function buildCurrentRuntimeSnapshotFingerprint/);
  assert.doesNotMatch(currentRuntimeSnapshotSource, /export function normalizeRuntimePath/);
  assert.doesNotMatch(currentRuntimeSnapshotSource, /function buildArtifactInventory/);
  assert.match(currentRuntimeApiSource, /acquireCurrentRuntimeSnapshot/);
  assert.match(currentRuntimeApiSource, /export type CurrentRuntimeApiContextHandle = Readonly/);
  assert.match(currentRuntimeApiSource, /function buildCurrentRuntimeApiContext/);
  assert.match(currentRuntimeApiSource, /function createApiContextHandle/);
  assert.match(currentRuntimeApiSource, /export function acquireCurrentRuntimeApiContext/);
  assert.match(currentRuntimeApiSource, /export function withCurrentRuntimeApiContext/);
  assert.match(currentRuntimeApiSource, /export async function withCurrentRuntimeApiContextAsync/);
  assert.match(currentRuntimeApiSource, /getRuntimeHealthSummary\(\{ snapshot \}\)/);
  assert.doesNotMatch(currentRuntimeApiSource, /getCurrentRuntimeSnapshot/);
  assert.doesNotMatch(currentRuntimeApiSource, /export function createCurrentRuntimeApiContext/);
  assert.match(currentRuntimeApiSource, /export type CurrentRuntimeApiContext/);
  assert.match(currentRuntimeApiSource, /export function getCurrentRuntimeOverview/);
  assert.match(currentRuntimeApiSource, /export function getCurrentRuntimeManifestDelivery/);
  assert.doesNotMatch(currentRuntimeApiSource, /export function getCurrentRuntimeDiagnosticsHealth/);
  assert.doesNotMatch(currentRuntimeApiSource, /export function getCurrentRuntimeDiagnosticsSummary/);
  assert.doesNotMatch(currentRuntimeApiSource, /export function getCurrentRuntimeNativeSurfaceMetrics/);
  assert.match(currentRuntimeObservabilitySource, /import \{ type CurrentRuntimeApiContext \} from '\.\/current-runtime-api\.service'/);
  assert.match(currentRuntimeObservabilitySource, /export function getCurrentRuntimeDiagnosticsHealth/);
  assert.match(currentRuntimeObservabilitySource, /export function getCurrentRuntimeDiagnosticsSummary/);
  assert.match(currentRuntimeObservabilitySource, /export function getCurrentRuntimeNativeSurfaceMetrics/);
  assert.match(routeSource, /current-runtime-observability\.service/);
  assert.match(currentRuntimeTransportSource, /export type CurrentRuntimeJsonEnvelope = Readonly/);
  assert.match(currentRuntimeTransportSource, /export function createCurrentRuntimeEnvelope/);
  assert.match(currentRuntimeTransportSource, /export function sendCurrentRuntimeJson/);
  assert.match(currentRuntimeTransportSource, /export function sendCurrentRuntimeNoStoreJson/);
  assert.match(currentRuntimeTransportSource, /export function sendCurrentRuntimeManifest/);
  assert.match(currentRuntimeTransportSource, /export function sendCurrentRuntimeAsset/);
  assert.match(currentRuntimeTransportSource, /export function sendCurrentRuntimeReport/);
  assert.match(currentRuntimeTransportSource, /setNoStoreHeaders/);
  assert.match(currentRuntimeTransportSource, /setStaticAssetCacheHeaders/);
  assert.match(currentRuntimeTransportSource, /resolveCurrentRuntimeReport/);
  assert.doesNotMatch(routeSource, /function sendOk/);
  assert.doesNotMatch(routeSource, /getCurrentRuntimeAssetDelivery/);
  assert.doesNotMatch(routeSource, /getCurrentRuntimeManifestDelivery/);
  assert.doesNotMatch(routeSource, /resolveCurrentRuntimeReport/);
  assert.doesNotMatch(routeSource, /setNoStoreHeaders/);
  assert.doesNotMatch(routeSource, /setStaticAssetCacheHeaders/);
  assert.match(routeSource, /withCurrentRuntimeApiContext/);
  assert.match(routeSource, /withCurrentRuntimeApiContextAsync/);
  assert.match(routeSource, /sendCurrentRuntimeNoStoreJson/);
  assert.match(routeSource, /sendCurrentRuntimeManifest/);
  assert.match(routeSource, /sendCurrentRuntimeAsset/);
  assert.match(routeSource, /sendCurrentRuntimeReport/);
  assert.doesNotMatch(routeSource, /createCurrentRuntimeApiContext/);
  assert.doesNotMatch(routeSource, /function getCurrentMeta/);
  assert.doesNotMatch(routeSource, /getCurrentRuntimeSnapshot/);
  assert.doesNotMatch(routeSource, /function getDeclaredRuntimeFilePaths/);
  assert.doesNotMatch(routeSource, /function resolveRuntimeFile/);
  assert.doesNotMatch(routeSource, /context\.snapshot\.artifactsByPath/);

  const assetIndex = currentRuntimeTransportSource.indexOf('function sendCurrentRuntimeAsset');
  assert.notEqual(assetIndex, -1, 'sendCurrentRuntimeAsset must exist');
  const assetBody = currentRuntimeTransportSource.slice(assetIndex, currentRuntimeTransportSource.indexOf('\n}', assetIndex) + 2);
  assert.doesNotMatch(assetBody, /fs\.statSync/);
  assert.doesNotMatch(assetBody, /fs\.existsSync/);
});

test('runtime delivery API exposes immutable ETag asset contracts and report allowlist', () => {
  assert.match(currentRuntimeApiSource, /createWeakEtag/);
  assert.match(currentRuntimeTransportSource, /setStaticAssetCacheHeaders/);
  assert.match(currentRuntimeTransportSource, /IMMUTABLE_RUNTIME_ASSET_CACHE/);
  assert.match(currentRuntimeTransportSource, /immutable:\s*true/);
  assert.match(currentRuntimeTransportSource, /res\.setHeader\('ETag'/);
  assert.match(routeSource, /sendCurrentRuntimeNoStoreJson\(res, getCurrentRuntimeOverview\(context\), context\)/, 'current runtime pointer must remain no-store');
  assert.match(currentRuntimeTransportSource, /setNoStoreHeaders\(res\);\s*\n\s*sendCurrentRuntimeJson\(res, data, context\)/, 'no-store envelope must be centralized in current runtime transport');
  assert.match(currentRuntimeApiSource, /runtimeId: meta\.runtimeId/);
  assert.match(currentRuntimeTransportSource, /resolveCurrentRuntimeReport\(reportName\)/);
  assert.match(currentRuntimeTransportSource, /res\.sendFile\(report\.absolutePath\)/);
  assert.doesNotMatch(routeSource, /const allowedReports/);
  assert.doesNotMatch(routeSource, /function resolveRuntimeReport/);
  assert.doesNotMatch(routeSource, /fs\.existsSync/);
  assert.doesNotMatch(routeSource, /fs\.statSync/);
  assert.doesNotMatch(routeSource, /res\.sendFile/);
  assert.doesNotMatch(routeSource, /res\.setHeader\('ETag'/);
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
  assert.doesNotMatch(currentRuntimeTransportSource, /[A-Za-z]:\\\\/);
  assert.doesNotMatch(currentRuntimeTransportSource, /E:\\\\codex/);
  assert.doesNotMatch(currentRuntimeApiSource, /[A-Za-z]:\\\\/);
  assert.doesNotMatch(currentRuntimeApiSource, /E:\\\\codex/);
  assert.doesNotMatch(currentRuntimeObservabilitySource, /[A-Za-z]:\\\\/);
  assert.doesNotMatch(currentRuntimeObservabilitySource, /E:\\\\codex/);
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
  assert.match(currentRuntimeEndpointRegistrySource, /path: '\/recipes\/page\/:recipePageId\(\*\)'/);

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


test('dynamic sqlite read namespaces and lab bucket are retired from production /api', () => {
  const appSource = fs.readFileSync('src/app.ts', 'utf8');
  const publishAdminRoutesSource = fs.readFileSync('src/routes/publish-admin.routes.ts', 'utf8');
  const adminControlPlaneSource = fs.readFileSync('src/routes/runtime-admin-control-plane.routes.ts', 'utf8');
  assert.doesNotMatch(namespaceSource, /resolveAccelerationCompilerAuthority|externalRuntimeAuthority/);
  assert.match(namespaceSource, /publicRuntimeOnly: options\.publicRuntimeOnly/);
  assert.doesNotMatch(namespaceRegistrySource, /export const LAB_CONTROL_NAMESPACES/);
  assert.doesNotMatch(namespaceRegistrySource, /tier: 'lab-control'/);
  assert.doesNotMatch(namespaceRegistrySource, /dev-compat|DEV_COMPAT_NAMESPACES/);
  assert.doesNotMatch(namespaceRegistrySource, /export const LEGACY_COMPAT_NAMESPACES/);
  assert.doesNotMatch(namespaceRegistrySource, /legacy-compat/);
  assert.doesNotMatch(namespaceRegistrySource, /labItems|labRecipes|labRecipeBootstrap/);
  assert.doesNotMatch(namespaceRegistrySource, /mountPath: '\/lab(?:\/|')/);
  assert.doesNotMatch(namespaceRegistrySource, /mountPath: '\/api\/recipes-indexed'/);
  assert.doesNotMatch(namespaceRegistrySource, /mountPath: '\/api\/recipe-bootstrap'/);
  assert.match(appSource, /registerRuntimeAdminControlPlaneRoutes\(/);
  assert.match(adminControlPlaneSource, /prefix:\s*'\/ops'/);
  assert.match(adminControlPlaneSource, /prefix:\s*'\/api\/admin'/);
  assert.match(adminControlPlaneSource, /router\.use\('\/patterns', patternsRoutes\)/);
  assert.match(adminControlPlaneSource, /router\.use\('\/render-contract', renderContractRoutes\)/);
  assert.match(adminControlPlaneSource, /router\.use\('\/publish', createPublishAdminRouter\(\)\)/);
  assert.match(publishAdminRoutesSource, /createPublishAdminRouter/);
});

test('v1 runtime contracts advertise ops/admin control diagnostics, not legacy sqlite read routes', () => {
  const v1Source = fs.readFileSync('src/routes/v1.routes.ts', 'utf8');
  const runtimeContractIndexSource = fs.readFileSync('src/services/runtime-contract-index.service.ts', 'utf8');
  assert.doesNotMatch(v1Source, /resolveAccelerationCompilerAuthority|externalRuntimeAuthority|legacyApiBase/);
  assert.match(v1Source, /getApiV1RuntimeContractIndex\(\)/);
  assert.doesNotMatch(v1Source, /control: \{/);
  assert.match(runtimeContractIndexSource, /const RUNTIME_CONTROL_ENDPOINTS = Object\.freeze/);
  assert.match(runtimeContractIndexSource, /patterns: '\/ops\/patterns'/);
  assert.match(runtimeContractIndexSource, /publish: '\/ops\/publish'/);
  assert.match(runtimeContractIndexSource, /renderContract: '\/ops\/render-contract'/);
  assert.doesNotMatch(v1Source, /\/lab\//);
  assert.doesNotMatch(runtimeContractIndexSource, /\/lab\//);
  assert.doesNotMatch(v1Source, /\/api\/recipes-indexed/);
  assert.doesNotMatch(v1Source, /\/api\/recipe-bootstrap/);
  assert.doesNotMatch(v1Source, /compatibility: \{/);
});
