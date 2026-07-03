import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const publishRouteSource = readFileSync(resolve(root, 'src/routes/publish.routes.ts'), 'utf8');
const publishHandlerSource = readFileSync(resolve(root, 'src/routes/publish-public-endpoint-handlers.ts'), 'utf8');
const deliveryAbiSource = readFileSync(resolve(root, 'src/services/publish-runtime-delivery-abi.ts'), 'utf8');
const deliverySource = readFileSync(resolve(root, 'src/services/publish-runtime-delivery.service.ts'), 'utf8');

test('publish manifest and home-bootstrap delivery policy are ABI-owned', () => {
  assert.match(deliveryAbiSource, /import \{ createWeakEtag \} from '\.\.\/utils\/http-cache'/);
  assert.match(deliveryAbiSource, /export type PublishHomeBootstrapQuery/);
  assert.match(deliveryAbiSource, /export type NormalizedPublishHomeBootstrapQuery/);
  assert.match(deliveryAbiSource, /export const PUBLISH_HOME_BOOTSTRAP_INTEGER_PARAM_DESCRIPTORS/);
  assert.match(deliveryAbiSource, /export const PUBLISH_RUNTIME_ETAG_NAMESPACE_DESCRIPTORS/);
  assert.match(deliveryAbiSource, /export const PUBLISH_HOME_BOOTSTRAP_MATERIALIZED_POLICY/);
  assert.match(deliveryAbiSource, /export const PUBLISH_RUNTIME_EXTERNAL_AUTHORITY_POLICY/);
  assert.match(deliveryAbiSource, /export function normalizeHomeBootstrapQuery/);
  assert.match(deliveryAbiSource, /export function shouldUseMaterializedHomeBootstrap/);
  assert.match(deliveryAbiSource, /export function isPublishExternalRuntimeAuthority/);
  assert.match(deliveryAbiSource, /export function getPublishRuntimeExternalBundleRequiredError/);
  assert.match(deliveryAbiSource, /export function createPublishManifestEtag/);
  assert.match(deliveryAbiSource, /export function createHomeBootstrapEtag/);
  assert.match(deliveryAbiSource, /'publish-manifest'/);
  assert.match(deliveryAbiSource, /'publish-home-bootstrap'/);
  assert.match(deliveryAbiSource, /manifest\.runtimeCacheKey/);
  assert.match(deliveryAbiSource, /fallback: 1/);
  assert.match(deliveryAbiSource, /max: 1_000_000/);
  assert.match(deliveryAbiSource, /fallback: 50/);
  assert.match(deliveryAbiSource, /max: 500/);
  assert.match(deliveryAbiSource, /fallback: 48/);
  assert.match(deliveryAbiSource, /min: 24/);
  assert.match(deliveryAbiSource, /max: 128/);
  assert.match(deliveryAbiSource, /allModsSentinel: 'all'/);
  assert.match(deliveryAbiSource, /authority: 'external-runtime'/);
  assert.match(deliveryAbiSource, /EXTERNAL_RUNTIME_PUBLISH_BUNDLE_REQUIRED/);
  assert.match(deliveryAbiSource, /dynamic SQLite fallback is disabled/);
  assert.match(deliveryAbiSource, /function validateAndFreezeIntegerParamDescriptors/);
  assert.match(deliveryAbiSource, /function validateAndFreezeEtagNamespaceDescriptors/);
  assert.match(deliveryAbiSource, /function validateAndFreezeMaterializedPolicy/);
  assert.match(deliveryAbiSource, /function validateAndFreezeExternalAuthorityPolicy/);

  assert.match(deliverySource, /from '\.\/publish-runtime-delivery-abi'/);
  assert.match(deliverySource, /getPublishManifestService\(\)\.getRuntimeManifest\(\)/);
  assert.match(deliverySource, /normalizeHomeBootstrapQuery\(query\)/);
  assert.match(deliverySource, /createPublishManifestEtag\(manifest\)/);
  assert.match(deliverySource, /createHomeBootstrapEtag\(manifest, normalizedQuery\)/);
  assert.doesNotMatch(deliverySource, /'publish-manifest'/);
  assert.doesNotMatch(deliverySource, /'publish-home-bootstrap'/);
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
  assert.match(deliverySource, /shouldUseMaterializedHomeBootstrap\(manifest, query\)/);
  assert.match(deliverySource, /getPublishPayloadService\(\)\.getHomeBootstrapWindow/);
  assert.match(deliverySource, /derivePagePackFromWindow\(\s*materialized\.pagePack,\s*getMaterializedHomeBootstrapPage\(\),\s*query\.pageSize,\s*\)/);
  assert.match(deliverySource, /function isExternalRuntimeAuthority\(\)/);
  assert.match(deliverySource, /isPublishExternalRuntimeAuthority\(resolveAccelerationCompilerAuthority\(\)\)/);
  assert.match(deliverySource, /if \(isExternalRuntimeAuthority\(\)\) \{/);
  assert.match(deliverySource, /getPublishRuntimeExternalBundleRequiredError\(\)/);
  assert.match(deliverySource, /serviceUnavailable\(\s*error\.message,\s*error\.code,\s*\)/);
  assert.doesNotMatch(deliverySource, /EXTERNAL_RUNTIME_PUBLISH_BUNDLE_REQUIRED/);
  assert.doesNotMatch(deliverySource, /dynamic SQLite fallback is disabled/);
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
