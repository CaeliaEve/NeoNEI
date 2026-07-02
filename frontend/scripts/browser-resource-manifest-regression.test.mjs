import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const runtimeTypesSource = fs.readFileSync(
  'src/runtime/types.ts',
  'utf8',
).replace(/\r\n/g, '\n');

const browserProjectionSource = fs.readFileSync(
  'src/runtime/browserProjection.ts',
  'utf8',
).replace(/\r\n/g, '\n');

const browserPageCacheSource = fs.readFileSync(
  'src/composables/browser/browserPageCache.ts',
  'utf8',
).replace(/\r\n/g, '\n');

const browserProjectionLoaderSource = fs.readFileSync(
  'src/composables/browser/browserPageProjectionLoader.ts',
  'utf8',
).replace(/\r\n/g, '\n');

const browserProjectionUtilsSource = fs.readFileSync(
  'src/composables/browser/browserProjectionUtils.ts',
  'utf8',
).replace(/\r\n/g, '\n');

const browserPresentationWarmSource = fs.readFileSync(
  'src/composables/browser/browserPagePresentationWarm.ts',
  'utf8',
).replace(/\r\n/g, '\n');

test('frontend preserves browser page resource manifests without page-scoped atlas dependency', () => {
  assert.equal(
    runtimeTypesSource.includes('export interface BrowserPageResourceManifest'),
    true,
    'API types should expose browser resource manifests',
  );
  assert.equal(
    runtimeTypesSource.includes('PageAtlasResult') || runtimeTypesSource.includes('PageAtlasSpriteEntry'),
    false,
    'runtime API types should not expose retired page-scoped atlas payload contracts',
  );
  assert.equal(
    browserProjectionSource.includes('function buildBrowserPageResourceManifest('),
    true,
    'published browser window slices should rebuild active-page resource manifests',
  );
  assert.equal(
    browserProjectionSource.includes('mediaManifest = trimRichMediaManifest(window.mediaManifest, data)'),
    true,
    'published browser window slices should preserve trimmed animated atlas manifests',
  );
  assert.equal(
    browserProjectionSource.includes('resourceManifest: buildBrowserPageResourceManifest(data, mediaManifest),'),
    true,
    'resource manifests should be built from visible entries and rich-media metadata only',
  );
  assert.equal(
    browserProjectionSource.includes('trimAtlasEntries'),
    false,
    'page-window derivation must not trim or rehydrate page-scoped static atlases',
  );
  assert.equal(
    browserProjectionSource.includes('atlasUrls: []'),
    true,
    'static texture ownership should remain in the resident global/native atlas registry',
  );
  assert.equal(
    browserProjectionSource.includes('atlasEntryCount: 0'),
    true,
    'page manifests should no longer report page-scoped static atlas entries',
  );
});

test('browser prewarm uses precomputed resource manifests', () => {
  assert.equal(
    browserPageCacheSource.includes('resourceManifest?: BrowserPagePackResponse[\'resourceManifest\'];'),
    true,
    'cached browser pages should retain resource manifests',
  );
  assert.equal(
    browserProjectionUtilsSource.includes('function collectBrowserPageResourceItemIds(page: CachedBrowserPage): string[]'),
    true,
    'browser prewarm should read item ids from resource manifests',
  );
  assert.equal(
    browserProjectionLoaderSource.includes("from '../../services/pageAtlas'"),
    false,
    'runtime catalog projection should not import the deleted page atlas service',
  );
  assert.equal(
    browserProjectionUtilsSource.includes('...(page.resourceManifest?.animatedAtlasFiles ?? [])'),
    true,
    'browser prewarm should read animated atlas files from resource manifests',
  );
  assert.equal(
    browserPageCacheSource.includes('PageAtlasResult'),
    false,
    'frontend visible-page cache should not carry retired page atlas payloads',
  );
  assert.equal(
    browserProjectionUtilsSource.includes('version: 4'),
    true,
    'persistent browser page cache should cut a new key version after removing page atlas payloads',
  );
});

test('stale browser page prewarm is gated by the active page token', () => {
  assert.equal(
    browserPresentationWarmSource.includes('let activeResourceWarmToken = 0;'),
    true,
    'item browser should track the active resource warm generation',
  );
  assert.equal(
    browserPresentationWarmSource.includes('activeResourceWarmToken += 1;'),
    true,
    'item browser should advance the warm generation for new visible page loads',
  );
  assert.equal(
    browserPresentationWarmSource.includes('warmToken !== activeResourceWarmToken'),
    true,
    'item browser should ignore stale prewarm continuations',
  );
});

test('global atlas misses do not block page presentation', () => {
  assert.equal(
    browserPresentationWarmSource.includes("source: 'native-runtime-render-worker'"),
    true,
    'page presentation should be owned by the native render worker instead of page image decode',
  );
  assert.equal(
    browserPresentationWarmSource.includes('Do not decode DOM\n        // atlas images during page transitions'),
    true,
    'page presentation should not block navigation on legacy page atlas image warming',
  );
});
