import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readSource = (relativePath) => readFileSync(resolve(frontendRoot, relativePath), 'utf8');

const policySource = readSource('src/composables/recipe-display/recipePresentationPolicyCatalog.ts');
const uiTypeMappingSource = readSource('src/services/uiTypeMapping.ts');

test('recipe presentation policy catalog is descriptor-driven and validates duplicate route kinds', () => {
  assert.match(policySource, /type RecipePresentationRouteDescriptor/);
  assert.match(policySource, /validateRecipePresentationRouteDescriptors/);
  assert.match(policySource, /Duplicate recipe presentation route descriptor/);
  assert.match(policySource, /kind: 'detailed-crafting'/);
  assert.match(policySource, /kind: 'registered-component'/);
  assert.doesNotMatch(policySource, /kind: 'native-layout'/);
});

test('web-authored recipe components are the only runtime presentation path', () => {
  const detailedIndex = policySource.indexOf("kind: 'detailed-crafting'");
  const registeredIndex = policySource.indexOf("kind: 'registered-component'");
  assert.ok(detailedIndex >= 0, 'detailed crafting route should exist');
  assert.ok(registeredIndex > detailedIndex, 'registered hand-written components should follow detailed crafting');
  assert.doesNotMatch(policySource, /NativeNeiRecipeCanvas/);
  assert.doesNotMatch(policySource, /recipeUiPayloadNativeFrame/);
  assert.doesNotMatch(policySource, /nativeFrameRole/);
  assert.match(policySource, /function isWebAuthoredRecipeComponent/);
  assert.match(policySource, /return isRegisteredRecipeComponent\(componentName\)/);
  assert.match(policySource, /kind: 'registered-component'[\s\S]*isWebAuthoredRecipeComponent\(profile\.component\)/);
});

test('binding v2 rendererId is the only recipe presentation authority', () => {
  assert.match(policySource, /resolveRequiredRecipePresentationProfile\(uiBinding, uiBindingError, \{ preferDetailedCrafting \}\)/);
  assert.match(policySource, /presentationAuthority: 'ui-binding-v2-renderer-id-only'/);
  assert.match(policySource, /missingBindingPolicy: 'fail-closed'/);
  assert.match(policySource, /retiredNativeArtifacts: Object\.freeze\(\['nei-frame-png', 'nei-background-png'\]\)/);
  assert.doesNotMatch(policySource, /resolveRecipePresentationProfileFromUiPayload/);
});

test('renderer catalog contains exact ids only and no name detector', () => {
  assert.match(uiTypeMappingSource, /UI_CONFIG_BY_RENDERER_ID/);
  assert.doesNotMatch(uiTypeMappingSource, /detectUIType|detectBaseUIType|EXACT_ALIASES|KEYWORD_ALIASES/);
  assert.doesNotMatch(uiTypeMappingSource, /\.includes\(/);
});

test('uiTypeMapping no longer owns familyKey or composite-key presentation routing', () => {
  assert.doesNotMatch(uiTypeMappingSource, /FAMILY_KEY_TO_UI_TYPE/);
  assert.doesNotMatch(uiTypeMappingSource, /resolveUiTypeFromUiPayloadFamilyKey/);
  assert.doesNotMatch(uiTypeMappingSource, /resolveRecipePresentationProfileFromUiPayload/);
  assert.match(uiTypeMappingSource, /resolveRecipePresentationProfileByRendererId/);
});
