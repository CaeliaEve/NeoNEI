import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  beginNativeRuntimeLoad,
  createNativeRuntimeControlState,
  markNativeRuntimeError,
  markNativeRuntimeReady,
  toNativeRuntimeMetricsPatch,
} from '../src/native-surface/NativeRuntimeControlPlane.ts';
import {
  NATIVE_RUNTIME_CONTROL_ERRORS,
  NATIVE_RUNTIME_CONTROL_METRIC_FIELDS,
  NATIVE_RUNTIME_CONTROL_MODULE,
  NATIVE_RUNTIME_CONTROL_STATUS,
  NATIVE_RUNTIME_CONTROL_STATUS_DESCRIPTORS,
} from '../src/native-surface/NativeRuntimeControlAbi.ts';

function readSource(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
}

test('native runtime control plane owns runtime status transitions', () => {
  const state = createNativeRuntimeControlState();
  assert.deepEqual(state, { revision: 0, status: NATIVE_RUNTIME_CONTROL_STATUS.idle, ready: false, packCount: 0, error: null });
  assert.equal(Object.isFrozen(state), true);

  const loading = beginNativeRuntimeLoad(state);
  assert.notEqual(loading, state);
  assert.deepEqual(state, { revision: 0, status: NATIVE_RUNTIME_CONTROL_STATUS.idle, ready: false, packCount: 0, error: null });
  assert.deepEqual(loading, { revision: 1, status: NATIVE_RUNTIME_CONTROL_STATUS.loading, ready: false, packCount: 0, error: null });
  assert.equal(Object.isFrozen(loading), true);

  const ready = markNativeRuntimeReady(loading, true, 3);
  assert.notEqual(ready, loading);
  assert.deepEqual(ready, { revision: 2, status: NATIVE_RUNTIME_CONTROL_STATUS.ready, ready: true, packCount: 3, error: null });
  assert.equal(Object.isFrozen(ready), true);
  assert.deepEqual(toNativeRuntimeMetricsPatch(ready), {
    nativeRuntimeStatus: NATIVE_RUNTIME_CONTROL_STATUS.ready,
    nativeRuntimeRevision: 2,
    nativeRuntimeReady: true,
    nativeRuntimePacks: 3,
    nativeRuntimeError: null,
  });

  const error = markNativeRuntimeError(ready, new Error('manifest rejected'));
  assert.notEqual(error, ready);
  assert.deepEqual(error, { revision: 3, status: NATIVE_RUNTIME_CONTROL_STATUS.error, ready: false, packCount: 0, error: 'manifest rejected' });
  assert.equal(Object.isFrozen(error), true);
});

test('native runtime control ABI catalog is the status and metrics source of truth', () => {
  assert.deepEqual(
    NATIVE_RUNTIME_CONTROL_STATUS_DESCRIPTORS.map((descriptor) => descriptor.status),
    [
      NATIVE_RUNTIME_CONTROL_STATUS.idle,
      NATIVE_RUNTIME_CONTROL_STATUS.loading,
      NATIVE_RUNTIME_CONTROL_STATUS.ready,
      NATIVE_RUNTIME_CONTROL_STATUS.error,
    ],
  );
  assert.equal(NATIVE_RUNTIME_CONTROL_MODULE.schema, 'neonei/native-runtime-control/current');
  assert.equal(NATIVE_RUNTIME_CONTROL_MODULE.statusCount, 4);
  assert.deepEqual([...NATIVE_RUNTIME_CONTROL_METRIC_FIELDS], [
    'nativeRuntimeStatus',
    'nativeRuntimeRevision',
    'nativeRuntimeReady',
    'nativeRuntimePacks',
    'nativeRuntimeError',
  ]);
  assert.match(NATIVE_RUNTIME_CONTROL_ERRORS.emptyAcceptedPackSet, /usable packs/);
  assert.match(NATIVE_RUNTIME_CONTROL_ERRORS.rejectedPackSet, /worker rejected/);
});

