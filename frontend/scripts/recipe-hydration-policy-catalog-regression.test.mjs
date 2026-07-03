import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readSource = (relativePath) => readFileSync(resolve(frontendRoot, relativePath), 'utf8');

const policySource = readSource('src/composables/recipe-browser/recipeHydrationPolicyCatalog.ts');
const viewerSource = readSource('src/composables/useRecipeViewer.ts');
const shardHydratorSource = readSource('src/composables/recipe-browser/recipeShardHydrator.ts');

test('recipe hydration recovery policy is catalog-owned and descriptor validated', () => {
  assert.match(policySource, /type RecipeHydrationRecoveryDescriptor/);
  assert.match(policySource, /validateRecoveryDescriptors/);
  assert.match(policySource, /Duplicate recipe hydration recovery descriptor/);
  assert.match(policySource, /initial-visible-pack/);
  assert.match(policySource, /used-in-visible-pack/);
  assert.match(policySource, /category-window-recovery/);
  assert.match(policySource, /group-window-recovery/);
  assert.match(policySource, /RECIPE_HYDRATION_POLICY_CATALOG/);
});

test('recipe viewer escalates through hydration policy ops instead of local fallback strings', () => {
  assert.match(viewerSource, /RecipeHydrationRecoveryReason/);
  assert.match(viewerSource, /RECIPE_HYDRATION_RECOVERY_REASONS\.groupWindowRecovery/);
  assert.match(viewerSource, /recipeHydrationRecoveryReasonForTab\(tab\)/);
  assert.match(viewerSource, /reportRecipeGroupHydrationFailure/);
  assert.doesNotMatch(viewerSource, /falling back to full shard/);
  assert.doesNotMatch(viewerSource, /fallback-category/);
  assert.doesNotMatch(viewerSource, /initial-fallback/);
  assert.doesNotMatch(viewerSource, /used-in-tab/);
});

test('recipe shard hydrator forbids chunked indexed-recipe fallback after shard failure', () => {
  assert.match(shardHydratorSource, /reportRecipeShardHydrationFailure\(shardError\)/);
  assert.doesNotMatch(shardHydratorSource, /getIndexedRecipesByIds/);
  assert.doesNotMatch(shardHydratorSource, /chunkSize/);
  assert.doesNotMatch(shardHydratorSource, /chunked batch/);
  assert.doesNotMatch(shardHydratorSource, /falling back/);
});
