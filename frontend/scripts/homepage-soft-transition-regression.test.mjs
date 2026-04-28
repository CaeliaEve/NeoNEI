import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const browserSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/frontend/src/composables/useItemBrowser.ts',
  'utf8',
).replace(/\r\n/g, '\n');

const homePageSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/frontend/src/views/HomePage.vue',
  'utf8',
).replace(/\r\n/g, '\n');

test('browser page transitions keep the previous grid alive while the next page warms', () => {
  assert.equal(
    browserSource.includes('const transitioning = ref(false);'),
    true,
    'item browser should expose a dedicated transition state for warm page flips',
  );
  assert.equal(
    browserSource.includes('const hadVisibleEntries = browserEntries.value.length > 0 && items.value.length > 0;'),
    true,
    'item browser should detect whether a previous page is already visible before showing blocking loading UI',
  );
  assert.equal(
    browserSource.includes('if (hadVisibleEntries) {\n      loading.value = false;\n      transitioning.value = true;'),
    true,
    'warm page flips should switch to a soft-transition state instead of replacing the grid with a blocking loader',
  );
  assert.equal(
    browserSource.includes('if (!hadVisibleEntries) {\n        browserEntries.value = [];\n        items.value = [];'),
    true,
    'hard clears should only happen when no previous page is available to keep on screen',
  );
  assert.equal(
    browserSource.includes('await waitForBrowserPagePresentation(cacheKey, cached, 260);'),
    true,
    'cached warm-page flips should briefly wait for atlas readiness before swapping away from the previous grid',
  );
  assert.equal(
    browserSource.includes('await waitForBrowserPagePresentation(normalizedCacheKey, normalized, 260);'),
    true,
    'network page flips should hold the previous grid until the incoming atlas gets a short warmup window',
  );
});

test('homepage only shows the full blocking loader on true cold starts', () => {
  assert.equal(
    homePageSource.includes('v-if="loading && items.length === 0"'),
    true,
    'homepage should reserve the full-screen loading panel for cold loads with no visible tiles',
  );
  assert.equal(
    homePageSource.includes('v-else-if="loadError && items.length === 0"'),
    true,
    'homepage should only replace the grid with an error state when no prior content is available',
  );
  assert.equal(
    homePageSource.includes('const showTransitionOverlay = ref(false);'),
    true,
    'homepage should keep the in-grid transition hint behind a dedicated delayed-visibility state',
  );
  assert.equal(
    homePageSource.includes('transitionOverlayTimer = window.setTimeout(() => {\n      showTransitionOverlay.value = true;\n      transitionOverlayTimer = null;\n    }, TRANSITION_OVERLAY_DELAY_MS);'),
    true,
    'short-lived warm-page flips should not flash the transition hint before the delay expires',
  );
  assert.equal(
    homePageSource.includes('v-if="showTransitionOverlay"'),
    true,
    'homepage should render a lightweight in-grid transition indicator during warm page flips',
  );
  assert.equal(
    homePageSource.includes('正在切换到第 {{ currentPage }} 页...'),
    true,
    'homepage should describe warm-page flips as a neutral page switch instead of a resource preheat warning',
  );
});
