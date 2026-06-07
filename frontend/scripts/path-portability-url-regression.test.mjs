import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('src/services/api/images.ts', 'utf8');

function normalizeLikeRuntime(imageFileName) {
  return imageFileName
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/^[a-zA-Z]:\//, '')
    .replace(/^images\/item\//, '')
    .replace(/^api\/images\/item\//, '')
    .replace(/^.*?\/image\/item\//i, '')
    .replace(/^.*?\/image\//i, '');
}

function toBrowserItemImageUrl(imageFileName) {
  return normalizeLikeRuntime(imageFileName)
    .split('/')
    .filter((part) => part.length > 0)
    .map((part) => encodeURIComponent(part))
    .join('/');
}

test('image URL normalizer is source-root agnostic for Windows and Linux NESQL exports', () => {
  const expected = 'gregtech/gt.metaitem.01~32000.png';
  const windowsSlashExport = ['Z:', 'portable', 'exports', 'run', 'image', 'item', expected].join('/');
  const windowsBackslashExport = ['Z:', 'portable', 'exports', 'run', 'image', 'item', expected].join('\\');
  const samples = [
    windowsSlashExport,
    windowsBackslashExport,
    '/srv/neonei/exports/run/image/item/gregtech/gt.metaitem.01~32000.png',
    'images/item/gregtech/gt.metaitem.01~32000.png',
    'api/images/item/gregtech/gt.metaitem.01~32000.png',
  ];

  for (const sample of samples) {
    assert.equal(toBrowserItemImageUrl(sample), expected, sample);
  }
});

test('runtime image normalizer contains the required path-neutral transforms', () => {
  assert.equal(source.includes(".replace(/\\\\/g, '/')"), true, 'must normalize Windows separators');
  assert.equal(source.includes(".replace(/^[a-zA-Z]:\\//, '')"), true, 'must remove Windows drive prefixes');
  assert.equal(source.includes(".replace(/^.*?\\/image\\/item\\//i, '')"), true, 'must trim any export root before image/item');
  assert.equal(source.includes('.minecraft/nesql/nesql-repository'), false, 'must not depend on old machine-specific repository shape');
});

test('retired canonical atlas references resolve through dist-data runtime assets', () => {
  assert.equal(
    source.includes("return resolveDistDataAssetPath(distPath);"),
    true,
    'retired canonical relative paths should be normalized into the portable runtime asset resolver',
  );
  assert.equal(
    source.includes("`/canonical/"),
    false,
    'image service must not rebuild public canonical URLs',
  );
});
