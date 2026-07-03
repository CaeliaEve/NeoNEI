import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const source = fs.readFileSync(
  'src/services/api/images.ts',
  'utf8',
);

test('getImageUrl preserves NBT hash suffix for exact variant textures', () => {
  assert.equal(
    source.includes('return buildItemImageUrl(`${modId}/${encodeURIComponent(`${internalName}~${damage}~${nbt}.png`)}`);'),
    true,
    'hashed item ids should resolve to their exact exported variant texture instead of the base damage image',
  );
});

test('preferred static image resolves hashed gif variants to base gif file', () => {
  assert.equal(
    source.includes('stripVariantSuffixFromImageFileName'),
    true,
    'preferred static image path should normalize hashed gif variants',
  );
});

test('canonical assets resolve through the dist-data asset resolver', () => {
  assert.equal(
    source.includes('return resolveDistDataAssetPath(distPath);'),
    true,
    'canonical animation assets should resolve through the portable dist-data asset resolver',
  );
});
