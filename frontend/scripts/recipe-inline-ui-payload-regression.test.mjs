import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const source = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/frontend/src/components/RecipeDisplayRouter.vue',
  'utf8',
);

test('recipe display router prefers inline ui payload hints before network fallback', () => {
  assert.equal(
    source.includes('const inlineRecipeUiPayload = computed'),
    true,
    'router should derive ui payload directly from bootstrap/shard-enriched recipe data',
  );
  assert.equal(
    source.includes('if (inlineRecipeUiPayload.value) {'),
    true,
    'router should short-circuit ui payload fetch when inline payload is already present',
  );
});
