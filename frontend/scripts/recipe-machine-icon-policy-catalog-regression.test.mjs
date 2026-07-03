import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readSource = (relativePath) => readFileSync(resolve(frontendRoot, relativePath), 'utf8');

const helpersSource = readSource('src/composables/recipe-browser/helpers.ts');
const policySource = readSource('src/composables/recipe-browser/machineIconPolicyCatalog.ts');

test('recipe machine icon matching is descriptor-owned', () => {
  assert.match(policySource, /type GtMachineIconPolicyDescriptor/);
  assert.match(policySource, /validateGtMachineIconPolicyDescriptors/);
  assert.match(policySource, /GT_MACHINE_ICON_POLICY_DESCRIPTORS/);
  assert.match(policySource, /MACHINE_ICON_POLICY_CATALOG/);
  assert.match(policySource, /descriptor-owned-machine-icons-no-legacy-fallback/);
  assert.match(policySource, /defaultMetaId/);
});

test('recipe browser helpers consume machine icon policy without local fallback tables', () => {
  assert.match(helpersSource, /from '\.\/machineIconPolicyCatalog'/);
  assert.match(helpersSource, /resolveMachineIconByName/);
  assert.doesNotMatch(helpersSource, /resolveFallbackMachineIconByName/);
  assert.doesNotMatch(helpersSource, /GT_MACHINE_ICON_BY_FAMILY/);
  assert.doesNotMatch(helpersSource, /fallbackMapped/);
});
