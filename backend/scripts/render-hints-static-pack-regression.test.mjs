import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const materializerSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/backend/src/services/publish-payload-materializer.service.ts',
  'utf8',
).replace(/\r\n/g, '\n');

const publishPayloadSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/backend/src/services/publish-payload.service.ts',
  'utf8',
).replace(/\r\n/g, '\n');

const itemsRouteSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/backend/src/routes/items.routes.ts',
  'utf8',
).replace(/\r\n/g, '\n');

const publishRouteSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/backend/src/routes/publish.routes.ts',
  'utf8',
).replace(/\r\n/g, '\n');

test('publish hot payloads bake render hints into homepage/browser page packs', () => {
  assert.equal(
    materializerSource.includes("PUBLISH_PAYLOAD_REVISION = '2026-04-26-runtime-hot-payloads-v3'"),
    true,
    'publish payload revision should advance when browser-page payload shape gains baked render hints',
  );
  assert.equal(
    materializerSource.includes('attachRenderHintsToEntries(firstPageWindow.data);'),
    true,
    'materialized first-page publish payloads should embed render hints before serialization',
  );
  assert.equal(
    materializerSource.includes("includeBrowserSearchPack: options.publishHotPayloads?.includeBrowserSearchPack ?? false"),
    true,
    'publish hot payloads should stop baking unused browser search packs by default once homepage search moves to the direct backend path',
  );
});

test('runtime page-pack routes attach render hints for both homepage and search/browser hydration', () => {
  assert.equal(
    itemsRouteSource.includes('attachRenderHintsToEntries(result.data);'),
    true,
    'browser page-pack responses should attach render hints before atlas generation',
  );
  assert.equal(
    itemsRouteSource.includes('attachRenderHintsToItems(orderedItems);'),
    true,
    'browser by-ids hydration should attach render hints for search-result pages as well',
  );
  assert.equal(
    publishRouteSource.includes('attachRenderHintsToEntries(pagePack.data);'),
    true,
    'home bootstrap fallback responses should attach render hints before atlas generation',
  );
});

test('materialized browser windows can derive early follow-up pages from the same hot payload', () => {
  assert.equal(
    publishPayloadSource.includes('export function derivePagePackFromWindow('),
    true,
    'publish payload helpers should derive arbitrary early pages from the same first-window hot payload',
  );
  assert.equal(
    publishPayloadSource.includes('const startIndex = (normalizedPage - 1) * normalizedPageSize;'),
    true,
    'derived materialized page packs should slice from the hot window using the requested page offset',
  );
  assert.equal(
    itemsRouteSource.includes('const materialized = getMaterializedBrowserPagePack({'),
    true,
    'browser page-pack route should attempt to serve early follow-up pages from the hot payload window before hitting the DB',
  );
});
