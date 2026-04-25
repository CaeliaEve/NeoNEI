import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const read = (relativePath) =>
  fs.readFileSync(`E:/codex/ae2/NeoNEI/${relativePath}`, 'utf8');

test('homepage item browser keeps animation enabled for right-side item cards', () => {
  const source = read('frontend/src/views/HomePage.vue');

  assert.equal(
    source.includes(':enableAnimation="false"'),
    false,
    'homepage item cards should not explicitly disable animation in the right browsing rail',
  );
});

test('homepage no longer exposes a manual animation speed setting', () => {
  const source = read('frontend/src/views/HomePage.vue');

  assert.equal(
    source.includes('animationSpeed'),
    false,
    'homepage settings should not override exported in-game animation timing',
  );
});

test('atlas-backed item cards still schedule animation enhancement once visible', () => {
  const source = read('frontend/src/components/ItemCard.vue');

  assert.equal(
    source.includes('if (atlasSprite) {') && source.includes('scheduleAnimationEnhancement();'),
    true,
    'atlas-backed item cards should promote from static atlas sprites to animated rendering after first paint',
  );

  assert.equal(
    source.includes('normalizeFrameDuration'),
    true,
    'item cards should normalize timing from exported metadata instead of a manual fps prop',
  );
});
