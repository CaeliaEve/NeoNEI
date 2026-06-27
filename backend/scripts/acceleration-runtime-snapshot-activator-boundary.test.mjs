import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const runtimeServicePath = resolve(root, 'src/services/acceleration-runtime.service.ts');
const activatorPath = resolve(root, 'src/services/acceleration-runtime-snapshot-activator.service.ts');
const runtimeService = readFileSync(runtimeServicePath, 'utf8');
const activator = readFileSync(activatorPath, 'utf8');

test('acceleration snapshot activation lives in a dedicated activator module', () => {
  assert.equal(existsSync(activatorPath), true, 'acceleration-runtime-snapshot-activator.service.ts must exist');
  assert.match(activator, /export type AccelerationSnapshotActivationInput/);
  assert.match(activator, /export async function activateCompiledAccelerationSnapshot/);
  assert.match(activator, /setAccelerationRuntimePhase\('promoting'/);
  assert.match(activator, /setAccelerationRuntimeBlocking\(true\)/);
  assert.match(activator, /waitForAccelerationApiIdle\(\)/);
  assert.match(activator, /promoteCompiledAccelerationDatabase/);
  assert.match(activator, /setAccelerationRuntimeBlocking\(false\)/);
  assert.match(activator, /setAccelerationRuntimePhase\('ready', 'Acceleration snapshot refreshed\.'/);
});

test('acceleration runtime service delegates snapshot activation', () => {
  assert.match(runtimeService, /from '\.\/acceleration-runtime-snapshot-activator\.service'/);
  assert.match(runtimeService, /await activateCompiledAccelerationSnapshot\(\{/);
  assert.match(runtimeService, /signature: compileResult\.signature/);
  assert.doesNotMatch(runtimeService, /promoteCompiledAccelerationDatabase/);
  assert.doesNotMatch(runtimeService, /setAccelerationRuntimeBlocking/);
  assert.doesNotMatch(runtimeService, /waitForAccelerationApiIdle/);
  assert.doesNotMatch(runtimeService, /setAccelerationRuntimePhase\('promoting'/);
  assert.doesNotMatch(runtimeService, /Acceleration snapshot refreshed\./);
});

test('snapshot activator owns the complete bounded blocking window', () => {
  const blockingOn = activator.indexOf('setAccelerationRuntimeBlocking(true)');
  const waitIdle = activator.indexOf('waitForAccelerationApiIdle()');
  const promote = activator.lastIndexOf('promoteCompiledAccelerationDatabase');
  const blockingOff = activator.indexOf('setAccelerationRuntimeBlocking(false)');
  assert.ok(blockingOn >= 0, 'blocking on must be present');
  assert.ok(waitIdle > blockingOn, 'idle wait must occur after blocking starts');
  assert.ok(promote > waitIdle, 'promotion must occur after idle wait');
  assert.ok(blockingOff > promote, 'blocking must be cleared after promotion attempt');
});
