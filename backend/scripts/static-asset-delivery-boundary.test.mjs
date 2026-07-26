import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const routeSource = readFileSync(resolve(root, 'src/routes/static-assets.routes.ts'), 'utf8');
const routeRegistrySource = readFileSync(resolve(root, 'src/routes/static-asset-route-registry.ts'), 'utf8');
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

  assert.match(routeRegistrySource, /export const STATIC_ASSET_IMAGE_ARTIFACT_ROUTES/);
  assert.match(routeRegistrySource, /export const STATIC_ASSET_MOUNTS/);
  assert.match(routeRegistrySource, /export const STATIC_ASSET_PRE_IMAGE_ARTIFACT_MOUNTS/);
  assert.match(routeRegistrySource, /export const STATIC_ASSET_POST_IMAGE_ARTIFACT_MOUNTS/);
  assert.match(routeRegistrySource, /validateAndFreezeStaticAssetImageArtifactRoutes/);
  assert.match(routeRegistrySource, /validateAndFreezeStaticAssetMounts/);
  assert.match(routeRegistrySource, /validateAndFreezeRouteDescriptors/);
  assert.match(routeRegistrySource, /Duplicate static asset mount descriptor/);
  assert.match(routeRegistrySource, /Missing static asset mount descriptor/);
  assert.match(routeRegistrySource, /Invalid static asset mount phase/);
  assert.match(routeRegistrySource, /path: '\/images\/item\/:modId\/:fileName'/);
  assert.match(routeRegistrySource, /path: '\/api\/images\/entity\/:modId\/:fileName'/);
  assert.match(routeRegistrySource, /DIST_DATA_DIR/);
  assert.match(routeRegistrySource, /key:\s*'distData'[\s\S]*mountPath:\s*'\/dist-data'[\s\S]*rootDir:\s*DIST_DATA_DIR/);
  assert.match(routeRegistrySource, /key:\s*'distData'[\s\S]*phase:\s*'before-image-artifacts'[\s\S]*key:\s*'publicRoot'/);
  assert.match(routeRegistrySource, /mountPath: '\/contracts'/);
  assert.match(routeRegistrySource, /mountPath: '\/publish'/);
  assert.match(routeRegistrySource, /phase: 'before-image-artifacts'/);
  assert.match(routeRegistrySource, /phase: 'after-image-artifacts'/);

  for (const routeLocalPolicy of [
    /from 'fs'/,
    /from 'path'/,
    /from '\.\.\/config\/runtime-paths'/,
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
  assert.match(routeSource, /for \(const mount of STATIC_ASSET_PRE_IMAGE_ARTIFACT_MOUNTS\)/);
  assert.match(routeSource, /for \(const route of STATIC_ASSET_IMAGE_ARTIFACT_ROUTES\)/);
  assert.match(routeSource, /for \(const mount of STATIC_ASSET_POST_IMAGE_ARTIFACT_MOUNTS\)/);
  assert.match(routeSource, /app\.get\(route\.path, createImageArtifactRoute\(route\.family\)\)/);
  assert.match(routeSource, /staticDirectoryExists\(mount\.rootDir\)/);
  const distDataMountIndex = routeSource.indexOf("mount.key === 'distData'");
  const existingDirectoryGuardIndex = routeSource.indexOf('mount.requireExistingDirectory && !staticDirectoryExists');
  assert.equal(distDataMountIndex < existingDirectoryGuardIndex, true, 'dist-data authority route must mount before directory existence checks');
  assert.match(routeSource, /catch \{[\s\S]*res\.status\(409\)\.end\(\)/);
  assert.match(routeSource, /setNoStoreHeaders\(res\)/);
  assert.match(routeSource, /setStaticAssetCacheHeaders\(res, \{/);
  assert.match(routeSource, /res\.sendFile\(delivery\.responsePath/);

  for (const catalogOwnedLiteral of [
    /'\/images\/item\/:modId\/:fileName'/,
    /'\/api\/images\/entity\/:modId\/:fileName'/,
    /'\/contracts'/,
    /'\/api\/images'/,
    /'\/publish'/,
    /'365d'/,
  ]) {
    assert.match(routeRegistrySource, catalogOwnedLiteral);
    assert.doesNotMatch(routeSource, catalogOwnedLiteral);
  }
});
