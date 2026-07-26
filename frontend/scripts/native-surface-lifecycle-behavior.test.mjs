import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { resolve } from 'node:path';

import { createSurfaceState } from '../src/workers/nativeSurfaceWorkerState.ts';
import {
  admitNativeSurfaceRequest,
  completeNativeSurfaceInitialize,
  destroyNativeSurface,
} from '../src/workers/nativeSurfaceWorkerLifecycle.ts';
import { buildNativeSurfaceWorkerMetrics } from '../src/workers/nativeSurfaceWorkerMetricsCatalog.ts';
import { releaseNativeWasmPayloads } from '../src/workers/nativeSurfaceWasmRuntime.ts';
import { NativeSurfaceLifecycle } from '../src/native-surface/NativeSurfaceLifecycle.ts';

let controllerModulePromise = null;
let workerModulePromise = null;

function loadControllerModule() {
  controllerModulePromise ??= build({
    entryPoints: [resolve('src/native-surface/NativeSurfaceController.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node24',
    write: false,
  }).then(({ outputFiles: [output] }) => (
    import(`data:text/javascript;base64,${Buffer.from(output.text).toString('base64')}`)
  ));
  return controllerModulePromise;
}

function loadWorkerModule() {
  workerModulePromise ??= build({
    entryPoints: [resolve('src/workers/nativeSurfaceEngine.worker.ts')],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    write: false,
  }).then(({ outputFiles: [output] }) => (
    import(`data:text/javascript;base64,${Buffer.from(output.text).toString('base64')}`)
  ));
  return workerModulePromise;
}

function metricsFor(surfaces, lastSurfaceId = null) {
  return buildNativeSurfaceWorkerMetrics({
    surfaces: surfaces.values(),
    events: 0,
    lastEvent: null,
    lastSurfaceId,
    lastSurface: lastSurfaceId ? surfaces.get(lastSurfaceId) ?? null : null,
    wasmReady: true,
    wasmError: null,
    nowMs: 1,
  });
}

function populateSurface(surface) {
  surface.initialized = true;
  surface.viewport = { width: 800, height: 600, scrollTop: 0 };
  surface.runtimeManifestUrl = '/runtime/manifest.json';
  surface.runtimePacks.set('browser', new ArrayBuffer(16));
  surface.runtimePacks.set('textures', new ArrayBuffer(32));
  surface.browserPack = { itemCount: 1, stringCount: 1 };
  surface.runtimeBrowserIndexByItemId.set('item', 0);
  surface.groupByKey.set('group', { groupKey: 'group', memberItemIds: ['item'] });
  surface.searchByItemId.set('item', { itemId: 'item' });
  surface.stringByItemId.set('item', { itemId: 'item' });
  surface.textureByItemId.set('item', { itemId: 'item' });
  surface.animationByItemId.set('item', { itemId: 'item' });
  surface.runtimeProjectionCacheKey = 'projection';
  surface.runtimeProjectionIndices = Uint32Array.of(0);
  surface.runtimeVisibleCacheKey = 'visible';
  surface.runtimeVisibleEntries = Uint32Array.of(0);
  surface.layoutCommands = [{ key: 'item' }];
  surface.expandedGroups = ['group'];
  surface.historyItems = ['item'];
  surface.lastHit = { key: 'item' };
  surface.selectedItemId = 'item';
  surface.runtimeBrowserWasmPtr = 10;
  surface.runtimeBrowserWasmLen = 16;
}

test('destroy releases a surface and returns worker surface/pack metrics to baseline', () => {
  const baseline = createSurfaceState();
  baseline.initialized = true;
  baseline.runtimePacks.set('baseline', new ArrayBuffer(5));

  const target = createSurfaceState();
  populateSurface(target);

  const surfaces = new Map([
    ['baseline', baseline],
    ['target', target],
  ]);
  let closeReason = null;
  const renderConnections = new Map([
    ['target', { close: (reason) => { closeReason = reason; } }],
  ]);
  let disposedSurface = null;
  const disposeWasmPayloads = (surface) => {
    disposedSurface = surface;
    surface.runtimeBrowserWasmPtr = 0;
    surface.runtimeBrowserWasmLen = 0;
  };

  const before = metricsFor(surfaces, 'target');
  assert.equal(before.surfaceCount, 2);
  assert.equal(before.runtimePackBytes, 53);

  assert.equal(destroyNativeSurface({
    surfaceId: 'target',
    surfaces,
    renderConnections,
    disposeWasmPayloads,
    reason: 'test destroy',
  }), true);

  assert.equal(closeReason, 'test destroy');
  assert.equal(disposedSurface, target);
  assert.equal(renderConnections.has('target'), false);
  assert.equal(surfaces.has('target'), false);
  assert.equal(target.initialized, false);
  assert.equal(target.runtimePacks.size, 0);
  assert.equal(target.browserPack, null);
  assert.equal(target.runtimeBrowserIndexByItemId.size, 0);
  assert.equal(target.groupByKey.size, 0);
  assert.equal(target.searchByItemId.size, 0);
  assert.equal(target.stringByItemId.size, 0);
  assert.equal(target.textureByItemId.size, 0);
  assert.equal(target.animationByItemId.size, 0);
  assert.equal(target.runtimeProjectionCacheKey, null);
  assert.equal(target.runtimeProjectionIndices, null);
  assert.equal(target.runtimeVisibleCacheKey, null);
  assert.equal(target.runtimeVisibleEntries, null);
  assert.deepEqual(target.layoutCommands, []);
  assert.deepEqual(target.expandedGroups, []);
  assert.deepEqual(target.historyItems, []);
  assert.equal(target.viewport, null);
  assert.equal(target.lastHit, null);
  assert.equal(target.selectedItemId, null);
  assert.equal(target.runtimeManifestUrl, null);

  const after = metricsFor(surfaces, 'target');
  assert.equal(after.surfaceCount, 1);
  assert.equal(after.runtimePackBytes, 5);
  assert.equal(after.runtimePacks, 0);

  destroyNativeSurface({
    surfaceId: 'baseline',
    surfaces,
    renderConnections,
    disposeWasmPayloads,
    reason: 'baseline destroy',
  });
  const empty = metricsFor(surfaces);
  assert.equal(empty.surfaceCount, 0);
  assert.equal(empty.runtimePackBytes, 0);
});

test('destroying an absent surface still closes a stale render connection without allocating state', () => {
  const surfaces = new Map();
  let closeCalls = 0;
  const renderConnections = new Map([
    ['stale', { close: () => { closeCalls += 1; } }],
  ]);
  let disposeCalls = 0;

  assert.equal(destroyNativeSurface({
    surfaceId: 'stale',
    surfaces,
    renderConnections,
    disposeWasmPayloads: () => { disposeCalls += 1; },
    reason: 'stale destroy',
  }), false);
  assert.equal(closeCalls, 1);
  assert.equal(disposeCalls, 0);
  assert.equal(surfaces.size, 0);
  assert.equal(renderConnections.size, 0);
});

test('destroy removes retained state even when connection or WASM disposal reports an error', () => {
  const surface = createSurfaceState();
  populateSurface(surface);
  const surfaces = new Map([['broken', surface]]);
  const renderConnections = new Map([[
    'broken',
    { close: () => { throw new Error('close failed'); } },
  ]]);
  let disposeCalls = 0;

  assert.throws(() => destroyNativeSurface({
    surfaceId: 'broken',
    surfaces,
    renderConnections,
    disposeWasmPayloads: () => {
      disposeCalls += 1;
      throw new Error('dispose failed');
    },
    reason: 'broken destroy',
  }), /close failed/);

  assert.equal(disposeCalls, 1);
  assert.equal(renderConnections.size, 0);
  assert.equal(surfaces.size, 0);
  assert.equal(surface.runtimePacks.size, 0);
  assert.equal(surface.browserPack, null);
  assert.equal(surface.layoutCommands.length, 0);
});

test('WASM disposal attempts every payload and zeroes all pointers after a deallocator trap', () => {
  const surface = createSurfaceState();
  const fields = [
    ['runtimeBrowserWasmPtr', 'runtimeBrowserWasmLen'],
    ['runtimeSearchWasmPtr', 'runtimeSearchWasmLen'],
    ['runtimeGroupWasmPtr', 'runtimeGroupWasmLen'],
    ['runtimeStringWasmPtr', 'runtimeStringWasmLen'],
    ['runtimeTextureWasmPtr', 'runtimeTextureWasmLen'],
    ['runtimeAnimationWasmPtr', 'runtimeAnimationWasmLen'],
  ];
  fields.forEach(([ptrField, lenField], index) => {
    surface[ptrField] = 100 + index;
    surface[lenField] = 10 + index;
  });
  surface.runtimeBrowserWasmItemCount = 2;
  surface.runtimeBrowserWasmProjectedEntries = 2;
  surface.runtimeGroupWasmCount = 2;
  surface.runtimeStringWasmItemCount = 2;
  surface.runtimeTextureWasmItemCount = 2;
  surface.runtimeAnimationWasmItemCount = 2;
  const calls = [];

  assert.throws(() => releaseNativeWasmPayloads(surface, (ptr, len) => {
    calls.push([ptr, len]);
    if (ptr === 100) throw new Error('first dealloc trapped');
  }), /first dealloc trapped/);

  assert.equal(calls.length, 6);
  for (const [ptrField, lenField] of fields) {
    assert.equal(surface[ptrField], 0);
    assert.equal(surface[lenField], 0);
  }
  assert.equal(surface.runtimeBrowserWasmItemCount, 0);
  assert.equal(surface.runtimeBrowserWasmProjectedEntries, 0);
  assert.equal(surface.runtimeGroupWasmCount, 0);
  assert.equal(surface.runtimeStringWasmItemCount, 0);
  assert.equal(surface.runtimeTextureWasmItemCount, 0);
  assert.equal(surface.runtimeAnimationWasmItemCount, 0);
});

test('controller lifecycle invalidation rejects late async runtime work until a new initialize generation', async () => {
  const lifecycle = new NativeSurfaceLifecycle();
  const firstGeneration = lifecycle.beginInitialize();
  assert.equal(lifecycle.completeInitialize(firstGeneration), true);
  let resolveLoad;
  const load = new Promise((resolve) => { resolveLoad = resolve; });
  let publications = 0;
  const latePublish = (async () => {
    await load;
    if (!lifecycle.isCurrent(firstGeneration)) return false;
    publications += 1;
    return true;
  })();

  lifecycle.destroy();
  resolveLoad();
  assert.equal(await latePublish, false);
  assert.equal(publications, 0);
  assert.equal(lifecycle.isActive(), false);

  const nextGeneration = lifecycle.beginInitialize();
  assert.equal(lifecycle.isCurrent(firstGeneration), false);
  assert.equal(lifecycle.isCurrent(nextGeneration), false);
  assert.equal(lifecycle.completeInitialize(nextGeneration), true);
  assert.equal(lifecycle.isCurrent(nextGeneration), true);
});

test('controller initialize failure rolls back inactive state and rejects later mutation enqueue', async () => {
  const { NativeSurfaceController } = await loadControllerModule();
  const requests = [];
  const controller = new NativeSurfaceController('initialize-failure', async (request) => {
    requests.push(request);
    throw new Error('initialize request failed');
  });

  await assert.rejects(
    controller.initialize({
      preferredRenderer: 'webgl2',
      enableAnimations: true,
      enableHistoryViewport: false,
    }),
    /initialize request failed/,
  );

  assert.equal((await controller.getMetrics()).initialized, false);
  controller.setPage(2);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(requests.map((request) => request.type), ['initialize']);
});

test('worker lifecycle admission rejects late requests without blocking an explicit reinitialize', () => {
  const destroyed = new Set();
  admitNativeSurfaceRequest(destroyed, 'browser', 'initialize');
  admitNativeSurfaceRequest(destroyed, 'browser', 'destroy');
  assert.equal(destroyed.has('browser'), true);
  assert.throws(
    () => admitNativeSurfaceRequest(destroyed, 'browser', 'runtimePacks'),
    /Native surface is destroyed/,
  );
  admitNativeSurfaceRequest(destroyed, 'browser', 'disconnectRenderPort');
  admitNativeSurfaceRequest(destroyed, 'browser', 'initialize');
  assert.equal(destroyed.has('browser'), true);
  assert.throws(
    () => admitNativeSurfaceRequest(destroyed, 'browser', 'runtimePacks'),
    /Native surface is destroyed/,
  );
  const staleSurface = createSurfaceState();
  const currentSurface = createSurfaceState();
  const surfaces = new Map([['browser', currentSurface]]);
  assert.equal(
    completeNativeSurfaceInitialize(destroyed, surfaces, 'browser', staleSurface),
    false,
  );
  assert.equal(destroyed.has('browser'), true);
  assert.equal(
    completeNativeSurfaceInitialize(destroyed, surfaces, 'browser', currentSurface),
    true,
  );
  assert.equal(destroyed.has('browser'), false);
  assert.doesNotThrow(() => admitNativeSurfaceRequest(destroyed, 'browser', 'runtimePacks'));
});

test('worker onmessage fails a stale initialize raced by destroy and preserves the tombstone', async () => {
  const originalSelf = globalThis.self;
  const originalFetch = globalThis.fetch;
  let resolveFetch;
  let markFetchStarted;
  const fetchStarted = new Promise((resolve) => { markFetchStarted = resolve; });
  const fetchResult = new Promise((resolve) => { resolveFetch = resolve; });
  const responses = [];
  const responseWaiters = new Set();
  const workerSelf = {
    onmessage: null,
    postMessage(message) {
      responses.push(message);
      for (const waiter of responseWaiters) waiter();
    },
  };
  const waitForResponse = async (id) => {
    const findResponse = () => responses.find((response) => response.id === id);
    const existing = findResponse();
    if (existing) return existing;
    return await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        responseWaiters.delete(check);
        reject(new Error(`Timed out waiting for worker response ${id}`));
      }, 2_000);
      const check = () => {
        const response = findResponse();
        if (!response) return;
        clearTimeout(timeout);
        responseWaiters.delete(check);
        resolve(response);
      };
      responseWaiters.add(check);
    });
  };

  try {
    globalThis.self = workerSelf;
    globalThis.fetch = () => {
      markFetchStarted();
      return fetchResult;
    };
    await loadWorkerModule();

    workerSelf.onmessage({
      data: {
        type: 'initialize',
        id: 1,
        surfaceId: 'raced-surface',
        preferredRenderer: 'webgl2',
        enableAnimations: false,
        enableHistoryViewport: false,
      },
    });
    await fetchStarted;
    workerSelf.onmessage({
      data: {
        type: 'destroy',
        id: 2,
        surfaceId: 'raced-surface',
      },
    });
    assert.equal((await waitForResponse(2)).type, 'ack');

    resolveFetch({ ok: false, status: 503 });
    const initializeResponse = await waitForResponse(1);
    assert.equal(initializeResponse.type, 'error');
    assert.match(initializeResponse.error, /superseded|destroyed|stale/i);

    workerSelf.onmessage({
      data: {
        type: 'runtimePacks',
        id: 3,
        surfaceId: 'raced-surface',
        manifestUrl: '/runtime/manifest.json',
        packs: [],
      },
    });
    const lateMutationResponse = await waitForResponse(3);
    assert.equal(lateMutationResponse.type, 'error');
    assert.match(lateMutationResponse.error, /Native surface is destroyed/);
  } finally {
    globalThis.self = originalSelf;
    globalThis.fetch = originalFetch;
  }
});
