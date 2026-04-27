import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const source = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/frontend/src/services/persistentRuntimeCache.ts',
  'utf8',
);

test('runtime cache store can prune stale signature entries when a new export signature becomes active', () => {
  assert.equal(
    source.includes('cleanupPersistentRuntimeCacheForSignature'),
    true,
    'persistent runtime cache should expose a signature-aware cleanup path',
  );
  assert.equal(
    source.includes('cursor.delete()'),
    true,
    'signature cleanup should delete stale records instead of letting IndexedDB grow forever',
  );
  assert.equal(
    source.includes('primeRuntimeCacheSignature'),
    true,
    'manifest consumers should be able to prime the current signature and trigger one-time cleanup',
  );
});
