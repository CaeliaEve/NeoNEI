import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const runtimeServicePath = resolve(root, 'src/services/acceleration-runtime.service.ts');
const phaseMachinePath = resolve(root, 'src/services/acceleration-runtime-phase-machine.service.ts');
const dispatcherPath = resolve(root, 'src/services/acceleration-runtime-reconcile-dispatcher.service.ts');
const runtimeService = readFileSync(runtimeServicePath, 'utf8');
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
  assert.match(dispatcher, /reconcileHandlerDescriptor\('compile-snapshot', \(\{ manager \}\) => refreshAccelerationSnapshot\(\{ manager \}\)\)/);
  assert.match(dispatcher, /reconcileHandlerDescriptor\('compile-external-runtime', \(\) => refreshExternalRuntimeArtifact\(\)\)/);
  assert.match(dispatcher, /reconcileHandlerDescriptor\('materialize-publish-payloads', \(\) => refreshPublishPayloadMaterialization\(\)\)/);
  assert.match(dispatcher, /reconcileHandlerDescriptor\('ready-noop', \(\) => skipPublishPayloadMaterializationOnStartup\(\)\)/);
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
  assert.match(phaseMachine, /export const ACCELERATION_RECONCILE_DECISIONS/);
  assert.match(phaseMachine, /export type AccelerationReconcileDecision = \(typeof ACCELERATION_RECONCILE_DECISIONS\)\[number\]/);
  for (const decision of ['compile-snapshot', 'compile-external-runtime', 'materialize-publish-payloads', 'ready-noop']) {
    assert.equal(phaseMachine.includes(`'${decision}'`), true, `phase machine missing decision: ${decision}`);
    assert.equal(dispatcher.includes(`'${decision}'`), true, `dispatcher missing decision: ${decision}`);
  }
  assert.match(dispatcher, /return ACCELERATION_RECONCILE_HANDLERS\[input\.decision\]\(input\)/);
});
