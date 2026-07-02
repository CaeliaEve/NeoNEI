import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const publishRouteSource = readFileSync(resolve(root, 'src/routes/publish.routes.ts'), 'utf8');
const publishHandlerSource = readFileSync(resolve(root, 'src/routes/publish-public-endpoint-handlers.ts'), 'utf8');
const deliverySource = readFileSync(resolve(root, 'src/services/publish-runtime-delivery.service.ts'), 'utf8');

test('publish manifest and home-bootstrap delivery policy are service-owned', () => {
  assert.match(deliverySource, /import \{ createWeakEtag \} from '\.\.\/utils\/http-cache'/);
  assert.match(deliverySource, /getPublishManifestService\(\)\.getRuntimeManifest\(\)/);
  assert.match(deliverySource, /function normalizeHomeBootstrapQuery/);
  assert.match(deliverySource, /function createPublishManifestEtag/);
  assert.match(deliverySource, /function createHomeBootstrapEtag/);
  assert.match(deliverySource, /'publish-manifest'/);
  assert.match(deliverySource, /'publish-home-bootstrap'/);
  assert.match(deliverySource, /manifest\.runtimeCacheKey/);
  assert.match(deliverySource, /export function getPublishManifestDelivery/);
  assert.match(deliverySource, /export function createPublishHomeBootstrapDelivery/);

  assert.match(publishHandlerSource, /getPublishManifestDelivery\(\)/);
  assert.match(publishHandlerSource, /createPublishHomeBootstrapDelivery\(req\.query\)/);
  assert.match(publishHandlerSource, /sendNotModifiedIfEtagMatches\(req, res, delivery\.etag\)/);
  assert.match(publishHandlerSource, /res\.json\(delivery\.payload\)/);
  assert.match(publishHandlerSource, /res\.json\(await delivery\.loadPayload\(\)\)/);

  for (const routeLocalPolicy of [
    /getPublishManifestService/,
    /getPublishPayloadService/,
    /derivePagePackFromWindow/,
    /createWeakEtag/,
    /new ItemsService/,
    /resolveAccelerationCompilerAuthority/,
    /attachRenderHintsToEntries/,
    /buildBrowserRichMediaManifest/,
    /serviceUnavailable/,
    /EXTERNAL_RUNTIME_PUBLISH_BUNDLE_REQUIRED/,
    /parseInt\(req\.query/,
    /shouldUseMaterializedHomeBootstrap/,
    /dynamic SQLite fallback is disabled/,
  ]) {
    assert.doesNotMatch(publishRouteSource, routeLocalPolicy);
  }
});

test('publish home-bootstrap keeps materialized-first and external-runtime fail-closed in delivery service', () => {
  assert.match(deliverySource, /function readMaterializedHomeBootstrap/);
  assert.match(deliverySource, /shouldUseMaterializedHomeBootstrap = query\.page === 1/);
  assert.match(deliverySource, /getPublishPayloadService\(\)\.getHomeBootstrapWindow/);
  assert.match(deliverySource, /derivePagePackFromWindow\(materialized\.pagePack, 1, query\.pageSize\)/);
  assert.match(deliverySource, /function isExternalRuntimeAuthority\(\)/);
  assert.match(deliverySource, /resolveAccelerationCompilerAuthority\(\) === 'external-runtime'/);
  assert.match(deliverySource, /if \(isExternalRuntimeAuthority\(\)\) \{/);
  assert.match(deliverySource, /EXTERNAL_RUNTIME_PUBLISH_BUNDLE_REQUIRED/);
  assert.match(deliverySource, /dynamic SQLite fallback is disabled/);
  assert.match(deliverySource, /itemsService\.getBrowserItems/);

  const materializedIndex = deliverySource.indexOf('const materialized = readMaterializedHomeBootstrap');
  const gateIndex = deliverySource.indexOf('if (isExternalRuntimeAuthority()) {');
  const dynamicIndex = deliverySource.indexOf('return buildDynamicHomeBootstrap(manifest, query)');
  assert.notEqual(materializedIndex, -1, 'materialized home bootstrap path must exist');
  assert.notEqual(gateIndex, -1, 'external-runtime gate must exist');
  assert.notEqual(dynamicIndex, -1, 'dynamic path may remain after the gate');
  assert.equal(materializedIndex < gateIndex, true, 'materialized bundle must be attempted before fail-closed gate');
  assert.equal(gateIndex < dynamicIndex, true, 'external-runtime must fail before ItemsService dynamic fallback');
});
