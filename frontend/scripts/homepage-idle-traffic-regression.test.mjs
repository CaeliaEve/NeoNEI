import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const homePageSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/frontend/src/views/HomePage.vue',
  'utf8',
).replace(/\r\n/g, '\n');

const itemBrowserSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/frontend/src/composables/useItemBrowser.ts',
  'utf8',
).replace(/\r\n/g, '\n');

test('homepage prefetch stays single-page and idle-scheduled instead of eager multi-page fanout', () => {
  assert.equal(
    homePageSource.includes('[page - 1, page + 1, page + 2]'),
    false,
    'homepage should no longer eagerly prefetch previous/next/two-ahead pages on first paint',
  );
  assert.equal(
    homePageSource.includes('const neighborPage = page >= total ? 1 : page + 1;'),
    true,
    'homepage should only prefetch the next wrapped browser page',
  );
  assert.equal(
    homePageSource.includes('requestIdleCallback'),
    true,
    'homepage should delay neighbor page prefetch until the browser is idle',
  );
});

test('browser search pack no longer auto-warms during homepage idle bootstrap', () => {
  assert.equal(
    itemBrowserSource.includes('requestIdleCallback(() => {\n          void preloadBrowserSearchWorker();'),
    false,
    'item browser should not fetch the full browser search pack automatically during homepage idle bootstrap',
  );
  assert.equal(
    itemBrowserSource.includes('const warmSearchIndex = () => {'),
    true,
    'item browser should expose an explicit search-index warm path instead of forcing idle bootstrap traffic',
  );
  assert.equal(
    homePageSource.includes('@focus="warmSearchIndex"'),
    true,
    'homepage search field should explicitly warm the search index on user intent',
  );
});
