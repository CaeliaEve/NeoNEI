import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'node:path';

const read = (relativePath) =>
  fs.readFileSync(path.resolve('..', relativePath), 'utf8');

test('backend item image resolution resolves hashed variant siblings and sidecars', () => {
  const source = read('backend/src/routes/static-assets.routes.ts');
  const registrySource = read('backend/src/routes/static-asset-route-registry.ts');

  assert.equal(
    source.includes('resolveImageFamilyArtifact'),
    true,
    'server resolution should delegate requested base artifacts and sidecars to the shared delivery resolver',
  );

  assert.equal(
    source.includes('createImageArtifactRoute(route.family)'),
    true,
    'server resolution should mount image resolutions from the static asset descriptor catalog',
  );

  assert.equal(
    registrySource.includes("path: '/images/item/:modId/:fileName', family: 'item'"),
    true,
    'item image requests should be declared in the shared static asset descriptor catalog',
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
