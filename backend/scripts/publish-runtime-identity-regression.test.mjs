import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const runtimeManifestSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/backend/src/services/publish-manifest.service.ts',
  'utf8',
).replace(/\r\n/g, '\n');

test('runtime cache key is bound to publish bundle content identity', () => {
  assert.equal(
    runtimeManifestSource.includes('const publishIdentityKey ='),
    true,
    'runtime manifest should derive a stable publish identity key',
  );
  assert.equal(
    runtimeManifestSource.includes('runtimePublishBundle?.identity?.contentHash'),
    true,
    'runtime cache key should prefer the manifest identity exposed to clients',
  );
  assert.equal(
    runtimeManifestSource.includes('publishBundle?.identity?.contentHash'),
    true,
    'runtime cache key should fall back to the original publish bundle identity',
  );
  assert.equal(
    runtimeManifestSource.includes("'publish-identity-missing'"),
    true,
    'runtime cache key should have an explicit missing identity fallback',
  );
  assert.equal(
    runtimeManifestSource.includes('browserLayoutKey,\n        publishIdentityKey,'),
    true,
    'publish identity should be part of runtimeCacheKey after browser layout identity',
  );
});
