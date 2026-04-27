import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const source = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/frontend/src/services/browserSearchWorker.ts',
  'utf8',
).replace(/\r\n/g, '\n');

test('browser search can answer page-1 hot-shard hits before full-pack hydration completes', () => {
  assert.equal(
    source.includes('await ensureWarmInitialized();'),
    true,
    'search queries should only require the warm hot-shard stage before first response',
  );
  assert.equal(
    source.includes('const partialResult = await dispatchQueryToWorker(params);'),
    true,
    'search queries should issue an immediate worker query against the warm search shard',
  );
  assert.equal(
    source.includes('const canSatisfyFromHotShard = normalizedPage === 1 && partialResult.total >= normalizedPageSize;'),
    true,
    'page-1 hot-shard hits should be allowed to return immediately when they can fill the requested page',
  );
  assert.equal(
    source.includes('await ensureFullyInitialized();'),
    true,
    'search queries should still escalate to the full search pack when the hot shard is insufficient',
  );
});
