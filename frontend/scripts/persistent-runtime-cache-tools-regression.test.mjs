import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const source = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/frontend/src/services/persistentRuntimeCache.ts',
  'utf8',
).replace(/\r\n/g, '\n');

test('persistent runtime cache exposes explicit clear and stats helpers for user-driven site preheat management', () => {
  assert.equal(
    source.includes('export async function clearPersistentRuntimeCache(): Promise<void> {'),
    true,
    'persistent runtime cache should expose a full clear operation for the settings panel',
  );
  assert.equal(
    source.includes('store.clear();'),
    true,
    'full clear should wipe the IndexedDB store instead of only dropping the active signature marker',
  );
  assert.equal(
    source.includes('export async function getPersistentRuntimeCacheStats(): Promise<{'),
    true,
    'persistent runtime cache should expose stats for cache count/size reporting',
  );
  assert.equal(
    source.includes('approxBytes += new Blob(['),
    true,
    'cache stats should estimate stored payload size for the settings UI',
  );
});
