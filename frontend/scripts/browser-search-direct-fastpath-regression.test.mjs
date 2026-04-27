import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const source = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/frontend/src/composables/useItemBrowser.ts',
  'utf8',
).replace(/\r\n/g, '\n');

test('browser search hydrates directly from backend page-pack fast path instead of client-wide search-pack bootstrap', () => {
  assert.equal(
    source.includes("import { preloadBrowserSearchWorker, queryBrowserSearchWorker } from '../services/browserSearchWorker';"),
    false,
    'item browser should no longer depend on the browser search worker for homepage search hydration',
  );
  assert.equal(
    source.includes('const response = await api.getBrowserPagePack({'),
    true,
    'search page hydration should reuse the backend browser page-pack fast path directly',
  );
  assert.equal(
    source.includes('queryBrowserSearchWorker({'),
    false,
    'item browser should not ship a full client-side search-pack query path on the critical search route',
  );
});
