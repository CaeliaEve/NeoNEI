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

test('native UI payload authority fails closed instead of using detected component fallback', () => {
  assert.match(policySource, /hasOwnRecordProperty\(payloadRecord, 'nativeLayout'\)/);
  assert.match(policySource, /has no valid nativeLayout; refusing legacy component fallback/);
  assert.match(policySource, /is not registered in the recipe presentation catalog; refusing heuristic UI fallback/);
  assert.match(policySource, /is not eligible for the native layout renderer; refusing legacy component fallback/);
});

test('machine-present generic routing is named as a policy, not a legacy fallback', () => {
  assert.match(uiTypeMappingSource, /reason: 'machine_type:gt_generic'/);
  assert.doesNotMatch(uiTypeMappingSource, /fallback:machine_type_present/);
});
