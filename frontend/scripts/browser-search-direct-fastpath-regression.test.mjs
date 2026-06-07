import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const source = fs.readFileSync(
  'src/composables/useItemBrowser.ts',
  'utf8',
).replace(/\r\n/g, '\n');

test('browser search projects from the native worker/catalog path instead of backend page packs', () => {
  assert.equal(
    source.includes("queryBrowserSearchWorker({"),
    true,
    'item browser should use the resident browser search worker for homepage search projection',
  );
  assert.equal(
    source.includes('const response = await api.getBrowserPagePack({'),
    false,
    'search page hydration should not fetch backend page packs on the hot path',
  );
  assert.equal(
    source.includes("source: 'runtime-catalog-projection'"),
    true,
    'non-worker search continuation should project from runtime catalogs, not page packs',
  );
  assert.equal(
    source.includes('getBrowserPagePackByIds'),
    false,
    'search projection should not rehydrate per-item page packs',
  );
});
