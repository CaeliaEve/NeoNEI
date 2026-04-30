import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const read = (relativePath) =>
  fs.readFileSync(`E:/codex/ae2/NeoNEI/${relativePath}`, 'utf8');

test('homepage item browser keeps animation enabled for right-side item cards', () => {
  const source = read('frontend/src/views/HomePage.vue');

  assert.equal(
    source.includes(':enableAnimation="false"'),
    false,
    'homepage item cards should not explicitly disable animation in the right browsing rail',
  );
});

test('homepage history rail reuses the shared canvas grid and browser pack hydration path', () => {
  const source = read('frontend/src/views/HomePage.vue');

  assert.equal(
    source.includes('const historyBrowserEntries = computed<BrowserGridEntry[]>(() =>'),
    true,
    'history rail should project visible history items into browser grid entries so it can reuse the shared canvas host',
  );

  assert.equal(
    source.includes('<HomeCanvasGrid')
      && source.includes(':entries="historyBrowserEntries"')
      && source.includes(':atlas="historyAtlas"')
      && source.includes(':enable-animation="true"')
      && source.includes(':prefer-atlas="true"')
      && source.includes('peekBrowserPagePackByIds')
      && source.includes('getBrowserPagePackByIds')
      && source.includes('primeAnimatedAtlasManifest')
      && source.includes('queueRenderableMediaPrewarmFromUnknown')
      && !source.includes('<ItemTooltip')
      && !source.includes('<ItemCard'),
    true,
    'history rail should hydrate atlas/media data through the shared browser pack pipeline and render through the same canvas grid as the main browser',
  );
});

test('homepage no longer exposes a manual animation speed setting', () => {
  const source = read('frontend/src/views/HomePage.vue');

  assert.equal(
    source.includes('animationSpeed'),
    false,
    'homepage settings should not override exported in-game animation timing',
  );
});

test('atlas-backed item cards still schedule animation enhancement once visible', () => {
  const source = read('frontend/src/components/ItemCard.vue');

  assert.equal(
    source.includes('if (atlasSprite) {') && source.includes('scheduleAnimationEnhancement();'),
    true,
    'atlas-backed item cards should promote from static atlas sprites to animated rendering after first paint',
  );

  assert.equal(
    source.includes('prepareItemAnimationFrames'),
    true,
    'item cards should reuse the shared prepared animation pipeline so history cards match the main browser animation behavior',
  );
});
