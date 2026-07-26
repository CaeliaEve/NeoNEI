import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";

test("runtime service worker is registered by the frontend shell", async () => {
  const main = await readFile(new URL("../src/main.ts", import.meta.url), "utf8");
  assert.match(main, /registerRuntimeServiceWorker/);
});

test("runtime service worker caches binary packs, atlas images, and native engine assets", async () => {
  const worker = await readFile(new URL("../public/neonei-sw.js", import.meta.url), "utf8");
  assert.ok(worker.includes("dist-data\\/runtime"), "runtime binary pack path should be cached");
  assert.ok(worker.includes("dist-data\\/(?:runtime\\/|rust\\/|textures\\/atlas-assets\\/)"), "rust binary pack and atlas-assets paths should be cached");
  assert.ok(worker.includes("api\\/runtime\\/(?:current|[^/]+)\\/asset"), "semantic runtime asset API should be cached");
  assert.ok(worker.includes("api\\/runtime\\/(?:current|[^/]+)\\/manifest"), "semantic runtime manifest API should be network-first");
  assert.doesNotMatch(worker, /api\/native-runtime\/current/);
  assert.ok(worker.includes("textures\\/atlas"), "atlas texture path should be cached");
  assert.ok(worker.includes("png|webp"), "png atlas assets should be cached");
  assert.ok(worker.includes("native\\/engine"), "native engine path should be cached");
  assert.match(worker, /cacheFirst/);
  assert.match(worker, /runtimeManifestNetworkFirst/);
  assert.match(worker, /NEONEI_RUNTIME_CACHE_STATUS/);
  assert.match(worker, /NEONEI_RUNTIME_CACHE_CLEAR/);
  assert.match(worker, /hashRuntimeManifestText/);
  assert.match(worker, /extractRuntimeIdFromManifestText/);
  assert.match(worker, /updateRuntimeCacheVersionFromManifest/);
  assert.match(worker, /CACHE_PREFIX/);
  assert.match(worker, /runtimeCacheName/);
  assert.match(worker, /runtimeId/);
  assert.match(worker, /manifestHash/);
  assert.match(worker, /retainRollbackRuntimeCaches/);
  assert.match(worker, /previousRuntimeId/);
  assert.match(worker, /runtimeIdentityConflict/);
  assert.match(worker, /x-neonei-runtime-id/);
});

function createMemoryCacheStorage() {
  const stores = new Map();
  const requestKey = (request) => typeof request === "string" ? request : request.url;
  let nextPutFailureCacheName = null;

  return {
    async open(name) {
      if (!stores.has(name)) {
        const entries = new Map();
        stores.set(name, {
          async match(request) {
            return entries.get(requestKey(request))?.clone?.() ?? null;
          },
          async put(request, response) {
            if (nextPutFailureCacheName === name) {
              nextPutFailureCacheName = null;
              throw new Error(`injected cache put failure: ${name}`);
            }
            entries.set(requestKey(request), response.clone());
          },
          async keys() {
            return Array.from(entries.keys()).map((url) => new Request(url));
          },
          _entries: entries,
        });
      }
      return stores.get(name);
    },
    async keys() {
      return Array.from(stores.keys());
    },
    async delete(name) {
      return stores.delete(name);
    },
    failNextPut(name) {
      nextPutFailureCacheName = name;
    },
    _stores: stores,
  };
}

async function createServiceWorkerHarness() {
  const worker = await readFile(new URL("../public/neonei-sw.js", import.meta.url), "utf8");
  const listeners = new Map();
  const caches = createMemoryCacheStorage();
  let fetchImpl = async () => new Response("", { status: 404 });
  const self = {
    location: { origin: "https://neonei.test" },
    clients: { claim: async () => undefined },
    skipWaiting: async () => undefined,
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
  };

  vm.runInNewContext(worker, {
    self,
    caches,
    Response,
    Request,
    URL,
    Date,
    JSON,
    Promise,
    fetch: (...args) => fetchImpl(...args),
    console,
  });

  const dispatchFetch = async (path) => {
    const request = new Request(`https://neonei.test${path}`);
    let responsePromise = null;
    listeners.get("fetch")({
      request,
      respondWith(promise) {
        responsePromise = Promise.resolve(promise);
      },
    });
    assert.ok(responsePromise, `fetch for ${path} should be handled by the runtime service worker`);
    return responsePromise;
  };

  const dispatchMessage = async (data) => {
    let waitPromise = Promise.resolve();
    let postedMessage = null;
    listeners.get("message")({
      data,
      source: {
        postMessage(message) {
          postedMessage = message;
        },
      },
      waitUntil(promise) {
        waitPromise = Promise.resolve(promise);
      },
    });
    await waitPromise;
    return postedMessage;
  };

  return {
    caches,
    setFetch(handler) {
      fetchImpl = handler;
    },
    dispatchFetch,
    dispatchMessage,
  };
}

