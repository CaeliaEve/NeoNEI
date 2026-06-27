import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const runtimeServicePath = resolve(root, 'src/services/acceleration-runtime.service.ts');
const reporterPath = resolve(root, 'src/services/acceleration-runtime-compiler-boundary-reporter.service.ts');
const runtimeService = readFileSync(runtimeServicePath, 'utf8');
const reporter = readFileSync(reporterPath, 'utf8');

test('acceleration compiler boundary reporter owns compiler handshake verification', () => {
  assert.equal(existsSync(reporterPath), true, 'acceleration-runtime-compiler-boundary-reporter.service.ts must exist');
  assert.match(reporter, /verifyElysiumCompilerBoundary/);
  assert.match(reporter, /export async function verifyAccelerationCompilerBoundary/);
  assert.match(reporter, /const handshake = await verifyElysiumCompilerBoundary\(\)/);
  assert.match(reporter, /return handshake/);
  assert.match(runtimeService, /verifyAccelerationCompilerBoundary\(\)/);
  assert.doesNotMatch(runtimeService, /verifyElysiumCompilerBoundary/);
});

test('acceleration compiler boundary reporter owns ABI evidence shape and log event', () => {
  assert.match(reporter, /export type AccelerationCompilerBoundaryEvidence/);
  assert.match(reporter, /export function buildAccelerationCompilerBoundaryEvidence/);
  for (const snippet of [
    'compiler: handshake.compiler',
    'exportAbiVersion: handshake.metadata?.exportAbiVersion',
    'packAbiVersion: handshake.metadata?.packAbiVersion',
    'runtimeAbiVersion: handshake.metadata?.runtimeAbiVersion',
    'nativeUiCapabilities: handshake.capabilities.nativeUi.requiredCapabilities',
    'nativeUiCoordinateSpace: handshake.capabilities.nativeUi.coordinateSpace',
    'nativeUiRuntimeTransform: handshake.capabilities.nativeUi.runtimeTransform',
  ]) {
    assert.equal(reporter.includes(snippet), true, `reporter missing evidence field: ${snippet}`);
    assert.equal(runtimeService.includes(snippet), false, `reconciler must not own evidence field: ${snippet}`);
  }
  assert.match(reporter, /logger\.info\('\[ACCELERATION_DB\] external compiler boundary verified', evidence\)/);
  assert.doesNotMatch(runtimeService, /external compiler boundary verified/);
});

test('acceleration runtime reconciler delegates compiler boundary evidence before compilation work', () => {
  const verifyIndex = runtimeService.indexOf('await verifyAccelerationCompilerBoundary()');
  const compilerIndex = runtimeService.indexOf('new NeoNeiCompilerService');
  const decisionIndex = runtimeService.indexOf('decideAccelerationReconcilePhase({');
  assert.ok(verifyIndex >= 0, 'reconciler should verify compiler boundary');
  assert.ok(compilerIndex > verifyIndex, 'compiler service should be created after boundary verification');
  assert.ok(decisionIndex > compilerIndex, 'reconcile decision should happen after compiler service construction');
});
