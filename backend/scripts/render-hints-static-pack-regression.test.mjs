import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const materializerSource = fs.readFileSync(
  'src/services/publish-payload-materializer.service.ts',
  'utf8',
).replace(/\r\n/g, '\n');

const publishPayloadSource = fs.readFileSync(
  'src/services/publish-payload.service.ts',
  'utf8',
).replace(/\r\n/g, '\n');

const publishDeliverySource = fs.readFileSync(
  'src/services/publish-runtime-delivery.service.ts',
  'utf8',
).replace(/\r\n/g, '\n');

test('publish hot payloads bake render hints into homepage/browser page packs', () => {
  assert.equal(
    /PUBLISH_PAYLOAD_REVISION = '[^']+'/.test(materializerSource),
    true,
    'publish payload revision should be explicit when browser-page payload shape changes',
  );
  assert.equal(
    materializerSource.includes('attachRenderHintsToEntries(firstPageWindow.data);'),
    true,
    'materialized first-page publish payloads should embed render hints before serialization',
  );
  assert.equal(
    materializerSource.includes('includeBrowserSearchPack: options.publishHotPayloads?.includeBrowserSearchPack ?? true'),
    true,
    'publish hot payload search-pack baking should remain explicit in materializer options',
  );
});

test('runtime publish payloads attach render hints without lab item route compatibility', () => {
  assert.equal(
    fs.existsSync('src/routes/items.routes.ts'),
    false,
    'retired lab item route must not remain as a render-hint compatibility path',
  );
  assert.equal(
    publishDeliverySource.includes('attachRenderHintsToEntries(pagePack.data);'),
    true,
    'home bootstrap fallback responses should attach render hints before atlas generation',
  );
  assert.equal(
    materializerSource.includes('attachRenderHintsToEntries(firstPageWindow.data);'),
    true,
    'materialized first-page publish payloads should attach render hints before serialization',
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
    publishDeliverySource.includes('const shouldUseMaterializedHomeBootstrap = query.page === 1'),
    true,
    'home bootstrap should attempt to serve the materialized hot payload before hitting the DB',
  );
});
