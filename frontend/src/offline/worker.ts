/// <reference lib="webworker" />
import { Api, Catalog, Fault, checkManifest, hash, limits } from '@neonei/catalog/source';
import { formats } from '@elysium/contracts';
import { body, request } from '../catalog/transport.ts';
import { Shelf } from './store.ts';
import type { Call, Operation, Progress, Reply } from './protocol.ts';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const jobs = new Map<number, AbortController>();
const opening = Shelf.open();
void opening.catch(() => {});
let current: Catalog | null = null;
let api: Api | null = null;

function send(message: Reply, transfer: Transferable[] = []): void { scope.postMessage(message, transfer); }
function id(value: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Fault('invalid_id', '资料标识无效', 400);
}
function base(value: string): URL {
  const url = new URL(value, scope.location.origin);
  if (url.origin !== scope.location.origin || !url.pathname.endsWith('/api') || url.search || url.hash) {
    throw new Fault('invalid_url', '离线保存只接受本站的资料接口', 400);
  }
  return url;
}
function asset(source: URL, catalog: string, path: string): string {
  return source.origin + source.pathname.slice(0, -4) + '/assets/' + catalog + '/' + path.split('/').map(encodeURIComponent).join('/');
}
async function write<T>(signal: AbortSignal, action: () => Promise<T>): Promise<T> {
  if (!scope.navigator.locks) throw new Fault('storage_unavailable', '浏览器不支持安全的离线写入锁');
  return scope.navigator.locks.request('neonei.catalog.write', { signal }, action);
}
function notify(kind: string, catalog: string): void {
  const channel = new BroadcastChannel('neonei.catalog');
  channel.postMessage({ kind, catalog }); channel.close();
}

