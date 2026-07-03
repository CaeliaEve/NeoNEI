import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  clearNativeSurfaceFaultControlState,
  createNativeSurfaceFaultControlState,
  markNativeSurfaceFault,
  toNativeSurfaceFaultMetricsPatch,
} from '../src/native-surface/NativeSurfaceFaultControlPlane.ts';
import {
  NATIVE_SURFACE_FAULT_CONTROL_MODULE,
  NATIVE_SURFACE_FAULT_DOMAINS,
  NATIVE_SURFACE_FAULT_METRIC_FIELDS,
  NATIVE_SURFACE_FAULT_STATUS,
  NATIVE_SURFACE_FAULT_STATUS_DESCRIPTORS,
} from '../src/native-surface/NativeSurfaceFaultControlAbi.ts';

function readSource(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
}

test('native surface fault control plane owns immutable fault transitions', () => {
  const state = createNativeSurfaceFaultControlState();
  assert.deepEqual(state, {
    revision: 0,
    status: NATIVE_SURFACE_FAULT_STATUS.ok,
    faulted: false,
    domain: null,
    phase: null,
    message: null,
    count: 0,
  });
  assert.equal(Object.isFrozen(state), true);

  const faulted = markNativeSurfaceFault(state, {
    domain: NATIVE_SURFACE_FAULT_DOMAINS.render,
    phase: 'frame',
    error: new Error('worker returned error response'),
  });
  assert.notEqual(faulted, state);
  assert.deepEqual(faulted, {
    revision: 1,
    status: NATIVE_SURFACE_FAULT_STATUS.faulted,
    faulted: true,
    domain: NATIVE_SURFACE_FAULT_DOMAINS.render,
    phase: 'frame',
    message: 'worker returned error response',
    count: 1,
  });
  assert.equal(Object.isFrozen(faulted), true);
  assert.deepEqual(toNativeSurfaceFaultMetricsPatch(faulted), {
    nativeSurfaceFaulted: true,
    nativeSurfaceFaultDomain: 'render',
    nativeSurfaceFaultPhase: 'frame',
    nativeSurfaceFaultMessage: 'worker returned error response',
    nativeSurfaceFaultCount: 1,
  });

  const cleared = clearNativeSurfaceFaultControlState(faulted);
  assert.deepEqual(cleared, {
    revision: 2,
    status: NATIVE_SURFACE_FAULT_STATUS.ok,
    faulted: false,
    domain: null,
    phase: null,
    message: null,
    count: 1,
  });
  assert.equal(Object.isFrozen(cleared), true);
});

test('native surface fault ABI catalog is the metrics source of truth', () => {
  assert.equal(NATIVE_SURFACE_FAULT_CONTROL_MODULE.schema, 'neonei/native-surface-fault-control/current');
  assert.equal(NATIVE_SURFACE_FAULT_CONTROL_MODULE.failurePolicy, 'fail-closed-observable');
  assert.deepEqual(
    NATIVE_SURFACE_FAULT_STATUS_DESCRIPTORS.map((descriptor) => descriptor.status),
    [NATIVE_SURFACE_FAULT_STATUS.ok, NATIVE_SURFACE_FAULT_STATUS.faulted],
  );
  assert.deepEqual([...NATIVE_SURFACE_FAULT_METRIC_FIELDS], [
    'nativeSurfaceFaulted',
    'nativeSurfaceFaultDomain',
    'nativeSurfaceFaultPhase',
    'nativeSurfaceFaultMessage',
    'nativeSurfaceFaultCount',
  ]);
});

test('native surface faults are published through metrics instead of console-only state', () => {
  const metricsSource = readSource('src/native-surface/NativeSurfaceMetrics.ts');
  const controllerSource = readSource('src/native-surface/NativeSurfaceController.ts');
  const browserSurfaceSource = readSource('src/components/native-surface/NativeBrowserSurface.vue');
  const contractsSource = readSource('src/native-surface/contracts.ts');

  assert.match(metricsSource, /const faultBySurface = new Map/);
  assert.match(metricsSource, /export function recordNativeSurfaceFault/);
  assert.match(metricsSource, /markNativeSurfaceFault\(getNativeSurfaceFaultState\(surfaceId\), fault\)/);
  assert.match(metricsSource, /toNativeSurfaceFaultMetricsPatch\(state\)/);
  assert.match(contractsSource, /nativeSurfaceFaulted: boolean/);
  assert.match(contractsSource, /nativeSurfaceFaultDomain: "render" \| "engine" \| "runtime" \| "protocol" \| null/);

  assert.match(controllerSource, /recordNativeSurfaceFault\(this\.surfaceId, \{/);
  assert.match(controllerSource, /domain: "engine"/);
  assert.match(controllerSource, /domain: "runtime"/);
  assert.match(browserSurfaceSource, /recordNativeSurfaceFault\(props\.surfaceId, \{ domain, phase, error \}\)/);
  assert.match(browserSurfaceSource, /nativeSurfaceFaultMessage = ref\(""\)/);
  assert.match(browserSurfaceSource, /Native surface fault is recorded in the control plane/);

  assert.doesNotMatch(metricsSource, /catch \{\s*\}/);
});
