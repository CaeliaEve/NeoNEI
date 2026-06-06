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
    source.includes('const queryResultSetCache = new Map'),
    true,
    'search worker should cache the sorted result set so page jumps do not rerank the same query',
  );
  assert.equal(
    source.includes('const MAX_QUERY_RESULT_SET_CACHE = 48'),
    true,
    'sorted result set cache should be bounded',
  );
  assert.equal(
    source.includes('queryResultSetCache.clear();'),
    true,
    'sorted result set cache must be invalidated when the search index rebuilds',
  );
  assert.equal(
    source.includes('getCachedSearchResultSet'),
    true,
    'search paging should reuse pre-ranked query result sets',
  );
  assert.equal(
    source.includes('searchIndexVersion'),
    true,
    'cache keys should include the search index version',
  );
});
