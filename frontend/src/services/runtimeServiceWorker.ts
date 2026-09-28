export type RuntimeServiceWorkerStatus = {
  supported: boolean;
  registered: boolean;
  controllerReady: boolean;
  cacheName?: string;
  runtimeId?: string | null;
  entryCount?: number;
  approxBytes?: number;
  manifestHash?: string | null;
  manifestUpdatedAt?: string | null;
  error?: string;
};

import { start } from '../offline/shell';

export async function registerRuntimeServiceWorker(): Promise<RuntimeServiceWorkerStatus> {
  start();
  return getRuntimeServiceWorkerStatus();
}

export async function getRuntimeServiceWorkerStatus(): Promise<RuntimeServiceWorkerStatus> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return { supported: false, registered: false, controllerReady: false };
  }
  const registration = await navigator.serviceWorker.getRegistration('/');
  const worker = registration?.active;
  const registered = Boolean(worker && new URL(worker.scriptURL).pathname === '/sw.js');
  const cacheName = 'neonei.shell.' + __APP_BUILD__;
  const keys = await caches.keys();
  const entries = keys.includes(cacheName) ? await (await caches.open(cacheName)).keys() : [];
  return { supported: true, registered, controllerReady: registered && navigator.serviceWorker.controller === worker,
    cacheName, runtimeId: __APP_BUILD__, manifestHash: __APP_BUILD__, entryCount: entries.length };
}

export async function clearRuntimeServiceWorkerCache(): Promise<RuntimeServiceWorkerStatus> {
  // Prune only unused shell versions. Explicitly downloaded catalogs and the
  // shell needed by this or another open tab remain available offline.
  const registration = await navigator.serviceWorker?.getRegistration('/');
  registration?.active?.postMessage({ kind: 'shell-prune' });
  return getRuntimeServiceWorkerStatus();
}
