import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const source = fs.readFileSync(
  'src/composables/useRecipeViewer.ts',
  'utf8',
);

const policySource = fs.readFileSync(
  'src/composables/recipe-browser/recipeHydrationPolicyCatalog.ts',
  'utf8',
);

const searchControllerSource = fs.readFileSync(
  'src/composables/recipe-browser/recipeSearchController.ts',
  'utf8',
);

test('recipe viewer prefers bounded group hydration before full-shard recovery', () => {
  assert.equal(
    source.includes('api.getRecipeBootstrapProducedByGroup('),
    true,
    'recipe viewer should request machine-group packs for producedBy categories',
  );
  assert.equal(
    source.includes('api.getRecipeBootstrapUsedInGroup('),
    true,
    'recipe viewer should request machine-group packs for usedIn categories before full-shard recovery',
  );
  assert.equal(
    source.includes('api.getRecipeBootstrapCategoryGroup('),
    true,
    'recipe viewer should request generic category packs for non-machine categories before full-shard recovery',
  );
  assert.equal(
    source.includes('prefetchNeighborRecipePacks'),
    true,
    'recipe viewer should prefetch adjacent category packs to reduce next-step latency',
  );
  assert.equal(
    source.includes('queueMicrotask(() => ensureVisibleRecipePack())'),
    true,
    'recipe viewer should defer visible recipe pack selection instead of forcing immediate full-shard hydration on initial load',
  );
  assert.equal(
    searchControllerSource.includes('api.getRecipeBootstrapSearch('),
    true,
    'recipe viewer should use recipe-bootstrap search packs instead of forcing full-shard hydration for recipe search',
  );
  assert.equal(
    source.includes('type RecipeHydrationRecoveryReason'),
    true,
    'full-shard recovery reasons should be owned by the hydration policy catalog, not local string unions',
  );
  assert.equal(
    policySource.includes('initial-visible-pack'),
    true,
    'initial visible pack recovery reason should be cataloged explicitly',
  );
  assert.equal(
    source.includes("reason: 'initial-fallback' | 'used-in-tab' | 'fallback-category'"),
    false,
    'old fallback reason union should stay removed from the viewer',
  );
});
