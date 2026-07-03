import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createNativeWorkerClientSession,
  NATIVE_WORKER_CLIENT_OPS_CATALOG_ABI,
} from '../src/native-surface/NativeWorkerClientOpsCatalog.ts';

class FakeWorker {
  static instances = [];

  constructor(url, options) {
    this.url = url;
    this.options = options;
    this.onmessage = null;
    this.onerror = null;
    this.messages = [];
    this.terminated = false;
    FakeWorker.instances.push(this);
  }

  postMessage(message, transferables) {
    this.messages.push({ message, transferables });
  }

  terminate() {
    this.terminated = true;
  }

  emit(response) {
    this.onmessage?.({ data: response });
  }

  fail(message = 'worker exploded') {
    this.onerror?.({ message });
  }
}

async function withFakeWorker(body) {
  const previousWorker = globalThis.Worker;
  FakeWorker.instances = [];
  globalThis.Worker = FakeWorker;
  try {
    return await body();
  } finally {
    if (previousWorker === undefined) {
      delete globalThis.Worker;
    } else {
      globalThis.Worker = previousWorker;
    }
  }
}

function createSession() {
  return createNativeWorkerClientSession({
    boundary: 'test-worker',
    workerUrl: () => new URL('worker:test', import.meta.url),
    unavailableCode: 'worker-unavailable',
    constructionFailedCode: 'worker-construction-failed',
    postFailedCode: 'worker-post-failed',
    runtimeErrorCode: 'worker-runtime-error',
    resetCode: 'worker-reset',
    malformedResponseCode: 'worker-malformed-response',
    unavailableMessage: 'Worker API is unavailable',
    constructionFailedMessage: 'unable to construct test worker',
    postFailedMessage: 'unable to post test worker request',
    runtimeErrorMessage: 'test worker runtime error',
    resetMessage: 'test worker reset',
    malformedResponseMessage: 'test worker returned malformed response',
    createError: (code, message, cause) => Object.assign(new Error(`${code}:${message}`), { code, cause }),
    transferables: (message) => message.type === 'sendBuffer' ? [message.buffer] : [],
    metrics: (response) => response.metrics ?? null,
    responseFailure: (response) => response.type === 'error'
      ? { code: 'worker-error-response', message: response.message, cause: response }
      : null,
  });
}

test('native worker client ops catalog owns request ids, transfers, metrics, and reset', async () => {
  assert.equal(NATIVE_WORKER_CLIENT_OPS_CATALOG_ABI.schema, 'neonei/native-worker-client-ops/current');
  assert.equal(NATIVE_WORKER_CLIENT_OPS_CATALOG_ABI.lifecyclePolicy, 'descriptor-owned-worker-client-session');
  assert.equal(NATIVE_WORKER_CLIENT_OPS_CATALOG_ABI.failurePolicy, 'fail-closed');

  await withFakeWorker(async () => {
    const session = createSession();
    const buffer = new ArrayBuffer(4);
    const pending = session.post({ type: 'sendBuffer', buffer });
    const worker = FakeWorker.instances[0];

    assert.equal(FakeWorker.instances.length, 1);
    assert.equal(worker.options.type, 'module');
    assert.deepEqual(worker.messages[0].message, { type: 'sendBuffer', buffer, id: 1 });
    assert.deepEqual(worker.messages[0].transferables, [buffer]);

    worker.emit({ id: 1, type: 'ok', metrics: { frames: 7 } });
    assert.deepEqual(await pending, { id: 1, type: 'ok', metrics: { frames: 7 } });
    assert.deepEqual(session.getMetrics(), { frames: 7 });

    const resetPending = session.post({ type: 'noop' });
    session.reset();
    await assert.rejects(resetPending, /worker-reset:test worker reset/);
    assert.equal(worker.terminated, true);
    assert.equal(session.getMetrics(), null);
  });
});

test('native worker client ops catalog fails closed on worker errors and error responses', async () => {
  await withFakeWorker(async () => {
    const session = createSession();
    const errorResponse = session.post({ type: 'noop' });
    FakeWorker.instances[0].emit({ id: 1, type: 'error', message: 'bad frame', metrics: { frames: 1 } });
    await assert.rejects(errorResponse, (error) => {
      assert.equal(error.code, 'worker-error-response');
      assert.deepEqual(session.getMetrics(), { frames: 1 });
      return true;
    });

    const runtimeFailure = session.post({ type: 'noop' });
    FakeWorker.instances[0].fail('boom');
    await assert.rejects(runtimeFailure, /worker-runtime-error:boom/);
  });
});

test('native worker client ops catalog rejects malformed responses for every pending request', async () => {
  await withFakeWorker(async () => {
    const session = createSession();
    const first = session.post({ type: 'noop' });
    const second = session.post({ type: 'noop' });
    FakeWorker.instances[0].emit({ type: 'missing-id' });

    await assert.rejects(first, /worker-malformed-response:test worker returned malformed response/);
    await assert.rejects(second, /worker-malformed-response:test worker returned malformed response/);
  });
});
