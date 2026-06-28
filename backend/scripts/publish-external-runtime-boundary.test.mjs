import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const publishRouteSource = fs.readFileSync('src/routes/publish.routes.ts', 'utf8').replace(/\r\n/g, '\n');
const namespaceSource = fs.readFileSync('src/routes/api-namespaces.routes.ts', 'utf8').replace(/\r\n/g, '\n');
const httpSource = fs.readFileSync('src/utils/http.ts', 'utf8').replace(/\r\n/g, '\n');

test('external-runtime publish home bootstrap is materialized-bundle only', () => {
  assert.match(publishRouteSource, /resolveAccelerationCompilerAuthority/);
  assert.match(publishRouteSource, /function isExternalRuntimeAuthority\(\)/);
  assert.match(publishRouteSource, /shouldUseMaterializedHomeBootstrap = page === 1/);
  assert.match(publishRouteSource, /getPublishPayloadService\(\)\.getHomeBootstrapWindow/);
  assert.match(publishRouteSource, /if \(isExternalRuntimeAuthority\(\)\) \{/);
  assert.match(publishRouteSource, /EXTERNAL_RUNTIME_PUBLISH_BUNDLE_REQUIRED/);
  assert.match(publishRouteSource, /dynamic SQLite fallback is disabled/);

  const materializedIndex = publishRouteSource.indexOf('const shouldUseMaterializedHomeBootstrap');
  const gateIndex = publishRouteSource.indexOf('if (isExternalRuntimeAuthority()) {');
  const dynamicIndex = publishRouteSource.indexOf('const [mods, pagePack] = await Promise.all');
  assert.notEqual(materializedIndex, -1, 'materialized home bootstrap path must exist');
  assert.notEqual(gateIndex, -1, 'external-runtime gate must exist');
  assert.notEqual(dynamicIndex, -1, 'lab/internal dynamic path may remain after the gate');
  assert.equal(materializedIndex < gateIndex, true, 'materialized bundle must be attempted before fail-closed gate');
  assert.equal(gateIndex < dynamicIndex, true, 'external-runtime must fail before ItemsService dynamic fallback');
});

test('publish route namespace keeps lab diagnostics while public api is guarded', () => {
  assert.match(namespaceSource, /app\.use\('\/lab\/publish', publishRoutes\)/);
  assert.match(namespaceSource, /app\.use\('\/api\/publish', tagApiTier\('public-runtime'\), publishRoutes\)/);
});

test('http utilities expose explicit service unavailable error contracts', () => {
  assert.match(httpSource, /export function serviceUnavailable/);
  assert.match(httpSource, /statusCode = 503/);
  assert.match(httpSource, /code = 'SERVICE_UNAVAILABLE'/);
});
