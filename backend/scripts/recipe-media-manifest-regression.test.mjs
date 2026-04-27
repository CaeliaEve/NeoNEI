import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const serviceSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/backend/src/services/recipe-bootstrap.service.ts',
  'utf8',
).replace(/\r\n/g, '\n');

const routeSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/backend/src/routes/recipe-bootstrap.routes.ts',
  'utf8',
).replace(/\r\n/g, '\n');

test('recipe bootstrap payloads include rich-media manifests for atlas-first animation warmup', () => {
  assert.equal(
    serviceSource.includes('payload.mediaManifest = buildRichMediaManifestFromUnknown(payload, {'),
    true,
    'bootstrap and shard payloads should attach a page-level rich-media manifest',
  );
  assert.equal(
    serviceSource.includes('mediaManifest: buildRichMediaManifestFromUnknown(recipes, {'),
    true,
    'recipe group payloads should attach a page-level rich-media manifest',
  );
  assert.equal(
    routeSource.includes('getRecipeBootstrapService().getProducedByGroup('),
    true,
    'produced-by-group route should use the bootstrap service so render hints/media manifest stay attached',
  );
  assert.equal(
    routeSource.includes('getRecipeBootstrapService().getUsedInGroup('),
    true,
    'used-in-group route should use the bootstrap service so render hints/media manifest stay attached',
  );
  assert.equal(
    routeSource.includes('getRecipeBootstrapService().getCategoryGroup('),
    true,
    'category-group route should use the bootstrap service so render hints/media manifest stay attached',
  );
});
