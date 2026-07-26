import assert from 'node:assert/strict';
import { MessageChannel as NodeMessageChannel } from 'node:worker_threads';
import test from 'node:test';

class FakeWorker {
  static instances = [];
  static failNextEngineSurface = null;

  constructor(url) {
    this.kind = `${url}`.includes('nativeSurfaceEngine.worker') ? 'engine' : 'render';
    this.onmessage = null;
    this.onerror = null;
    this.port = null;
    this.enginePorts = new Map();
    this.canvas = null;
    this.frames = 0;
    this.terminated = false;
    FakeWorker.instances.push(this);
  }

  emit(data) {
    queueMicrotask(() => this.onmessage?.({ data }));
  }

  postMessage(message, transferables) {
    if (this.terminated) throw new Error(`${this.kind} worker is terminated`);
    if (message.type === 'initialize') {
      assert.deepEqual(transferables, [message.canvas]);
      this.canvas = message.canvas;
      this.emit({
        type: 'ready',
        id: message.id,
        backend: 'webgl2',
        limits: { maxTextureSize: 4096, maxTextureUnits: 16 },
        metrics: { surface: this.canvas.id, frames: this.frames },
      });
      return;
    }
    if (message.type === 'connectEnginePort') {
      assert.deepEqual(transferables, [message.port]);
      this.port = message.port;
      this.port.onmessage = (event) => {
        if (event.data.type === 'pipelineHandshake') {
          this.port.postMessage({ type: 'pipelineReady', sessionId: event.data.sessionId });
        } else if (event.data.type === 'renderFrame') {
          this.frames += 1;
          this.emit({
            type: 'frame',
            id: -event.data.frameToken,
            metrics: { surface: this.canvas.id, frames: this.frames },
          });
          this.port.postMessage({
            type: 'frameRendered',
            sessionId: event.data.sessionId,
            frameToken: event.data.frameToken,
            status: 'rendered',
            missingTextureKeys: [],
          });
        }
      };
      this.port.start();
      this.emit({ type: 'pipelineConnected', id: message.id, sessionId: message.sessionId, metrics: null });
      return;
    }
    if (message.type === 'connectRenderPort') {
      assert.deepEqual(transferables, [message.port]);
      if (FakeWorker.failNextEngineSurface === message.surfaceId) {
        FakeWorker.failNextEngineSurface = null;
        this.emit({
          type: 'error',
          id: message.id,
          surfaceId: message.surfaceId,
          error: 'injected engine handshake failure',
          metrics: null,
        });
        return;
      }
      this.enginePorts.set(message.surfaceId, message.port);
      message.port.onmessage = (event) => {
        if (event.data.type === 'pipelineReady') {
          this.emit({
            type: 'ack',
            id: message.id,
            surfaceId: message.surfaceId,
            event: message.type,
            metrics: null,
          });
        }
      };
      message.port.start();
      message.port.postMessage({ type: 'pipelineHandshake', sessionId: message.sessionId });
      return;
    }
    if (message.type === 'disconnectRenderPort') {
      this.enginePorts.get(message.surfaceId)?.close();
      this.enginePorts.delete(message.surfaceId);
      this.emit({
        type: 'ack',
        id: message.id,
        surfaceId: message.surfaceId,
        event: message.type,
        metrics: null,
      });
      return;
    }
    if (message.type === 'disconnectEnginePort') {
      this.port?.close();
      this.port = null;
      this.emit({ type: 'pipelineDisconnected', id: message.id, sessionId: message.sessionId, metrics: null });
      return;
    }
    throw new Error(`unsupported fake ${this.kind} request: ${message.type}`);
  }

  terminate() {
    this.terminated = true;
    this.port?.close();
    for (const port of this.enginePorts.values()) port.close();
    this.port = null;
    this.enginePorts.clear();
  }
}

