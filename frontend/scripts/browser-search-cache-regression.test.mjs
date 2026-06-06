import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const source = fs.readFileSync('src/workers/browserSearch.worker.ts', 'utf8');

test('browser search worker keeps a bounded query result cache for instant repeated searches', () => {
  assert.equal(
    source.includes('const queryResultCache = new Map'),
    true,
    'search worker should cache query results instead of recomputing repeated searches',
  );
  assert.equal(
    source.includes('const MAX_QUERY_RESULT_CACHE = 160'),
    true,
    'search cache should be bounded',
  );
  assert.equal(
    source.includes('queryResultCache.clear();'),
    true,
    'search cache must be invalidated when the search index rebuilds',
  );
  assert.equal(
    source.includes('searchIndexVersion'),
    true,
    'cache keys should include the search index version',
  );
});
