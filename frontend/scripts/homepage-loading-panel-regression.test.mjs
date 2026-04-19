import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const homePageSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/frontend/src/views/HomePage.vue',
  'utf8',
);

test('homepage loading panel expands across the full item browser stage', () => {
  assert.equal(
    homePageSource.includes('.list-state-panel {\n  flex: 1;\n  align-self: stretch;\n  width: auto;\n  max-width: none;'),
    true,
    'list loading panel should stretch across the whole browser column instead of using the generic compact width',
  );
});
