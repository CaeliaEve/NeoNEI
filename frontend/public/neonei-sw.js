const CACHE_PREFIX = "neonei-runtime-assets-";
const LEGACY_CACHE_NAME = "neonei-runtime-current";
const META_CACHE_NAME = "neonei-runtime-meta";
const META_REQUEST_URL = "/__neonei_runtime_cache_meta__";
const DEFAULT_RUNTIME_ID = "current";
const RUNTIME_ASSET_PATTERN = /\/(?:dist-data\/(?:runtime\/|rust\/|textures\/atlas-assets\/)|textures\/atlas\/|native\/engine\/).+\.(?:bin|json|png|webp|wasm)$/i;
const RUNTIME_ASSET_API_PATTERN = /\/api\/runtime\/(?:current|[^/]+)\/asset\/.+/i;
const RUNTIME_MANIFEST_PATTERN = /\/(?:dist-data\/manifest\.json|dist-data\/runtime\/runtime-manifest\.json|dist-data\/rust\/runtime-manifest\.json|api\/runtime\/(?:current|[^/]+)\/manifest)$/i;

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key === LEGACY_CACHE_NAME)
        .map((key) => caches.delete(key)),
    );
    await self.clients.claim();
  })());
});

function sanitizeRuntimeId(value) {
  const text = `${value || DEFAULT_RUNTIME_ID}`.trim().toLowerCase();
  return text.replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || DEFAULT_RUNTIME_ID;
}

function runtimeCacheName(runtimeId) {
  return `${CACHE_PREFIX}${sanitizeRuntimeId(runtimeId)}`;
}

function requiresRuntimeIdentity(pathname) {
  return pathname.startsWith("/dist-data/") || pathname.startsWith("/api/runtime/");
}

function runtimeIdentityConflict(expectedRuntimeId, actualRuntimeId) {
  return new Response(JSON.stringify({
    error: "runtime identity changed during artifact fetch",
    expectedRuntimeId,
    actualRuntimeId,
  }), {
    status: 409,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "x-neonei-runtime-expected": expectedRuntimeId || "missing",
      "x-neonei-runtime-actual": actualRuntimeId || "missing",
    },
  });
}

function hashRuntimeManifestText(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function extractRuntimeIdFromManifestText(text) {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("runtime manifest must be a JSON object");
  }
  return sanitizeRuntimeId(
    parsed.runtimeId
      || parsed.data?.runtimeId
      || parsed.meta?.runtimeId
      || parsed.data?.manifest?.runtimeId
      || parsed.manifest?.runtimeId
      || parsed.runtime?.runtimeId
      || parsed.nativeRuntime?.runtimeId
      || `hash-${hashRuntimeManifestText(text)}`,
  );
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
  const runtimeId = extractRuntimeIdFromManifestText(text);
  return { manifestHash, runtimeId };
}

async function retainRollbackRuntimeCaches(runtimeId, previousRuntimeId) {
  const retained = new Set(
    [runtimeId, previousRuntimeId]
      .filter(Boolean)
      .map((value) => runtimeCacheName(value)),
  );
  const keys = await caches.keys();
  await Promise.all(
    keys
      .filter((key) => key.startsWith(CACHE_PREFIX) && !retained.has(key))
      .map((key) => caches.delete(key)),
  );
}

async function runtimeManifestNetworkFirst(request) {
  const previous = await readRuntimeCacheMeta();
  const cache = await caches.open(runtimeCacheName(previous?.runtimeId));
  try {
    const response = await fetch(request);
    if (response.ok) {
      const text = await response.clone().text();
      const { manifestHash, runtimeId } = await updateRuntimeCacheVersionFromManifest(text);
      const runtimeCache = await caches.open(runtimeCacheName(runtimeId));
      const cachedResponse = new Response(text, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
      cachedResponse.headers.set("x-neonei-runtime-manifest-hash", manifestHash);
      cachedResponse.headers.set("x-neonei-runtime-id", runtimeId);
      await runtimeCache.put(request, cachedResponse.clone());
      const previousRuntimeId = previous?.runtimeId && previous.runtimeId !== runtimeId
        ? previous.runtimeId
        : previous?.previousRuntimeId ?? null;
      await writeRuntimeCacheMeta({
        runtimeId,
        previousRuntimeId,
        cacheName: runtimeCacheName(runtimeId),
        manifestHash,
        updatedAt: new Date().toISOString(),
      });
      await retainRollbackRuntimeCaches(runtimeId, previousRuntimeId);
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
  const meta = await readRuntimeCacheMeta();
  const cache = await caches.open(runtimeCacheName(meta?.runtimeId));
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const pathname = new URL(request.url).pathname;
    if (requiresRuntimeIdentity(pathname)) {
      const expectedRuntimeId = meta?.runtimeId ? sanitizeRuntimeId(meta.runtimeId) : null;
      const responseRuntimeId = response.headers.get("x-neonei-runtime-id");
      const actualRuntimeId = responseRuntimeId ? sanitizeRuntimeId(responseRuntimeId) : null;
      const latestMeta = await readRuntimeCacheMeta();
      const latestRuntimeId = latestMeta?.runtimeId ? sanitizeRuntimeId(latestMeta.runtimeId) : null;
      if (!expectedRuntimeId || !actualRuntimeId
        || actualRuntimeId !== expectedRuntimeId
        || latestRuntimeId !== expectedRuntimeId) {
        return runtimeIdentityConflict(expectedRuntimeId, actualRuntimeId);
      }
    }
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
  if (RUNTIME_ASSET_PATTERN.test(url.pathname) || RUNTIME_ASSET_API_PATTERN.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
  }
});

async function getRuntimeCacheStats() {
  const meta = await readRuntimeCacheMeta();
  const cacheName = runtimeCacheName(meta?.runtimeId);
  const cache = await caches.open(cacheName);
  const requests = await cache.keys();
  let approxBytes = 0;
  for (const request of requests) {
    const response = await cache.match(request);
    const length = Number(response?.headers.get("content-length") ?? 0);
    if (Number.isFinite(length) && length > 0) {
      approxBytes += length;
      continue;
    }
    try {
      approxBytes += response ? (await response.clone().arrayBuffer()).byteLength : 0;
    } catch {
      approxBytes += 0;
    }
  }
  return {
    cacheName,
    runtimeId: meta?.runtimeId ?? null,
    previousRuntimeId: meta?.previousRuntimeId ?? null,
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
    event.waitUntil(caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key.startsWith(CACHE_PREFIX) || key === LEGACY_CACHE_NAME || key === META_CACHE_NAME)
        .map((key) => caches.delete(key)),
    )).then(() => {
      event.source?.postMessage({ type: "NEONEI_RUNTIME_CACHE_CLEAR_RESULT", payload: { cachePrefix: CACHE_PREFIX } });
    }));
  }
});


