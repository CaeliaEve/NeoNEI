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

test('publish manifest exposes build report artifacts', () => {
  assert.equal(
    publishPayloadSource.includes('buildReport: string | null;'),
    true,
    'publish bundle manifest should expose the JSON build report path',
  );
  assert.equal(
    publishPayloadSource.includes('buildReportHtml: string | null;'),
    true,
    'publish bundle manifest should expose the HTML build report path',
  );
});

test('publish materializer registers build reports as compressed assets before writing manifest', () => {
  assert.equal(
    materializerSource.includes("const buildReportPaths = this.writeBuildReport(bundleOutputDir, basePublicPath, bundleManifest, rows);"),
    true,
    'build report should be produced before final manifest serialization',
  );
  assert.equal(
    materializerSource.includes('bundleManifest.files.buildReport = buildReportPaths.jsonPublicPath;'),
    true,
    'JSON build report should be assigned into manifest files',
  );
  assert.equal(
    materializerSource.includes('registerCompressedAsset(buildReportPaths.jsonRelativePath, buildReportPaths.jsonAbsolutePath, buildReportPaths.jsonPublicPath);'),
    true,
    'JSON build report should be registered for compression metadata',
  );
  assert.equal(
    materializerSource.includes('registerCompressedAsset(buildReportPaths.htmlRelativePath, buildReportPaths.htmlAbsolutePath, buildReportPaths.htmlPublicPath);'),
    true,
    'HTML build report should be registered for compression metadata',
  );
});

test('publish manifest carries content identity hashes', () => {
  assert.equal(
    publishPayloadSource.includes('export interface PublishBundleIdentity'),
    true,
    'publish manifest should define a bundle identity contract',
  );
  assert.equal(
    publishPayloadSource.includes("algorithm: 'sha256';"),
    true,
    'publish bundle identity should declare sha256 as the hash algorithm',
  );
  assert.equal(
    publishPayloadSource.includes('identity: PublishBundleIdentity;'),
    true,
    'publish manifest should expose the bundle identity block',
  );
  assert.equal(
    publishPayloadSource.includes('sha256: string;'),
    true,
    'each publish asset should expose its content sha256',
  );
});

test('publish materializer derives identity from registered assets', () => {
  assert.equal(
    materializerSource.includes('function buildPublishIdentity(assets: Record<string, PublishBundleAssetMetadata>)'),
    true,
    'publish materializer should compute bundle identity from registered assets',
  );
  assert.equal(
    materializerSource.includes('bundleManifest.identity = buildPublishIdentity(bundleManifest.compression.assets);'),
    true,
    'publish identity should be finalized before manifest serialization',
  );
  assert.equal(
    materializerSource.includes('sha256: sourceHash,'),
    true,
    'registered publish assets should carry their source sha256',
  );
});

