import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const runtimeRouteSource = readFileSync(resolve(root, 'src/routes/runtime.routes.ts'), 'utf8');
const v1RouteSource = readFileSync(resolve(root, 'src/routes/v1.routes.ts'), 'utf8');
const deliverySource = readFileSync(resolve(root, 'src/services/runtime-manifest-delivery.service.ts'), 'utf8');

test('runtime manifest ETag and contract envelope are delivery-service owned', () => {
  assert.match(deliverySource, /import \{ createWeakEtag \} from '\.\.\/utils\/http-cache'/);
  assert.match(deliverySource, /getPublishManifestService\(\)\.getRuntimeManifest\(\)/);
  assert.match(deliverySource, /const RUNTIME_MANIFEST_DELIVERY_CONTRACTS/);
  assert.match(deliverySource, /schemaVersion: 'neonei\/runtime-manifest\/current'/);
  assert.match(deliverySource, /contractIndex: '\/runtime\/contracts'/);
  assert.match(deliverySource, /schemaVersion: 'neonei\/api-v1\/runtime-manifest\/v1'/);
  assert.match(deliverySource, /contractIndex: '\/api\/v1\/runtime\/contracts'/);
  assert.match(deliverySource, /const RUNTIME_MANIFEST_ETAG_KEYS/);
  assert.match(deliverySource, /current: 'runtime-manifest'/);
  assert.match(deliverySource, /'api-v1': 'v1-runtime-manifest'/);
  assert.match(deliverySource, /function createRuntimeManifestEtag/);
  assert.match(deliverySource, /manifest\.runtimeCacheKey/);
  assert.match(deliverySource, /export function getCurrentRuntimeManifestDelivery/);
  assert.match(deliverySource, /export function getApiV1RuntimeManifestDelivery/);

  assert.match(runtimeRouteSource, /getCurrentRuntimeManifestDelivery\(\)/);
  assert.match(v1RouteSource, /getApiV1RuntimeManifestDelivery\(\)/);
  assert.match(runtimeRouteSource, /sendNotModifiedIfEtagMatches\(req, res, delivery\.etag\)/);
  assert.match(v1RouteSource, /sendNotModifiedIfEtagMatches\(req, res, delivery\.etag\)/);
  assert.match(runtimeRouteSource, /res\.json\(delivery\.payload\)/);
  assert.match(v1RouteSource, /res\.json\(delivery\.payload\)/);

  for (const routeSource of [runtimeRouteSource, v1RouteSource]) {
    assert.doesNotMatch(routeSource, /getPublishManifestService/);
    assert.doesNotMatch(routeSource, /createWeakEtag/);
    assert.doesNotMatch(routeSource, /runtimeCacheKey/);
    assert.doesNotMatch(routeSource, /schemaVersion: 'neonei\/(?:api-v1\/)?runtime-manifest/);
    assert.doesNotMatch(routeSource, /contractIndex: '\/(?:api\/v1\/)?runtime\/contracts'/);
  }
});
