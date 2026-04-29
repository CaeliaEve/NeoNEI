import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const read = (relativePath) =>
  fs.readFileSync(`E:/codex/ae2/NeoNEI/${relativePath}`, 'utf8');

test('backend item image fallback resolves hashed variant siblings and sidecars', () => {
  const source = read('backend/src/server.ts');

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

test('page atlas and item service can resolve hashed sibling variants when base pngs are missing', () => {
  const atlasSource = read('backend/src/services/page-atlas.service.ts');
  const itemsSource = read('backend/src/services/items.service.ts');

  assert.equal(
    atlasSource.includes('variantPattern'),
    true,
    'page atlas generation should search hashed sibling image variants before declaring an item missing',
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
