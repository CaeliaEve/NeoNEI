import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const runtimeServicePath = resolve(root, 'src/services/acceleration-runtime.service.ts');
const phaseMachinePath = resolve(root, 'src/services/acceleration-runtime-phase-machine.service.ts');
const reconcileWorkerPath = resolve(root, 'src/services/acceleration-runtime-reconcile-worker.service.ts');
const runtimeService = readFileSync(runtimeServicePath, 'utf8');
const phaseMachine = readFileSync(phaseMachinePath, 'utf8');
const reconcileWorker = readFileSync(reconcileWorkerPath, 'utf8');

test('acceleration reconcile phase decisions live in a dedicated phase machine', () => {
  assert.equal(existsSync(phaseMachinePath), true, 'acceleration-runtime-phase-machine.service.ts must exist');
  assert.match(phaseMachine, /export type AccelerationReconcileDecision/);
  assert.match(phaseMachine, /'compile-snapshot'/);
  assert.match(phaseMachine, /'materialize-publish-payloads'/);
  assert.match(phaseMachine, /'ready-noop'/);
  assert.match(phaseMachine, /export function decideAccelerationReconcilePhase/);
  assert.match(phaseMachine, /if \(!input\.fresh\) return 'compile-snapshot'/);
  assert.match(phaseMachine, /if \(input\.publishMaterializeOnStart\) return 'materialize-publish-payloads'/);
  assert.match(phaseMachine, /return 'ready-noop'/);
});

test('acceleration phase machine owns user-visible phase announcements', () => {
  assert.match(phaseMachine, /import \{ setAccelerationRuntimePhase \} from '\.\/acceleration-runtime-state\.service'/);
  for (const snippet of [
    "setAccelerationRuntimePhase('stale', 'Acceleration snapshot is stale; compiling next snapshot in background.'",
    "setAccelerationRuntimePhase('compiling', 'Compiling next acceleration snapshot in background.'",
    "setAccelerationRuntimePhase('materializing', 'Refreshing publish hot payloads.'",
    "setAccelerationRuntimePhase('ready', 'Acceleration runtime ready.'",
  ]) {
    assert.equal(phaseMachine.includes(snippet), true, `phase machine missing announcement: ${snippet}`);
    assert.equal(runtimeService.includes(snippet), false, `reconciler must not own announcement: ${snippet}`);
  }
});

test('acceleration runtime service delegates phase decisions and announcements', () => {
  assert.match(runtimeService, /from '\.\/acceleration-runtime-phase-machine\.service'/);
  assert.match(runtimeService, /const reconcileDecision = decideAccelerationReconcilePhase\(\{/);
  assert.match(runtimeService, /dispatchAccelerationReconcile\(\{/);
  assert.doesNotMatch(runtimeService, /if \(reconcileDecision ===/);
  assert.match(reconcileWorker, /announceAccelerationSnapshotStale\(\)/);
  assert.match(reconcileWorker, /announceAccelerationSnapshotCompile\(\)/);
  assert.match(reconcileWorker, /announcePublishPayloadMaterialization\(\)/);
  assert.match(reconcileWorker, /announceAccelerationRuntimeReady\(\)/);
  assert.match(reconcileWorker, /logAccelerationSnapshotPromotedPayload\(compileResult\)/);
  assert.doesNotMatch(runtimeService, /announceAccelerationSnapshotStale\(\)/);
  assert.doesNotMatch(runtimeService, /announceAccelerationSnapshotCompile\(\)/);
  assert.doesNotMatch(runtimeService, /announcePublishPayloadMaterialization\(\)/);
  assert.doesNotMatch(runtimeService, /announceAccelerationRuntimeReady\(\)/);
  assert.doesNotMatch(runtimeService, /logAccelerationSnapshotPromotedPayload\(compileResult\)/);
  assert.doesNotMatch(runtimeService, /import \{\s*setAccelerationRuntimePhase\s*\} from '\.\/acceleration-runtime-state\.service'/);
  assert.doesNotMatch(runtimeService, /setAccelerationRuntimePhase\('/);
});

test('phase machine keeps promotion log payload shape explicit', () => {
  assert.match(phaseMachine, /export type AccelerationCompilePromotionSummary/);
  assert.match(phaseMachine, /export function logAccelerationSnapshotPromotedPayload/);
  assert.match(phaseMachine, /itemsImported: summary\.itemsImported/);
  assert.match(phaseMachine, /recipesImported: summary\.recipesImported/);
  assert.match(phaseMachine, /signature: summary\.signature/);
});
