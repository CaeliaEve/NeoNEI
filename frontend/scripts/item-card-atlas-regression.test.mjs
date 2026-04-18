import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const source = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/frontend/src/components/ItemCard.vue',
  'utf8',
);

test('ItemCard does not mount fallback img when atlas sprite is available', () => {
  assert.equal(
    source.includes('v-show="!showAnimation && !atlasSprite"'),
    false,
    'atlas-backed cards must not keep a hidden fallback <img> mounted',
  );
  assert.equal(
    source.includes('const shouldRenderFallbackImage = computed('),
    true,
    'item card should compute fallback image visibility explicitly',
  );
  assert.equal(
    source.includes('v-if="shouldRenderFallbackImage"'),
    true,
    'atlas-backed cards should gate the fallback <img> with v-if',
  );
});
