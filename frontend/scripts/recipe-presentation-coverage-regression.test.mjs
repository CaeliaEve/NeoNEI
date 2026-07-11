import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readSource = (relativePath) => readFileSync(resolve(frontendRoot, relativePath), 'utf8');

const coverageSource = readSource('src/composables/recipe-display/recipePresentationCoverage.ts');
const policySource = readSource('src/composables/recipe-display/recipePresentationPolicyCatalog.ts');

test('recipe presentation coverage diagnostic is driven by the web-authored component catalog', () => {
  assert.match(coverageSource, /resolveRecipePresentationProfileFromUiPayload/);
  assert.match(coverageSource, /isRegisteredRecipeComponent/);
  assert.match(coverageSource, /export function collectRecipePresentationCoverageReport/);
  assert.match(coverageSource, /export function collectRecipePresentationCoverageGaps/);
  assert.doesNotMatch(coverageSource, /NativeNeiRecipeCanvas/);
  assert.doesNotMatch(coverageSource, /nativeFrame\.assetRef/);
});

test('coverage diagnostic groups missing hand-written UI by family and sample recipe ids', () => {
  assert.match(coverageSource, /familyKey: string;/);
  assert.match(coverageSource, /recipeCount: number;/);
  assert.match(coverageSource, /sampleRecipeIds: string\[\];/);
  assert.match(coverageSource, /const gapsByKey = new Map<string, RecipePresentationCoverageGap>\(\)/);
  assert.match(coverageSource, /summary\.recipeCount \+= 1/);
  assert.match(coverageSource, /gap\.recipeCount \+= 1/);
  assert.match(coverageSource, /pushSampleRecipeId\(gap\.sampleRecipeIds, input\.recipeId, sampleRecipeLimit\)/);
  assert.match(coverageSource, /right\.recipeCount - left\.recipeCount/);
});

test('coverage diagnostic treats detailed crafting as covered and unknown payload families as fail-closed gaps', () => {
  assert.match(coverageSource, /profile\?\.renderMode === 'detailed_crafting'/);
  assert.match(coverageSource, /kind: 'unmapped-ui-payload-family'/);
  assert.match(coverageSource, /ui_payload_family_unmapped/);
  assert.match(coverageSource, /NEI frame\/background PNG rendering is retired; refusing heuristic UI path/);
  assert.match(policySource, /nativePayloadAuthority: 'web-authored-ui-only'/);
  assert.match(policySource, /retiredNativeArtifacts: Object\.freeze\(\['nei-frame-png', 'nei-background-png'\]\)/);
});
