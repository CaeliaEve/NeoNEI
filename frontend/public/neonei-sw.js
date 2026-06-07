const CACHE_NAME = "neonei-runtime-current";
const RUNTIME_ASSET_PATTERN = /\/(?:dist-data\/runtime\/|textures\/atlas\/|native\/engine\/).+\.(?:bin|json|webp|wasm)$/i;
const RUNTIME_MANIFEST_PATTERN = /\/(?:dist-data\/manifest\.json|dist-data\/runtime\/runtime-manifest\.json)$/i;

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith("neonei-runtime-") && key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (RUNTIME_MANIFEST_PATTERN.test(url.pathname)) {
    event.respondWith(networkFirst(request));
    return;
  }
  if (RUNTIME_ASSET_PATTERN.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
  }
});

async function getRuntimeCacheStats() {
  const cache = await caches.open(CACHE_NAME);
  const requests = await cache.keys();
  let approxBytes = 0;
  for (const request of requests) {
    const response = await cache.match(request);
    const length = Number(response?.headers.get("content-length") ?? 0);
    approxBytes += Number.isFinite(length) ? length : 0;
  }
  return {
    cacheName: CACHE_NAME,
    entryCount: requests.length,
    approxBytes,
  };
}

self.addEventListener("message", (event) => {
  const type = event.data?.type;
  if (type === "NEONEI_RUNTIME_CACHE_STATUS") {
    event.waitUntil(getRuntimeCacheStats().then((payload) => {
      event.source?.postMessage({ type: "NEONEI_RUNTIME_CACHE_STATUS_RESULT", payload });
    }));
    return;
  }
  if (type === "NEONEI_RUNTIME_CACHE_CLEAR") {
    event.waitUntil(caches.delete(CACHE_NAME).then(() => {
      event.source?.postMessage({ type: "NEONEI_RUNTIME_CACHE_CLEAR_RESULT", payload: { cacheName: CACHE_NAME } });
    }));
  }
});
