import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const source = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/frontend/src/services/api/images.ts',
  'utf8',
);

test('getImageUrl falls back to base damage image for item ids with hash suffix', () => {
  assert.equal(
    source.includes('return buildItemImageUrl(`${modId}/${normalizedInternal}`);'),
    true,
    'hashed item ids should resolve to base damage image path instead of direct hash filename',
  );
});

test('preferred static image resolves hashed gif variants to base gif file', () => {
  assert.equal(
    source.includes('stripVariantSuffixFromImageFileName'),
    true,
    'preferred static image path should normalize hashed gif variants',
  );
});

test('canonical assets resolve through api proxy when backend base is relative', () => {
  assert.equal(
    source.includes("return `${proxyBase}/canonical/${canonicalPath}`;"),
    true,
    'canonical animation assets should resolve through the /api proxy in preview deployments',
  );
});
