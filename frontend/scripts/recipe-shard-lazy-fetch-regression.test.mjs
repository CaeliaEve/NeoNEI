import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const source = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/frontend/src/composables/useRecipeViewer.ts',
  'utf8',
);

test('recipe viewer prefers producedBy machine-group hydration before full shard fallback', () => {
  assert.equal(
    source.includes('api.getRecipeBootstrapProducedByGroup('),
    true,
    'recipe viewer should request machine-group packs for producedBy categories',
  );
  assert.equal(
    source.includes('api.getRecipeBootstrapUsedInGroup('),
    true,
    'recipe viewer should request machine-group packs for usedIn categories before full shard fallback',
  );
  assert.equal(
    source.includes('api.getRecipeBootstrapCategoryGroup('),
    true,
    'recipe viewer should request generic category packs for non-machine categories before full shard fallback',
  );
  assert.equal(
    source.includes('prefetchNeighborRecipePacks'),
    true,
    'recipe viewer should prefetch adjacent category packs to reduce next-step latency',
  );
  assert.equal(
    source.includes('queueMicrotask(() => ensureVisibleRecipePack())'),
    true,
    'recipe viewer should defer visible recipe pack selection instead of forcing immediate full shard hydration on initial load',
  );
  assert.equal(
    source.includes('api.getRecipeBootstrapSearch('),
    true,
    'recipe viewer should use recipe-bootstrap search packs instead of forcing full shard hydration for recipe search',
  );
  assert.equal(
    source.includes("reason: 'initial-fallback' | 'used-in-tab' | 'fallback-category'"),
    true,
    'search-driven full shard fallback should be removed from the viewer reason union',
  );
});
