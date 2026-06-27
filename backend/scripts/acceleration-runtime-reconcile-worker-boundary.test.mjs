import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const runtimeServicePath = resolve(root, 'src/services/acceleration-runtime.service.ts');
const reconcileWorkerPath = resolve(root, 'src/services/acceleration-runtime-reconcile-worker.service.ts');
const runtimeService = readFileSync(runtimeServicePath, 'utf8');
const reconcileWorker = readFileSync(reconcileWorkerPath, 'utf8');

test('acceleration reconcile work lives behind a dedicated worker boundary', () => {
  assert.equal(existsSync(reconcileWorkerPath), true, 'acceleration-runtime-reconcile-worker.service.ts must exist');
  assert.match(reconcileWorker, /export async function refreshAccelerationSnapshot/);
  assert.match(reconcileWorker, /export function skipPublishPayloadMaterializationOnStartup/);
  assert.match(reconcileWorker, /export async function refreshPublishPayloadMaterialization/);
  assert.match(reconcileWorker, /export function getAccelerationCandidateDbPath/);
  assert.match(reconcileWorker, /export function removeExistingAccelerationCandidateSnapshot/);
});

test('acceleration runtime service schedules decisions instead of executing reconcile work inline', () => {
  assert.match(runtimeService, /from '\.\/acceleration-runtime-reconcile-worker\.service'/);
  assert.match(runtimeService, /return refreshAccelerationSnapshot\(\{ manager: accelerationDbManager \}\)/);
  assert.match(runtimeService, /return skipPublishPayloadMaterializationOnStartup\(\)/);
  assert.match(runtimeService, /return refreshPublishPayloadMaterialization\(\)/);
  assert.doesNotMatch(runtimeService, /import fs from 'fs'/);
  assert.doesNotMatch(runtimeService, /fs\.existsSync/);
  assert.doesNotMatch(runtimeService, /fs\.rmSync/);
  assert.doesNotMatch(runtimeService, /compileAccelerationSnapshotInChild\(/);
  assert.doesNotMatch(runtimeService, /materializePublishPayloadsInChild\(/);
  assert.doesNotMatch(runtimeService, /activateCompiledAccelerationSnapshot\(/);
  assert.doesNotMatch(runtimeService, /stale; runtime will stay online/);
  assert.doesNotMatch(runtimeService, /startup materialization skipped/);
});

test('snapshot refresh worker owns candidate cleanup, compile, activation, and promotion log order', () => {
  for (const snippet of [
    'const candidateDbPath = getAccelerationCandidateDbPath(input.manager)',
    'announceAccelerationSnapshotStale()',
    'removeExistingAccelerationCandidateSnapshot(candidateDbPath)',
    'announceAccelerationSnapshotCompile()',
    'const compileResult = await compileAccelerationSnapshotInChild(candidateDbPath)',
    'await activateCompiledAccelerationSnapshot({',
    'logAccelerationSnapshotPromotedPayload(compileResult)',
    'announceAccelerationRuntimeReady()',
  ]) {
    assert.equal(reconcileWorker.includes(snippet), true, `worker missing snapshot refresh snippet: ${snippet}`);
  }

  const stale = reconcileWorker.indexOf('announceAccelerationSnapshotStale()');
  const cleanup = reconcileWorker.indexOf('removeExistingAccelerationCandidateSnapshot(candidateDbPath)');
  const compilePhase = reconcileWorker.indexOf('announceAccelerationSnapshotCompile()');
  const compile = reconcileWorker.indexOf('compileAccelerationSnapshotInChild(candidateDbPath)');
  const activate = reconcileWorker.indexOf('activateCompiledAccelerationSnapshot({');
  const promoted = reconcileWorker.indexOf('logAccelerationSnapshotPromotedPayload(compileResult)');
  assert.ok(cleanup > stale, 'candidate cleanup should happen after stale announcement');
  assert.ok(compilePhase > cleanup, 'compile announcement should happen after candidate cleanup');
  assert.ok(compile > compilePhase, 'child compile should happen after compile announcement');
  assert.ok(activate > compile, 'snapshot activation should happen after child compile');
  assert.ok(promoted > activate, 'promotion log should happen after activation');
});

test('publish payload worker owns materialization and skip logs', () => {
  assert.match(reconcileWorker, /announcePublishPayloadMaterialization\(\)/);
  assert.match(reconcileWorker, /const publishPayloadsResult = await materializePublishPayloadsInChild\(\)/);
  assert.match(reconcileWorker, /logger\.info\(publishPayloadMaterializationLogMessage\(publishPayloadsResult\)\)/);
  assert.match(reconcileWorker, /startup materialization skipped; set NEONEI_PUBLISH_MATERIALIZE_ON_START=1/);
  assert.match(reconcileWorker, /announceAccelerationRuntimeReady\(\)/);
});
