import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const materializerSource = fs.readFileSync(
  'src/services/publish-payload-materializer.service.ts',
  'utf8',
).replace(/\r\n/g, '\n');

const publishPayloadSource = fs.readFileSync(
  'src/services/publish-payload.service.ts',
  'utf8',
).replace(/\r\n/g, '\n');

const staticAssetsRouteSource = fs.readFileSync(
  'src/routes/static-assets.routes.ts',
  'utf8',
).replace(/\r\n/g, '\n');

const staticAssetDeliverySource = fs.readFileSync(
  'src/services/static-asset-delivery.service.ts',
  'utf8',
).replace(/\r\n/g, '\n');

test('publish static bundle advertises sidecar compression metadata', () => {
  assert.equal(
    publishPayloadSource.includes("export type PublishBundleSidecarEncoding = 'br' | 'gzip';"),
    true,
    'publish bundle manifest should declare the supported sidecar encodings',
  );
  assert.equal(
    publishPayloadSource.includes('compressedVariants: PublishBundleCompressedVariant[];'),
    true,
    'publish bundle manifest should expose compressed sidecar metadata per asset',
  );
  assert.equal(
    publishPayloadSource.includes('assets: Record<string, PublishBundleAssetMetadata>;'),
    true,
    'publish bundle manifest should centralize sidecar metadata in an asset map',
  );
  assert.equal(
    publishPayloadSource.includes('contentAddressedPath: string;'),
    true,
    'publish bundle asset metadata should expose immutable content-addressed URLs',
  );
});

test('publish materializer writes both brotli and gzip sidecars', () => {
  assert.equal(
    materializerSource.includes('zlib.brotliCompressSync'),
    true,
    'publish materializer should emit brotli sidecars',
  );
  assert.equal(
    materializerSource.includes('zlib.gzipSync'),
    true,
    'publish materializer should emit gzip sidecars',
  );
  assert.equal(
    materializerSource.includes('bundleManifest.compression.assets[relativePath] = {'),
    true,
    'publish materializer should capture sidecar metadata in the manifest asset map',
  );
  assert.equal(
    materializerSource.includes('buildContentAddressedRelativePath'),
    true,
    'publish materializer should create hash-named aliases for CDN immutable caching',
  );
  assert.equal(
    materializerSource.includes('contentAddressedPath: contentAddressedPublicPath'),
    true,
    'publish materializer should record content-addressed public paths',
  );
});

test('publish build report verifies source contract and bundle matching', () => {
  assert.equal(
    materializerSource.includes('sourceSignaturePresent'),
    true,
    'build report should verify source signature presence',
  );
  assert.equal(
    materializerSource.includes('browserLayoutPresent'),
    true,
    'build report should verify browser layout payload presence',
  );
  assert.equal(
    materializerSource.includes('searchPackPresent'),
    true,
    'build report should verify search pack payload presence',
  );
  assert.equal(
    materializerSource.includes('recipeBundlePresent'),
    true,
    'build report should verify recipe bundle payload presence',
  );
});

test('publish static route prefers precompressed sidecars when clients accept them', () => {
  assert.equal(
    staticAssetDeliverySource.includes('const PUBLISH_STATIC_SIDECAR_VARIANTS = Object.freeze(['),
    true,
    'publish server should declare the available precompressed variants',
  );
  assert.match(
    staticAssetDeliverySource,
    /const PUBLISH_STATIC_SIDECAR_VARIANTS = Object\.freeze\(\[\s*Object\.freeze\(\{\s*encoding: 'br'/,
    'publish server should prefer brotli before gzip when both sidecars are available',
  );
  assert.equal(
    staticAssetsRouteSource.includes("bypassCompression: Boolean(req.headers['x-no-compression'])"),
    true,
    'publish server should allow smoke tests and diagnostics to bypass sidecar compression explicitly',
  );
  assert.equal(
    staticAssetsRouteSource.includes("res.setHeader('Content-Encoding', delivery.contentEncoding);"),
    true,
    'publish server should send the selected content encoding header',
  );
  assert.equal(
    staticAssetsRouteSource.includes("res.setHeader('Vary', 'Accept-Encoding');")
      && staticAssetDeliverySource.includes('varyAcceptEncoding = canServePrecompressedPublishAsset'),
    true,
    'publish server should vary publish assets on Accept-Encoding',
  );
});


test('publish static route uses the shared cache header helpers', () => {
  assert.equal(
    staticAssetsRouteSource.includes("import { setNoStoreHeaders, setStaticAssetCacheHeaders } from '../utils/http-cache';"),
    true,
    'static assets route should import the shared cache header helpers',
  );
  assert.equal(
    staticAssetsRouteSource.includes('setNoStoreHeaders(res);'),
    true,
    'mutable publish artifacts should use the centralized no-store helper',
  );
  assert.equal(
    staticAssetsRouteSource.includes("res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');"),
    false,
    'server route code should not hand-roll no-store headers',
  );
  assert.equal(
    staticAssetsRouteSource.includes('setStaticAssetCacheHeaders(res, {'),
    true,
    'static publish/raw artifacts should use the centralized static cache helper',
  );
  assert.equal(
    staticAssetsRouteSource.includes('cacheControl: true'),
    false,
    'server static routes should not split cache policy between Express sendFile and shared helpers',
  );
});
