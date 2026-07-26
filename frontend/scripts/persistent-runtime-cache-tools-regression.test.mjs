import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const source = fs.readFileSync(
  'src/services/persistentRuntimeCache.ts',
  'utf8',
).replace(/\r\n/g, '\n');
const preheaterSource = fs.readFileSync(
  'src/composables/useSitePreheater.ts',
  'utf8',
).replace(/\r\n/g, '\n');

test('persistent runtime cache exposes explicit clear and stats helpers for user-driven site preheat management', () => {
  assert.equal(
    source.includes('export async function clearPersistentRuntimeCache(): Promise<void> {'),
    true,
    'persistent runtime cache should expose a full clear operation for the settings panel',
  );
  assert.equal(
    source.includes('transaction.objectStore(PAYLOAD_STORE_NAME).clear();'),
    true,
    'full clear should wipe the IndexedDB store instead of only dropping the active signature marker',
  );
  assert.equal(
    source.includes('export async function getPersistentRuntimeCacheStats(): Promise<{'),
    true,
    'persistent runtime cache should expose stats for cache count/size reporting',
  );
  assert.equal(
    source.includes("transaction.objectStore(STATE_STORE_NAME).get(TOTAL_BYTES_STATE_KEY)"),
    true,
    'cache stats should read the transactionally maintained byte total without cloning payloads',
  );
});

test('site preheater reports cache clear success only after all persistent stores commit', () => {
  const awaitIndex = preheaterSource.indexOf('await Promise.all([');
  const successIndex = preheaterSource.indexOf('currentPhase.value = "\\u7f13\\u5b58\\u5df2\\u6e05\\u7a7a"');
  assert.ok(awaitIndex >= 0 && successIndex > awaitIndex);
  assert.match(preheaterSource, /catch \(error\) \{[\s\S]*缓存清理失败|catch \(error\) \{[\s\S]*\\u7f13\\u5b58\\u6e05\\u7406\\u5931\\u8d25/);
});
