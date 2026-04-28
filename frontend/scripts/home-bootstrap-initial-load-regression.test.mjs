import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const source = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/frontend/src/composables/useItemBrowser.ts',
  'utf8',
);

test('initial homepage load can use a single home-bootstrap payload for first-page cold starts', () => {
  assert.equal(
    source.includes('const measuredCapacity = allowMeasuredPageCapacity'),
    true,
    'item browser should support switching between measured-capacity and heuristic page sizing paths',
  );
  assert.equal(
    source.includes('api.getHomeBootstrap({'),
    true,
    'item browser should use the home bootstrap endpoint on eligible cold-start first-page loads',
  );
  assert.equal(
    source.includes('applyHomeBootstrapResponse'),
    true,
    'home bootstrap responses should be normalized into the same page cache path as regular browser page packs',
  );
  assert.equal(
    source.includes('isHomeBootstrapEligible'),
    true,
    'home bootstrap should remain constrained to the simple first-page no-search state to avoid incorrect expanded/search hydration',
  );
  assert.equal(
    source.includes('allowMeasuredPageCapacity = true;\n    await nextTick();\n    pageSize.value = calculatePageSize();\n    await loadInitialHomeState();'),
    true,
    'initial homepage load should try to use the mounted viewport capacity before issuing the first browser-page request',
  );
});

test('browser page caches survive homepage remounts through a bounded shared cache', () => {
  assert.equal(
    source.includes('const sharedPageCache = new Map<string, CachedBrowserPage>();'),
    true,
    'browser pages should be retained across route exits instead of rebuilding from scratch on every return to the homepage',
  );
  assert.equal(
    source.includes('const SHARED_BROWSER_PAGE_CACHE_LIMIT = 48;'),
    true,
    'shared browser page cache should stay bounded to avoid unbounded memory growth while the SPA remains open',
  );
  assert.equal(
    source.includes('setSharedBrowserPageCache(cacheKey, normalized);'),
    true,
    'browser page responses should be inserted through the shared bounded cache helper',
  );
});

test('homepage bootstrap keeps the publish-bundle fast path available before falling back to API bootstrap', () => {
  const apiSource = fs.readFileSync(
    'E:/codex/ae2/NeoNEI/frontend/src/services/api.ts',
    'utf8',
  );

  assert.equal(
    apiSource.includes('manifest.publishBundle?.files.homeBootstrapWindows'),
    true,
    'api.getHomeBootstrap should consult the published home-bootstrap bundle when available',
  );
  assert.equal(
    apiSource.includes('fetchPublishedJson'),
    true,
    'published bootstrap assets should be read through the shared published-json helper',
  );
});

test('search warmup preloads the browser search worker through published search shards', () => {
  assert.equal(
    source.includes('preloadBrowserSearchWorker'),
    true,
    'item browser warmSearchIndex should prewarm the browser search worker',
  );
  const apiSource = fs.readFileSync(
    'E:/codex/ae2/NeoNEI/frontend/src/services/api.ts',
    'utf8',
  );
  assert.equal(
    apiSource.includes('browserSearchShards'),
    true,
    'publish bundle manifest should expose browser search shard metadata to the frontend',
  );
});

test('recipe bootstrap fast path can resolve published hot-item bootstrap shards before API fallback', () => {
  const apiSource = fs.readFileSync(
    'E:/codex/ae2/NeoNEI/frontend/src/services/api.ts',
    'utf8',
  );

  assert.equal(
    apiSource.includes('resolvePublishedRecipeBootstrapPath'),
    true,
    'api should resolve published recipe bootstrap assets when the manifest advertises them',
  );
  assert.equal(
    apiSource.includes("manifest, itemId, 'bootstrap'"),
    true,
    'recipe bootstrap calls should consult the published bootstrap asset before falling back to the API route',
  );
  assert.equal(
    apiSource.includes("manifest, itemId, 'shard'"),
    true,
    'recipe bootstrap shard calls should consult the published shard asset before falling back to the API route',
  );
});

test('recipe group index packs can use published hot-item static assets for first id-probe group pages', () => {
  const apiSource = fs.readFileSync(
    'E:/codex/ae2/NeoNEI/frontend/src/services/api.ts',
    'utf8',
  );
  const viewerSource = fs.readFileSync(
    'E:/codex/ae2/NeoNEI/frontend/src/composables/useRecipeViewer.ts',
    'utf8',
  );

  assert.equal(
    apiSource.includes('resolvePublishedRecipeGroupIndexPath'),
    true,
    'api should resolve published recipe group index assets when the bundle advertises them',
  );
  assert.equal(
    apiSource.includes('recipeGroupIndexBasePath'),
    true,
    'publish bundle manifest should expose a recipe group index asset base path',
  );
  assert.equal(
    viewerSource.includes('machineKey,'),
    true,
    'recipe viewer should forward machine keys so machine-group lead assets can be addressed without client-side alias guessing',
  );
  assert.equal(
    viewerSource.includes('prefetchCurrentCategoryAdjacentPages'),
    true,
    'recipe viewer should also prefetch adjacent pages within the active category to reduce next-page latency after first open',
  );
});
