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
    homePageSource.includes('const scheduleNeighborPrefetch = ('),
    true,
    'homepage should move neighbor-page prefetch behind an explicit scheduling helper instead of lifecycle auto-runs',
  );
  assert.equal(
    homePageSource.includes('const BROWSER_PREFETCH_FORWARD_RADIUS = 4;'),
    true,
    'homepage should bias the hot ring forward so rapid next-page browsing warms farther ahead',
  );
  assert.equal(
    homePageSource.includes('const BROWSER_PREFETCH_BACKWARD_RADIUS = 2;'),
    true,
    'homepage should still keep the backward ring bounded while spending more budget in the active browsing direction',
  );
  assert.equal(
    homePageSource.includes('const candidatePages = collectWrappedPageCandidates(')
      && homePageSource.includes('direction >= 0 ? BROWSER_PREFETCH_FORWARD_RADIUS : BROWSER_PREFETCH_BACKWARD_RADIUS')
      && homePageSource.includes('direction <= 0 ? BROWSER_PREFETCH_FORWARD_RADIUS : BROWSER_PREFETCH_BACKWARD_RADIUS'),
    true,
    'homepage should derive wrapped prefetch candidates from the active page plus the latest browsing direction',
  );
  assert.equal(
    homePageSource.includes('void prefetchItemsPage(resolvedTargetPage);'),
    true,
    'homepage should kick the target-page fetch immediately when the user flips pages so the request is already in flight before the next render tick',
  );
  assert.equal(
    homePageSource.includes('scheduleNeighborPrefetch(resolvedTargetPage, total, direction);'),
    true,
    'homepage should only schedule the neighbor prefetch ring after an explicit page-flip interaction',
  );
  assert.equal(
    homePageSource.includes('currentView.value !== "items" || total <= 1 || searchQuery.value.trim()'),
    true,
    'homepage should skip neighbor prefetch entirely outside the normal item-browser browsing state',
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
