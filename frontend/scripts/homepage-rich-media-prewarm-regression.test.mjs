import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const browserSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/frontend/src/composables/useItemBrowser.ts',
  'utf8',
);

const animationBudgetSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/frontend/src/services/animationBudget.ts',
  'utf8',
).replace(/\r\n/g, '\n');

test('homepage browser pages prewarm atlas plus animated-only rich media without reviving per-item static image warmups', () => {
  assert.equal(
    browserSource.includes('loadImageAsset(response.atlas.atlasUrl)'),
    true,
    'browser page application should prewarm the shared atlas image as soon as the page pack arrives',
  );
  assert.equal(
    browserSource.includes('queueRenderableMediaPrewarmFromUnknown(response.data'),
    true,
    'browser page application should queue rich-media prewarm work from the visible entries',
  );
  assert.equal(
    browserSource.includes('primeAnimatedAtlasManifest(response.mediaManifest)'),
    true,
    'browser page application should prime animated atlas metadata from the page payload before item renderers probe it',
  );
  assert.equal(
    browserSource.includes('const animatedAtlasUrls = collectAnimatedAtlasUrls(response).slice'),
    true,
    'browser page application should prewarm shared animated atlas images from the page manifest',
  );
  assert.equal(
    browserSource.includes('void ensureBrowserPagePresentationWarm(cacheKey, normalized, { animatedEntryLimit: 40, atlasLimit: 6 })'),
    true,
    'neighbor page prefetches should also prewarm atlas and animated rich media before the user flips pages',
  );
  assert.equal(
    browserSource.includes('animatedOnly: true'),
    true,
    'browser page rich-media warmup should stay limited to animated/render-contract items instead of rewarming every static tile',
  );
});

test('animation budget remembers session-warm assets even after the short HTMLImageElement cache trims older entries', () => {
  assert.equal(
    animationBudgetSource.includes('const warmImageAssetHistory = new Map<string, true>();'),
    true,
    'animation budget should keep a separate warm-history map for assets that have already been loaded this session',
  );
  assert.equal(
    animationBudgetSource.includes('touchBoundedCache(warmImageAssetHistory, src, true, MAX_WARM_IMAGE_HISTORY);'),
    true,
    'successful image loads should stamp the asset into the warm-history map',
  );
  assert.equal(
    animationBudgetSource.includes('return warmImageAssetHistory.has(normalizedSrc)\n    || imageAssetCache.has(normalizedSrc)\n    || imageAssetInFlight.has(normalizedSrc);'),
    true,
    'page presentation gating should treat session-warmed assets as warm even after the short image cache rotates older entries out',
  );
});
