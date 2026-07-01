import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  configureNativeUiCanvasSize,
  NativeUiRendererSession,
  normalizeNativeUiDpr,
} from '../src/services/nativeUiRendererSession.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(__dirname, '..');

function fakeRenderer() {
  const calls = [];
  return {
    backend: 'webgl2',
    calls,
    disposed: false,
    registerTexture() { return true; },
    textureCount() { return 0; },
    render(width, height, commands, spriteCommands) {
      calls.push({ width, height, commands, spriteCommands });
      return {
        drawCalls: commands.length,
        vertexCount: 0,
        spriteDrawCalls: spriteCommands.length,
        spriteVertexCount: 0,
      };
    },
    dispose() { this.disposed = true; },
  };
}

function fakeScheduler() {
  const requested = [];
  const cancelled = [];
  let nextId = 1;
  return {
    requested,
    cancelled,
    request(callback) {
      const id = nextId;
      nextId += 1;
      requested.push({ id, callback });
      return id;
    },
    cancel(id) {
      cancelled.push(id);
    },
  };
}

test('native UI renderer session normalizes DPR and owns canvas device sizing', () => {
  assert.equal(normalizeNativeUiDpr(undefined), 1);
  assert.equal(normalizeNativeUiDpr(0), 1);
  assert.equal(normalizeNativeUiDpr(1.5), 1.5);
  assert.equal(normalizeNativeUiDpr(4), 2);

  const canvas = { width: 0, height: 0 };
  assert.deepEqual(configureNativeUiCanvasSize(canvas, 176, 90, 2.5), {
    dpr: 2,
    width: 352,
    height: 180,
  });
  assert.equal(canvas.width, 352);
  assert.equal(canvas.height, 180);
});

test('native UI renderer session creates one renderer, renders frames, and disposes', () => {
  const canvas = { width: 352, height: 180 };
  const renderer = fakeRenderer();
  let factoryCalls = 0;
  const session = new NativeUiRendererSession();

  assert.equal(session.ensureRenderer(canvas, () => {
    factoryCalls += 1;
    return renderer;
  }), renderer);
  assert.equal(session.ensureRenderer(canvas, () => {
    throw new Error('must not create twice');
  }), renderer);
  assert.equal(factoryCalls, 1);

  assert.equal(session.renderFrame({
    canvas,
    nowMs: 123,
    spriteCommands: (nowMs) => [{ textureKey: `atlas-${nowMs}`, sourceX: 0, sourceY: 0, sourceWidth: 1, sourceHeight: 1, destX: 0, destY: 0, destWidth: 1, destHeight: 1 }],
  }), true);
  assert.equal(renderer.calls.length, 1);
  assert.equal(renderer.calls[0].width, 352);
  assert.equal(renderer.calls[0].height, 180);
  assert.equal(renderer.calls[0].spriteCommands[0].textureKey, 'atlas-123');

  session.dispose();
  assert.equal(renderer.disposed, true);
  assert.equal(session.activeRenderer, null);
});

test('native UI renderer session owns animation loop scheduling and cancellation', () => {
  const session = new NativeUiRendererSession();
  const scheduler = fakeScheduler();
  const renderedAt = [];

  session.scheduleAnimationLoop({
    enabled: true,
    scheduler,
    renderAt: (timestamp) => renderedAt.push(timestamp),
  });
  assert.deepEqual(scheduler.requested.map((entry) => entry.id), [1]);

  scheduler.requested[0].callback(42);
  assert.deepEqual(renderedAt, [42]);
  assert.deepEqual(scheduler.requested.map((entry) => entry.id), [1, 2]);

  session.stopAnimationLoop();
  assert.deepEqual(scheduler.cancelled, [2]);

  session.scheduleAnimationLoop({ enabled: false, scheduler, renderAt: () => renderedAt.push(-1) });
  assert.equal(scheduler.requested.length, 2);
});

test('native UI renderer session owns component renderer lifecycle boundary', () => {
  const componentSource = readFileSync(resolve(frontendRoot, 'src/components/NativeNeiRecipeCanvas.vue'), 'utf8').replace(/\r\n/g, '\n');
  const sessionSource = readFileSync(resolve(frontendRoot, 'src/services/nativeUiRendererSession.ts'), 'utf8').replace(/\r\n/g, '\n');

  assert.match(componentSource, /nativeUiRendererSession/);
  assert.match(componentSource, /new NativeUiRendererSession\(\)/);
  assert.match(componentSource, /configureNativeUiCanvasSize/);
  assert.match(componentSource, /renderSession\.ensureRenderer/);
  assert.match(componentSource, /renderSession\.scheduleAnimationLoop/);
  assert.doesNotMatch(componentSource, /WebGl2NativeRenderer/);
  assert.doesNotMatch(componentSource, /requestAnimationFrame/);
  assert.doesNotMatch(componentSource, /cancelAnimationFrame/);
  assert.doesNotMatch(componentSource, /renderer\.value/);
  assert.doesNotMatch(componentSource, /getSharedAnimationNowMs/);

  assert.match(sessionSource, /WebGl2NativeRenderer/);
  assert.match(sessionSource, /requestAnimationFrame/);
  assert.match(sessionSource, /cancelAnimationFrame/);
  assert.match(sessionSource, /nativeUiRendererNowMs/);
  assert.doesNotMatch(sessionSource, /animationBudget/);
});
