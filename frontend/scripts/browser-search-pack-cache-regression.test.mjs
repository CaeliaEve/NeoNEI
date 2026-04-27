import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const source = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/frontend/src/services/browserSearchWorker.ts',
  'utf8',
);

test('browser search worker seeds itself from publish-manifest keyed persistent cache before refetching packs', () => {
  assert.equal(
    source.includes('api.getPublishManifest()'),
    true,
    'browser search worker should read publish manifest before resolving the search-pack cache key',
  );
  assert.equal(
    source.includes('readPersistentRuntimeCache'),
    true,
    'browser search worker should read the persistent runtime cache',
  );
  assert.equal(
    source.includes('writePersistentRuntimeCache'),
    true,
    'browser search worker should persist fetched search packs for later cold starts',
  );
  assert.equal(
    source.includes('runtimeCacheKey'),
    true,
    'browser search worker cache keys should follow the publish runtime cache key so in-place payload refreshes invalidate old search packs',
  );
});
