import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const artifactIndexPath = resolve(root, 'src/services/current-runtime-artifact-index.service.ts');
const snapshotPath = resolve(root, 'src/services/current-runtime-snapshot.service.ts');
const apiPath = resolve(root, 'src/services/current-runtime-api.service.ts');
const reportRegistryPath = resolve(root, 'src/services/current-runtime-report-registry.service.ts');
const runtimeRecipePackPath = resolve(root, 'src/services/runtime-recipe-pack.service.ts');
const nativeRenderDiagnosticsPath = resolve(root, 'src/services/native-render-runtime-diagnostics.service.ts');
const nativeRenderDiagnosticsAbiPath = resolve(root, 'src/services/native-render-runtime-diagnostics-abi.ts');
const runtimeHealthPath = resolve(root, 'src/services/runtime-health-summary.service.ts');
const rustSearchPackPath = resolve(root, 'src/services/rust-search-pack.service.ts');
const rustSearchPackAbiPath = resolve(root, 'src/services/rust-search-pack-abi.ts');
const artifactIndex = readFileSync(artifactIndexPath, 'utf8');
const snapshot = readFileSync(snapshotPath, 'utf8');
const api = readFileSync(apiPath, 'utf8');
const reportRegistry = readFileSync(reportRegistryPath, 'utf8');
const runtimeRecipePack = readFileSync(runtimeRecipePackPath, 'utf8');
const nativeRenderDiagnostics = readFileSync(nativeRenderDiagnosticsPath, 'utf8');
const nativeRenderDiagnosticsAbi = readFileSync(nativeRenderDiagnosticsAbiPath, 'utf8');
const runtimeHealth = readFileSync(runtimeHealthPath, 'utf8');
const rustSearchPack = readFileSync(rustSearchPackPath, 'utf8');
const rustSearchPackAbi = readFileSync(rustSearchPackAbiPath, 'utf8');

test('current runtime artifact index owns dist-data paths and artifact inventory', () => {
  assert.equal(existsSync(artifactIndexPath), true, 'current-runtime-artifact-index.service.ts must exist');
  assert.match(artifactIndex, /import fs from 'fs'/);
  assert.match(artifactIndex, /import path from 'path'/);
  assert.match(artifactIndex, /import \{ DIST_DATA_DIR \} from '\.\.\/config\/runtime-paths'/);
  assert.match(artifactIndex, /CURRENT_RUNTIME_DIST_DATA_DIR/);
  assert.match(artifactIndex, /CURRENT_RUNTIME_DIST_MANIFEST_FILE/);
  assert.doesNotMatch(artifactIndex, /PUBLIC_DIR/);
  for (const symbol of [
    'readCurrentRuntimeJson',
    'readCurrentRuntimeText',
    'isPortableRuntimePath',
    'normalizeRuntimePath',
    'resolveDistDataRuntimeFile',
    'getRuntimeManifestRelativePath',
    'collectDeclaredRuntimeFilePaths',
    'buildCurrentRuntimeArtifactInventory',
    'buildCurrentRuntimeSnapshotFingerprint',
  ]) {
    assert.match(artifactIndex, new RegExp(`export function ${symbol}`));
  }
});

test('current runtime snapshot service owns RCU publication but not artifact indexing internals', () => {
  assert.match(snapshot, /from '\.\/current-runtime-artifact-index\.service'/);
  assert.doesNotMatch(snapshot, /import fs from 'fs'/);
  assert.doesNotMatch(snapshot, /import path from 'path'/);
  assert.doesNotMatch(snapshot, /PUBLIC_DIR/);
  assert.doesNotMatch(snapshot, /function collectManifestRuntimeFiles/);
  assert.doesNotMatch(snapshot, /function buildArtifactInventory/);
  assert.doesNotMatch(snapshot, /function fileFingerprint/);
  assert.doesNotMatch(snapshot, /export function resolveDistDataRuntimeFile/);
  assert.doesNotMatch(snapshot, /export function isPortableRuntimePath/);
  assert.doesNotMatch(snapshot, /export function normalizeRuntimePath/);
  assert.match(snapshot, /function publishCurrentRuntimeSnapshot/);
  assert.match(snapshot, /export function acquireCurrentRuntimeSnapshot/);
  assert.match(snapshot, /export function getCurrentRuntimeSnapshotReadStats/);
});

test('current runtime API and report registry depend on artifact index for path safety', () => {
  assert.match(api, /from '\.\/current-runtime-artifact-index\.service'/);
  assert.match(api, /isPortableRuntimePath/);
  assert.match(api, /normalizeRuntimePath/);
  assert.match(reportRegistry, /from '\.\/current-runtime-artifact-index\.service'/);
  assert.doesNotMatch(reportRegistry, /from '\.\/current-runtime-snapshot\.service'/);
});


