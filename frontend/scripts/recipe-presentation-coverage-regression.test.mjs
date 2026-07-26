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
  assert.match(coverageSource, /resolveRecipePresentationProfileFromBinding/);
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

test('coverage diagnostic treats missing and invalid binding v2 authority as fail-closed gaps', () => {
  assert.match(coverageSource, /kind: 'missing-ui-binding-v2'/);
  assert.match(coverageSource, /ui_binding_v2_missing/);
  assert.match(coverageSource, /kind: 'invalid-binding-renderer'/);
  assert.match(policySource, /presentationAuthority: 'ui-binding-v2-renderer-id-only'/);
  assert.match(policySource, /retiredNativeArtifacts: Object\.freeze\(\['nei-frame-png', 'nei-background-png'\]\)/);
});
