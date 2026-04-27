import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const source = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/frontend/src/composables/useItemBrowser.ts',
  'utf8',
);

test('homepage browser pages prewarm atlas plus animated-only rich media without reviving per-item static image warmups', () => {
  assert.equal(
    source.includes('loadImageAsset(response.atlas.atlasUrl)'),
    true,
    'browser page application should prewarm the shared atlas image as soon as the page pack arrives',
  );
  assert.equal(
    source.includes('queueRenderableMediaPrewarmFromUnknown(response.data'),
    true,
    'browser page application should queue rich-media prewarm work from the visible entries',
  );
  assert.equal(
    source.includes('primeAnimatedAtlasManifest(response.mediaManifest)'),
    true,
    'browser page application should prime animated atlas metadata from the page payload before item renderers probe it',
  );
  assert.equal(
    source.includes('const animatedAtlasUrls = collectAnimatedAtlasUrls(response).slice'),
    true,
    'browser page application should prewarm shared animated atlas images from the page manifest',
  );
  assert.equal(
    source.includes('prewarmCachedBrowserPageMedia(normalized, { animatedEntryLimit: 40, atlasLimit: 6 })'),
    true,
    'neighbor page prefetches should also prewarm atlas and animated rich media before the user flips pages',
  );
  assert.equal(
    source.includes('animatedOnly: true'),
    true,
    'browser page rich-media warmup should stay limited to animated/render-contract items instead of rewarming every static tile',
  );
});
