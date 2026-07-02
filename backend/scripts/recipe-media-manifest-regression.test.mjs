import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const serviceSource = fs.readFileSync(
  'src/services/recipe-bootstrap.service.ts',
  'utf8',
).replace(/\r\n/g, '\n');

test('recipe bootstrap payloads include rich-media manifests for atlas-first animation warmup', () => {
  assert.equal(
    fs.existsSync('src/routes/recipe-bootstrap.routes.ts'),
    false,
    'recipe bootstrap must remain an internal publish/runtime service, not an externally mounted lab route',
  );
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
    serviceSource.includes('async getProducedByGroup('),
    true,
    'produced-by-group payloads should stay in the bootstrap service so render hints/media manifest stay attached',
  );
  assert.equal(
    serviceSource.includes('async getUsedInGroup('),
    true,
    'used-in-group payloads should stay in the bootstrap service so render hints/media manifest stay attached',
  );
  assert.equal(
    serviceSource.includes('async getCategoryGroup('),
    true,
    'category-group payloads should stay in the bootstrap service so render hints/media manifest stay attached',
  );
});
