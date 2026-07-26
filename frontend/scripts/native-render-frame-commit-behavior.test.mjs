import assert from 'node:assert/strict';
import test from 'node:test';

import { commitNativeRenderFrame } from '../src/workers/nativeRenderFrameCommit.ts';
import { parseNativeLayoutCommandBuffer } from '../src/renderers/native/NativeRendererCommandProtocol.ts';

const commands = [{
  textureKey: 'atlas-a',
  sourceX: 0,
  sourceY: 0,
  sourceWidth: 16,
  sourceHeight: 16,
  destX: 0,
  destY: 0,
  destWidth: 16,
  destHeight: 16,
}];

function createRenderer(events) {
  return {
    backend: 'webgl2',
    registerTexture: () => true,
    textureCount: () => 0,
    render: () => {
      events.push('render-clear-commit');
      return { drawCalls: 1, vertexCount: 6, spriteDrawCalls: 1, spriteVertexCount: 6 };
    },
    dispose: () => undefined,
  };
}

test('missing sprite textures defer without clearing or committing, then retry commits once after upload', () => {
  const events = [];
  const resident = new Set();
  const renderer = createRenderer(events);

  const layout = parseNativeLayoutCommandBuffer(new ArrayBuffer(0), 9, 0);
  const deferred = commitNativeRenderFrame(renderer, 320, 180, layout, commands, resident);
  assert.deepEqual(deferred, { status: 'deferred', missingTextureKeys: ['atlas-a'] });
  assert.deepEqual(events, []);

  resident.add('atlas-a');
  const committed = commitNativeRenderFrame(renderer, 320, 180, layout, commands, resident);
  assert.equal(committed.status, 'rendered');
  assert.deepEqual(events, ['render-clear-commit']);
});

test('rapid paging keeps the previous committed frame visible while the next page texture is missing', () => {
  const events = [];
  const resident = new Set(['atlas-a']);
  const renderer = createRenderer(events);
  const layout = parseNativeLayoutCommandBuffer(new ArrayBuffer(0), 9, 0);

  assert.equal(commitNativeRenderFrame(renderer, 320, 180, layout, commands, resident).status, 'rendered');
  const nextPageCommands = commands.map((command) => ({ ...command, textureKey: 'atlas-b' }));
  assert.deepEqual(
    commitNativeRenderFrame(renderer, 320, 180, layout, nextPageCommands, resident),
    { status: 'deferred', missingTextureKeys: ['atlas-b'] },
  );
  assert.deepEqual(events, ['render-clear-commit']);

  resident.add('atlas-b');
  assert.equal(commitNativeRenderFrame(renderer, 320, 180, layout, nextPageCommands, resident).status, 'rendered');
  assert.deepEqual(events, ['render-clear-commit', 'render-clear-commit']);
});
