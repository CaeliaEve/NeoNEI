import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  NATIVE_RENDERER_COMMAND_PROTOCOL_ABI,
  NATIVE_RENDERER_LAYOUT_COMMAND_BUFFER_DESCRIPTOR,
  parseNativeLayoutCommandBuffer,
} from '../src/renderers/native/NativeRendererCommandProtocol.ts';
import {
  nativeRendererProbeSupported,
  nativeRendererProbeUnsupported,
} from '../src/renderers/native/NativeRendererProbe.ts';
import {
  NATIVE_RENDER_WORKER_BACKEND_DESCRIPTOR_LIST,
  NATIVE_RENDER_WORKER_BACKEND_PROBE_REGISTRY,
  NATIVE_RENDER_WORKER_POLICY_CATALOG_ABI,
  NATIVE_RENDER_WORKER_PROBE_CATALOG,
  NATIVE_RENDER_WORKER_PROBE_DESCRIPTOR_MAP,
  NATIVE_RENDER_WORKER_RESOURCE_CATALOG,
  NATIVE_RENDER_WORKER_RESOURCE_OPERATIONS,
  NativeRenderWorkerResourceError,
  nativeRenderWorkerProbePlan,
  probeRequestedNativeRenderWorker,
  requireNativeRenderWorkerResource,
} from '../src/workers/nativeRenderWorkerPolicyCatalog.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(__dirname, '..');

function read(relativePath) {
  return readFileSync(resolve(frontendRoot, relativePath), 'utf8').replace(/\r\n/g, '\n');
}

function fakeRenderer(backend = 'webgl2') {
  return {
    backend,
    registerTexture() {
      return true;
    },
    textureCount() {
      return 0;
    },
    render() {
      return { drawCalls: 0, vertexCount: 0, spriteDrawCalls: 0, spriteVertexCount: 0 };
    },
    dispose() {},
  };
}

test('native renderer command protocol owns layout command parsing', () => {
  assert.equal(NATIVE_RENDERER_COMMAND_PROTOCOL_ABI.schema, 'neonei/native-renderer-command-protocol/current');
  assert.equal(NATIVE_RENDERER_COMMAND_PROTOCOL_ABI.failurePolicy, 'fail-closed');
  assert.equal(NATIVE_RENDERER_LAYOUT_COMMAND_BUFFER_DESCRIPTOR.u32Stride, 9);
  assert.deepEqual(NATIVE_RENDERER_LAYOUT_COMMAND_BUFFER_DESCRIPTOR.fieldOffsets, {
    x: 1,
    y: 2,
    size: 3,
    kind: 7,
    flags: 8,
  });

  const values = new Uint32Array(18);
  values.set([11, 21, 31, 41, 51, 61, 71, 1, 5], 0);
  values.set([12, 22, 32, 42, 52, 62, 72, 2, 18], 9);

  assert.deepEqual(parseNativeLayoutCommandBuffer(values.buffer, 9, 2), [
    { x: 21, y: 31, size: 41, kind: 1, flags: 5 },
    { x: 22, y: 32, size: 42, kind: 2, flags: 18 },
  ]);
  assert.deepEqual(parseNativeLayoutCommandBuffer(values.buffer, 8, 2), []);
});

