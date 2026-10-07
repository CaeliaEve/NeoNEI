import type { Manifest } from '@elysium/contracts';
import { ApiError } from '../catalog/transport.ts';
import type { Operation, Opened, Progress, Reply, Saved } from './protocol.ts';

export type { Progress, Saved };

interface Pending {
  operation: Operation;
  started: boolean;
  cancelled: boolean;
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
  private readonly queue: number[] = [];
  private active = 0;
  private sequence = 0;
  private closed = false;
  constructor() {
    if (!available()) throw new ApiError('offline_unavailable', '离线读取需要支持本地存储的浏览器，并通过 HTTPS 或 localhost 打开');
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.worker.addEventListener('message', event => {
      const reply = event.data as Reply;
      const pending = this.pending.get(reply.id);
      if (!pending) return;
      if ('progress' in reply) { if (!pending.cancelled) pending.progress?.(reply.progress); return; }
      this.pending.delete(reply.id); pending.signal?.removeEventListener('abort', pending.abort);
      if (pending.started) this.active--;
      if (!pending.cancelled) {
        if ('error' in reply) pending.reject(new ApiError(reply.error.code, reply.error.message, reply.error.status));
        else pending.resolve(reply.value);
      }
      this.drain();
    });
    this.worker.addEventListener('error', event => {
      event.preventDefault(); this.close(new ApiError('offline_worker', '离线读取进程无法运行，请刷新后重试'));
    });
    this.worker.addEventListener('messageerror', () => this.close(new ApiError('offline_message', '离线数据传输失败')));
  }

  call<T>(operation: Operation, signal?: AbortSignal, progress?: (value: Progress) => void): Promise<T> {
    if (this.closed || signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
    if (this.pending.size >= 2048) return Promise.reject(new ApiError('offline_busy', '离线请求队列已满，请稍后重试', 429));
    const id = ++this.sequence;
    return new Promise<T>((resolve, reject) => {
      const abort = (): void => {
        const pending = this.pending.get(id);
        if (!pending || pending.cancelled) return;
        pending.cancelled = true;
        if (pending.started) this.worker.postMessage({ cancel: id });
        else {
          this.pending.delete(id);
          const index = this.queue.indexOf(id);
          if (index >= 0) this.queue.splice(index, 1);
        }
        reject(new DOMException('Aborted', 'AbortError'));
        this.drain();
      };
      this.pending.set(id, { operation, started: false, cancelled: false, resolve: value => resolve(value as T), reject, signal, abort, progress });
      signal?.addEventListener('abort', abort, { once: true });
      this.queue.push(id);
      this.drain();
    });
  }

  private drain(): void {
    while (!this.closed && this.active < 8 && this.queue.length) {
      const id = this.queue.shift()!, pending = this.pending.get(id);
      if (!pending) continue;
      pending.started = true; this.active++;
      try { this.worker.postMessage({ id, operation: pending.operation }); }
      catch (error) {
        this.active--; this.pending.delete(id);
        pending.signal?.removeEventListener('abort', pending.abort);
        pending.reject(error);
      }
    }
  }

  close(error: unknown = new DOMException('Aborted', 'AbortError')): void {
    if (this.closed) return;
    this.closed = true; this.worker.terminate();
    for (const pending of this.pending.values()) {
      pending.signal?.removeEventListener('abort', pending.abort); pending.reject(error);
    }
    this.pending.clear(); this.queue.length = 0; this.active = 0;
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
