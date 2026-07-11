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

test('native UI payload authority retires captured frame and background PNG rendering', () => {
  assert.match(policySource, /hasOwnRecordProperty\(payloadRecord, 'nativeLayout'\)/);
  assert.match(policySource, /NEI frame\/background PNG rendering is retired; refusing heuristic UI path/);
  assert.match(policySource, /is not registered in the web-authored recipe presentation catalog/);
  assert.match(policySource, /isWebAuthoredRecipeComponent\(payloadProfile\.component\)/);
  assert.match(policySource, /isWebAuthoredRecipeComponent\(detectedProfile\.component\)/);
  assert.match(policySource, /nativePayloadAuthority: 'web-authored-ui-only'/);
  assert.match(policySource, /retiredNativeArtifacts: Object\.freeze\(\['nei-frame-png', 'nei-background-png'\]\)/);
  assert.doesNotMatch(policySource, /missing nativeFrame/);
  assert.doesNotMatch(policySource, /reconstructed nativeLayout canvas path/);
});

test('machine-present generic routing is named as a policy, not a legacy fallback', () => {
  assert.match(uiTypeMappingSource, /reason: 'machine_type:gt_generic'/);
  assert.doesNotMatch(uiTypeMappingSource, /fallback:machine_type_present/);
});

test('native UI composite family keys resolve through registered canonical family prefixes', () => {
  assert.match(uiTypeMappingSource, /minecraft: STANDARD_CRAFTING\.uiType/);
  assert.match(uiTypeMappingSource, /'crafting-table': STANDARD_CRAFTING\.uiType/);
  assert.match(uiTypeMappingSource, /avaritia: AVARITIA_EXTREME_CRAFTING\.uiType/);
  assert.match(uiTypeMappingSource, /etfuturum: FURNACE\.uiType/);
  assert.match(uiTypeMappingSource, /furnace: FURNACE\.uiType/);
  assert.match(uiTypeMappingSource, /'gregtech-machine': GT_GENERIC\.uiType/);
  assert.match(uiTypeMappingSource, /'crafting-table\|crafting-grid\|166x140@0#2\|unknown': THAUMCRAFT_ARCANE\.uiType/);
  assert.match(uiTypeMappingSource, /'crafting-table\|crafting-grid\|256x208@0#1\|unknown': AVARITIA_EXTREME_CRAFTING\.uiType/);
  assert.match(uiTypeMappingSource, /'botania\|native-nei\|152x122@0#4\|unknown': BOTANIA_RUNE_ALTAR\.uiType/);
  assert.match(uiTypeMappingSource, /'thaumcraft\|native-nei\|166x140@0#2\|unknown': THAUMCRAFT_ASPECT\.uiType/);
  assert.match(uiTypeMappingSource, /function resolveUiTypeFromUiPayloadFamilyKey/);
  assert.match(uiTypeMappingSource, /normalizedFamilyKey\.split\('\|'\)\[0\]\?\.trim\(\)/);
  assert.match(
    uiTypeMappingSource,
    /const uiType = resolveUiTypeFromUiPayloadFamilyKey\(uiPayload\.familyKey\)/,
    'ui payload resolver should accept exporter composite keys only through registered canonical prefixes',
  );
});
