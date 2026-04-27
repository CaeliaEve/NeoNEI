import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const browserSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/frontend/src/composables/useItemBrowser.ts',
  'utf8',
).replace(/\r\n/g, '\n');

const searchWorkerSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/frontend/src/services/browserSearchWorker.ts',
  'utf8',
).replace(/\r\n/g, '\n');

const viewerSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/frontend/src/composables/useRecipeViewer.ts',
  'utf8',
).replace(/\r\n/g, '\n');

test('frontend emits key runtime performance markers for homepage, search worker, and recipe first paint', () => {
  assert.equal(
    browserSource.includes("markPerfEvent('home-bootstrap-done'"),
    true,
    'item browser should mark home-bootstrap-done once the initial browser shell is usable',
  );
  assert.equal(
    browserSource.includes("markPerfEvent('first-browser-tile-visible'"),
    true,
    'item browser should mark first-browser-tile-visible after the first tile paints',
  );
  assert.equal(
    searchWorkerSource.includes('markPerfEvent("search-worker-ready"'),
    true,
    'browser search worker should mark when the warm search shard is ready',
  );
  assert.equal(
    viewerSource.includes("markPerfEvent('recipe-first-page-visible'"),
    true,
    'recipe viewer should mark when the first recipe page becomes visible',
  );
});
