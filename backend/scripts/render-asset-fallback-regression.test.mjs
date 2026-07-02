import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'node:path';

const read = (relativePath) =>
  fs.readFileSync(path.resolve('..', relativePath), 'utf8');

test('backend item image fallback resolves hashed variant siblings and sidecars', () => {
  const source = read('backend/src/routes/static-assets.routes.ts');

  assert.equal(
    source.includes('parseRequestedArtifact'),
    true,
    'server fallback should parse requested base artifacts and sidecars before resolving hashed variants',
  );

  assert.equal(
    source.includes('variantRegex'),
    true,
    'server fallback should search sibling hashed artifacts when the base export path is missing',
  );

  assert.equal(
    source.includes("app.get('/images/item/:modId/:fileName', createArtifactFallbackRoute('item'));"),
    true,
    'item image requests should use the shared artifact fallback resolver',
  );
});

test('item service resolves hashed sibling variants without reviving page atlas generation', () => {
  const itemsSource = read('backend/src/services/items.service.ts');

  assert.equal(
    fs.existsSync(path.resolve('..', 'backend/src/services/page-atlas.service.ts')),
    false,
    'page atlas generation service should stay retired',
  );

  assert.equal(
    itemsSource.includes('resolveSiblingVariantImagePath'),
    true,
    'item service should resolve hashed sibling variants when the canonical base image is absent',
  );
});

test('render contract animated atlas service preserves per-frame timeline metadata', () => {
  const source = read('backend/src/services/render-contract.service.ts');

  assert.equal(
    source.includes('timeline: AnimatedAtlasTimelineEntry[];'),
    true,
    'animated atlas entries should expose per-frame timing metadata to the frontend',
  );

  assert.equal(
    source.includes('for (const frame of asset.timeline ?? [])'),
    true,
    'render contract service should parse timeline entries from animated atlas manifests',
  );

  assert.equal(
    source.includes("entry.animationMode === 'native_sprite_aux'"),
    true,
    'render contract hints should recognize auxiliary native sprite timelines exported alongside custom renderer assets',
  );
});
