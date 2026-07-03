import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const snapshotPath = resolve(root, 'src/services/current-runtime-snapshot.service.ts');
const snapshotAbiPath = resolve(root, 'src/services/current-runtime-snapshot-abi.ts');
const snapshot = readFileSync(snapshotPath, 'utf8');
const snapshotAbi = readFileSync(snapshotAbiPath, 'utf8');

test('current runtime snapshot lifecycle and diagnostics are ABI-catalog owned', () => {
  assert.equal(existsSync(snapshotAbiPath), true, 'current-runtime-snapshot-abi.ts must exist');
  assert.match(snapshot, /from '\.\/current-runtime-snapshot-abi'/);

  for (const symbol of [
    'CURRENT_RUNTIME_SNAPSHOT_DEFAULT_DESCRIPTORS',
    'CURRENT_RUNTIME_MANIFEST_FIELD_DESCRIPTORS',
    'CURRENT_RUNTIME_SNAPSHOT_STATUS_DESCRIPTORS',
    'CURRENT_RUNTIME_SNAPSHOT_STATUS',
    'CURRENT_RUNTIME_SNAPSHOT_DIAGNOSTIC_DESCRIPTORS',
    'CURRENT_RUNTIME_SNAPSHOT_DIAGNOSTICS',
    'CURRENT_RUNTIME_SNAPSHOT_PROBE_DESCRIPTORS',
    'CURRENT_RUNTIME_SNAPSHOT_PROBES',
    'createInitialCurrentRuntimeSnapshotDiagnostics',
    'buildCurrentRuntimeSnapshotDiagnostics',
    'createCurrentRuntimeSnapshotReaderCounters',
    'acquireCurrentRuntimeSnapshotReader',
    'buildCurrentRuntimeSnapshotReadStats',
  ]) {
    assert.match(snapshotAbi, new RegExp(`export (?:const|function) ${symbol}`));
  }

  for (const ownedLiteral of [
    /'ready'/,
    /'missing'/,
    /'invalid'/,
    /'current runtime snapshot has not been acquired yet'/,
    /'distManifest'/,
    /'runtimeManifestText'/,
    /'runtimeManifestJson'/,
    /'manifest\.json'/,
  ]) {
    assert.match(snapshotAbi, ownedLiteral);
    assert.doesNotMatch(snapshot, ownedLiteral);
  }
});

test('current runtime snapshot service publishes snapshots but delegates probe policy and RCU readers', () => {
  assert.match(snapshot, /function publishCurrentRuntimeSnapshot/);
  assert.match(snapshot, /createInitialCurrentRuntimeSnapshotDiagnostics\(\)/);
  assert.match(snapshot, /buildCurrentRuntimeSnapshotDiagnostics\(probes\)/);
  assert.match(snapshot, /createCurrentRuntimeSnapshotReaderCounters\(\)/);
  assert.match(snapshot, /acquireCurrentRuntimeSnapshotReader\(snapshotReaders\)/);
  assert.match(snapshot, /buildCurrentRuntimeSnapshotReadStats\(\{/);
  assert.match(snapshot, /CURRENT_RUNTIME_SNAPSHOT_PROBES\.distManifest\.key/);
  assert.match(snapshot, /CURRENT_RUNTIME_SNAPSHOT_PROBES\.runtimeManifestText\.key/);
  assert.match(snapshot, /CURRENT_RUNTIME_SNAPSHOT_PROBES\.runtimeManifestJson\.key/);

  assert.doesNotMatch(snapshot, /CURRENT_RUNTIME_ARTIFACT_STATUS/);
  assert.doesNotMatch(snapshot, /activeSnapshotReaders/);
  assert.doesNotMatch(snapshot, /totalSnapshotAcquires/);
  assert.doesNotMatch(snapshot, /Date\.now\(\)/);
  assert.doesNotMatch(snapshot, /Math\.max\(0/);
  assert.doesNotMatch(snapshot, /probes\.distManifest/);
  assert.doesNotMatch(snapshot, /probes\.runtimeManifestText/);
  assert.doesNotMatch(snapshot, /probes\.runtimeManifestJson/);
});
