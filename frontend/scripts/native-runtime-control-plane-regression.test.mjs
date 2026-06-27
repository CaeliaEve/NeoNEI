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
  assert.deepEqual(state, { status: 'idle', ready: false, packCount: 0, error: null });
  assert.equal(shouldSendCompatEntriesToWorker(state), true);

  beginNativeRuntimeLoad(state);
  assert.deepEqual(state, { status: 'loading', ready: false, packCount: 0, error: null });
  assert.equal(shouldSendCompatEntriesToWorker(state), true);

  markNativeRuntimeReady(state, true, 3);
  assert.deepEqual(state, { status: 'ready', ready: true, packCount: 3, error: null });
  assert.equal(shouldSendCompatEntriesToWorker(state), false);
  assert.deepEqual(toNativeRuntimeMetricsPatch(state), {
    nativeRuntimeReady: true,
    nativeRuntimePacks: 3,
    nativeRuntimeError: null,
  });

  markNativeRuntimeError(state, new Error('manifest rejected'));
  assert.deepEqual(state, { status: 'error', ready: false, packCount: 0, error: 'manifest rejected' });
  assert.equal(shouldSendCompatEntriesToWorker(state), true);
});

test('native runtime control plane rejects zero-pack and worker-rejected ready transitions', () => {
  const zeroPackState = createNativeRuntimeControlState();
  markNativeRuntimeReady(zeroPackState, true, 0);
  assert.equal(zeroPackState.status, 'error');
  assert.equal(zeroPackState.ready, false);
  assert.match(zeroPackState.error ?? '', /did not provide any usable packs/);

  const rejectedState = createNativeRuntimeControlState();
  markNativeRuntimeReady(rejectedState, false, 2);
  assert.equal(rejectedState.status, 'error');
  assert.equal(rejectedState.ready, false);
  assert.equal(rejectedState.packCount, 2);
  assert.match(rejectedState.error ?? '', /worker rejected runtime packs/);
});

test('native runtime control plane is the controller and metrics boundary', () => {
  const controlSource = readSource('src/native-surface/NativeRuntimeControlPlane.ts');
  const controllerSource = readSource('src/native-surface/NativeSurfaceController.ts');
  const metricsSource = readSource('src/native-surface/NativeSurfaceMetrics.ts');

  assert.match(controlSource, /export interface NativeRuntimeControlState/);
  assert.match(controlSource, /export function toNativeRuntimeMetricsPatch/);
  assert.match(controllerSource, /private nativeRuntime = createNativeRuntimeControlState\(\)/);
  assert.match(controllerSource, /beginNativeRuntimeLoad\(this\.nativeRuntime\)/);
  assert.match(controllerSource, /markNativeRuntimeReady\(this\.nativeRuntime, Boolean\(response\), packs\.length\)/);
  assert.match(controllerSource, /markNativeRuntimeError\(this\.nativeRuntime, error\)/);
  assert.match(controllerSource, /return shouldSendCompatEntriesToWorker\(this\.nativeRuntime\)/);
  assert.match(controllerSource, /\.\.\.toNativeRuntimeMetricsPatch\(this\.nativeRuntime\)/);
  assert.match(metricsSource, /\.\.\.toNativeRuntimeMetricsPatch\(nativeRuntime\)/);

  assert.doesNotMatch(controllerSource, /private nativeRuntimeReady = false/);
  assert.doesNotMatch(controllerSource, /private nativeRuntimePacks = 0/);
  assert.doesNotMatch(controllerSource, /private nativeRuntimeError: string \| null = null/);
  assert.doesNotMatch(controllerSource, /return !this\.nativeRuntimeReady \|\| this\.nativeRuntimePacks <= 0/);
});
