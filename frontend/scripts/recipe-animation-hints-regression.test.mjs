import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const normalizationSource = fs.readFileSync(
  'src/domain/recipeNormalization.ts',
  'utf8',
);

const animationBudgetSource = fs.readFileSync(
  'src/services/animationBudget.ts',
  'utf8',
);

const craftingUiSource = fs.readFileSync(
  'src/components/StandardCraftingUI.vue',
  'utf8',
);

const assemblyLineUiSource = fs.readFileSync(
  'src/components/GTAssemblyLineUI.vue',
  'utf8',
);

const animatedItemIconSource = fs.readFileSync(
  'src/components/AnimatedItemIcon.vue',
  'utf8',
);

const nativeSurfaceSource = fs.readFileSync(
  'src/components/native-surface/NativeBrowserSurface.vue',
  'utf8',
);

const recipeViewerSource = fs.readFileSync(
  'src/composables/useRecipeViewer.ts',
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
    animationBudgetSource.includes('const primedRenderHint = getPrimedRenderHint(renderAssetRef);'),
    true,
    'animation probe should check primed render hints first',
  );
  assert.equal(
    animationBudgetSource.includes('const atlasEntry = await fetchAnimatedAtlasEntry(renderAssetRef);'),
    true,
    'animation probe should prefer atlas-manifest detection before contract fallback',
  );

  assert.equal(
    animationBudgetSource.includes("renderContract.animationMode === 'native_sprite_aux'")
      || animationBudgetSource.includes('renderContract.animationMode === \"native_sprite_aux\"'),
    true,
    'animation probe should treat auxiliary native sprite timelines as animated instead of collapsing them to static',
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

test('animated item icons use the compiled atlas/render index instead of per-item probing', () => {
  assert.equal(
    animatedItemIconSource.includes('prepareItemAnimationFrames('),
    false,
    'recipe item icons must not fall back to per-item GIF/sprite probing',
  );
  assert.equal(
    animatedItemIconSource.includes('warmGlobalBrowserAtlasForItemsDetailed([itemId])'),
    true,
    'recipe item icons should resolve through the global browser atlas index',
  );
});

test('homepage and card animations advance from a shared animation clock instead of per-mount local timers', () => {
  assert.equal(
    animationBudgetSource.includes('export const getSharedAnimationNowMs = (): number => {'),
    true,
    'animation budget should expose a shared animation clock',
  );
  assert.equal(
    animationBudgetSource.includes('export const resolveTimelineFrameIndex = ('),
    true,
    'animation budget should expose shared native sprite timeline resolution',
  );
  assert.equal(
    animationBudgetSource.includes('export const resolvePreparedAnimationFrameIndex = ('),
    true,
    'animation budget should expose shared prepared-frame timeline resolution',
  );
  assert.equal(
    nativeSurfaceSource.includes('scheduleNextAnimatedNativeFrame(frame.nextFrameDelayMs)'),
    true,
    'homepage native browser surface should advance exported atlas animations from native frame timing',
  );
  assert.equal(
    animatedItemIconSource.includes('resolveTimelineFrameIndex(animation.timeline, timestamp)'),
    true,
    'recipe item icons should reuse exported atlas timelines from the shared clock',
  );
});

test('recipe viewer prewarms current and nearby page media to reduce blank textures after rapid paging', () => {
  assert.equal(
    recipeViewerSource.includes('buildCategoryPrewarmPageSequence(pageCount, pageIndex)'),
    true,
    'recipe viewer should use the shared category prewarm page sequence for nearby recipe media',
  );
  assert.equal(
    recipeViewerSource.includes('RECIPE_PAGE_PREWARM_MAX_RECIPES'),
    true,
    'recipe viewer should cap nearby recipe media prewarm through the shared budget constant',
  );
  assert.equal(
    recipeViewerSource.includes('queueRenderableMediaPrewarmFromUnknown(recipesForPrewarm'),
    true,
    'recipe viewer should queue media prewarm from the visible recipe window',
  );
});
