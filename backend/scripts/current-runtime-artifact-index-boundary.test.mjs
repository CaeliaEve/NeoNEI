import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const artifactIndexPath = resolve(root, 'src/services/current-runtime-artifact-index.service.ts');
const snapshotPath = resolve(root, 'src/services/current-runtime-snapshot.service.ts');
const apiPath = resolve(root, 'src/services/current-runtime-api.service.ts');
const reportRegistryPath = resolve(root, 'src/services/current-runtime-report-registry.service.ts');
const artifactIndex = readFileSync(artifactIndexPath, 'utf8');
const snapshot = readFileSync(snapshotPath, 'utf8');
const api = readFileSync(apiPath, 'utf8');
const reportRegistry = readFileSync(reportRegistryPath, 'utf8');

test('current runtime artifact index owns dist-data paths and artifact inventory', () => {
  assert.equal(existsSync(artifactIndexPath), true, 'current-runtime-artifact-index.service.ts must exist');
  assert.match(artifactIndex, /import fs from 'fs'/);
  assert.match(artifactIndex, /import path from 'path'/);
  assert.match(artifactIndex, /CURRENT_RUNTIME_DIST_DATA_DIR/);
  assert.match(artifactIndex, /CURRENT_RUNTIME_DIST_MANIFEST_FILE/);
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
