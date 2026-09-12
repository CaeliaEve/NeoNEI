import type { Manifest } from '@elysium/contracts';
import { ApiError } from '../catalog/transport.ts';
import type { Operation, Opened, Progress, Reply, Saved } from './protocol.ts';

export type { Progress, Saved };

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
  progress?: (value: Progress) => void;
  signal?: AbortSignal;
  abort: () => void;
}

export function available(): boolean {
  return typeof window !== 'undefined' && window.isSecureContext && 'indexedDB' in window && 'Worker' in window;
}

class Channel {
  private readonly worker: Worker;
  private readonly pending = new Map<number, Pending>();
  private sequence = 0;
  private closed = false;
  constructor() {
    if (!available()) throw new ApiError('offline_unavailable', '离线读取需要支持本地存储的浏览器，并通过 HTTPS 或 localhost 打开');
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.worker.addEventListener('message', event => {
      const reply = event.data as Reply;
      const pending = this.pending.get(reply.id);
      if (!pending) return;
      if ('progress' in reply) { pending.progress?.(reply.progress); return; }
      this.pending.delete(reply.id); pending.signal?.removeEventListener('abort', pending.abort);
      if ('error' in reply) pending.reject(new ApiError(reply.error.code, reply.error.message, reply.error.status));
      else pending.resolve(reply.value);
    });
    this.worker.addEventListener('error', event => {
      event.preventDefault(); this.close(new ApiError('offline_worker', '离线读取进程无法运行，请刷新后重试'));
    });
    this.worker.addEventListener('messageerror', () => this.close(new ApiError('offline_message', '离线数据传输失败')));
  }

  call<T>(operation: Operation, signal?: AbortSignal, progress?: (value: Progress) => void): Promise<T> {
    if (this.closed || signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
    const id = ++this.sequence;
    return new Promise<T>((resolve, reject) => {
      const abort = (): void => {
        this.pending.delete(id);
        this.worker.postMessage({ cancel: id });
        reject(new DOMException('Aborted', 'AbortError'));
      };
      this.pending.set(id, { resolve: value => resolve(value as T), reject, signal, abort, progress });
      signal?.addEventListener('abort', abort, { once: true });
      this.worker.postMessage({ id, operation });
    });
  }

  close(error: unknown = new DOMException('Aborted', 'AbortError')): void {
    if (this.closed) return;
    this.closed = true; this.worker.terminate();
    for (const pending of this.pending.values()) {
      pending.signal?.removeEventListener('abort', pending.abort); pending.reject(error);
    }
    this.pending.clear();
  }
}

export class Local {
  readonly manifest: Manifest;
  private readonly channel: Channel;
  private constructor(manifest: Manifest, channel: Channel) { this.manifest = manifest; this.channel = channel; }
  static async open(catalog: string, signal?: AbortSignal, base = '/api'): Promise<Local> {
    const channel = new Channel();
    try {
      const opened = await channel.call<Opened>({ kind: 'open', catalog, base }, signal);
      return new Local(opened.manifest, channel);
    } catch (error) { channel.close(); throw error; }
  }
  get(endpoint: string, signal?: AbortSignal): Promise<unknown> { return this.channel.call({ kind: 'query', endpoint }, signal); }
  asset(path: string, signal?: AbortSignal): Promise<Uint8Array> { return this.channel.call({ kind: 'asset', path }, signal); }
  close(): void { this.channel.close(); }
}

async function operation<T>(value: Operation, signal?: AbortSignal, progress?: (value: Progress) => void): Promise<T> {
  const channel = new Channel();
  try { return await channel.call<T>(value, signal, progress); }
  finally { channel.close(); }
}

export function saved(signal?: AbortSignal): Promise<Saved[]> { return operation({ kind: 'list' }, signal); }
export function save(catalog: string, signal: AbortSignal, progress: (value: Progress) => void, base = '/api'): Promise<Saved> {
  return operation({ kind: 'save', catalog, base }, signal, progress);
}
export function remove(catalog: string, signal?: AbortSignal): Promise<void> { return operation({ kind: 'remove', catalog }, signal); }
