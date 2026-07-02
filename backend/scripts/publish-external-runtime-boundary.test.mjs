import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const publishRouteSource = fs.readFileSync('src/routes/publish.routes.ts', 'utf8').replace(/\r\n/g, '\n');
const publishEndpointRegistrySource = fs.readFileSync('src/routes/publish-public-endpoint-registry.ts', 'utf8').replace(/\r\n/g, '\n');
const publishDeliverySource = fs.readFileSync('src/services/publish-runtime-delivery.service.ts', 'utf8').replace(/\r\n/g, '\n');
const namespaceRegistrySource = fs.readFileSync('src/routes/api-namespace-registry.ts', 'utf8').replace(/\r\n/g, '\n');
const appSource = fs.readFileSync('src/app.ts', 'utf8').replace(/\r\n/g, '\n');
const adminControlPlaneSource = fs.readFileSync('src/routes/runtime-admin-control-plane.routes.ts', 'utf8').replace(/\r\n/g, '\n');
const publishAdminRouteSource = fs.readFileSync('src/routes/publish-admin.routes.ts', 'utf8').replace(/\r\n/g, '\n');
const publishAdminEndpointRegistrySource = fs.readFileSync('src/routes/publish-admin-endpoint-registry.ts', 'utf8').replace(/\r\n/g, '\n');
const httpSource = fs.readFileSync('src/utils/http.ts', 'utf8').replace(/\r\n/g, '\n');

test('external-runtime publish home bootstrap is materialized-bundle only', () => {
  assert.match(publishDeliverySource, /resolveAccelerationCompilerAuthority/);
  assert.match(publishDeliverySource, /function isExternalRuntimeAuthority\(\)/);
  assert.match(publishDeliverySource, /shouldUseMaterializedHomeBootstrap = query\.page === 1/);
  assert.match(publishDeliverySource, /getPublishPayloadService\(\)\.getHomeBootstrapWindow/);
  assert.match(publishDeliverySource, /if \(isExternalRuntimeAuthority\(\)\) \{/);
  assert.match(publishDeliverySource, /EXTERNAL_RUNTIME_PUBLISH_BUNDLE_REQUIRED/);
  assert.match(publishDeliverySource, /dynamic SQLite fallback is disabled/);

  const materializedIndex = publishDeliverySource.indexOf('const materialized = readMaterializedHomeBootstrap');
  const gateIndex = publishDeliverySource.indexOf('if (isExternalRuntimeAuthority()) {');
  const dynamicIndex = publishDeliverySource.indexOf('return buildDynamicHomeBootstrap(manifest, query)');
  assert.notEqual(materializedIndex, -1, 'materialized home bootstrap path must exist');
  assert.notEqual(gateIndex, -1, 'external-runtime gate must exist');
  assert.notEqual(dynamicIndex, -1, 'internal dynamic path may remain after the gate');
  assert.equal(materializedIndex < gateIndex, true, 'materialized bundle must be attempted before fail-closed gate');
  assert.equal(gateIndex < dynamicIndex, true, 'external-runtime must fail before ItemsService dynamic fallback');

  assert.doesNotMatch(publishRouteSource, /resolveAccelerationCompilerAuthority|EXTERNAL_RUNTIME_PUBLISH_BUNDLE_REQUIRED/);
});

test('publish control is token-protected ops/admin plane while public api is read-only', () => {
  assert.match(namespaceRegistrySource, /import \{ publicPublishRoutes \} from '\.\/publish\.routes'/);
  assert.match(namespaceRegistrySource, /mountPath: '\/api\/publish'[\s\S]*handler: publicPublishRoutes/);
  assert.doesNotMatch(namespaceRegistrySource, /labPublishRoutes|\/lab\/publish/);
  assert.match(appSource, /registerRuntimeAdminControlPlaneRoutes\(app/);
  assert.match(adminControlPlaneSource, /prefix:\s*'\/ops'/);
  assert.match(adminControlPlaneSource, /prefix:\s*'\/api\/admin'/);
  assert.match(adminControlPlaneSource, /router\.use\('\/publish', createPublishAdminRouter\(\)\)/);
  assert.match(adminControlPlaneSource, /createRuntimeAdminTokenMiddleware\(requireAdminToken\)/);
  assert.doesNotMatch(publishAdminRouteSource, /withRuntimeAdminToken|RuntimeAdminTokenGuard/);
});

test('http utilities expose explicit service unavailable error contracts', () => {
  assert.match(httpSource, /export function serviceUnavailable/);
  assert.match(httpSource, /statusCode = 503/);
  assert.match(httpSource, /code = 'SERVICE_UNAVAILABLE'/);
});


test('publish route factory keeps release control out of public read routes', () => {
  assert.doesNotMatch(publishRouteSource, /PublishRoutesMode|registerLabControlRoutes|labPublishRoutes/);
  assert.match(publishRouteSource, /export const publicPublishRoutes = createPublishRoutes\(\)/);
  assert.match(publishAdminRouteSource, /export function createPublishAdminRouter\(\): Router/);
  assert.match(publishAdminEndpointRegistrySource, /path: '\/releases'/);
  assert.match(publishAdminEndpointRegistrySource, /path: '\/releases\/:sourceSignature\/activate'/);
  assert.match(publishEndpointRegistrySource, /path: '\/manifest'/);
  assert.match(publishEndpointRegistrySource, /path: '\/home-bootstrap'/);

  const publicReadIndex = publishRouteSource.indexOf('function registerPublicReadRoutes');
  assert.notEqual(publicReadIndex, -1, 'public read route registrar must exist');
  const publicReadBody = publishRouteSource.slice(publicReadIndex);
  assert.doesNotMatch(publicReadBody, /'\/releases\/:sourceSignature\/activate'/);
});
