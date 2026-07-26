import assert from 'node:assert/strict';
import { MessageChannel } from 'node:worker_threads';
import test from 'node:test';

import { validateNativeSurfaceEngineRequestEnvelope } from '../src/native-surface/NativeSurfaceEngineProtocol.ts';
import {
  getNativeRenderPipelineTransferables,
  isNativeRenderPipelineMessage,
} from '../src/native-surface/NativeRenderPipelineProtocol.ts';
import {
  NATIVE_RENDERER_LAYOUT_COMMAND_BUFFER_DESCRIPTOR,
  parseNativeLayoutCommandBuffer,
} from '../src/renderers/native/NativeRendererCommandProtocol.ts';
import { ensureReusableGpuBuffer } from '../src/renderers/native/WebGpuNativeRenderer.ts';

function receive(port) {
  return new Promise((resolve) => port.once('message', resolve));
}

test('ArrayBuffer ownership moves directly from engine port to render port exactly once', async () => {
  const direct = new MessageChannel();
  const original = new ArrayBuffer(64);
  const renderReceive = receive(direct.port2);
  direct.port1.postMessage({ type: 'renderFrame', commandBuffer: original }, [original]);
  assert.equal(original.byteLength, 0);
  assert.equal((await renderReceive).commandBuffer.byteLength, 64);
  direct.port1.close();
  direct.port2.close();
});

test('direct render pipeline transfer policy owns only renderFrame command buffers', () => {
  const commandBuffer = new ArrayBuffer(32);
  assert.deepEqual(getNativeRenderPipelineTransferables({
    type: 'renderFrame',
    sessionId: 'test-session',
    frameToken: 1,
    commandBuffer,
    commandStride: 9,
    commandCount: 0,
    spriteCommands: [],
    nowMs: 0,
  }), [commandBuffer]);
  assert.deepEqual(getNativeRenderPipelineTransferables({
    type: 'pipelineHandshake',
    sessionId: 'test-session',
  }), []);
  assert.equal(isNativeRenderPipelineMessage({
    type: 'frameRendered',
    sessionId: 'test-session',
    frameToken: 1,
    status: 'deferred',
    missingTextureKeys: ['atlas-a'],
  }), true);
  assert.equal(isNativeRenderPipelineMessage({ type: 'unknown', sessionId: 'test-session' }), false);
  assert.equal(isNativeRenderPipelineMessage({
    type: 'renderFrame',
    sessionId: 'test-session',
    frameToken: 1,
    commandBuffer: null,
    commandStride: 9,
    commandCount: 0,
    spriteCommands: [],
    nowMs: 0,
  }), false);
});

test('native layout command parser rejects fractional, unaligned, short and invalid descriptors', () => {
  const valid = new ArrayBuffer(18 * Uint32Array.BYTES_PER_ELEMENT);
  assert.equal(parseNativeLayoutCommandBuffer(valid, 9, 2).count, 2);
  assert.equal(parseNativeLayoutCommandBuffer(valid, 9.5, 2).count, 0);
  assert.equal(parseNativeLayoutCommandBuffer(valid, 9, 1.5).count, 0);
  assert.equal(parseNativeLayoutCommandBuffer(new ArrayBuffer(37), 9, 1).count, 0);
  assert.equal(parseNativeLayoutCommandBuffer(new ArrayBuffer(36), 9, 2).count, 0);
  assert.equal(parseNativeLayoutCommandBuffer(valid, 9, 2, {
    ...NATIVE_RENDERER_LAYOUT_COMMAND_BUFFER_DESCRIPTOR,
    fieldOffsets: {
      ...NATIVE_RENDERER_LAYOUT_COMMAND_BUFFER_DESCRIPTOR.fieldOffsets,
      flags: 9,
    },
  }).count, 0);
});

test('native surface engine envelope rejects unknown request types and malformed identities', () => {
  assert.equal(validateNativeSurfaceEngineRequestEnvelope({ id: 1, surfaceId: 'main', type: 'frame' }), null);
  assert.match(validateNativeSurfaceEngineRequestEnvelope({ id: 1, surfaceId: 'main', type: 'unknown' }), /unsupported request type/);
  assert.match(validateNativeSurfaceEngineRequestEnvelope({ id: 1.5, surfaceId: 'main', type: 'frame' }), /safe integer/);
  assert.match(validateNativeSurfaceEngineRequestEnvelope({ id: 1, surfaceId: '', type: 'frame' }), /non-empty string/);
});

test('WebGPU replacement is created before the old buffer is destroyed and failure preserves it', () => {
  const events = [];
  const oldBuffer = { destroy: () => events.push('destroy-old') };
  const current = { buffer: oldBuffer, capacity: 1024 };
  const device = {
    createBuffer: () => {
      events.push('create-new');
      return { destroy: () => events.push('destroy-new') };
    },
  };
  const replacement = ensureReusableGpuBuffer(device, current, 2048, 1);
  assert.deepEqual(events, ['create-new', 'destroy-old']);
  assert.notEqual(replacement.buffer, oldBuffer);

  const failureEvents = [];
  const preserved = { destroy: () => failureEvents.push('destroy-old') };
  const failingDevice = {
    createBuffer: () => {
      failureEvents.push('create-new');
      throw new Error('oom');
    },
  };
  assert.throws(() => ensureReusableGpuBuffer(failingDevice, { buffer: preserved, capacity: 1024 }, 2048, 1), /oom/);
  assert.deepEqual(failureEvents, ['create-new']);
  assert.equal(ensureReusableGpuBuffer(failingDevice, { buffer: preserved, capacity: 1024 }, 512, 1).buffer, preserved);
});
