import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const materializerSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/backend/src/services/publish-payload-materializer.service.ts',
  'utf8',
);
const publishPayloadSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/backend/src/services/publish-payload.service.ts',
  'utf8',
);
const apiSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/frontend/src/services/api.ts',
  'utf8',
);

test('publish bundle manifest exposes item recipe and recipe UI bundle roots', () => {
  for (const expected of [
    'itemRecipeBundleBasePath: string | null;',
    'itemRecipeBundleItems: string[];',
    'recipeUiBundleBasePath: string | null;',
    'recipeUiBundleItems: string[];',
    'buildPublishItemRecipeBundleBaseRelativePath',
    'buildPublishRecipeUiBundleBaseRelativePath',
  ]) {
    assert.equal(publishPayloadSource.includes(expected), true, `missing ${expected}`);
  }
});

test('publish materializer writes item-centric recipe and UI bundle shards', () => {
  for (const expected of [
    'buildPublishedItemRecipeBundle',
    'buildPublishedRecipeUiBundle',
    "payload_type: 'item-recipe-bundle'",
    "payload_type: 'recipe-ui-bundle'",
    'buildPublishItemRecipeBundleRelativePath(itemId)',
    'buildPublishRecipeUiBundleRelativePath(itemId)',
    'firstPageRecipes',
    'summaryGroups',
    'uiPayloadRefs',
    'assetRefs',
  ]) {
    assert.equal(materializerSource.includes(expected), true, `missing ${expected}`);
  }
});

test('frontend prefers item-centric recipe bundle before legacy recipe bootstrap files', () => {
  assert.equal(apiSource.includes('resolvePublishedItemRecipeBundlePath'), true);
  assert.equal(apiSource.includes('unwrapPublishedItemRecipeBundle'), true);
  const bundleIndex = apiSource.indexOf('resolvePublishedItemRecipeBundlePath(manifest, itemId)');
  const legacyIndex = apiSource.indexOf("resolvePublishedRecipeBootstrapPath(manifest, itemId, 'bootstrap')");
  assert.equal(bundleIndex > 0 && legacyIndex > bundleIndex, true, 'item recipe bundle should be tried before legacy bootstrap');
});
