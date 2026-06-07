import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const browserSource = fs.readFileSync(
  'src/composables/useItemBrowser.ts',
  'utf8',
);

const animationBudgetSource = fs.readFileSync(
  'src/services/animationBudget.ts',
  'utf8',
).replace(/\r\n/g, '\n');

test('homepage browser pages warm only the resident global atlas without reviving page media fallbacks', () => {
  assert.equal(
    browserSource.includes("source: 'resident-global-atlas'"),
    true,
    'browser page presentation should report resident global atlas coverage',
  );
  assert.equal(
    browserSource.includes('queueRenderableMediaPrewarmFromUnknown(response.data'),
    false,
    'browser page application should not queue per-entry rich-media prewarm work on the homepage hot path',
  );
  assert.equal(
    browserSource.includes('primeAnimatedAtlasManifest(response.mediaManifest)'),
    false,
    'browser page application should not depend on page payload animated atlas metadata',
  );
  assert.equal(
    browserSource.includes('const animatedAtlasUrls = collectAnimatedAtlasUrls(response).slice'),
    false,
    'browser page application should not prewarm page-scoped animated atlas images',
  );
  assert.equal(
    browserSource.includes('warmGlobalBrowserAtlasForItemsDetailed(itemIds)'),
    true,
    'browser presentation warming should use the resident global atlas coverage path',
  );
  assert.equal(
    browserSource.includes('animatedOnly: true'),
    false,
    'homepage should not keep animated-only per-item media prewarm fallback',
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
