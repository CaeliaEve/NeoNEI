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
