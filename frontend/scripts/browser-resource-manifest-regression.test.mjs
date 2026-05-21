import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const apiSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/frontend/src/services/api.ts',
  'utf8',
).replace(/\r\n/g, '\n');

const itemBrowserSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/frontend/src/composables/useItemBrowser.ts',
  'utf8',
).replace(/\r\n/g, '\n');

test('frontend preserves browser page resource manifests', () => {
  assert.equal(
    apiSource.includes('export interface BrowserPageResourceManifest'),
    true,
    'API types should expose browser resource manifests',
  );
  assert.equal(
    apiSource.includes('function buildBrowserPageResourceManifest('),
    true,
    'published browser window slices should rebuild trimmed resource manifests',
  );
  assert.equal(
    apiSource.includes('mediaManifest = trimRichMediaManifest(window.mediaManifest, data)'),
    true,
    'published browser window slices should preserve trimmed animated atlas manifests',
  );
  assert.equal(
    apiSource.includes('resourceManifest: buildBrowserPageResourceManifest(data, atlas, mediaManifest),'),
    true,
    'published browser window slices should expose active-page resource manifests',
  );
});

test('browser prewarm uses precomputed resource manifests', () => {
  assert.equal(
    itemBrowserSource.includes('resourceManifest?: BrowserPagePackResponse[\'resourceManifest\'];'),
    true,
    'cached browser pages should retain resource manifests',
  );
  assert.equal(
    itemBrowserSource.includes('function collectBrowserPageResourceItemIds(page: CachedBrowserPage): string[]'),
    true,
    'browser prewarm should read item ids from resource manifests',
  );
  assert.equal(
    itemBrowserSource.includes('...(response.resourceManifest?.atlasUrls ?? [])'),
    true,
    'browser prewarm should read static atlas urls from resource manifests',
  );
  assert.equal(
    itemBrowserSource.includes('...(page.resourceManifest?.animatedAtlasFiles ?? [])'),
    true,
    'browser prewarm should read animated atlas files from resource manifests',
  );
});

test('stale browser page prewarm is gated by the active page token', () => {
  assert.equal(
    itemBrowserSource.includes('let activeResourceWarmToken = 0;'),
    true,
    'item browser should track the active resource warm generation',
  );
  assert.equal(
    itemBrowserSource.includes('activeResourceWarmToken += 1;'),
    true,
    'item browser should advance the warm generation for new visible page loads',
  );
  assert.equal(
    itemBrowserSource.includes('if (warmToken !== activeResourceWarmToken)'),
    true,
    'item browser should ignore stale prewarm continuations',
  );
});

test('global atlas misses do not block page presentation', () => {
  assert.equal(
    itemBrowserSource.includes('if (hasGlobalBrowserAtlas() && globalCoverage?.total && globalCoverage.total > 0)'),
    true,
    'page presentation should fast-path once the global atlas index can serve the page',
  );
  assert.equal(
    itemBrowserSource.includes('if (globalCoverage.missingCount > 0)'),
    true,
    'missing atlas entries should be warmed asynchronously instead of blocking visible navigation',
  );
});
