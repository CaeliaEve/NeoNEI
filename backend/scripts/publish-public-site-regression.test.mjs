import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const readSource = (path) => fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

const staticRouteRegistrySource = readSource('src/routes/static-asset-route-registry.ts');
const staticDeliverySource = readSource('src/services/static-asset-delivery.service.ts');
const httpCacheSource = readSource('src/utils/http-cache.ts');
const serverSettingsSource = readSource('src/config/server-settings.ts');
const serverSettingsAbiSource = readSource('src/config/server-settings-abi.ts');
const adminAccessSource = readSource('src/utils/admin-access.ts');
const adminAccessAbiSource = readSource('src/utils/admin-access-abi.ts');
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
  assert.match(serverSettingsSource, /resolveAdminAccessGuardOptions/, 'admin guard options should come from the settings ABI catalog');
  assert.match(serverSettingsAbiSource, /NEONEI_ADMIN_TOKEN/, 'admin mutation endpoints should require an explicit token');
  assert.match(serverSettingsAbiSource, /ADMIN_TOKEN/, 'legacy admin token env should be explicitly cataloged while migration remains active');
  assert.match(serverSettingsAbiSource, /NEONEI_ADMIN_RATE_LIMIT_WINDOW_MS/, 'admin rate window env should be catalog-owned');
  assert.match(serverSettingsAbiSource, /NEONEI_ADMIN_RATE_LIMIT_MAX/, 'admin rate max env should be catalog-owned');
  assert.match(adminAccessAbiSource, /ADMIN_ACCESS_TOKEN_SOURCE_DESCRIPTORS/, 'admin token source names should be catalog-owned');
  assert.match(adminAccessAbiSource, /x-neonei-admin-token/, 'admin token header should be catalog-owned');
  assert.match(adminAccessAbiSource, /adminToken/, 'admin token query parameter should be catalog-owned');
  assert.match(adminAccessAbiSource, /ADMIN_ACCESS_ERROR_DESCRIPTORS/, 'admin access errors should be catalog-owned');
  assert.match(adminAccessAbiSource, /ADMIN_RATE_LIMITED/, 'admin rate-limit error should be catalog-owned');
  assert.match(adminAccessAbiSource, /ADMIN_TOKEN_NOT_CONFIGURED/, 'admin missing-token error should be catalog-owned');
  assert.match(adminAccessAbiSource, /ADMIN_TOKEN_REQUIRED/, 'admin unauthorized error should be catalog-owned');
  assert.match(adminAccessSource, /function isAdminRateLimited/, 'admin routes should apply rate limiting');
  assert.match(adminAccessSource, /ADMIN_ACCESS_ERRORS\.rateLimited/, 'rate-limit response should consume the catalog');
  assert.match(adminAccessSource, /getAdminAccessTokenCandidate/, 'token extraction should consume the catalog');
  assert.match(serverSettingsSource, /export const requireAdminToken/, 'admin routes should share token validation');
  for (const catalogOwnedEnvLiteral of [
    /NEONEI_ADMIN_TOKEN/,
    /ADMIN_TOKEN/,
    /NEONEI_ADMIN_RATE_LIMIT_WINDOW_MS/,
    /NEONEI_ADMIN_RATE_LIMIT_MAX/,
  ]) {
    assert.match(serverSettingsAbiSource, catalogOwnedEnvLiteral);
    assert.doesNotMatch(serverSettingsSource, catalogOwnedEnvLiteral);
  }
  for (const catalogOwnedAdminAccessLiteral of [
    /'Retry-After'/,
    /'x-neonei-admin-token'/,
    /'adminToken'/,
    /'ADMIN_RATE_LIMITED'/,
    /'ADMIN_TOKEN_NOT_CONFIGURED'/,
    /'ADMIN_TOKEN_REQUIRED'/,
    /'Admin token is required'/,
  ]) {
    assert.match(adminAccessAbiSource, catalogOwnedAdminAccessLiteral);
    assert.doesNotMatch(adminAccessSource, catalogOwnedAdminAccessLiteral);
  }
  assert.match(runtimeAdminTransportSource, /createRuntimeAdminTokenMiddleware/, 'admin control plane should enforce a token middleware');
  assert.match(runtimeAdminEndpointRegistrySource, /path: '\/api\/openapi\.json'/, 'server should expose a lightweight OpenAPI document');
  assert.match(runtimeAdminControlAbiSource, /'NeoNEI Public Runtime API'/, 'OpenAPI metadata should be catalog-owned');
  assert.match(runtimeAdminControlPlaneRegistrySource, /prefix: '\/api\/admin'/, 'server should expose token-protected admin control plane');
  assert.match(runtimeAdminEndpointRegistrySource, /path: '\/runtime'/, 'admin runtime diagnostics should be descriptor-owned');
  assert.match(runtimeAdminEndpointRegistrySource, /path: '\/acceleration\/reconcile'/, 'admin rebuild reconcile endpoint should be descriptor-owned');
  assert.match(runtimeAdminReconcileExecutorSource, /logger\.info\(`\[\$\{label\}\] acceleration reconcile requested`/, 'admin mutations should be logged');
});
