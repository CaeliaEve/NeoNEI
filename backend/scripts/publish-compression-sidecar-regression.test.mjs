import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const materializerSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/backend/src/services/publish-payload-materializer.service.ts',
  'utf8',
).replace(/\r\n/g, '\n');

const publishPayloadSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/backend/src/services/publish-payload.service.ts',
  'utf8',
).replace(/\r\n/g, '\n');

const serverSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/backend/src/server.ts',
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
});

test('publish static route prefers precompressed sidecars when clients accept them', () => {
  assert.equal(
    serverSource.includes("const PUBLISH_STATIC_SIDECAR_VARIANTS = ["),
    true,
    'publish server should declare the available precompressed variants',
  );
  assert.equal(
    serverSource.includes("res.setHeader('Content-Encoding', contentEncoding);"),
    true,
    'publish server should send the selected content encoding header',
  );
  assert.equal(
    serverSource.includes("res.setHeader('Vary', 'Accept-Encoding');"),
    true,
    'publish server should vary publish assets on Accept-Encoding',
  );
});
