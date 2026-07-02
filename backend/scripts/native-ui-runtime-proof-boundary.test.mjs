import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const proofServicePath = resolve(root, 'src/services/native-ui-runtime-proof.service.ts');
const proofService = readFileSync(proofServicePath, 'utf8');
const proofAbiCatalog = readFileSync(resolve(root, 'src/services/native-ui-pack-abi.ts'), 'utf8');
const proofContractCatalog = readFileSync(resolve(root, 'src/services/native-ui-runtime-proof-abi.ts'), 'utf8');
const healthService = readFileSync(resolve(root, 'src/services/runtime-health-summary.service.ts'), 'utf8');
const diagnosticsService = readFileSync(resolve(root, 'src/services/runtime-diagnostics-summary.service.ts'), 'utf8');
const observabilityService = readFileSync(resolve(root, 'src/services/current-runtime-observability.service.ts'), 'utf8');
const reportRegistry = readFileSync(resolve(root, 'src/services/current-runtime-report-registry.service.ts'), 'utf8');
const reportRegistryAbi = readFileSync(resolve(root, 'src/services/current-runtime-report-registry-abi.ts'), 'utf8');
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
  assert.match(proofContractCatalog, /NATIVE_UI_RUNTIME_PROOF_SCHEMA_VERSION = 'neonei\/native-ui-runtime-proof\/current'/);
  assert.match(proofContractCatalog, /NATIVE_UI_PROOF_STATUS = Object\.freeze/);
  assert.match(proofContractCatalog, /NATIVE_UI_PROOF_LOGICAL_NAMES = Object\.freeze/);
  assert.match(proofContractCatalog, /NATIVE_UI_PROOF_MANIFEST_KEYS = Object\.freeze/);
  assert.match(proofContractCatalog, /NATIVE_UI_RUNTIME_PROOF_POLICY = Object\.freeze/);
  assert.match(proofContractCatalog, /NATIVE_UI_RUNTIME_PROOF_REPORTS = Object\.freeze/);
  assert.match(proofContractCatalog, /NATIVE_UI_PROOF_REPORT_FIELDS = Object\.freeze/);
  assert.match(proofService, /schemaVersion: NATIVE_UI_RUNTIME_PROOF_SCHEMA_VERSION/);
  assert.match(proofService, /NATIVE_UI_PROOF_STATUS/);
  assert.match(proofService, /NATIVE_UI_PROOF_REPORT_FIELDS/);
  assert.match(proofService, /policy: NATIVE_UI_RUNTIME_PROOF_POLICY/);
  assert.match(proofAbiCatalog, /NATIVE_UI_EXPORT_POLICY_LEGACY_FALLBACK = 'forbidden'/);
  assert.doesNotMatch(proofService, /missingProof: 'fail-closed'/);
  assert.doesNotMatch(proofService, /invalidProof: 'fail-closed'/);
});

test('native UI proof validates both producer ABI and UI pack ABI reports', () => {
  assert.match(proofContractCatalog, /NATIVE_UI_EXPORT_ABI_PROOF_SPEC/);
  assert.match(proofAbiCatalog, /rust\/native-ui-export-abi-validation-report\.json/);
  assert.match(proofAbiCatalog, /elysium-compiler\/native-ui-export-abi-validation\/v1/);
  assert.match(proofAbiCatalog, /nesqlpp\/raw-export\/alpha1\/native-ui-validation/);
  assert.match(proofAbiCatalog, /rawReportStatus/);
  assert.match(proofService, /layoutCount/);
  assert.match(proofService, /slotCount/);
  assert.match(proofAbiCatalog, /missingSurfaceCount/);
  assert.match(proofAbiCatalog, /coordinateContractViolationCount/);

  assert.match(proofContractCatalog, /UI_PACK_ABI_PROOF_SPEC/);
  assert.match(proofAbiCatalog, /rust\/ui-pack-abi-validation-report\.json/);
  assert.match(proofAbiCatalog, /elysium-compiler\/ui-pack-abi-validation\/v1/);
  for (const logicalName of ['rustUiTemplatesBin', 'rustUiBindingsBin', 'rustUiStringsBin']) {
    assert.match(proofContractCatalog, new RegExp(logicalName));
  }
  for (const schema of ['neonei/ui-template-pack/current', 'neonei/ui-binding-pack/current', 'neonei/ui-string-pack/current']) {
    assert.match(proofAbiCatalog, new RegExp(schema.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.doesNotMatch(proofService, /const UI_PACK_REQUIRED_ARTIFACTS/);
});

test('runtime health and diagnostics expose proof state and report delivery slugs', () => {
  assert.match(healthService, /getNativeUiRuntimeProofSummary/);
  assert.match(healthService, /import \{ DIST_DATA_DIR \} from '\.\.\/config\/runtime-paths'/);
  assert.doesNotMatch(healthService, /path\.join\(PUBLIC_DIR, 'dist-data'\)/);
  assert.match(healthService, /nativeUiProofBlocked/);
  assert.match(healthService, /nativeUi,/);
  assert.match(diagnosticsService, /nativeUi: RuntimeHealthSummary\['nativeUi'\]/);
  assert.match(diagnosticsService, /nativeUi: health\.nativeUi/);
  assert.match(observabilityService, /nativeUiProof: health\.nativeUi\.status/);
  assert.match(observabilityService, /nativeUi: health\.nativeUi/);
  assert.match(reportRegistry, /current-runtime-report-registry-abi/);
  assert.match(reportRegistryAbi, /NATIVE_UI_RUNTIME_PROOF_REPORTS/);
  assert.match(reportRegistryAbi, /\[NATIVE_UI_RUNTIME_PROOF_REPORTS\.nativeUiExportAbi\.slug\]/);
  assert.match(reportRegistryAbi, /\[NATIVE_UI_RUNTIME_PROOF_REPORTS\.uiPackAbi\.slug\]/);
  assert.match(frontendTypes, /interface NativeUiRuntimeProofSummary/);
  assert.match(frontendTypes, /nativeUi\?: NativeUiRuntimeProofSummary/);
});
