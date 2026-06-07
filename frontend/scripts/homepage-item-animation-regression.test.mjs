import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'node:path';

const read = (relativePath) =>
  fs.readFileSync(path.resolve('..', relativePath), 'utf8');

test('homepage item browser keeps animation enabled for right-side native surface', () => {
  const source = read('frontend/src/components/home/HomeBrowserColumn.vue');

  assert.equal(
    source.includes(':enable-animation="false"'),
    false,
    'homepage browser surface should not disable animation in the right browsing rail',
  );
  assert.equal(
    source.includes(':enable-animation="true"'),
    true,
    'homepage browser surface should explicitly keep exported animation timing enabled',
  );
});

test('homepage history rail uses the native surface and browser pack hydration path', () => {
  const historyComposableSource = read('frontend/src/composables/home/useHomeHistory.ts');
  const historySource = read('frontend/src/components/home/HomeHistoryStrip.vue');

  assert.equal(
    historyComposableSource.includes('const historyBrowserEntries = computed<BrowserGridEntry[]>(() =>'),
    true,
    'history rail should project visible history items into browser grid entries for native surface hydration',
  );

  assert.equal(
    historySource.includes('<NativeBrowserSurface')
      && historySource.includes(':entries="historyBrowserEntries"')
      && historySource.includes(':atlas="historyAtlas"')
      && historySource.includes(':enable-animation="false"')
      && historySource.includes(':prefer-atlas="true"')
      && historySource.includes(':history-item-ids="historyItemIds"')
      && !historySource.includes('<ItemTooltip')
      && !historySource.includes('<ItemCard')
      && !historySource.includes('<HomeCanvasGrid'),
    true,
    'history rail should hydrate atlas/media data and render through the native surface without DOM grid fallback',
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

test('legacy item card and DOM grid fallbacks are retired from the homepage path', () => {
  const homeSource = read('frontend/src/views/HomePage.vue');
  const browserSource = read('frontend/src/components/home/HomeBrowserColumn.vue');
  const historySource = read('frontend/src/components/home/HomeHistoryStrip.vue');
  const nativeSource = read('frontend/src/components/native-surface/NativeBrowserSurface.vue');
  const combined = `${homeSource}\n${browserSource}\n${historySource}\n${nativeSource}`;

  assert.equal(
    combined.includes('<ItemCard'),
    false,
    'homepage should not route browser or history items through the retired item-card fallback',
  );

  assert.equal(
    combined.includes('<HomeCanvasGrid'),
    false,
    'homepage should not mount the retired DOM/canvas grid hot path',
  );

  assert.equal(
    browserSource.includes('<NativeBrowserSurface') && historySource.includes('<NativeBrowserSurface'),
    true,
    'homepage browser and history rails should use the native atlas surface',
  );
});