async function run(operation: Operation, signal: AbortSignal, progress: (value: Progress) => void): Promise<unknown> {
  const shelf = await opening;
  signal.throwIfAborted();
  if (operation.kind === 'list') return shelf.list();
  if (operation.kind === 'open') {
    if (operation.catalog) id(operation.catalog);
    const source = base(operation.base);
    const saved = operation.catalog ? await shelf.saved(operation.catalog)
      : (await shelf.list()).find(row => row.state === 'ready' && row.source === source.pathname && row.revision === formats.catalog.revision);
    if (!saved || saved.state !== 'ready') throw new Fault('catalog_missing', '本地尚未完整保存这份资料', 404);
    if (saved.revision !== formats.catalog.revision) throw new Fault('catalog_revision', '此离线副本的数据格式已更新，请下载当前发布的资料');
    id(saved.id);
    const catalog = await Catalog.open(await shelf.manifest(saved.id), async file => {
      const bytes = await shelf.file(saved.id, file.path);
      if (!bytes) throw new Fault('file_missing', '离线文件缺失，请重新保存这份资料', 404);
      return bytes;
    }, saved.id);
    signal.throwIfAborted();
    current = catalog; api = new Api(catalog);
    return { manifest: catalog.manifest };
  }
  if (operation.kind === 'query') {
    if (!api) throw new Fault('catalog_missing', '尚未打开离线资料', 404);
    if (typeof operation.endpoint !== 'string' || operation.endpoint.length > 16384) throw new Fault('invalid_url', '资料查询地址无效', 400);
    const url = new URL(operation.endpoint, scope.location.origin);
    if (url.origin !== scope.location.origin || url.pathname.length > 2048) throw new Fault('invalid_url', '资料查询地址无效', 400);
    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    const value = await api.read(parts, url.searchParams);
    signal.throwIfAborted();
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > limits.result) throw new Fault('result_limit', '结果过大，请缩小每页数量');
    return value;
  }
  if (operation.kind === 'asset') {
    if (!current || current.descriptor(operation.path).kind !== 'image') throw new Fault('file_missing', '纹理未在这份资料中声明', 404);
    const bytes = await current.read(operation.path);
    signal.throwIfAborted();
    return bytes;
  }
  if (operation.kind === 'remove') {
    id(operation.catalog);
    await write(signal, () => shelf.remove(operation.catalog));
    notify('removed', operation.catalog);
    return null;
  }
  if (operation.kind === 'save') {
    id(operation.catalog);
    const source = base(operation.base);
    return write(signal, async () => {
      const manifest = await checkManifest(await request(source.href + '/catalog/' + operation.catalog, signal, limits.manifest), operation.catalog);
      for (const kind of ['browse', 'groups', 'topics', 'categories']) {
        const weight = manifest.files.filter(file => file.kind === kind).reduce((total, file) => total + file.bytes * 4, 0);
        if (weight > 256 * 1024 * 1024) throw new Fault('index_limit', '这份资料的索引超过离线查询内存预算');
      }
      const row = await shelf.begin(manifest, source.pathname);
      const storage = await scope.navigator.storage?.estimate();
      if (storage?.quota !== undefined && storage.usage !== undefined
        && row.totalBytes - row.bytes + 8 * 1024 * 1024 > storage.quota - storage.usage) {
        throw new Fault('storage_quota', '浏览器存储空间不足，请移除不再需要的离线副本');
      }
      let files = 0, bytes = 0;
      const catalog = await Catalog.open(manifest, async file => {
        signal.throwIfAborted();
        let data = await shelf.file(manifest.id, file.path);
        if (!data || data.byteLength !== file.bytes || await hash(data) !== file.sha256) {
          const response = await fetch(asset(source, manifest.id, file.path), { signal });
          if (!response.ok) {
            await response.body?.cancel();
            throw new Fault('download_failed', '下载失败：HTTP ' + response.status, response.status);
          }
          data = await body(response, file.bytes, file.bytes);
          if (await hash(data) !== file.sha256) throw new Fault('invalid_file', '下载文件的摘要与清单不一致');
          signal.throwIfAborted();
          await shelf.put(manifest.id, file, data);
        }
        files++; bytes += file.bytes;
        progress({ id: manifest.id, files, totalFiles: row.totalFiles, bytes, totalBytes: row.totalBytes });
        return data;
      }, manifest.id);
      await catalog.check();
      signal.throwIfAborted();
      const saved = await shelf.finish(manifest.id);
      notify('saved', manifest.id);
      return saved;
    });
  }
  throw new Fault('invalid_operation', '未知离线操作', 400);
}

scope.addEventListener('message', event => {
  const call = event.data as Call;
  if (!call || typeof call !== 'object') return;
  if ('cancel' in call) { jobs.get(call.cancel)?.abort(); return; }
  if (!Number.isSafeInteger(call.id) || jobs.has(call.id)) return;
  if (jobs.size >= 64) {
    send({ id: call.id, error: { code: 'offline_busy', message: '离线查询繁忙，请稍后重试', status: 429, name: 'Error' } }); return;
  }
  const controller = new AbortController(); jobs.set(call.id, controller);
  void run(call.operation, controller.signal, value => {
    if (!controller.signal.aborted) send({ id: call.id, progress: value });
  }).then(value => {
    if (controller.signal.aborted) return;
    if (value instanceof Uint8Array) send({ id: call.id, value }, [value.buffer as ArrayBuffer]);
    else send({ id: call.id, value });
  }, error => {
    if (controller.signal.aborted) return;
    const quota = error instanceof DOMException && error.name === 'QuotaExceededError';
    send({ id: call.id, error: {
      code: quota ? 'storage_quota' : typeof error?.code === 'string' ? error.code : 'offline_error',
      message: quota ? '浏览器存储空间不足，已下载的部分可以稍后继续' : error instanceof Error ? error.message : '离线操作失败',
      status: typeof error?.status === 'number' ? error.status : 0,
      name: error instanceof Error ? error.name : 'Error',
    } });
  }).finally(() => jobs.delete(call.id));
});
