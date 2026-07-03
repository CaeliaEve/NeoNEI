import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const presentationSource = fs.readFileSync(
  'src/composables/recipe-display/useRecipePresentation.ts',
  'utf8',
);
const policySource = fs.readFileSync(
  'src/composables/recipe-display/recipePresentationPolicyCatalog.ts',
  'utf8',
);

test('recipe presentation prefers inline ui payload hints before network fetch', () => {
  assert.equal(
    presentationSource.includes('const inlineRecipeUiPayload = computed'),
    true,
    'presentation should derive ui payload directly from bootstrap/shard-enriched recipe data',
  );
  assert.equal(
    policySource.includes('export function resolveInlineRecipeUiPayload'),
    true,
    'inline payload extraction should live in the presentation policy catalog',
  );
  assert.equal(
    presentationSource.includes('if (inlineRecipeUiPayload.value) {'),
    true,
    'presentation should short-circuit ui payload fetch when inline payload is already present',
  );
});
