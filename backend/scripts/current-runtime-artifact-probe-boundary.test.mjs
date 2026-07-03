import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const artifactSource = fs.readFileSync('src/services/current-runtime-artifact-index.service.ts', 'utf8');
const artifactAbiSource = fs.readFileSync('src/services/current-runtime-artifact-index-abi.ts', 'utf8');
const snapshotSource = fs.readFileSync('src/services/current-runtime-snapshot.service.ts', 'utf8');
const snapshotAbiSource = fs.readFileSync('src/services/current-runtime-snapshot-abi.ts', 'utf8');
const recipePackSource = fs.readFileSync('src/services/runtime-recipe-pack.service.ts', 'utf8');
const nativeUiProofSource = fs.readFileSync('src/services/native-ui-runtime-proof.service.ts', 'utf8');
const runtimeHealthSource = fs.readFileSync('src/services/runtime-health-summary.service.ts', 'utf8');
const frontendTypesSource = fs.readFileSync('../frontend/src/runtime/types.ts', 'utf8');
const runtimeHealthViewSource = fs.readFileSync('../frontend/src/views/RuntimeHealthView.vue', 'utf8');

function sourceSection(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  assert.notEqual(start, -1, `missing source section start: ${startNeedle}`);
  const end = source.indexOf(endNeedle, start);
  assert.notEqual(end, -1, `missing source section end: ${endNeedle}`);
  return source.slice(start, end);
}

test('current runtime artifact index owns explicit read/stat probe ABI', () => {
  assert.match(artifactAbiSource, /CURRENT_RUNTIME_ARTIFACT_STATUS = Object\.freeze/);
  assert.match(artifactAbiSource, /export type CurrentRuntimeArtifactProbeStatus/);
  assert.match(artifactAbiSource, /export type CurrentRuntimeArtifactReadKind = 'file' \| 'json' \| 'text'/);
  assert.match(artifactAbiSource, /export type CurrentRuntimeArtifactProbe = Readonly/);

  for (const status of ['present', 'missing', 'invalid']) {
    assert.match(artifactAbiSource, new RegExp(`${status}: '${status}'`));
  }
});

test('current runtime artifact reads distinguish missing invalid and present instead of returning null', () => {
  const fileProbe = sourceSection(
    artifactSource,
    'export function probeCurrentRuntimeFile',
    'export function readCurrentRuntimeJsonArtifact',
  );
  const jsonRead = sourceSection(
    artifactSource,
    'export function readCurrentRuntimeJsonArtifact',
    'export function readCurrentRuntimeTextArtifact',
  );
  const textRead = sourceSection(
    artifactSource,
    'export function readCurrentRuntimeTextArtifact',
    'export function isPortableRuntimePath',
  );

  assert.match(fileProbe, /fs\.statSync/);
  assert.match(fileProbe, /stat\.isFile\(\)/);
  assert.match(fileProbe, /CURRENT_RUNTIME_ARTIFACT_STATUS\.present/);
  assert.match(fileProbe, /CURRENT_RUNTIME_ARTIFACT_STATUS\.missing/);
  assert.match(fileProbe, /CURRENT_RUNTIME_ARTIFACT_STATUS\.invalid/);
  assert.match(jsonRead, /current runtime JSON artifact payload must be an object/);
  assert.match(textRead, /readFileSync/);
  assert.doesNotMatch(artifactSource, /function statRuntimeFile/);
  assert.doesNotMatch(artifactSource, /export function readCurrentRuntimeJson\(filePath: string\)/);
  assert.doesNotMatch(artifactSource, /export function readCurrentRuntimeText\(filePath: string\)/);
  assert.doesNotMatch(artifactSource, /catch \{\s*return null;\s*\}/s);
});

test('current runtime snapshot publishes diagnostics and artifact probes', () => {
  assert.match(snapshotAbiSource, /export type CurrentRuntimeSnapshotDiagnostics/);
  assert.match(snapshotSource, /CurrentRuntimeSnapshotDiagnostics/);
  assert.match(snapshotSource, /artifactProbesByPath/);
  assert.match(snapshotSource, /diagnostics: CurrentRuntimeSnapshotDiagnostics/);
  assert.match(snapshotSource, /publishCurrentRuntimeSnapshotDiagnostics/);
  assert.match(snapshotSource, /buildCurrentRuntimeSnapshotDiagnostics\(probes\)/);
  assert.match(snapshotSource, /readCurrentRuntimeJsonArtifact/);
  assert.match(snapshotSource, /readCurrentRuntimeTextArtifact/);
  assert.match(snapshotAbiSource, /lastRefreshStatus/);
  assert.match(snapshotAbiSource, /lastRefreshErrors/);
  assert.doesNotMatch(snapshotSource, /readCurrentRuntimeJson,/);
  assert.doesNotMatch(snapshotSource, /readCurrentRuntimeText,/);
});

test('runtime recipe pack consumes explicit runtime entrypoints without default recipe-pack fallback', () => {
  assert.match(recipePackSource, /probeCurrentRuntimeFile/);
  assert.match(recipePackSource, /readCurrentRuntimeJsonArtifact/);
  assert.match(recipePackSource, /entrypoints\)\?\.recipes/);
  assert.match(recipePackSource, /artifact-probe/);
  assert.match(recipePackSource, /distManifestRead\.probe\.bytes/);
  assert.match(recipePackSource, /runtimeManifestRead\.probe\.mtimeMs/);
  assert.doesNotMatch(recipePackSource, /rust\/recipes\.bin/);
  assert.doesNotMatch(recipePackSource, /runtime-cache-missing/);
  assert.doesNotMatch(recipePackSource, /fs\.existsSync\(packPath\)/);
});

test('runtime health and frontend expose current runtime snapshot probe diagnostics', () => {
  assert.match(nativeUiProofSource, /readCurrentRuntimeJsonArtifact/);
  assert.match(runtimeHealthSource, /type CurrentRuntimeSnapshotDiagnostics/);
  assert.match(runtimeHealthSource, /status: CurrentRuntimeSnapshotDiagnostics\['status'\]/);
  assert.match(runtimeHealthSource, /errors: readonly string\[\]/);
  assert.match(runtimeHealthSource, /snapshotHandle\?\.diagnostics/);
  assert.match(frontendTypesSource, /status: 'ready' \| 'missing' \| 'invalid'/);
  assert.match(frontendTypesSource, /errors: readonly string\[\]/);
  assert.match(runtimeHealthViewSource, /\['探针状态', snapshot\?\.status\]/);
  assert.match(runtimeHealthViewSource, /health\.runtimeSnapshot\?\.errors/);
});
