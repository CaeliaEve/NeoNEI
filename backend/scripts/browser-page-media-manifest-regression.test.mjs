import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const itemsRouteSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/backend/src/routes/items.routes.ts',
  'utf8',
).replace(/\r\n/g, '\n');

const publishRouteSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/backend/src/routes/publish.routes.ts',
  'utf8',
).replace(/\r\n/g, '\n');

const materializerSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/backend/src/services/publish-payload-materializer.service.ts',
  'utf8',
).replace(/\r\n/g, '\n');

test('browser page payloads include a rich-media manifest for animated atlas fast paths', () => {
  assert.equal(
    itemsRouteSource.includes('mediaManifest: buildBrowserRichMediaManifest(displayItems)'),
    true,
    'runtime browser page-pack route should include a page-level rich-media manifest',
  );
  assert.equal(
    itemsRouteSource.includes('mediaManifest: buildBrowserRichMediaManifest(orderedItems)'),
    true,
    'browser by-ids pack should include a page-level rich-media manifest for search hydration',
  );
  assert.equal(
    publishRouteSource.includes('mediaManifest: buildBrowserRichMediaManifest(displayItems)'),
    true,
    'home bootstrap fallback should include a page-level rich-media manifest',
  );
  assert.equal(
    materializerSource.includes('mediaManifest: firstPageMediaManifest'),
    true,
    'materialized hot page payloads should serialize their rich-media manifest',
  );
  assert.equal(
    materializerSource.includes('mediaManifest: extraMediaManifest'),
    true,
    'materialized follow-up windows should serialize their rich-media manifest',
  );
});
