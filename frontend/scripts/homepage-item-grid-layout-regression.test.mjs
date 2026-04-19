import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const homePageSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/frontend/src/views/HomePage.vue',
  'utf8',
);

test('homepage item grid uses stretch-fit columns and does not enable vertical scrolling', () => {
  assert.equal(
    homePageSource.includes('<div class="homepage-shell h-screen overflow-hidden flex">'),
    true,
    'homepage shell should lock to the viewport and hide page-level overflow so the root page cannot scroll vertically',
  );

  assert.equal(
    homePageSource.includes("class=\"item-grid-shell grid gap-1 w-full p-4 flex-1 min-h-0 overflow-hidden\""),
    true,
    'item grid container should stay overflow-hidden so the right browser column does not vertically scroll',
  );

  assert.equal(
    homePageSource.includes("gridTemplateColumns: `repeat(auto-fit, minmax(${gridCellSize}, 1fr))`"),
    true,
    'item grid columns should use auto-fit minmax so the last column fills the right edge instead of leaving a gutter',
  );

  assert.equal(
    homePageSource.includes('class="item-grid-cell"'),
    true,
    'item cards should mount inside stretch cells so each adaptive column stays visually aligned',
  );

  assert.equal(
    homePageSource.includes('const itemGridShellRef = ref<HTMLElement | null>(null);'),
    true,
    'homepage should track the real grid shell element so page capacity can be measured from the rendered layout',
  );

  assert.equal(
    homePageSource.includes('new ResizeObserver(() => {'),
    true,
    'homepage should observe the rendered grid shell size to keep pageSize aligned with the visible rows and columns',
  );
});
