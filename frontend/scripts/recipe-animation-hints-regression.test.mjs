import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const normalizationSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/frontend/src/domain/recipeNormalization.ts',
  'utf8',
);

const animationBudgetSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/frontend/src/services/animationBudget.ts',
  'utf8',
);

const craftingUiSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/frontend/src/components/StandardCraftingUI.vue',
  'utf8',
);

const assemblyLineUiSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/frontend/src/components/GTAssemblyLineUI.vue',
  'utf8',
);

const animatedItemIconSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/frontend/src/components/AnimatedItemIcon.vue',
  'utf8',
);

const recipeViewerSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/frontend/src/composables/useRecipeViewer.ts',
  'utf8',
);

test('recipe normalization primes render animation hints from indexed payloads', () => {
  assert.equal(
    normalizationSource.includes('primeRenderAnimationHintsFromUnknown(indexed);'),
    true,
    'indexed recipe normalization should seed render hints before icon animation probing runs',
  );
});

test('animation probing consults primed render hints before falling back to per-asset contract fetches', () => {
  assert.equal(
    animationBudgetSource.includes('const primedRenderHint = renderAssetRef ? primedRenderHintCache.get(renderAssetRef) : undefined;'),
    true,
    'animation probe should check primed render hints first',
  );
  assert.equal(
    animationBudgetSource.includes('const atlasEntry = await fetchAnimatedAtlasEntry(renderAssetRef);'),
    true,
    'animation probe should prefer atlas-manifest detection before contract fallback',
  );
});

test('recipe UI components consume inline item payloads instead of refetching item batches for first paint', () => {
  assert.equal(
    craftingUiSource.includes('api.getItemsByIds('),
    false,
    'standard crafting UI should render directly from normalized slot payloads',
  );
  assert.equal(
    assemblyLineUiSource.includes('api.getItemsByIds('),
    false,
    'assembly line UI should render directly from normalized slot payloads',
  );
  assert.equal(
    normalizationSource.includes("renderAssetRef: typeof candidate.renderAssetRef === 'string' ? candidate.renderAssetRef : null"),
    true,
    'recipe normalization should preserve inline render metadata for visible slots',
  );
});

test('animated item icons reuse prepared frame caches instead of rebuilding frames on every mount', () => {
  assert.equal(
    animatedItemIconSource.includes('prepareItemAnimationFrames({'),
    true,
    'animated item icon should consume prepared animation frame caches',
  );
  assert.equal(
    animationBudgetSource.includes('const preparedAnimationFrameCache = new Map<string, PreparedAnimationFrame[]>()'),
    true,
    'animation budget should keep a shared prepared animation frame cache',
  );
});

test('recipe viewer prewarms current and nearby page media to reduce blank textures after rapid paging', () => {
  assert.equal(
    recipeViewerSource.includes('RECIPE_PAGE_PREWARM_LOOKAHEAD = 6'),
    true,
    'recipe viewer should prewarm several pages ahead of the visible page',
  );
  assert.equal(
    recipeViewerSource.includes('queueRenderableMediaPrewarmFromUnknown(recipesForPrewarm'),
    true,
    'recipe viewer should queue media prewarm from the visible recipe window',
  );
});
