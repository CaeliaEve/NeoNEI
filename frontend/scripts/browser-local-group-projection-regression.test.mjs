import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const useItemBrowserSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/frontend/src/composables/useItemBrowser.ts',
  'utf8',
);

test('expanded browser groups no longer clear the entire shared page cache before reprojecting', () => {
  const setExpandedGroupsBlock = useItemBrowserSource.match(
    /const setExpandedGroups = \(groupKeys: string\[\]\) => \{[\s\S]*?\n  \};/,
  )?.[0] ?? '';

  assert.equal(
    setExpandedGroupsBlock.includes('clearBrowserPageState()'),
    false,
    'group expand/collapse should preserve hot page caches instead of invalidating every browser page',
  );
});

test('item browser can locally project expanded groups from the default browser catalog', () => {
  assert.equal(
    useItemBrowserSource.includes('projectBrowserEntriesFromDefaultCatalog'),
    true,
    'useItemBrowser should locally reproject expanded groups to match NEI-style collapse behavior',
  );

  assert.equal(
    useItemBrowserSource.includes('getBrowserDefaultCatalog'),
    true,
    'useItemBrowser should hydrate the default browser catalog for local expand/collapse',
  );

  assert.equal(
    useItemBrowserSource.includes('getBrowserGroupItems'),
    true,
    'useItemBrowser should fetch group members once and reuse them for instant expand/collapse paging',
  );

  assert.equal(
    useItemBrowserSource.includes('peekBrowserDefaultCatalog')
      && useItemBrowserSource.includes('peekBrowserSearchCatalog')
      && useItemBrowserSource.includes('getBrowserSearchCatalog')
      && useItemBrowserSource.includes('peekBrowserGroupItems')
      && useItemBrowserSource.includes('peekBrowserPagePackByIds')
      && useItemBrowserSource.includes('getBrowserPagePackByIds')
      && useItemBrowserSource.includes('SEARCH_LOCAL_PROJECTION_MAX_TOTAL'),
    true,
    'useItemBrowser should fast-path expand/collapse from hot local caches for both default and search browser scopes, then hydrate atlas/media in the background',
  );
});
