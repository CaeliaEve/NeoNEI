import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'node:path';

const read = (relativePath) =>
  fs.readFileSync(path.resolve('..', relativePath), 'utf8');

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

test('legacy item card fallback is retired from the homepage path', () => {
  const homeSource = read('frontend/src/views/HomePage.vue');

  assert.equal(
    homeSource.includes('<ItemCard'),
    false,
    'homepage should not route browser or history items through the retired item-card fallback',
  );

  assert.equal(
    homeSource.includes('<HomeCanvasGrid'),
    true,
    'homepage should keep using the shared atlas canvas grid',
  );
});

