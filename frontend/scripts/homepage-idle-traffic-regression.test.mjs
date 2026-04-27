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

test('homepage prefetch stays idle-scheduled while expanding to a small wrapped hot-page ring', () => {
  assert.equal(
    homePageSource.includes('const BROWSER_PREFETCH_RADIUS = 2;'),
    true,
    'homepage should declare a bounded wrapped prefetch radius instead of unbounded fanout',
  );
  assert.equal(
    homePageSource.includes('collectWrappedPageCandidates(page, total, BROWSER_PREFETCH_RADIUS)'),
    true,
    'homepage should derive nearby wrapped prefetch candidates from the active page',
  );
  assert.equal(
    homePageSource.includes('for (let offset = 1; offset <= normalizedRadius; offset += 1)'),
    true,
    'homepage should prefetch a small forward/backward ring instead of only a single neighbor',
  );
  assert.equal(
    homePageSource.includes('const BROWSER_PREFETCH_RADIUS = 3;'),
    false,
    'homepage should keep the hot ring bounded instead of expanding to a larger eager radius by default',
  );
  assert.equal(
    homePageSource.includes('requestIdleCallback'),
    true,
    'homepage should still delay hot-ring prefetch until the browser is idle',
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
