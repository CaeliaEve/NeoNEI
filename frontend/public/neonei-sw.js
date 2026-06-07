const CACHE_NAME = "neonei-runtime-current";
const META_CACHE_NAME = "neonei-runtime-meta";
const META_REQUEST_URL = "/__neonei_runtime_cache_meta__";
const RUNTIME_ASSET_PATTERN = /\/(?:dist-data\/runtime\/|textures\/atlas\/|native\/engine\/).+\.(?:bin|json|webp|wasm)$/i;
const RUNTIME_MANIFEST_PATTERN = /\/(?:dist-data\/manifest\.json|dist-data\/runtime\/runtime-manifest\.json)$/i;

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith("neonei-runtime-") && key !== CACHE_NAME && key !== META_CACHE_NAME)
        .map((key) => caches.delete(key)),
    );
    await self.clients.claim();
  })());
});

function hashRuntimeManifestText(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

async function readRuntimeCacheMeta() {
  const metaCache = await caches.open(META_CACHE_NAME);
  const response = await metaCache.match(META_REQUEST_URL);
  if (!response) return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function writeRuntimeCacheMeta(meta) {
  const metaCache = await caches.open(META_CACHE_NAME);
  await metaCache.put(
    META_REQUEST_URL,
    new Response(JSON.stringify(meta), {
      headers: { "content-type": "application/json" },
    }),
  );
}

async function updateRuntimeCacheVersionFromManifest(text) {
  const manifestHash = hashRuntimeManifestText(text);
  const previous = await readRuntimeCacheMeta();
  if (previous?.manifestHash && previous.manifestHash !== manifestHash) {
    await caches.delete(CACHE_NAME);
  }
  await writeRuntimeCacheMeta({
    manifestHash,
    updatedAt: new Date().toISOString(),
  });
  return manifestHash;
}

async function runtimeManifestNetworkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) {
      const text = await response.clone().text();
      const manifestHash = await updateRuntimeCacheVersionFromManifest(text);
      const cachedResponse = new Response(text, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
      cachedResponse.headers.set("x-neonei-runtime-manifest-hash", manifestHash);
      await cache.put(request, cachedResponse.clone());
      return cachedResponse;
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
    event.respondWith(runtimeManifestNetworkFirst(request));
    return;
  }
  if (RUNTIME_ASSET_PATTERN.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
  }
});

async function getRuntimeCacheStats() {
  const cache = await caches.open(CACHE_NAME);
  const requests = await cache.keys();
  const meta = await readRuntimeCacheMeta();
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
    manifestHash: meta?.manifestHash ?? null,
    manifestUpdatedAt: meta?.updatedAt ?? null,
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
    event.waitUntil(Promise.all([caches.delete(CACHE_NAME), caches.delete(META_CACHE_NAME)]).then(() => {
      event.source?.postMessage({ type: "NEONEI_RUNTIME_CACHE_CLEAR_RESULT", payload: { cacheName: CACHE_NAME } });
    }));
  }
});
