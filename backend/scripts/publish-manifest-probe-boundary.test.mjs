import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const serviceSource = fs.readFileSync('src/services/publish-manifest.service.ts', 'utf8');
const abiSource = fs.readFileSync('src/services/publish-manifest-abi.ts', 'utf8');
const frontendTypesSource = fs.readFileSync('../frontend/src/runtime/types.ts', 'utf8');

function sourceSection(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  assert.notEqual(start, -1, `missing source section start: ${startNeedle}`);
  const end = source.indexOf(endNeedle, start);
  assert.notEqual(end, -1, `missing source section end: ${endNeedle}`);
  return source.slice(start, end);
}

test('publish manifest owns an explicit probe ABI catalog', () => {
  assert.match(abiSource, /PUBLISH_MANIFEST_STATUS = Object\.freeze/);
  assert.match(abiSource, /PUBLISH_MANIFEST_PROBE_STATUS = Object\.freeze/);
  assert.match(abiSource, /export type PublishManifestProbeName/);
  assert.match(abiSource, /PUBLISH_MANIFEST_PROBE_DESCRIPTORS/);
  assert.match(abiSource, /validateAndFreezePublishManifestProbeDescriptors/);

  for (const probe of [
    'database',
    'sourceSignature',
    'publishRevision',
    'publishCompiledAt',
    'browserLayoutKey',
    'publishBundle',
    'runtimeCacheKey',
  ]) {
    assert.match(abiSource, new RegExp(`'${probe}'`));
  }
});

test('publish manifest database and bundle reads expose probes instead of null-swallow fallbacks', () => {
  const databaseRead = sourceSection(
    serviceSource,
    'private getAccelerationDatabase',
    'private readPublishBundleManifest',
  );
  const bundleRead = sourceSection(
    serviceSource,
    'private readPublishBundleManifest',
    'private createBlockedRuntimeManifest',
  );

  assert.match(serviceSource, /export type PublishManifestProbe/);
  assert.match(databaseRead, /PublishManifestDatabaseRead/);
  assert.match(databaseRead, /PUBLISH_MANIFEST_PROBE_STATUS\.ready/);
  assert.match(databaseRead, /PUBLISH_MANIFEST_PROBE_STATUS\.invalid/);
  assert.match(databaseRead, /describeError\(error\)/);
  assert.match(bundleRead, /PublishBundleManifestRead/);
  assert.match(bundleRead, /fs\.statSync/);
  assert.match(bundleRead, /stats\.isFile\(\)/);
  assert.match(bundleRead, /publish bundle source signature mismatch/);
  assert.match(bundleRead, /publish bundle identity contentHash is required/);
  assert.doesNotMatch(serviceSource, /catch \{\s*return null;\s*\}/s);
  assert.doesNotMatch(serviceSource, /bootstrap-missing/);
  assert.doesNotMatch(serviceSource, /source-signature-missing/);
});

test('publish manifest blocks stale or incomplete runtime bundles instead of trimming windows as compatibility', () => {
  const manifestAssembly = sourceSection(
    serviceSource,
    'getRuntimeManifest(): PublicRuntimeManifest',
    'invalidate(): void',
  );

  assert.match(manifestAssembly, /publishIsOlderThanBrowserLayout/);
  assert.match(manifestAssembly, /PUBLISH_MANIFEST_PROBE_STATUS\.stale/);
  assert.match(manifestAssembly, /runtime cache key is withheld while publish bundle is stale/);
  assert.match(manifestAssembly, /publishBundle: probes\.status === PUBLISH_MANIFEST_STATUS\.ready \? publishBundle : null/);
  assert.match(manifestAssembly, /status: probes\.status/);
  assert.match(manifestAssembly, /probes,/);
  assert.doesNotMatch(manifestAssembly, /browserPageWindows:\s*\[\]/);
  assert.doesNotMatch(manifestAssembly, /homeBootstrapWindows:\s*\[\]/);
});

test('publish manifest probe ABI is visible to frontend runtime manifest consumers', () => {
  assert.match(frontendTypesSource, /export type PublishManifestProbeStatus = 'ready' \| 'missing' \| 'invalid' \| 'stale'/);
  assert.match(frontendTypesSource, /export interface PublishManifestProbeSummary/);
  assert.match(frontendTypesSource, /status\?: 'ready' \| 'blocked' \| 'stale'/);
  assert.match(frontendTypesSource, /probes\?: PublishManifestProbeSummary/);
});
