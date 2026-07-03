import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const runtimeServicePath = resolve(root, 'src/services/acceleration-runtime.service.ts');
const phaseAbiPath = resolve(root, 'src/services/acceleration-runtime-phase-abi.ts');
const phaseMachinePath = resolve(root, 'src/services/acceleration-runtime-phase-machine.service.ts');
const reconcileWorkerPath = resolve(root, 'src/services/acceleration-runtime-reconcile-worker.service.ts');
const runtimeService = readFileSync(runtimeServicePath, 'utf8');
const phaseAbi = readFileSync(phaseAbiPath, 'utf8');
const phaseMachine = readFileSync(phaseMachinePath, 'utf8');
const reconcileWorker = readFileSync(reconcileWorkerPath, 'utf8');

test('acceleration reconcile phase decisions live in a dedicated phase machine', () => {
  assert.equal(existsSync(phaseMachinePath), true, 'acceleration-runtime-phase-machine.service.ts must exist');
  assert.equal(existsSync(phaseAbiPath), true, 'acceleration-runtime-phase-abi.ts must exist');
  assert.match(phaseMachine, /from '\.\/acceleration-runtime-phase-abi'/);
  assert.match(phaseAbi, /export const ACCELERATION_RECONCILE_DECISION_DESCRIPTORS/);
  assert.match(phaseMachine, /ACCELERATION_RECONCILE_DECISIONS/);
  assert.match(phaseMachine, /type AccelerationReconcileDecision/);
  assert.match(phaseMachine, /ACCELERATION_RECONCILE_DECISION/);
  assert.match(phaseAbi, /'compile-snapshot'/);
  assert.match(phaseAbi, /'compile-external-runtime'/);
  assert.match(phaseAbi, /'materialize-publish-payloads'/);
  assert.match(phaseAbi, /'ready-noop'/);
  assert.match(phaseAbi, /validateAndFreezeReconcileDecisionDescriptors/);
  assert.match(phaseAbi, /Duplicate acceleration reconcile decision descriptor/);
  assert.match(phaseAbi, /Missing acceleration reconcile decision descriptor/);
  assert.match(phaseMachine, /export function decideAccelerationReconcilePhase/);
  assert.match(phaseMachine, /return ACCELERATION_RECONCILE_DECISION\.compileSnapshot/);
  assert.match(phaseMachine, /return ACCELERATION_RECONCILE_DECISION\.materializePublishPayloads/);
  assert.match(phaseMachine, /return ACCELERATION_RECONCILE_DECISION\.readyNoop/);
  assert.doesNotMatch(phaseMachine, /'compile-snapshot'/);
  assert.doesNotMatch(phaseMachine, /'compile-external-runtime'/);
  assert.doesNotMatch(phaseMachine, /'materialize-publish-payloads'/);
  assert.doesNotMatch(phaseMachine, /'ready-noop'/);
});

test('acceleration phase machine owns user-visible phase announcements', () => {
  assert.match(phaseMachine, /import \{ setAccelerationRuntimePhase \} from '\.\/acceleration-runtime-state\.service'/);
  assert.match(phaseAbi, /ACCELERATION_PHASE_ANNOUNCEMENT_DESCRIPTORS/);
  assert.match(phaseAbi, /'Acceleration snapshot is stale; compiling next snapshot in background\.'/);
  assert.match(phaseAbi, /'Compiling next acceleration snapshot in background\.'/);
  assert.match(phaseAbi, /'Refreshing publish hot payloads\.'/);
  assert.match(phaseAbi, /'Acceleration runtime ready\.'/);
  assert.match(phaseAbi, /validateAndFreezePhaseAnnouncementDescriptors/);
  assert.match(phaseMachine, /announceAccelerationPhase\('snapshotStale'\)/);
  assert.match(phaseMachine, /announceAccelerationPhase\('snapshotCompile'\)/);
  assert.match(phaseMachine, /announceAccelerationPhase\('publishPayloadMaterialization'\)/);
  assert.match(phaseMachine, /announceAccelerationPhase\('runtimeReady'\)/);
  for (const catalogOwnedAnnouncement of [
    /'Acceleration snapshot is stale; compiling next snapshot in background\.'/,
    /'Compiling next acceleration snapshot in background\.'/,
    /'Refreshing publish hot payloads\.'/,
    /'Acceleration runtime ready\.'/,
  ]) {
    assert.match(phaseAbi, catalogOwnedAnnouncement);
    assert.doesNotMatch(phaseMachine, catalogOwnedAnnouncement);
    assert.doesNotMatch(runtimeService, catalogOwnedAnnouncement);
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
  assert.match(phaseAbi, /export type AccelerationCompilePromotionSummary/);
  assert.match(phaseAbi, /ACCELERATION_PROMOTION_LOG_FIELD_DESCRIPTORS/);
  assert.match(phaseAbi, /validateAndFreezePromotionLogFields/);
  assert.match(phaseAbi, /projectAccelerationPromotionLogPayload/);
  assert.match(phaseMachine, /export function logAccelerationSnapshotPromotedPayload/);
  assert.match(phaseMachine, /projectAccelerationPromotionLogPayload\(summary\)/);
  assert.match(phaseAbi, /itemsImported/);
  assert.match(phaseAbi, /recipesImported/);
  assert.match(phaseAbi, /signature/);
});