test("runtime service worker switches runtime caches and serves cached files offline", async () => {
  const harness = await createServiceWorkerHarness();
  const manifestPath = "/api/runtime/current/manifest";
  const browserPackPath = "/api/runtime/current/asset/rust/browser.bin";

  harness.setFetch(async (request) => {
    const url = new URL(request.url);
    if (url.pathname === manifestPath) {
      return new Response(JSON.stringify({ ok: true, data: { runtimeId: "alpha", files: [] }, meta: { runtimeId: "alpha" } }), {
        status: 200,
        headers: { "content-type": "application/json", "content-length": "32" },
      });
    }
    if (url.pathname === browserPackPath) {
      return new Response("alpha-pack", {
        status: 200,
        headers: { "content-type": "application/octet-stream", "content-length": "10", "x-neonei-runtime-id": "alpha" },
      });
    }
    return new Response("not found", { status: 404 });
  });

  const alphaManifest = await harness.dispatchFetch(manifestPath);
  assert.equal(alphaManifest.headers.get("x-neonei-runtime-id"), "alpha");
  const alphaPack = await harness.dispatchFetch(browserPackPath);
  assert.equal(await alphaPack.text(), "alpha-pack");
  assert.ok((await harness.caches.keys()).includes("neonei-runtime-assets-alpha"));

  harness.setFetch(async (request) => {
    const url = new URL(request.url);
    if (url.pathname === manifestPath) {
      return new Response(JSON.stringify({ ok: true, data: { runtimeId: "beta", files: [] }, meta: { runtimeId: "beta" } }), {
        status: 200,
        headers: { "content-type": "application/json", "content-length": "31" },
      });
    }
    if (url.pathname === browserPackPath) {
      return new Response("beta-pack", {
        status: 200,
        headers: { "content-type": "application/octet-stream", "content-length": "9", "x-neonei-runtime-id": "beta" },
      });
    }
    return new Response("not found", { status: 404 });
  });

  const betaManifest = await harness.dispatchFetch(manifestPath);
  assert.equal(betaManifest.headers.get("x-neonei-runtime-id"), "beta");
  assert.ok((await harness.caches.keys()).includes("neonei-runtime-assets-alpha"), "previous runtime cache must be retained for rollback");
  const betaPack = await harness.dispatchFetch(browserPackPath);
  assert.equal(await betaPack.text(), "beta-pack");

  harness.setFetch(async () => {
    throw new Error("offline");
  });

  const offlineManifest = await harness.dispatchFetch(manifestPath);
  assert.equal(offlineManifest.headers.get("x-neonei-runtime-id"), "beta");
  assert.deepEqual(await offlineManifest.json(), { ok: true, data: { runtimeId: "beta", files: [] }, meta: { runtimeId: "beta" } });
  const offlinePack = await harness.dispatchFetch(browserPackPath);
  assert.equal(await offlinePack.text(), "beta-pack");
});

