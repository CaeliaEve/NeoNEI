import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const runtimeRouteSource = readFileSync(resolve(root, 'src/routes/runtime.routes.ts'), 'utf8');
const v1RouteSource = readFileSync(resolve(root, 'src/routes/v1.routes.ts'), 'utf8');
const runtimeHandlerSource = readFileSync(resolve(root, 'src/routes/runtime-public-endpoint-handlers.ts'), 'utf8');
const v1HandlerSource = readFileSync(resolve(root, 'src/routes/v1-endpoint-handlers.ts'), 'utf8');
const deliverySource = readFileSync(resolve(root, 'src/services/runtime-manifest-delivery.service.ts'), 'utf8');
const deliveryAbiSource = readFileSync(resolve(root, 'src/services/runtime-manifest-delivery-abi.ts'), 'utf8');

test('runtime manifest ETag and contract envelope are delivery-service owned', () => {
  assert.match(deliverySource, /import \{ createWeakEtag \} from '\.\.\/utils\/http-cache'/);
  assert.match(deliverySource, /from '\.\/runtime-manifest-delivery-abi'/);
  assert.match(deliverySource, /getPublishManifestService\(\)\.getRuntimeManifest\(\)/);
  assert.match(deliveryAbiSource, /const RUNTIME_MANIFEST_DELIVERY_CONTRACTS/);
  assert.match(deliveryAbiSource, /schemaVersion: 'neonei\/runtime-manifest\/current'/);
  assert.match(deliveryAbiSource, /contractIndex: '\/runtime\/contracts'/);
  assert.match(deliveryAbiSource, /schemaVersion: 'neonei\/api-v1\/runtime-manifest\/v1'/);
  assert.match(deliveryAbiSource, /contractIndex: '\/api\/v1\/runtime\/contracts'/);
  assert.match(deliveryAbiSource, /const RUNTIME_MANIFEST_ETAG_KEYS/);
  assert.match(deliveryAbiSource, /'runtime-manifest'/);
  assert.match(deliveryAbiSource, /'v1-runtime-manifest'/);
  assert.doesNotMatch(deliverySource, /schemaVersion: 'neonei\/runtime-manifest\/current'/);
  assert.doesNotMatch(deliverySource, /contractIndex: '\/runtime\/contracts'/);
  assert.doesNotMatch(deliverySource, /schemaVersion: 'neonei\/api-v1\/runtime-manifest\/v1'/);
  assert.doesNotMatch(deliverySource, /contractIndex: '\/api\/v1\/runtime\/contracts'/);
  assert.doesNotMatch(deliverySource, /'runtime-manifest'/);
  assert.doesNotMatch(deliverySource, /'v1-runtime-manifest'/);
  assert.match(deliverySource, /function createRuntimeManifestEtag/);
  assert.match(deliverySource, /manifest\.runtimeCacheKey/);
  assert.match(deliverySource, /export function getCurrentRuntimeManifestDelivery/);
  assert.match(deliverySource, /export function getApiV1RuntimeManifestDelivery/);

  assert.match(runtimeHandlerSource, /getCurrentRuntimeManifestDelivery\(\)/);
  assert.match(v1HandlerSource, /getApiV1RuntimeManifestDelivery\(\)/);
  assert.match(runtimeHandlerSource, /sendNotModifiedIfEtagMatches\(req, res, delivery\.etag\)/);
  assert.match(v1HandlerSource, /sendNotModifiedIfEtagMatches\(req, res, delivery\.etag\)/);
  assert.match(runtimeHandlerSource, /res\.json\(delivery\.payload\)/);
  assert.match(v1HandlerSource, /res\.json\(delivery\.payload\)/);

  for (const source of [runtimeRouteSource, v1RouteSource, runtimeHandlerSource, v1HandlerSource]) {
    assert.doesNotMatch(source, /getPublishManifestService/);
    assert.doesNotMatch(source, /createWeakEtag/);
    assert.doesNotMatch(source, /runtimeCacheKey/);
    assert.doesNotMatch(source, /schemaVersion: 'neonei\/(?:api-v1\/)?runtime-manifest/);
    assert.doesNotMatch(source, /contractIndex: '\/(?:api\/v1\/)?runtime\/contracts'/);
  }
});
