import { ApiError } from '../catalog/transport.ts';

let listening = false;

function register(): Promise<ServiceWorkerRegistration> {
  if (!import.meta.env.PROD || !window.isSecureContext || !('serviceWorker' in navigator)) {
    return Promise.reject(new ApiError('offline_shell', '请通过 HTTPS 或 localhost 使用构建版本保存离线资料'));
  }
  // A resolved registration may later lose every worker after a failed install
  // or removal. Ask the browser to ensure registration for each explicit save.
  return navigator.serviceWorker.register('/sw.js', { type: 'module', updateViaCache: 'none' });
}

export function start(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || listening) return;
  listening = true;
  navigator.serviceWorker.addEventListener('message', event => {
    if (event.data?.kind === 'shell-build') event.ports[0]?.postMessage({ build: __APP_BUILD__ });
  });
  void register().catch(() => {});
}

function status(worker: ServiceWorker, signal: AbortSignal, repair = false): Promise<{ build: string; ready: boolean }> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    let done = false;
    const finish = (value?: { build: string; ready: boolean }, error?: unknown): void => {
      if (done) return;
      done = true; clearTimeout(timer); signal.removeEventListener('abort', abort); channel.port1.close();
      if (error) reject(error); else resolve(value!);
    };
    const abort = (): void => finish(undefined, new DOMException('Aborted', 'AbortError'));
    const timer = setTimeout(() => finish(undefined, new ApiError('offline_shell', '离线页面尚未就绪，请刷新后重试')), repair ? 60000 : 4000);
    signal.addEventListener('abort', abort, { once: true });
    channel.port1.onmessage = event => finish(event.data);
    try { worker.postMessage({ kind: repair ? 'shell-save' : 'shell-status' }, [channel.port2]); }
    catch (error) { channel.port2.close(); finish(undefined, error); }
  });
}

function state(worker: ServiceWorker, target: ServiceWorkerState, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const finish = (error?: unknown): void => {
      worker.removeEventListener('statechange', changed); signal.removeEventListener('abort', aborted);
      if (error) reject(error); else resolve();
    };
    const aborted = (): void => finish(new DOMException('Aborted', 'AbortError'));
    const changed = (): void => {
      if (worker.state === target || (target === 'installed' && worker.state === 'activated')) finish();
      else if (worker.state === 'redundant') finish(new ApiError('offline_shell', '离线页面未能完整保存，请关闭旧标签页后重试'));
    };
    worker.addEventListener('statechange', changed); signal.addEventListener('abort', aborted, { once: true }); changed();
  });
}

export async function prepare(signal: AbortSignal): Promise<void> {
  start();
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(60000)]);
  const current = await register();
  bounded.throwIfAborted();
  if (current.active) {
    const reply = await status(current.active, bounded);
    if (reply.build === __APP_BUILD__) {
      if (reply.ready || (await status(current.active, bounded, true)).ready) return;
      throw new ApiError('offline_shell', '离线页面未能完整保存，请联网后重试');
    }
  }
  let next = current.installing ?? current.waiting;
  if (!next) { await current.update(); next = current.installing ?? current.waiting ?? current.active; }
  if (!next) throw new ApiError('offline_shell', '离线页面与当前版本不一致，请刷新后重试');
  await state(next, 'installed', bounded);
  const reply = await status(next, bounded);
  if (reply.build !== __APP_BUILD__ || !reply.ready) throw new ApiError('offline_shell', '离线页面未能完整保存');
  if (next.state !== 'activated') {
    next.postMessage({ kind: 'shell-activate', build: __APP_BUILD__ });
    await state(next, 'activated', bounded);
  }
}
