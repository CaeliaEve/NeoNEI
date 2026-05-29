import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const source = fs.readFileSync(
  'src/composables/useItemBrowser.ts',
  'utf8',
);

test('expanded browser group projection results are cached with an LRU budget', () => {
  assert.match(
    source,
    /const SHARED_EXPANDED_PROJECTION_CACHE_LIMIT = \d+;/,
    'expanded projection cache should have an explicit memory cap',
  );
  assert.equal(
    source.includes('const sharedExpandedProjectionCache = new Map<string, CachedBrowserPage>()'),
    true,
    'expanded projection pages should be stored separately from network page cache',
  );
  assert.equal(
    source.includes('setSharedExpandedProjectionCache'),
    true,
    'expanded projection cache should use an LRU insert helper',
  );
});

test('expanded browser projection cache key includes query, scope, page geometry, and expanded groups', () => {
  const keyBlock = source.match(
    /const buildExpandedProjectionCacheKey = \([\s\S]*?\n  \}\);/,
  )?.[0] ?? '';

  for (const required of [
    "type: 'expanded-browser-projection'",
    'page: params.page',
    'pageSize: params.pageSize',
    "search: params.search?.trim() || ''",
    "modId: params.modId || 'all'",
    'expandedGroups: normalizeExpandedGroups(params.expandedGroups)',
    'slotSize: params.slotSize',
    'catalogSize',
    'groups: Array.from(groupItemsByKey.entries())',
  ]) {
    assert.equal(
      keyBlock.includes(required),
      true,
      `projection cache key should include ${required}`,
    );
  }
});

test('expanded browser projections precompute the current adjacent page window', () => {
  assert.equal(
    source.includes('const precomputeExpandedProjectionWindow'),
    true,
    'expanded group projection should precompute a small page window',
  );
  assert.equal(
    source.includes('for (const page of [params.page - 1, params.page, params.page + 1])'),
    true,
    'projection window should include previous, current, and next pages',
  );
  assert.equal(
    (source.match(/precomputeExpandedProjectionWindow\(catalogEntries, params, groupItemsByKey\)/g) ?? []).length >= 2,
    true,
    'both hot-cache and async expanded projection paths should prime projection windows',
  );
  assert.equal(
    source.includes('sharedExpandedProjectionCache.clear()'),
    true,
    'projection cache should clear with page geometry/runtime page cache resets',
  );
});

