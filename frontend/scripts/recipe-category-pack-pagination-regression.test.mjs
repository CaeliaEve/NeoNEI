import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const source = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/frontend/src/composables/useRecipeViewer.ts',
  'utf8',
);

test('recipe viewer keeps large category hydration paged instead of pulling full group payloads at once', () => {
  assert.equal(
    source.includes('CATEGORY_PACK_PAGE_SIZE = 8'),
    true,
    'viewer should cap category/group hydration to a bounded page size',
  );
  assert.equal(
    source.includes('CATEGORY_PACK_IDS_ONLY_LIMIT = 0'),
    true,
    'viewer should support ids-only bootstrap requests before hydrating recipe windows',
  );
  assert.equal(
    source.includes('includeRecipeIds: true'),
    true,
    'viewer should fetch ordered recipe ids separately for large category paging',
  );
  assert.equal(
    source.includes('offset: clampedOffset'),
    true,
    'viewer should request later category windows by offset instead of always hydrating the whole group',
  );
  assert.equal(
    source.includes('await ensureCategoryPageReady'),
    true,
    'page navigation should ensure the target category page is hydrated before switching pages',
  );
});