test('native render worker policy catalog owns backend probes and resource requirements', async () => {
  assert.equal(NATIVE_RENDER_WORKER_POLICY_CATALOG_ABI.schema, 'neonei/native-render-worker-policy-catalog/current');
  assert.equal(NATIVE_RENDER_WORKER_POLICY_CATALOG_ABI.backendRegistryPolicy, 'descriptor-owned-backend-probes');
  assert.equal(NATIVE_RENDER_WORKER_RESOURCE_CATALOG.failurePolicy, 'fail-closed');
  assert.deepEqual(
    NATIVE_RENDER_WORKER_RESOURCE_CATALOG.descriptors.map((descriptor) => descriptor.operation),
    [
      NATIVE_RENDER_WORKER_RESOURCE_OPERATIONS.loadTextures,
      NATIVE_RENDER_WORKER_RESOURCE_OPERATIONS.render,
    ],
  );
  assert.deepEqual(
    NATIVE_RENDER_WORKER_BACKEND_DESCRIPTOR_LIST.map((descriptor) => descriptor.backend),
    ['webgpu', 'webgl2'],
  );
  assert.equal(typeof NATIVE_RENDER_WORKER_BACKEND_PROBE_REGISTRY.webgpu, 'function');
  assert.equal(typeof NATIVE_RENDER_WORKER_BACKEND_PROBE_REGISTRY.webgl2, 'function');
  assert.deepEqual(nativeRenderWorkerProbePlan('auto'), ['webgl2']);
  assert.deepEqual(nativeRenderWorkerProbePlan('webgpu'), ['webgpu']);
  assert.equal(NATIVE_RENDER_WORKER_PROBE_CATALOG.fallbackPolicy, 'no-runtime-backend-fallback');
  assert.equal(NATIVE_RENDER_WORKER_PROBE_DESCRIPTOR_MAP.auto.policy, 'browser-default');

  const renderer = fakeRenderer();
  assert.equal(
    requireNativeRenderWorkerResource('render', {
      nativeRenderer: renderer,
      requestedBackend: 'webgl2',
      backend: 'webgl2',
    }),
    renderer,
  );
  assert.throws(
    () => requireNativeRenderWorkerResource('render', {
      nativeRenderer: null,
      requestedBackend: 'webgl2',
      backend: null,
    }),
    NativeRenderWorkerResourceError,
  );

  const calls = [];
  const probes = Object.freeze({
    webgpu: () => {
      calls.push('webgpu');
      return nativeRendererProbeUnsupported('webgpu', 'blocked in test');
    },
    webgl2: () => {
      calls.push('webgl2');
      return nativeRendererProbeSupported(renderer);
    },
  });

  const result = await probeRequestedNativeRenderWorker('auto', {}, probes);
  assert.equal(result.status, 'supported');
  assert.equal(result.backend, 'webgl2');
  assert.deepEqual(calls, ['webgl2']);

  await assert.rejects(
    () => probeRequestedNativeRenderWorker('webgpu', {}, probes),
    /blocked in test/,
  );
});

test('native render worker keeps backend selection behind catalog boundary', () => {
  const workerSource = read('src/workers/nativeRender.worker.ts');
  const policySource = read('src/workers/nativeRenderWorkerPolicyCatalog.ts');
  const commandProtocolSource = read('src/renderers/native/NativeRendererCommandProtocol.ts');
  const webglSource = read('src/renderers/native/WebGl2NativeRenderer.ts');
  const backendSource = read('src/renderers/native/NativeRendererBackend.ts');

  assert.match(workerSource, /NativeRendererCommandProtocol/);
  assert.match(workerSource, /probeRequestedNativeRenderWorker/);
  assert.doesNotMatch(workerSource, /WebGpuNativeRenderer/);
  assert.doesNotMatch(workerSource, /WebGl2NativeRenderer/);
  assert.doesNotMatch(workerSource, /nativeRenderWorkerBackendProbes/);

  assert.match(policySource, /NATIVE_RENDER_WORKER_POLICY_CATALOG_ABI/);
  assert.match(policySource, /NATIVE_RENDER_WORKER_BACKEND_DESCRIPTOR_LIST/);
  assert.match(policySource, /WebGpuNativeRenderer\.probe/);
  assert.match(policySource, /WebGl2NativeRenderer\.probe/);

  assert.match(commandProtocolSource, /NATIVE_RENDERER_LAYOUT_COMMAND_BUFFER_DESCRIPTOR/);
  assert.match(commandProtocolSource, /u32Stride: 9/);
  assert.doesNotMatch(webglSource, /export type NativeRenderCommand/);
  assert.doesNotMatch(webglSource, /parseNativeLayoutCommandBuffer/);
  assert.match(backendSource, /NativeRendererCommandProtocol/);
  assert.doesNotMatch(backendSource, /WebGl2NativeRenderer/);
});