test('native runtime control plane rejects zero-pack and worker-rejected ready transitions', () => {
  const zeroPackState = createNativeRuntimeControlState();
  const zeroPackError = markNativeRuntimeReady(zeroPackState, true, 0);
  assert.equal(zeroPackError.status, NATIVE_RUNTIME_CONTROL_STATUS.error);
  assert.equal(zeroPackError.ready, false);
  assert.equal(zeroPackError.revision, 1);
  assert.equal(zeroPackState.status, NATIVE_RUNTIME_CONTROL_STATUS.idle);
  assert.match(zeroPackError.error ?? '', /did not provide any usable packs/);

  const rejectedState = createNativeRuntimeControlState();
  const rejectedError = markNativeRuntimeReady(rejectedState, false, 2);
  assert.equal(rejectedError.status, NATIVE_RUNTIME_CONTROL_STATUS.error);
  assert.equal(rejectedError.ready, false);
  assert.equal(rejectedError.packCount, 2);
  assert.equal(rejectedError.revision, 1);
  assert.equal(rejectedState.status, NATIVE_RUNTIME_CONTROL_STATUS.idle);
  assert.match(rejectedError.error ?? '', /worker rejected runtime packs/);
});

test('native runtime control plane is the controller and metrics boundary', () => {
  const controlSource = readSource('src/native-surface/NativeRuntimeControlPlane.ts');
  const controllerSource = readSource('src/native-surface/NativeSurfaceController.ts');
  const metricsSource = readSource('src/native-surface/NativeSurfaceMetrics.ts');

  assert.match(controlSource, /export interface NativeRuntimeControlState/);
  assert.match(controlSource, /NATIVE_RUNTIME_CONTROL_STATUS/);
  assert.match(controlSource, /NATIVE_RUNTIME_CONTROL_ERRORS/);
  assert.match(controlSource, /readonly revision: number/);
  assert.match(controlSource, /Object\.freeze\(state\)/);
  assert.match(controlSource, /export function toNativeRuntimeMetricsPatch/);
  assert.match(controllerSource, /private nativeRuntime = createNativeRuntimeControlState\(\)/);
  assert.match(controllerSource, /this\.nativeRuntime = beginNativeRuntimeLoad\(this\.nativeRuntime\)/);
  assert.match(controllerSource, /this\.nativeRuntime = markNativeRuntimeReady\(this\.nativeRuntime, true, packs\.length\)/);
  assert.match(controllerSource, /this\.nativeRuntime = markNativeRuntimeError\(this\.nativeRuntime, error\)/);
  assert.match(controllerSource, /\.\.\.toNativeRuntimeMetricsPatch\(this\.nativeRuntime\)/);
  assert.match(metricsSource, /\.\.\.toNativeRuntimeMetricsPatch\(nativeRuntime\)/);

  assert.doesNotMatch(controlSource, /state\.status =/);
  assert.doesNotMatch(controlSource, /state\.ready =/);
  assert.doesNotMatch(controlSource, /state\.packCount =/);
  assert.doesNotMatch(controlSource, /state\.error =/);
  assert.doesNotMatch(controlSource, /status: "idle"/);
  assert.doesNotMatch(controlSource, /status: "loading"/);
  assert.doesNotMatch(controlSource, /status: "ready"/);
  assert.doesNotMatch(controlSource, /status: "error"/);
  assert.doesNotMatch(controlSource, /Native runtime did not provide any usable packs\./);
  assert.doesNotMatch(controlSource, /Native runtime worker rejected runtime packs\./);
  assert.doesNotMatch(controllerSource, /private nativeRuntimeReady = false/);
  assert.doesNotMatch(controllerSource, /private nativeRuntimePacks = 0/);
  assert.doesNotMatch(controllerSource, /private nativeRuntimeError: string \| null = null/);
  assert.doesNotMatch(controllerSource, /shouldSendCompatEntriesToWorker/);
  assert.doesNotMatch(controllerSource, /setCompatEntries/);
  assert.doesNotMatch(controlSource, /shouldSendCompatEntriesToWorker/);
});
