import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const source = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/frontend/src/composables/useItemBrowser.ts',
  'utf8',
);

test('homepage browser page packs use manifest-keyed persistent cache and slot-size-aware keys', () => {
  assert.equal(
    source.includes('readPersistentRuntimeCache'),
    true,
    'item browser should read persistent runtime cache for cold-start browser page packs',
  );
  assert.equal(
    source.includes('writePersistentRuntimeCache'),
    true,
    'item browser should persist fetched browser page packs for later reloads',
  );
  assert.equal(
    source.includes('getStoredRuntimeSignature')
      && source.includes('primeRuntimeCacheSignature'),
    true,
    'item browser should remember the latest publish signature for cache reuse',
  );
  assert.equal(
    source.includes('slotSize: params.slotSize'),
    true,
    'browser page cache keys should include slot size so atlas reuse matches the rendered grid',
  );
  assert.equal(
    source.includes('revalidatePersistentDefaultPage'),
    true,
    'item browser should revalidate persisted browser page packs against the latest manifest signature',
  );
});