test("runtime service worker cache stats count cached bodies without content-length", async () => {
  const harness = await createServiceWorkerHarness();
  const manifestPath = "/api/runtime/current/manifest";
  const browserPackPath = "/api/runtime/current/asset/rust/browser.bin";

  harness.setFetch(async (request) => {
    const url = new URL(request.url);
    if (url.pathname === manifestPath) {
      return new Response(JSON.stringify({ ok: true, data: { runtimeId: "gamma", files: [] }, meta: { runtimeId: "gamma" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.pathname === browserPackPath) {
      return new Response("pack-without-content-length", {
        status: 200,
        headers: { "content-type": "application/octet-stream", "x-neonei-runtime-id": "gamma" },
      });
    }
    return new Response("not found", { status: 404 });
  });

  await harness.dispatchFetch(manifestPath);
  await harness.dispatchFetch(browserPackPath);

  const message = await harness.dispatchMessage({ type: "NEONEI_RUNTIME_CACHE_STATUS" });
  assert.equal(message.type, "NEONEI_RUNTIME_CACHE_STATUS_RESULT");
  assert.equal(message.payload.runtimeId, "gamma");
  assert.ok(message.payload.approxBytes >= "pack-without-content-length".length);
});

test("corrupt manifest cannot evict the last known-good runtime and offline reads remain available", async () => {
  const harness = await createServiceWorkerHarness();
  const manifestPath = "/api/runtime/current/manifest";
  const browserPackPath = "/api/runtime/current/asset/rust/browser.bin";

  harness.setFetch(async (request) => {
    const url = new URL(request.url);
    if (url.pathname === manifestPath) {
      return new Response(JSON.stringify({ ok: true, data: { runtimeId: "stable" }, meta: { runtimeId: "stable" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.pathname === browserPackPath) return new Response("stable-pack", {
      status: 200,
      headers: { "x-neonei-runtime-id": "stable" },
    });
    return new Response("not found", { status: 404 });
  });
  await harness.dispatchFetch(manifestPath);
  await harness.dispatchFetch(browserPackPath);

  harness.setFetch(async (request) => {
    const url = new URL(request.url);
    if (url.pathname === manifestPath) {
      return new Response("{not-json", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error("offline after corrupt manifest");
  });

  const recoveredManifest = await harness.dispatchFetch(manifestPath);
  assert.equal(recoveredManifest.headers.get("x-neonei-runtime-id"), "stable");
  const recoveredPack = await harness.dispatchFetch(browserPackPath);
  assert.equal(await recoveredPack.text(), "stable-pack");
  assert.ok((await harness.caches.keys()).includes("neonei-runtime-assets-stable"));
  assert.ok(!(await harness.caches.keys()).some((name) => name.startsWith("neonei-runtime-assets-hash-")));
});

test("an explicit rollback commits the older runtime only after its manifest is cached", async () => {
  const harness = await createServiceWorkerHarness();
  const manifestPath = "/api/runtime/current/manifest";
  let runtimeId = "beta";
  harness.setFetch(async () => new Response(JSON.stringify({
    ok: true,
    data: { runtimeId },
    meta: { runtimeId },
  }), {
    status: 200,
    headers: { "content-type": "application/json" },
  }));

  const beta = await harness.dispatchFetch(manifestPath);
  assert.equal(beta.headers.get("x-neonei-runtime-id"), "beta");
  runtimeId = "alpha";
  const alpha = await harness.dispatchFetch(manifestPath);
  assert.equal(alpha.headers.get("x-neonei-runtime-id"), "alpha");
  assert.ok((await harness.caches.keys()).includes("neonei-runtime-assets-alpha"));
  assert.ok((await harness.caches.keys()).includes("neonei-runtime-assets-beta"), "rolled-back-from runtime must remain as the bounded previous cache");

  harness.setFetch(async () => { throw new Error("offline after rollback"); });
  const offlineRollback = await harness.dispatchFetch(manifestPath);
  assert.equal(offlineRollback.headers.get("x-neonei-runtime-id"), "alpha");
});

test("a failed new-runtime cache write cannot replace the previous runtime metadata", async () => {
  const harness = await createServiceWorkerHarness();
  const manifestPath = "/api/runtime/current/manifest";
  let runtimeId = "stable";
  harness.setFetch(async () => new Response(JSON.stringify({
    ok: true,
    data: { runtimeId },
    meta: { runtimeId },
  }), { status: 200, headers: { "content-type": "application/json" } }));

  const stable = await harness.dispatchFetch(manifestPath);
  assert.equal(stable.headers.get("x-neonei-runtime-id"), "stable");

  runtimeId = "candidate";
  harness.caches.failNextPut("neonei-runtime-assets-candidate");
  const fallback = await harness.dispatchFetch(manifestPath);
  assert.equal(fallback.headers.get("x-neonei-runtime-id"), "stable");
  const status = await harness.dispatchMessage({ type: "NEONEI_RUNTIME_CACHE_STATUS" });
  assert.equal(status.payload.runtimeId, "stable");
  assert.ok((await harness.caches.keys()).includes("neonei-runtime-assets-stable"));
});

test("runtime promotion during an asset fetch cannot write new bytes into the previous runtime cache", async () => {
  const harness = await createServiceWorkerHarness();
  const manifestPath = "/api/runtime/current/manifest";
  const browserPackPath = "/api/runtime/current/asset/rust/browser.bin";
  let runtimeId = "alpha";
  let releaseAsset;
  const pendingAsset = new Promise((resolve) => { releaseAsset = resolve; });

  harness.setFetch(async (request) => {
    const url = new URL(request.url);
    if (url.pathname === manifestPath) {
      return new Response(JSON.stringify({ ok: true, data: { runtimeId }, meta: { runtimeId } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.pathname === browserPackPath) return pendingAsset;
    return new Response("not found", { status: 404 });
  });

  await harness.dispatchFetch(manifestPath);
  const racingAsset = harness.dispatchFetch(browserPackPath);
  runtimeId = "beta";
  await harness.dispatchFetch(manifestPath);
  releaseAsset(new Response("beta-pack", {
    status: 200,
    headers: { "x-neonei-runtime-id": "beta" },
  }));

  const conflict = await racingAsset;
  assert.equal(conflict.status, 409);
  const alphaCache = await harness.caches.open("neonei-runtime-assets-alpha");
  assert.equal(await alphaCache.match(`https://neonei.test${browserPackPath}`), null);

  harness.setFetch(async (request) => {
    const url = new URL(request.url);
    if (url.pathname === browserPackPath) {
      return new Response("beta-pack", {
        status: 200,
        headers: { "x-neonei-runtime-id": "beta" },
      });
    }
    return new Response("not found", { status: 404 });
  });
  assert.equal(await (await harness.dispatchFetch(browserPackPath)).text(), "beta-pack");
});

