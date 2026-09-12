/// <reference lib="webworker" />
export {};
declare const __SHELL__: { build: string; files: Array<{ url: string; integrity: string }> };
const scope = self as unknown as ServiceWorkerGlobalScope;
const prefix = 'neonei.shell.';
const cacheName = prefix + __SHELL__.build;
const paths = new Set(__SHELL__.files.map(file => file.url));
let saving: Promise<void> | null = null;

async function valid(cache: Cache, file: { url: string; integrity: string }): Promise<boolean> {
  const response = await cache.match(file.url);
  if (!response || response.status !== 200) return false;
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', await response.arrayBuffer()));
  return 'sha256-' + btoa(String.fromCharCode(...bytes)) === file.integrity;
}

async function ready(cache: Cache): Promise<boolean> {
  for (const file of __SHELL__.files) if (!await valid(cache, file)) return false;
  return true;
}

function save(): Promise<void> {
  if (!saving) saving = (async () => {
    const cache = await caches.open(cacheName);
    for (const file of __SHELL__.files) {
      if (await valid(cache, file)) continue;
      const response = await fetch(file.url, { cache: 'reload', integrity: file.integrity, mode: 'same-origin' });
      if (response.status !== 200) throw new Error('Application file is unavailable');
      await cache.put(file.url, response);
    }
  })().finally(() => { saving = null; });
  return saving;
}

async function versions(): Promise<Set<string> | null> {
  const clients = await scope.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const values = await Promise.all(clients.map(client => new Promise<string | null>(resolve => {
    const channel = new MessageChannel();
    let settled = false;
    const finish = (value: string | null): void => {
      if (settled) return;
      settled = true; clearTimeout(timer); channel.port1.close(); resolve(value);
    };
    const timer = setTimeout(() => finish(null), 1500);
    channel.port1.onmessage = event => finish(typeof event.data?.build === 'string' ? event.data.build : null);
    try { client.postMessage({ kind: 'shell-build' }, [channel.port2]); } catch { finish(null); }
  })));
  return values.some(value => value === null) ? null : new Set(values as string[]);
}

async function prune(): Promise<void> {
  const active = await versions();
  if (!active) return;
  for (const name of await caches.keys()) {
    if (name.startsWith(prefix) && name !== cacheName && !active.has(name.slice(prefix.length))) await caches.delete(name);
  }
}

scope.addEventListener('install', event => {
  event.waitUntil((async () => {
    await prune();
    const names = (await caches.keys()).filter(name => name.startsWith(prefix));
    if (!names.includes(cacheName) && names.length >= 4) throw new Error('Close older application tabs before installing another offline shell');
    const cache = await caches.open(cacheName);
    const complete = await ready(cache);
    try {
      if (!complete) await save();
      if (!scope.registration.active) await scope.skipWaiting();
    } catch (error) { if (!complete) await caches.delete(cacheName); throw error; }
  })());
});

scope.addEventListener('activate', event => {
  event.waitUntil((async () => { await scope.clients.claim(); await prune(); })());
});

scope.addEventListener('message', event => {
  if (event.data?.kind === 'shell-status') {
    event.waitUntil((async () => event.ports[0]?.postMessage({ build: __SHELL__.build, ready: await ready(await caches.open(cacheName)) }))());
  }
  if (event.data?.kind === 'shell-save') {
    event.waitUntil(save().then(() => event.ports[0]?.postMessage({ build: __SHELL__.build, ready: true }),
      () => event.ports[0]?.postMessage({ build: __SHELL__.build, ready: false })));
  }
  if (event.data?.kind === 'shell-activate' && event.data.build === __SHELL__.build) event.waitUntil(scope.skipWaiting());
});

scope.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== scope.location.origin) return;
  if (url.pathname === '/api' || url.pathname.startsWith('/api/') || url.pathname.startsWith('/assets/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => {
      const cached = await (await caches.open(cacheName)).match('/index.html');
      if (!cached) throw new Error('Application has not been saved');
      return cached;
    }));
    return;
  }
  if (paths.has(url.pathname) || url.pathname.startsWith('/web/')) {
    event.respondWith((async () => {
      const own = await (await caches.open(cacheName)).match(request, { ignoreSearch: true });
      if (own) return own;
      for (const name of (await caches.keys()).filter(name => name.startsWith(prefix) && name !== cacheName)) {
        const cached = await (await caches.open(name)).match(request, { ignoreSearch: true });
        if (cached) return cached;
      }
      return fetch(request);
    })());
  }
});
