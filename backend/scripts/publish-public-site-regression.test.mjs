import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const readSource = (path) => fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

const staticRouteRegistrySource = readSource('src/routes/static-asset-route-registry.ts');
const staticDeliverySource = readSource('src/services/static-asset-delivery.service.ts');
const httpCacheSource = readSource('src/utils/http-cache.ts');
const serverSettingsSource = readSource('src/config/server-settings.ts');
const adminAccessSource = readSource('src/utils/admin-access.ts');
const runtimeAdminEndpointRegistrySource = readSource('src/routes/runtime-admin-endpoint-registry.ts');
const runtimeAdminControlPlaneRegistrySource = readSource('src/routes/runtime-admin-control-plane-registry.ts');
const runtimeAdminControlAbiSource = readSource('src/services/runtime-admin-control-abi.ts');
const runtimeAdminTransportSource = readSource('src/routes/runtime-admin-transport.ts');
const runtimeAdminReconcileExecutorSource = readSource('src/routes/runtime-admin-reconcile-executor.ts');

test('publish runtime keeps immutable assets but prevents active manifest staleness', () => {
  assert.match(staticDeliverySource, /function isPublishMutableArtifact/, 'delivery service should distinguish mutable publish artifacts');
  assert.match(staticRouteRegistrySource, /maxAge: '365d',[\s\S]*immutable: true/, 'bulk publish assets should keep long immutable caching');
  assert.match(httpCacheSource, /no-store, no-cache, must-revalidate, proxy-revalidate/, 'active manifests and build reports should force revalidation');
  assert.match(httpCacheSource, /Surrogate-Control/, 'CDN surrogate caches should be disabled for mutable publish artifacts');
});

test('admin runtime endpoints require tokens, rate limiting, structured diagnostics, and OpenAPI surface', () => {
  assert.match(serverSettingsSource, /NEONEI_ADMIN_TOKEN/, 'admin mutation endpoints should require an explicit token');
  assert.match(adminAccessSource, /function isAdminRateLimited/, 'admin routes should apply rate limiting');
  assert.match(serverSettingsSource, /export const requireAdminToken/, 'admin routes should share token validation');
  assert.match(runtimeAdminTransportSource, /createRuntimeAdminTokenMiddleware/, 'admin control plane should enforce a token middleware');
  assert.match(runtimeAdminEndpointRegistrySource, /path: '\/api\/openapi\.json'/, 'server should expose a lightweight OpenAPI document');
  assert.match(runtimeAdminControlAbiSource, /'NeoNEI Public Runtime API'/, 'OpenAPI metadata should be catalog-owned');
  assert.match(runtimeAdminControlPlaneRegistrySource, /prefix: '\/api\/admin'/, 'server should expose token-protected admin control plane');
  assert.match(runtimeAdminEndpointRegistrySource, /path: '\/runtime'/, 'admin runtime diagnostics should be descriptor-owned');
  assert.match(runtimeAdminEndpointRegistrySource, /path: '\/acceleration\/reconcile'/, 'admin rebuild reconcile endpoint should be descriptor-owned');
  assert.match(runtimeAdminReconcileExecutorSource, /logger\.info\(`\[\$\{label\}\] acceleration reconcile requested`/, 'admin mutations should be logged');
});
