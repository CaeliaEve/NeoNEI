import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const runtimeServicePath = resolve(root, 'src/services/acceleration-runtime.service.ts');
const phaseAbiPath = resolve(root, 'src/services/acceleration-runtime-phase-abi.ts');
const phaseMachinePath = resolve(root, 'src/services/acceleration-runtime-phase-machine.service.ts');
const dispatcherPath = resolve(root, 'src/services/acceleration-runtime-reconcile-dispatcher.service.ts');
const runtimeService = readFileSync(runtimeServicePath, 'utf8');
const phaseAbi = readFileSync(phaseAbiPath, 'utf8');
const phaseMachine = readFileSync(phaseMachinePath, 'utf8');
const dispatcher = readFileSync(dispatcherPath, 'utf8');

test('acceleration reconcile dispatcher owns the decision handler table', () => {
  assert.equal(existsSync(dispatcherPath), true, 'acceleration-runtime-reconcile-dispatcher.service.ts must exist');
  assert.match(dispatcher, /export type AccelerationReconcileDispatchInput/);
  assert.match(dispatcher, /export type AccelerationReconcileHandler/);
  assert.match(dispatcher, /export type AccelerationReconcileHandlerDescriptor/);
  assert.match(dispatcher, /ACCELERATION_RECONCILE_DECISIONS/);
  assert.match(dispatcher, /validateAndFreezeAccelerationReconcileHandlers/);
  assert.match(dispatcher, /export const ACCELERATION_RECONCILE_HANDLER_DESCRIPTORS/);
  assert.match(dispatcher, /export const ACCELERATION_RECONCILE_HANDLERS/);
  assert.match(dispatcher, /Unknown acceleration reconcile handler decision/);
  assert.match(dispatcher, /Duplicate acceleration reconcile handler decision/);
  assert.match(dispatcher, /Missing acceleration reconcile handler decision/);
  assert.match(dispatcher, /reconcileHandlerDescriptor\(ACCELERATION_RECONCILE_DECISION\.compileSnapshot/);
  assert.match(dispatcher, /reconcileHandlerDescriptor\(ACCELERATION_RECONCILE_DECISION\.compileExternalRuntime/);
  assert.match(dispatcher, /reconcileHandlerDescriptor\(ACCELERATION_RECONCILE_DECISION\.materializePublishPayloads/);
  assert.match(dispatcher, /reconcileHandlerDescriptor\(ACCELERATION_RECONCILE_DECISION\.readyNoop/);
  assert.doesNotMatch(dispatcher, /'compile-snapshot'/);
  assert.doesNotMatch(dispatcher, /'compile-external-runtime'/);
  assert.doesNotMatch(dispatcher, /'materialize-publish-payloads'/);
  assert.doesNotMatch(dispatcher, /'ready-noop'/);
});

test('acceleration runtime scheduler dispatches decisions instead of branching on handlers', () => {
  assert.match(runtimeService, /dispatchAccelerationReconcile\(\{/);
  assert.match(runtimeService, /decision: reconcileDecision/);
  assert.match(runtimeService, /manager: accelerationDbManager/);
  assert.doesNotMatch(runtimeService, /if \(reconcileDecision ===/);
  assert.doesNotMatch(runtimeService, /refreshAccelerationSnapshot\(/);
  assert.doesNotMatch(runtimeService, /refreshPublishPayloadMaterialization\(/);
  assert.doesNotMatch(runtimeService, /skipPublishPayloadMaterializationOnStartup\(/);
});

test('dispatcher covers every phase-machine decision explicitly', () => {
  assert.match(phaseMachine, /ACCELERATION_RECONCILE_DECISIONS/);
  assert.match(phaseMachine, /type AccelerationReconcileDecision/);
  for (const decision of ['compile-snapshot', 'compile-external-runtime', 'materialize-publish-payloads', 'ready-noop']) {
    assert.equal(phaseAbi.includes(`'${decision}'`), true, `phase ABI missing decision: ${decision}`);
    assert.equal(phaseMachine.includes(`'${decision}'`), false, `phase machine must not own decision literal: ${decision}`);
    assert.equal(dispatcher.includes(`'${decision}'`), false, `dispatcher must not own decision literal: ${decision}`);
  }
  assert.match(dispatcher, /return ACCELERATION_RECONCILE_HANDLERS\[input\.decision\]\(input\)/);
});
