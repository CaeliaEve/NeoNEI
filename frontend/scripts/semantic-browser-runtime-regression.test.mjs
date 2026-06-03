import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

const repoRoot = path.resolve(process.cwd(), '..');
const readSource = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

test('semantic browser groups keep user-visible variant context in tooltips', () => {
  const grid = readSource('frontend/src/components/HomeCanvasGrid.vue');
  const types = readSource('frontend/src/runtime/types.ts');
  const runtime = readSource('frontend/src/services/distDataRuntime.ts');
  const projection = readSource('frontend/src/services/browserLocalProjection.ts');

  assert.equal(types.includes('semanticFamily?: string | null;'), true);
  assert.equal(runtime.includes('semanticFamily: group.semanticFamily ?? null'), true);
  assert.equal(projection.includes('semanticFamily: group.semanticFamily ?? null'), true);
  assert.equal(grid.includes('Variant in ${rect.item.browserGroupSize} item semantic group'), true);
  assert.equal(grid.includes('rect.entry.group.groupSource === "semanticIdentity"'), true);
  assert.equal(grid.includes('${rect.entry.group.size} variants'), true);
});

test('semantic grouping does not replace exact legacy item identity for recipes and atlas lookup', () => {
  const compiler = readSource('scripts/compile-raw-export.mjs');
  const runtime = readSource('frontend/src/services/distDataRuntime.ts');
  const images = readSource('frontend/src/services/api/images.ts');

  assert.equal(compiler.includes('legacyItemId: variant?.legacyItemId'), true);
  assert.equal(compiler.includes('semanticIdentityByLegacyItemId.set(entry.legacyItemId'), true);
  assert.equal(compiler.includes('representativeLegacyItemId'), true);
  assert.equal(runtime.includes('entry.itemId,'), true, 'runtime item rows should remain keyed by exact itemId');
  assert.equal(images.includes('stripVariantSuffix'), true, 'image URL helper should understand legacy variant suffixes');
});
