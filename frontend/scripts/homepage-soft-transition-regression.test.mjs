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
    homePageSource.includes('v-if="transitioning"'),
    true,
    'homepage should render a lightweight in-grid transition indicator during warm page flips',
  );
});
