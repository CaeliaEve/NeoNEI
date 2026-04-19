import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const browserSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/frontend/src/composables/useItemBrowser.ts',
  'utf8',
);

test('homepage page-size calculation reserves space for pagination and history rows', () => {
  assert.equal(
    browserSource.includes('const paginationHeight = 52;'),
    true,
    'item browser should reserve vertical space for the top pager row',
  );
  assert.equal(
    browserSource.includes('const historyReserveHeight = Math.min(itemSize.value, 56) * 2 + 4 + 40;'),
    true,
    'item browser should reserve the fixed two-row history panel height when estimating visible rows',
  );
  assert.equal(
    browserSource.includes('window.innerHeight - paginationHeight - historyReserveHeight - paddingY'),
    true,
    'page-size calculation should only subtract the right-column pager/history chrome instead of unrelated shell heights',
  );
});
