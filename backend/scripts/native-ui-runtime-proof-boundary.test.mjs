import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const proofServicePath = resolve(root, 'src/services/native-ui-runtime-proof.service.ts');
const proofService = readFileSync(proofServicePath, 'utf8');
const proofAbiCatalog = readFileSync(resolve(root, 'src/services/native-ui-pack-abi.ts'), 'utf8');
const healthService = readFileSync(resolve(root, 'src/services/runtime-health-summary.service.ts'), 'utf8');
const diagnosticsService = readFileSync(resolve(root, 'src/services/runtime-diagnostics-summary.service.ts'), 'utf8');
const observabilityService = readFileSync(resolve(root, 'src/services/current-runtime-observability.service.ts'), 'utf8');
const reportRegistry = readFileSync(resolve(root, 'src/services/current-runtime-report-registry.service.ts'), 'utf8');
const frontendTypes = readFileSync(resolve(root, '../frontend/src/runtime/types.ts'), 'utf8');

test('native UI runtime proof is a dedicated artifact-index-backed health subsystem', () => {
  assert.equal(existsSync(proofServicePath), true, 'native-ui-runtime-proof.service.ts must exist');
  assert.match(proofService, /getNativeUiRuntimeProofSummary/);
  assert.match(proofService, /from '\.\/current-runtime-artifact-index\.service'/);
  assert.match(proofService, /isPortableRuntimePath/);
  assert.match(proofService, /normalizeRuntimePath/);
  assert.match(proofService, /readCurrentRuntimeJson/);
  assert.match(proofService, /resolveDistDataRuntimeFile/);
  assert.doesNotMatch(proofService, /import fs from 'fs'/);
  assert.doesNotMatch(proofService, /import path from 'path'/);
  assert.match(proofService, /schemaVersion: 'neonei\/native-ui-runtime-proof\/current'/);
  assert.match(proofAbiCatalog, /NATIVE_UI_EXPORT_POLICY_LEGACY_FALLBACK = 'forbidden'/);
  assert.match(proofService, /missingProof: 'fail-closed'/);
  assert.match(proofService, /invalidProof: 'fail-closed'/);
});

test('native UI proof validates both producer ABI and UI pack ABI reports', () => {
  assert.match(proofAbiCatalog, /rust\/native-ui-export-abi-validation-report\.json/);
  assert.match(proofAbiCatalog, /elysium-compiler\/native-ui-export-abi-validation\/v1/);
  assert.match(proofAbiCatalog, /nesqlpp\/raw-export\/alpha1\/native-ui-validation/);
  assert.match(proofAbiCatalog, /rawReportStatus/);
  assert.match(proofService, /layoutCount/);
  assert.match(proofService, /slotCount/);
  assert.match(proofAbiCatalog, /missingSurfaceCount/);
  assert.match(proofAbiCatalog, /coordinateContractViolationCount/);

  assert.match(proofAbiCatalog, /rust\/ui-pack-abi-validation-report\.json/);
  assert.match(proofAbiCatalog, /elysium-compiler\/ui-pack-abi-validation\/v1/);
  for (const logicalName of ['rustUiTemplatesBin', 'rustUiBindingsBin', 'rustUiStringsBin']) {
    assert.match(proofService, new RegExp(logicalName));
  }
  for (const schema of ['neonei/ui-template-pack/current', 'neonei/ui-binding-pack/current', 'neonei/ui-string-pack/current']) {
    assert.match(proofAbiCatalog, new RegExp(schema.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('runtime health and diagnostics expose proof state and report delivery slugs', () => {
  assert.match(healthService, /getNativeUiRuntimeProofSummary/);
  assert.match(healthService, /nativeUiProofBlocked/);
  assert.match(healthService, /nativeUi,/);
  assert.match(diagnosticsService, /nativeUi: RuntimeHealthSummary\['nativeUi'\]/);
  assert.match(diagnosticsService, /nativeUi: health\.nativeUi/);
  assert.match(observabilityService, /nativeUiProof: health\.nativeUi\.status/);
  assert.match(observabilityService, /nativeUi: health\.nativeUi/);
  assert.match(reportRegistry, /'native-ui-export-abi-validation-report': 'rust\/native-ui-export-abi-validation-report\.json'/);
  assert.match(reportRegistry, /'ui-pack-abi-validation-report': 'rust\/ui-pack-abi-validation-report\.json'/);
  assert.match(frontendTypes, /interface NativeUiRuntimeProofSummary/);
  assert.match(frontendTypes, /nativeUi\?: NativeUiRuntimeProofSummary/);
});
