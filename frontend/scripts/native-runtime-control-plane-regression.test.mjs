import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  beginNativeRuntimeLoad,
  createNativeRuntimeControlState,
  markNativeRuntimeError,
  markNativeRuntimeReady,
  shouldSendCompatEntriesToWorker,
  toNativeRuntimeMetricsPatch,
} from '../src/native-surface/NativeRuntimeControlPlane.ts';

function readSource(relativePath) {
  return readFileSync(relativePath, 'utf8').replace(/\r\n/g, '\n');
}

test('native runtime control plane owns runtime status transitions', () => {
  const state = createNativeRuntimeControlState();
  assert.deepEqual(state, { revision: 0, status: 'idle', ready: false, packCount: 0, error: null });
  assert.equal(Object.isFrozen(state), true);
  assert.equal(shouldSendCompatEntriesToWorker(state), true);

  const loading = beginNativeRuntimeLoad(state);
  assert.notEqual(loading, state);
  assert.deepEqual(state, { revision: 0, status: 'idle', ready: false, packCount: 0, error: null });
  assert.deepEqual(loading, { revision: 1, status: 'loading', ready: false, packCount: 0, error: null });
  assert.equal(Object.isFrozen(loading), true);
  assert.equal(shouldSendCompatEntriesToWorker(loading), true);

  const ready = markNativeRuntimeReady(loading, true, 3);
  assert.notEqual(ready, loading);
  assert.deepEqual(ready, { revision: 2, status: 'ready', ready: true, packCount: 3, error: null });
  assert.equal(Object.isFrozen(ready), true);
  assert.equal(shouldSendCompatEntriesToWorker(ready), false);
  assert.deepEqual(toNativeRuntimeMetricsPatch(ready), {
    nativeRuntimeReady: true,
    nativeRuntimePacks: 3,
    nativeRuntimeError: null,
  });

  const error = markNativeRuntimeError(ready, new Error('manifest rejected'));
  assert.notEqual(error, ready);
  assert.deepEqual(error, { revision: 3, status: 'error', ready: false, packCount: 0, error: 'manifest rejected' });
  assert.equal(Object.isFrozen(error), true);
  assert.equal(shouldSendCompatEntriesToWorker(error), true);
});

test('native runtime control plane rejects zero-pack and worker-rejected ready transitions', () => {
  const zeroPackState = createNativeRuntimeControlState();
  const zeroPackError = markNativeRuntimeReady(zeroPackState, true, 0);
  assert.equal(zeroPackError.status, 'error');
  assert.equal(zeroPackError.ready, false);
  assert.equal(zeroPackError.revision, 1);
  assert.equal(zeroPackState.status, 'idle');
  assert.match(zeroPackError.error ?? '', /did not provide any usable packs/);

  const rejectedState = createNativeRuntimeControlState();
  const rejectedError = markNativeRuntimeReady(rejectedState, false, 2);
  assert.equal(rejectedError.status, 'error');
  assert.equal(rejectedError.ready, false);
  assert.equal(rejectedError.packCount, 2);
  assert.equal(rejectedError.revision, 1);
  assert.equal(rejectedState.status, 'idle');
  assert.match(rejectedError.error ?? '', /worker rejected runtime packs/);
});

test('native runtime control plane is the controller and metrics boundary', () => {
  const controlSource = readSource('src/native-surface/NativeRuntimeControlPlane.ts');
  const controllerSource = readSource('src/native-surface/NativeSurfaceController.ts');
  const metricsSource = readSource('src/native-surface/NativeSurfaceMetrics.ts');

  assert.match(controlSource, /export interface NativeRuntimeControlState/);
  assert.match(controlSource, /readonly revision: number/);
  assert.match(controlSource, /Object\.freeze\(state\)/);
  assert.match(controlSource, /export function toNativeRuntimeMetricsPatch/);
  assert.match(controllerSource, /private nativeRuntime = createNativeRuntimeControlState\(\)/);
  assert.match(controllerSource, /this\.nativeRuntime = beginNativeRuntimeLoad\(this\.nativeRuntime\)/);
  assert.match(controllerSource, /this\.nativeRuntime = markNativeRuntimeReady\(this\.nativeRuntime, Boolean\(response\), packs\.length\)/);
  assert.match(controllerSource, /this\.nativeRuntime = markNativeRuntimeError\(this\.nativeRuntime, error\)/);
  assert.match(controllerSource, /return shouldSendCompatEntriesToWorker\(this\.nativeRuntime\)/);
  assert.match(controllerSource, /\.\.\.toNativeRuntimeMetricsPatch\(this\.nativeRuntime\)/);
  assert.match(metricsSource, /\.\.\.toNativeRuntimeMetricsPatch\(nativeRuntime\)/);

  assert.doesNotMatch(controlSource, /state\.status =/);
  assert.doesNotMatch(controlSource, /state\.ready =/);
  assert.doesNotMatch(controlSource, /state\.packCount =/);
  assert.doesNotMatch(controlSource, /state\.error =/);
  assert.doesNotMatch(controllerSource, /private nativeRuntimeReady = false/);
  assert.doesNotMatch(controllerSource, /private nativeRuntimePacks = 0/);
  assert.doesNotMatch(controllerSource, /private nativeRuntimeError: string \| null = null/);
  assert.doesNotMatch(controllerSource, /return !this\.nativeRuntimeReady \|\| this\.nativeRuntimePacks <= 0/);
});
