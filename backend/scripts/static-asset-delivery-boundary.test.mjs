import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const routeSource = readFileSync(resolve(root, 'src/routes/static-assets.routes.ts'), 'utf8');
const deliverySource = readFileSync(resolve(root, 'src/services/static-asset-delivery.service.ts'), 'utf8');

test('static asset filesystem and sidecar policy are delivery-service owned', () => {
  assert.match(deliverySource, /export function resolveImageFamilyArtifact/);
  assert.match(deliverySource, /export function resolveRawStaticAsset/);
  assert.match(deliverySource, /export function resolvePublishStaticAsset/);
  assert.match(deliverySource, /const PUBLISH_STATIC_SIDECAR_VARIANTS = Object\.freeze/);
  assert.match(deliverySource, /encoding: 'br'/);
  assert.match(deliverySource, /encoding: 'gzip'/);
  assert.match(deliverySource, /function canServePrecompressedPublishAsset/);
  assert.match(deliverySource, /function isPublishMutableArtifact/);
  assert.match(deliverySource, /function isSafeUnderRoot/);
  assert.match(deliverySource, /path\.sep/);

  for (const routeLocalPolicy of [
    /from 'fs'/,
    /from 'path'/,
    /parseRequestedArtifact/,
    /PUBLISH_STATIC_SIDECAR_VARIANTS/,
    /function acceptsEncoding/,
    /function isPublishMutableArtifact/,
    /function isSafeUnderRoot/,
    /function isExistingFile/,
    /fs\.existsSync/,
    /fs\.statSync/,
    /fs\.readdirSync/,
    /path\.resolve/,
  ]) {
    assert.doesNotMatch(routeSource, routeLocalPolicy);
  }

  assert.match(routeSource, /resolveImageFamilyArtifact\(family, req\.params\.modId, req\.params\.fileName\)/);
  assert.match(routeSource, /resolveRawStaticAsset\(rootDir, req\.url\)/);
  assert.match(routeSource, /resolvePublishStaticAsset\(\{/);
  assert.match(routeSource, /staticDirectoryExists\(CONTRACTS_DIR\)/);
  assert.match(routeSource, /setNoStoreHeaders\(res\)/);
  assert.match(routeSource, /setStaticAssetCacheHeaders\(res, \{/);
  assert.match(routeSource, /res\.sendFile\(delivery\.responsePath/);
});