test('runtime recipe pack and native render diagnostics reuse artifact index path safety', () => {
  assert.match(runtimeRecipePack, /from '\.\/current-runtime-artifact-index\.service'/);
  assert.match(runtimeRecipePack, /CURRENT_RUNTIME_DIST_MANIFEST_FILE/);
  assert.match(runtimeRecipePack, /resolveDistDataRuntimeFile/);
  assert.doesNotMatch(runtimeRecipePack, /function isPortableRuntimePath/);
  assert.doesNotMatch(runtimeRecipePack, /function resolveDistDataFile/);
  assert.doesNotMatch(runtimeRecipePack, /DIST_DATA_DIR/);

  assert.match(nativeRenderDiagnostics, /from '\.\/current-runtime-artifact-index\.service'/);
  assert.match(nativeRenderDiagnostics, /CURRENT_RUNTIME_DIST_DATA_DIR/);
  assert.match(nativeRenderDiagnostics, /CURRENT_RUNTIME_DIST_MANIFEST_FILE/);
  assert.match(nativeRenderDiagnostics, /resolveDistDataRuntimeFile/);
  assert.doesNotMatch(nativeRenderDiagnostics, /PUBLIC_DIR/);
  assert.doesNotMatch(nativeRenderDiagnostics, /path\.resolve/);
  assert.doesNotMatch(nativeRenderDiagnostics, /path\.join/);

  assert.match(runtimeHealth, /import \{ DIST_DATA_DIR \} from '\.\.\/config\/runtime-paths'/);
  assert.doesNotMatch(runtimeHealth, /PUBLIC_DIR/);
  assert.doesNotMatch(runtimeHealth, /path\.join\(PUBLIC_DIR, 'dist-data'\)/);

  assert.match(rustSearchPack, /from '\.\/current-runtime-artifact-index\.service'/);
  assert.match(rustSearchPack, /CURRENT_RUNTIME_DIST_MANIFEST_FILE/);
  assert.match(rustSearchPack, /resolveDistDataRuntimeFile/);
  assert.doesNotMatch(rustSearchPack, /DIST_DATA_DIR/);
  assert.doesNotMatch(rustSearchPack, /PUBLIC_DIR/);
  assert.doesNotMatch(rustSearchPack, /normalizeRelativePath/);
  assert.doesNotMatch(rustSearchPack, /searchAll/);
  assert.doesNotMatch(rustSearchPack, /path\.resolve/);
  assert.doesNotMatch(rustSearchPack, /path\.resolve\(PUBLIC_DIR, 'dist-data'\)/);
});

test('native render diagnostics and rust search pack runtime consumers use ABI catalogs', () => {
  assert.equal(existsSync(nativeRenderDiagnosticsAbiPath), true, 'native render diagnostics ABI catalog must exist');
  assert.match(nativeRenderDiagnostics, /from '\.\/native-render-runtime-diagnostics-abi'/);
  assert.match(nativeRenderDiagnosticsAbi, /NATIVE_RENDER_RUNTIME_DIAGNOSTICS_SCHEMA/);
  assert.match(nativeRenderDiagnosticsAbi, /NATIVE_RENDER_RUNTIME_DIAGNOSTIC_STATUS/);
  assert.match(nativeRenderDiagnosticsAbi, /NATIVE_RENDER_RUNTIME_MANIFEST_KEYS/);
  assert.match(nativeRenderDiagnosticsAbi, /NATIVE_RENDER_RUNTIME_CHECKS/);
  assert.match(nativeRenderDiagnosticsAbi, /NATIVE_RENDER_RUNTIME_CHECK_DESCRIPTORS/);
  assert.match(nativeRenderDiagnosticsAbi, /validateAndFreezeNativeRenderRuntimeCheckDescriptors/);
  assert.match(nativeRenderDiagnosticsAbi, /NATIVE_RENDER_RUNTIME_COUNT_FIELDS/);
  assert.match(nativeRenderDiagnosticsAbi, /NATIVE_RENDER_RUNTIME_COUNT_FIELD_DESCRIPTORS/);
  assert.match(nativeRenderDiagnosticsAbi, /validateAndFreezeNativeRenderRuntimeCountFieldDescriptors/);
  assert.match(nativeRenderDiagnosticsAbi, /NATIVE_RENDER_RUNTIME_VALIDATION_FIELDS/);
  assert.match(nativeRenderDiagnosticsAbi, /NATIVE_RENDER_RUNTIME_VALIDATION_FIELD_DESCRIPTORS/);
  assert.match(nativeRenderDiagnosticsAbi, /validateAndFreezeNativeRenderRuntimeValidationFieldDescriptors/);
  assert.match(nativeRenderDiagnosticsAbi, /Missing native render runtime check/);
  assert.match(nativeRenderDiagnosticsAbi, /Missing native render runtime count field/);
  assert.match(nativeRenderDiagnosticsAbi, /Missing native render runtime validation field/);
  assert.match(nativeRenderDiagnosticsAbi, /NATIVE_RENDER_RUNTIME_BLOCKED_STATUS/);
  assert.match(nativeRenderDiagnostics, /NATIVE_RENDER_RUNTIME_CHECK_DESCRIPTORS\.reduce/);
  assert.match(nativeRenderDiagnostics, /NATIVE_RENDER_RUNTIME_COUNT_FIELD_DESCRIPTORS\.reduce/);
  assert.match(nativeRenderDiagnostics, /NATIVE_RENDER_RUNTIME_VALIDATION_FIELD_DESCRIPTORS\.reduce/);
  assert.doesNotMatch(nativeRenderDiagnostics, /neonei\/native-render-runtime-diagnostics\/current/);
  assert.doesNotMatch(nativeRenderDiagnostics, /'ok' \| 'degraded' \| 'missing'/);
  assert.doesNotMatch(nativeRenderDiagnostics, /'blocked'/);
  assert.doesNotMatch(nativeRenderDiagnostics, /'nativeRenderIndex'/);

  assert.equal(existsSync(rustSearchPackAbiPath), true, 'rust search pack ABI catalog must exist');
  assert.match(rustSearchPack, /from '\.\/rust-search-pack-abi'/);
  assert.match(rustSearchPackAbi, /RUST_SEARCH_PACK_MANIFEST_KEYS/);
  assert.match(rustSearchPackAbi, /RUST_SEARCH_PACK_DEFAULT_PATH/);
  assert.match(rustSearchPackAbi, /RUST_SEARCH_PACK_DEFAULT_VERSION/);
  assert.match(rustSearchPackAbi, /RUST_SEARCH_PACK_SIGNATURE_FIELDS/);
  assert.doesNotMatch(rustSearchPackAbi, /searchAll/);
});
