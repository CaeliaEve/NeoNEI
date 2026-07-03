import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const runtimeManifestSource = fs.readFileSync(
  'src/services/publish-manifest.service.ts',
  'utf8',
).replace(/\r\n/g, '\n');

test('runtime cache key is bound to publish bundle content identity', () => {
  assert.equal(
    runtimeManifestSource.includes('const publishIdentityKey ='),
    true,
    'runtime manifest should derive a stable publish identity key',
  );
  assert.equal(
    runtimeManifestSource.includes('const publishIdentityKey = asString(publishBundle?.identity?.contentHash);'),
    true,
    'runtime cache key should prefer the validated publish bundle identity exposed to clients',
  );
  assert.equal(
    runtimeManifestSource.includes('runtime cache key requires database, source signature, publish metadata, browser layout, and bundle identity'),
    true,
    'runtime cache key should fail closed when bundle identity is unavailable',
  );
  assert.equal(
    runtimeManifestSource.includes('browserLayoutKey,\n        publishIdentityKey,'),
    true,
    'publish identity should be part of runtimeCacheKey after browser layout identity',
  );
});
