import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readBackendSource = (relativePath) => fs.readFileSync(path.join(backendRoot, relativePath), 'utf8');

const routeSource = readBackendSource('src/routes/current-api.routes.ts');
const namespaceSource = readBackendSource('src/routes/api-namespaces.routes.ts');
const namespaceRegistrySource = readBackendSource('src/routes/api-namespace-registry.ts');
const currentRuntimeEndpointRegistrySource = readBackendSource('src/routes/current-runtime-endpoint-registry.ts');
const currentRuntimeEndpointHandlersSource = readBackendSource('src/routes/current-runtime-endpoint-handlers.ts');
const currentRuntimeTransportSource = readBackendSource('src/routes/current-runtime-transport.ts');
const currentRuntimeTransportAbiSource = readBackendSource('src/routes/current-runtime-transport-abi.ts');
const currentRuntimeSnapshotSource = readBackendSource('src/services/current-runtime-snapshot.service.ts');
const currentRuntimeArtifactIndexSource = readBackendSource('src/services/current-runtime-artifact-index.service.ts');
const currentRuntimeApiSource = readBackendSource('src/services/current-runtime-api.service.ts');
const currentRuntimeApiAbiSource = readBackendSource('src/services/current-runtime-api-abi.ts');
const currentRuntimeObservabilitySource = readBackendSource('src/services/current-runtime-observability.service.ts');
const currentRuntimeRecipeApiSource = readBackendSource('src/services/current-runtime-recipe-api.service.ts');
const currentRuntimeReportRegistryAbiSource = readBackendSource('src/services/current-runtime-report-registry-abi.ts');
const currentRuntimeReportRegistrySource = readBackendSource('src/services/current-runtime-report-registry.service.ts');
const currentRuntimeReadSource = readBackendSource('src/services/current-runtime-read.service.ts');
const currentRuntimeSettingsSource = readBackendSource('src/services/current-runtime-settings.service.ts');
const currentRuntimeSettingsAbiSource = readBackendSource('src/services/current-runtime-settings-abi.ts');
const currentRuntimeSpecialDataSource = readBackendSource('src/services/current-runtime-special-data.service.ts');

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
  assert.match(currentRuntimeEndpointRegistrySource, /export const CURRENT_RUNTIME_ENDPOINTS/);
  assert.match(currentRuntimeEndpointRegistrySource, /CURRENT_RUNTIME_ENDPOINT_KEYS/);
  assert.match(currentRuntimeEndpointRegistrySource, /validateAndFreezeRouteDescriptors/);
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
  assert.equal(currentRuntimeApiSource.includes("CURRENT_RUNTIME_API_SCHEMA"), true);
  assert.equal(currentRuntimeApiSource.includes('schemaRevision: CURRENT_RUNTIME_API_SCHEMA_REVISION'), true);
  assert.equal(currentRuntimeApiAbiSource.includes("CURRENT_RUNTIME_API_SCHEMA = 'neonei/api/current'"), true);
  assert.equal(currentRuntimeApiSource.includes('capabilities'), true);
  assert.equal(currentRuntimeApiSource.includes('manifestUrl: CURRENT_RUNTIME_API_URLS.currentManifest'), true);
  assert.equal(currentRuntimeApiSource.includes('assetBaseUrl: CURRENT_RUNTIME_API_URLS.currentAssetBase'), true);
  assert.equal(currentRuntimeApiSource.includes('runtimeSchemaRevision'), true);
  assert.equal(currentRuntimeApiSource.includes('runtimeManifestUrl'), true);
  assert.equal(currentRuntimeApiSource.includes('runtimeAssetBaseUrl'), true);
  assert.equal(currentRuntimeApiSource.includes('legacyManifestUrl'), false);
  assert.doesNotMatch(currentRuntimeApiSource, /\/api\/native-runtime\/current/);
  assert.equal(currentRuntimeApiSource.includes('function assertCurrentRuntimeId'), true);
  assert.equal(currentRuntimeTransportSource.includes('function sendCurrentRuntimeReport'), true);
  assert.match(routeSource, /getCurrentRuntimeEndpointHandler\(endpoint\.key\)/);
  assert.doesNotMatch(routeSource, /from '\.\.\/services\//);
  assert.equal(currentRuntimeEndpointHandlersSource.includes('function sendDiagnosticsHealth'), true);
  assert.equal(currentRuntimeEndpointHandlersSource.includes('function sendDiagnosticsRuntimeSummary'), true);
  assert.equal(currentRuntimeEndpointHandlersSource.includes('function sendRuntimeSettings'), true);
  assert.equal(currentRuntimeEndpointHandlersSource.includes('function sendGTDiagramsOverview'), true);
  assert.equal(currentRuntimeEndpointHandlersSource.includes('function sendForestryGeneticsOverview'), true);
  assert.equal(currentRuntimeEndpointHandlersSource.includes('function sendMultiblockBlueprint'), true);
  assert.match(currentRuntimeEndpointHandlersSource, /current-runtime-read\.service/);
  assert.doesNotMatch(currentRuntimeEndpointHandlersSource, /current-runtime-settings\.service/);
  assert.doesNotMatch(currentRuntimeEndpointHandlersSource, /current-runtime-special-data\.service/);
  assert.doesNotMatch(currentRuntimeEndpointHandlersSource, /current-runtime-recipe-api\.service/);
  assert.doesNotMatch(currentRuntimeEndpointHandlersSource, /current-runtime-observability\.service/);
  assert.equal(currentRuntimeReadSource.includes('getCurrentRuntimeSettings()'), true);
  assert.equal(currentRuntimeReadSource.includes('getCurrentRuntimeGTDiagramsOverview()'), true);
  assert.equal(currentRuntimeReadSource.includes('getCurrentRuntimeForestryGeneticsOverview()'), true);
  assert.equal(currentRuntimeReadSource.includes('getCurrentRuntimeMultiblockBlueprint(controllerItemIdParam)'), true);
  assert.equal(currentRuntimeSpecialDataSource.includes("from './gt-diagrams.service'"), true);
  assert.equal(currentRuntimeSpecialDataSource.includes("from './forestry-genetics.service'"), true);
  assert.equal(currentRuntimeSpecialDataSource.includes("from './multiblocks.service'"), true);
  assert.equal(currentRuntimeSettingsSource.includes('CURRENT_RUNTIME_SETTINGS_STATIC'), true);
  assert.equal(currentRuntimeSettingsAbiSource.includes("allowDomGridFallback: false"), true);
  assert.equal(currentRuntimeSettingsAbiSource.includes("allowPerItemImageHotLoad: false"), true);
  assert.equal(currentRuntimeSettingsAbiSource.includes('NEONEI_DEBUG_PANELS'), true);
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
  assert.match(currentRuntimeReadSource, /current-runtime-observability\.service/);
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
  assert.doesNotMatch(routeSource, /withCurrentRuntimeApiContext/);
  assert.match(currentRuntimeEndpointHandlersSource, /withCurrentRuntimeApiContext/);
  assert.match(currentRuntimeEndpointHandlersSource, /withCurrentRuntimeApiContextAsync/);
  assert.match(currentRuntimeEndpointHandlersSource, /sendCurrentRuntimeNoStoreJson/);
  assert.match(currentRuntimeEndpointHandlersSource, /sendCurrentRuntimeManifest/);
  assert.match(currentRuntimeEndpointHandlersSource, /sendCurrentRuntimeAsset/);
  assert.match(currentRuntimeEndpointHandlersSource, /sendCurrentRuntimeReport/);
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
  assert.match(currentRuntimeTransportSource, /CURRENT_RUNTIME_IMMUTABLE_ASSET_CACHE/);
  assert.match(currentRuntimeTransportAbiSource, /immutable:\s*true/);
  assert.match(currentRuntimeTransportSource, /res\.setHeader\('ETag'/);
  assert.match(currentRuntimeEndpointHandlersSource, /sendCurrentRuntimeNoStoreJson\(res, getCurrentRuntimeOverviewPayload\(context\), context\)/, 'current runtime pointer must remain no-store');
  assert.match(currentRuntimeReadSource, /getCurrentRuntimeOverview\(context\)/, 'read service must own current runtime overview payload selection');
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
  assert.match(currentRuntimeReportRegistryAbiSource, /CURRENT_RUNTIME_REPORT_DESCRIPTORS/);
  assert.match(currentRuntimeReportRegistrySource, /CURRENT_RUNTIME_REPORTS_BY_SLUG/);
  assert.match(currentRuntimeReportRegistrySource, /export function resolveCurrentRuntimeReport/);
  assert.match(currentRuntimeReportRegistrySource, /resolveDistDataRuntimeFile\(descriptor\.path\)/);
  assert.match(currentRuntimeReportRegistrySource, /relativePath: descriptor\.path/);
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
    assert.equal(currentRuntimeReportRegistryAbiSource.includes(`'${report}'`), true, `missing report allowlist entry ${report}`);
  }
  assert.match(currentRuntimeReportRegistrySource, /!CURRENT_RUNTIME_REPORT_SLUG_PATTERN\.test\(normalized\)/, 'report names must be simple slugs');
  assert.match(currentRuntimeReportRegistrySource, /throw notFound\(CURRENT_RUNTIME_REPORT_ERRORS\.reportNotAllowed\)/);
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
  assert.doesNotMatch(currentRuntimeReadSource, /[A-Za-z]:\\\\/);
  assert.doesNotMatch(currentRuntimeReadSource, /E:\\\\codex/);
  assert.doesNotMatch(currentRuntimeSettingsSource, /[A-Za-z]:\\\\/);
  assert.doesNotMatch(currentRuntimeSettingsSource, /E:\\\\codex/);
  assert.doesNotMatch(currentRuntimeApiSource, /assetBaseUrl:\s*['"](?:[A-Za-z]:|\\\\|\/runtime\/)/);
  assert.match(currentRuntimeApiSource, /assetBaseUrl:\s*CURRENT_RUNTIME_API_URLS\.currentAssetBase/);
  assert.match(currentRuntimeApiSource, /runtimeAssetBaseUrl:\s*buildPinnedRuntimeAssetBaseUrl\(meta\.runtimeId\)/);
  assert.doesNotMatch(currentRuntimeSettingsSource, /assetBaseUrl:\s*['"](?:[A-Za-z]:|\\\\|\/runtime\/)/);
  assert.match(currentRuntimeSettingsSource, /CURRENT_RUNTIME_SETTINGS_STATIC/);
  assert.match(currentRuntimeSettingsAbiSource, /assetBaseUrl:\s*'\/api\/runtime\/current\/asset\/'/);
});

test('recipe page API exposes low-frequency page details without browser hot-path ownership', () => {
  assert.equal(currentRuntimeEndpointHandlersSource.includes('function sendRecipePage'), true);
  assert.equal(currentRuntimeEndpointHandlersSource.includes('getCurrentRuntimeRecipePagePayload(recipePageIdParam)'), true);
  assert.equal(currentRuntimeReadSource.includes('getCurrentRecipePage(recipePageIdParam)'), true);
  assert.equal(currentRuntimeRecipeApiSource.includes('getRecipePageById(recipePageId)'), true);
  assert.equal(currentRuntimeRecipeApiSource.includes("throw notFound('Recipe page not found')"), true);
  assert.match(currentRuntimeEndpointRegistrySource, /path: '\/recipes\/page\/:recipePageId\(\*\)'/);

  const serviceSource = readBackendSource('src/services/recipes-indexed.service.ts');
  assert.match(serviceSource, /async getRecipePageById\(recipePageId: string\)/);
  assert.match(serviceSource, /const recipe = await this\.getRecipeById\(normalizedRecipePageId\)/);
  assert.match(serviceSource, /uiPayload/);
  assert.doesNotMatch(currentRuntimeEndpointHandlersSource, /images\/item/, 'recipe page endpoint handlers must not advertise scattered item image paths');
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
  const pageIndex = currentRuntimeEndpointHandlersSource.indexOf('async function sendRecipePage');
  assert.notEqual(pageIndex, -1, 'sendRecipePage must exist');
  const pageBody = currentRuntimeEndpointHandlersSource.slice(pageIndex, currentRuntimeEndpointHandlersSource.indexOf('\n}', pageIndex) + 2);
  assert.match(pageBody, /getCurrentRuntimeRecipePagePayload\(recipePageIdParam\)/, 'sendRecipePage must delegate runtime recipe authority');
  assert.match(currentRuntimeReadSource, /getCurrentRecipePage\(recipePageIdParam\)/, 'read service must delegate runtime recipe authority');
});


test('dynamic sqlite read namespaces and lab bucket are retired from production /api', () => {
  const appSource = readBackendSource('src/app.ts');
  const publishAdminRoutesSource = readBackendSource('src/routes/publish-admin.routes.ts');
  const adminControlPlaneSource = readBackendSource('src/routes/runtime-admin-control-plane.routes.ts');
  const adminControlPlaneRegistrySource = readBackendSource('src/routes/runtime-admin-control-plane-registry.ts');
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
  assert.match(adminControlPlaneSource, /RUNTIME_ADMIN_CONTROL_PLANES/);
  assert.match(adminControlPlaneSource, /RUNTIME_ADMIN_CONTROL_PLANE_SUBSYSTEMS/);
  assert.match(adminControlPlaneRegistrySource, /prefix:\s*'\/ops'/);
  assert.match(adminControlPlaneRegistrySource, /prefix:\s*'\/api\/admin'/);
  assert.match(adminControlPlaneRegistrySource, /mountPath:\s*'\/patterns'/);
  assert.match(adminControlPlaneRegistrySource, /mountPath:\s*'\/render-contract'/);
  assert.match(adminControlPlaneRegistrySource, /mountPath:\s*'\/publish'/);
  assert.match(publishAdminRoutesSource, /createPublishAdminRouter/);
});

test('v1 runtime contracts advertise ops/admin control diagnostics, not legacy sqlite read routes', () => {
  const v1Source = readBackendSource('src/routes/v1.routes.ts');
  const v1RegistrySource = readBackendSource('src/routes/v1-endpoint-registry.ts');
  const v1HandlerSource = readBackendSource('src/routes/v1-endpoint-handlers.ts');
  const runtimeContractIndexSource = readBackendSource('src/services/runtime-contract-index.service.ts');
  assert.doesNotMatch(v1Source, /resolveAccelerationCompilerAuthority|externalRuntimeAuthority|legacyApiBase/);
  assert.match(v1Source, /API_V1_ENDPOINTS/);
  assert.match(v1Source, /API_V1_ENDPOINT_HANDLERS/);
  assert.match(v1RegistrySource, /path: '\/runtime\/contracts'/);
  assert.match(v1HandlerSource, /getApiV1RuntimeContractIndex\(\)/);
  assert.doesNotMatch(v1HandlerSource, /control: \{/);
  assert.match(runtimeContractIndexSource, /RUNTIME_CONTROL_ENDPOINT_KEYS/);
  assert.match(runtimeContractIndexSource, /validateAndProjectContractMap/);
  assert.match(runtimeContractIndexSource, /contractMapDescriptor\('patterns', '\/ops\/patterns'\)/);
  assert.match(runtimeContractIndexSource, /contractMapDescriptor\('publish', '\/ops\/publish'\)/);
  assert.match(runtimeContractIndexSource, /contractMapDescriptor\('renderContract', '\/ops\/render-contract'\)/);
  assert.doesNotMatch(v1Source, /\/lab\//);
  assert.doesNotMatch(v1RegistrySource, /\/lab\//);
  assert.doesNotMatch(v1HandlerSource, /\/lab\//);
  assert.doesNotMatch(runtimeContractIndexSource, /\/lab\//);
  assert.doesNotMatch(v1Source, /\/api\/recipes-indexed/);
  assert.doesNotMatch(v1Source, /\/api\/recipe-bootstrap/);
  assert.doesNotMatch(v1RegistrySource, /\/api\/recipes-indexed/);
  assert.doesNotMatch(v1RegistrySource, /\/api\/recipe-bootstrap/);
  assert.doesNotMatch(v1HandlerSource, /compatibility: \{/);
});