test('browser and history own isolated render workers, sessions, disconnects, and reconnects', async () => {
  const previousWorker = globalThis.Worker;
  const previousMessageChannel = globalThis.MessageChannel;
  globalThis.Worker = FakeWorker;
  globalThis.MessageChannel = NodeMessageChannel;
  try {
    const {
      createNativeRenderWorkerClient,
      getNativeRenderWorkerMetrics,
    } = await import('../src/native-surface/NativeRenderWorkerClient.ts');
    const { createNativeRenderPipelineClient } = await import('../src/native-surface/NativeRenderPipelineClient.ts');
    const browserWorker = createNativeRenderWorkerClient('browser');
    const historyWorker = createNativeRenderWorkerClient('history');
    const browserPipeline = createNativeRenderPipelineClient('browser', browserWorker);
    const historyPipeline = createNativeRenderPipelineClient('history', historyWorker);
    const browserCanvas = { id: 'browser-canvas' };
    const historyCanvas = { id: 'history-canvas' };
    await Promise.all([
      browserWorker.post({ type: 'initialize', canvas: browserCanvas, renderer: 'webgl2' }),
      historyWorker.post({ type: 'initialize', canvas: historyCanvas, renderer: 'webgl2' }),
    ]);

    await Promise.all([browserPipeline.connect(), historyPipeline.connect()]);
    assert.equal(browserPipeline.isConnected(), true);
    assert.equal(historyPipeline.isConnected(), true);
    assert.notEqual(browserPipeline.getSessionId(), historyPipeline.getSessionId());
    const renderWorkers = FakeWorker.instances.filter((worker) => worker.kind === 'render');
    const engineWorker = FakeWorker.instances.find((worker) => worker.kind === 'engine');
    const browserRenderWorker = renderWorkers.find((worker) => worker.canvas === browserCanvas);
    const historyRenderWorker = renderWorkers.find((worker) => worker.canvas === historyCanvas);
    assert.equal(renderWorkers.length, 2);
    assert.ok(browserRenderWorker);
    assert.ok(historyRenderWorker);
    assert.equal(engineWorker.enginePorts.size, 2);

    const browserBuffer = new ArrayBuffer(36);
    const historyBuffer = new ArrayBuffer(36);
    engineWorker.enginePorts.get('browser').postMessage({
      type: 'renderFrame',
      sessionId: browserPipeline.getSessionId(),
      frameToken: 101,
      commandBuffer: browserBuffer,
      commandStride: 9,
      commandCount: 1,
      spriteCommands: [],
      nowMs: 1,
    }, [browserBuffer]);
    engineWorker.enginePorts.get('history').postMessage({
      type: 'renderFrame',
      sessionId: historyPipeline.getSessionId(),
      frameToken: 202,
      commandBuffer: historyBuffer,
      commandStride: 9,
      commandCount: 1,
      spriteCommands: [],
      nowMs: 2,
    }, [historyBuffer]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(browserRenderWorker.frames, 1);
    assert.equal(historyRenderWorker.frames, 1);
    assert.deepEqual(getNativeRenderWorkerMetrics(), {
      browser: { surface: 'browser-canvas', frames: 1 },
      history: { surface: 'history-canvas', frames: 1 },
    });

    await browserPipeline.disconnect();
    browserWorker.destroy();
    assert.equal(browserRenderWorker.terminated, true);
    assert.equal(historyRenderWorker.terminated, false);
    assert.equal(historyPipeline.isConnected(), true);
    assert.deepEqual(Array.from(engineWorker.enginePorts.keys()), ['history']);

    const replacementBrowserWorker = createNativeRenderWorkerClient('browser');
    const replacementBrowserPipeline = createNativeRenderPipelineClient('browser', replacementBrowserWorker);
    const replacementBrowserCanvas = { id: 'browser-canvas-reconnected' };
    await replacementBrowserWorker.post({
      type: 'initialize',
      canvas: replacementBrowserCanvas,
      renderer: 'webgl2',
    });
    await replacementBrowserPipeline.connect();
    assert.equal(replacementBrowserPipeline.isConnected(), true);
    assert.equal(historyPipeline.isConnected(), true);
    assert.equal(historyRenderWorker.terminated, false);
    assert.equal(historyRenderWorker.canvas, historyCanvas);
    assert.deepEqual(new Set(engineWorker.enginePorts.keys()), new Set(['browser', 'history']));

    FakeWorker.failNextEngineSurface = 'browser';
    await assert.rejects(() => replacementBrowserPipeline.recreate(), /injected engine handshake failure/);
    assert.equal(historyPipeline.isConnected(), true);
    assert.equal(historyRenderWorker.terminated, false);
    assert.deepEqual(Array.from(engineWorker.enginePorts.keys()), ['history']);

    await historyPipeline.disconnect();
    historyWorker.destroy();
    replacementBrowserWorker.destroy();
  } finally {
    globalThis.Worker = previousWorker;
    globalThis.MessageChannel = previousMessageChannel;
  }
});
