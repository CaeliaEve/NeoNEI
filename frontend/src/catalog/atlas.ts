import type { File, Manifest, Texture } from '@elysium/contracts';
import { hash } from '@neonei/catalog/source';
import { body } from './transport.ts';

interface Page { image: ImageBitmap; bytes: number; refs: number }
export interface Lease { image: ImageBitmap; release: () => void }
type Source = (file: File, signal: AbortSignal) => Promise<Uint8Array>;

/** Shared decoded pages are counted once and retained only while visible consumers use them. */
export class Atlas {
  private readonly manifest: Manifest;
  private readonly base: string;
  private readonly signal: AbortSignal;
  private readonly source?: Source;
  private readonly controller = new AbortController();
  private readonly pages = new Map<string, Page>();
  private readonly pending = new Map<string, Promise<Page>>();
  private readonly waiting = new Map<string, number>();
  private readonly queue: Array<() => void> = [];
  private bytes = 0;
  private active = 0;
  private closed = false;
  private readonly budget = 192 * 1024 * 1024;

  constructor(manifest: Manifest, base: string, signal: AbortSignal, source?: Source) {
    this.manifest = manifest; this.base = base; this.signal = AbortSignal.any([signal, this.controller.signal]); this.source = source;
  }

  async acquire(path: string, signal?: AbortSignal): Promise<Lease> {
    if (this.closed || this.signal.aborted || signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    this.waiting.set(path, (this.waiting.get(path) ?? 0) + 1);
    try {
      let loading = this.pending.get(path);
      const cached = this.pages.get(path);
      if (!cached && !loading) {
        loading = new Promise<Page>((resolve, reject) => {
          this.queue.push(() => {
            this.active++;
            void this.load(path).then(resolve, reject).finally(() => { this.active--; this.drain(); });
          });
          this.drain();
        }).finally(() => this.pending.delete(path));
        this.pending.set(path, loading);
      }
      const page = cached ?? await loading!;
      if (this.closed || this.signal.aborted || signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      page.refs++;
      this.pages.delete(path); this.pages.set(path, page);
      let released = false;
      return { image: page.image, release: () => { if (!released) { released = true; page.refs--; } } };
    } finally {
      const count = this.waiting.get(path)! - 1;
      if (count) this.waiting.set(path, count); else this.waiting.delete(path);
    }
  }

  private drain(): void {
    while (this.active < 3 && this.queue.length) this.queue.shift()!();
  }

  private async load(path: string): Promise<Page> {
    this.signal.throwIfAborted();
    const file = this.manifest.files.find(file => file.kind === 'image' && file.path === path);
    if (!file || path !== 'textures/' + file.sha256 + '.webp' || file.bytes > 80 * 1024 * 1024) throw new Error('纹理未在数据集中声明');
    let bytes: Uint8Array;
    if (this.source) bytes = await this.source(file, this.signal);
    else {
      const response = await fetch(this.base + '/' + path, { signal: this.signal });
      if (!response.ok) { await response.body?.cancel(); throw new Error('纹理请求失败：' + response.status); }
      bytes = await body(response, file.bytes, file.bytes);
    }
    if (bytes.byteLength !== file.bytes) throw new Error('纹理长度与清单不一致');
    if (await hash(bytes) !== file.sha256) throw new Error('纹理校验失败');
    const content = bytes.buffer instanceof ArrayBuffer ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength) : new Uint8Array(bytes);
    const image = await createImageBitmap(new Blob([content], { type: 'image/webp' }));
    const size = image.width * image.height * 4;
    if (this.closed || this.signal.aborted || image.width > 4096 || image.height > 4096) {
      image.close();
      throw new Error('纹理尺寸无效或会话已关闭');
    }
    while (this.bytes + size > this.budget) {
      const unused = [...this.pages].find(([key, page]) => page.refs === 0 && !this.waiting.has(key));
      if (!unused) { image.close(); throw new Error('当前可见纹理超出内存预算，请缩小每页数量'); }
      unused[1].image.close(); this.bytes -= unused[1].bytes; this.pages.delete(unused[0]);
    }
    const page = { image, bytes: size, refs: 0 };
    this.bytes += size; this.pages.set(path, page);
    return page;
  }

  close(): void {
    this.closed = true;
    this.controller.abort();
    for (const page of this.pages.values()) page.image.close();
    this.pages.clear(); this.bytes = 0;
  }
}

export function frameAt(texture: Texture, milliseconds: number): { index: number; next: number; blend: number } {
  const current = stepAt(texture.frames, milliseconds);
  return { index: current.index, next: (current.index + 1) % texture.frames.length, blend: texture.interpolate ? current.fraction : 0 };
}

export function stepAt(frames: ReadonlyArray<{ ticks: number }>, milliseconds: number): { index: number; fraction: number } {
  const duration = frames.reduce((sum, frame) => sum + frame.ticks * 50, 0);
  if (!frames.length || !Number.isFinite(milliseconds) || !Number.isFinite(duration) || duration <= 0) throw new Error('动画时间线无效');
  let time = Math.max(0, milliseconds) % duration;
  for (let index = 0; index < frames.length; index++) {
    const length = frames[index]!.ticks * 50;
    if (length <= 0 || !Number.isInteger(frames[index]!.ticks)) throw new Error('动画时间线无效');
    if (time < length) return { index, fraction: time / length };
    time -= length;
  }
  throw new Error('动画时间线无效');
}
