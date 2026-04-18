import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const gridSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/frontend/src/components/VirtualRecipeGrid.vue',
  'utf8',
);
const viewSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/frontend/src/views/RecipeView.vue',
  'utf8',
);

test('RecipeView disables preview images in VirtualRecipeGrid to avoid bulk image requests', () => {
  assert.equal(
    viewSource.includes(':show-preview-images="false"'),
    true,
    'recipe preview grid should disable image thumbnails by default',
  );
});

test('VirtualRecipeGrid gates preview image rendering behind explicit prop', () => {
  assert.equal(
    gridSource.includes('showPreviewImages'),
    true,
    'virtual recipe grid must support disabling preview images',
  );
  assert.equal(
    gridSource.includes('v-if="showPreviewImages && entry.previewItemId"'),
    true,
    'preview image nodes must not mount unless explicitly enabled',
  );
});
