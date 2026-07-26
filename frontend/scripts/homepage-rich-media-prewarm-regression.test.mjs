import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const browserSource = fs.readFileSync(
  'src/composables/useItemBrowser.ts',
  'utf8',
);

const browserPresentationWarmSource = fs.readFileSync(
  'src/composables/browser/browserPagePresentationWarm.ts',
  'utf8',
);

const sitePreheaterSource = fs.readFileSync(
  'src/composables/useSitePreheater.ts',
  'utf8',
);

const animationBudgetSource = fs.readFileSync(
  'src/services/animationBudget.ts',
  'utf8',
).replace(/\r\n/g, '\n');
const imageAssetLoaderSource = fs.readFileSync(
  'src/services/imageAssetLoader.ts',
  'utf8',
).replace(/\r\n/g, '\n');

test('homepage browser pages warm only the resident global atlas without reviving page media fallbacks', () => {
  assert.equal(
    browserPresentationWarmSource.includes("source: 'native-runtime-render-worker'"),
    true,
    'browser page presentation should report Native render-worker residency instead of DOM image warming',
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
    browserPresentationWarmSource.includes('Do not decode DOM\n        // atlas images during page transitions'),
    true,
    'browser presentation warming should explicitly avoid DOM atlas decode work on page transitions',
  );
  assert.equal(
    browserSource.includes('animatedOnly: true'),
    false,
    'homepage should not keep animated-only per-item media prewarm fallback',
  );
  assert.equal(
    sitePreheaterSource.includes('pagePack.atlas?.atlasUrl'),
    false,
    'site preheater should not revive page-scoped static atlas image warming',
  );
  assert.equal(
    sitePreheaterSource.includes('\\u5206\\u9875 Atlas fallback') || sitePreheaterSource.includes('分页 Atlas fallback'),
    false,
    'site preheater status should not advertise a retired page atlas fallback',
  );
  assert.equal(
    animationBudgetSource.includes('prewarmItemViaGlobalBrowserAtlas'),
    true,
    'shared media prewarm should route item candidates through the resident global atlas',
  );
  assert.equal(
    animationBudgetSource.includes('await prewarmItemViaGlobalBrowserAtlas({ ...entity, itemId });'),
    true,
    'recipe/page item prewarm must not fetch retired /images/item URLs when an itemId is available',
  );
});

test('shared image asset loader remembers session-warm assets after the short image cache trims entries', () => {
  assert.equal(
    imageAssetLoaderSource.includes('const warmImageAssetHistory = new Map<string, true>();'),
    true,
    'animation budget should keep a separate warm-history map for assets that have already been loaded this session',
  );
  assert.equal(
    imageAssetLoaderSource.includes('touchBoundedCache(warmImageAssetHistory, src, true, MAX_WARM_IMAGE_HISTORY);'),
    true,
    'successful image loads should stamp the asset into the warm-history map',
  );
  assert.equal(
    imageAssetLoaderSource.includes('return warmImageAssetHistory.has(normalizedSrc)\n    || imageAssetCache.has(normalizedSrc)\n    || imageAssetInFlight.has(normalizedSrc);'),
    true,
    'page presentation gating should treat session-warmed assets as warm even after the short image cache rotates older entries out',
  );
});
