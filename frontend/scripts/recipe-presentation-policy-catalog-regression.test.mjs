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
  assert.match(policySource, /kind: 'native-layout'/);
  assert.match(policySource, /kind: 'registered-component'/);
});

test('native UI payload authority prefers captured frames and only falls back to registered components', () => {
  assert.match(policySource, /hasOwnRecordProperty\(payloadRecord, 'nativeLayout'\)/);
  assert.match(policySource, /function nativeFrameRecordFromPayload/);
  assert.match(policySource, /payloadRecord\?\.nativeFrame/);
  assert.match(policySource, /payloadRecord\?\.metadata\)\?\.nativeFrame/);
  assert.match(policySource, /payloadRecord\?\.additionalData\)\?\.nativeFrame/);
  assert.match(policySource, /missing nativeFrame; refusing reconstructed nativeLayout canvas path/);
  assert.match(policySource, /has no valid nativeFrame; refusing heuristic or reconstructed UI path/);
  assert.match(policySource, /is not registered in the recipe presentation catalog; refusing heuristic UI path/);
  assert.match(policySource, /isRegisteredRecipeComponent\(payloadProfile\.component\)/);
  assert.match(policySource, /isRegisteredRecipeComponent\(detectedProfile\.component\)/);
  assert.match(policySource, /kind: 'native-layout'[\s\S]*Boolean\(recipeUiPayloadNativeFrame\(uiPayload\)\)/);
  assert.match(policySource, /kind: 'registered-component'[\s\S]*!recipeUiPayloadNativeFrame\(uiPayload\)[\s\S]*isRegisteredRecipeComponent\(profile\.component\)/);
});

test('machine-present generic routing is named as a policy, not a legacy fallback', () => {
  assert.match(uiTypeMappingSource, /reason: 'machine_type:gt_generic'/);
  assert.doesNotMatch(uiTypeMappingSource, /fallback:machine_type_present/);
});

test('native UI composite family keys resolve through registered canonical family prefixes', () => {
  assert.match(uiTypeMappingSource, /furnace: FURNACE\.uiType/);
  assert.match(uiTypeMappingSource, /'gregtech-machine': GT_GENERIC\.uiType/);
  assert.match(uiTypeMappingSource, /function resolveUiTypeFromUiPayloadFamilyKey/);
  assert.match(uiTypeMappingSource, /normalizedFamilyKey\.split\('\\|'\)\[0\]\?\.trim\(\)/);
  assert.match(
    uiTypeMappingSource,
    /const uiType = resolveUiTypeFromUiPayloadFamilyKey\(uiPayload\.familyKey\)/,
    'ui payload resolver should accept exporter composite keys only through registered canonical prefixes',
  );
});
