import type { File, Manifest, Texture } from '@elysium/contracts';
import { hash } from '@neonei/catalog/source';
import { body } from './transport.ts';
import {PriorityPool} from '../browser/priority-pool.ts';

interface Page { image: ImageBitmap; bytes: number; refs: number }
export interface Lease { image: ImageBitmap; frame?: Pick<Texture['frames'][number],'x'|'y'|'width'|'height'>; release: () => void }
type Source = (file: File, signal: AbortSignal) => Promise<Uint8Array>;

/** Shared decoded pages are counted once and retained only while visible consumers use them. */
export class Atlas {
  private static readonly instances=new Set<Atlas>();
  private static readonly decodedBudget=192*1024*1024;
  readonly catalogId:string;
  private readonly manifest: Pick<Manifest, 'files'>;
  private readonly base: string;
  private readonly signal: AbortSignal;
  private readonly source?: Source;
  private readonly controller = new AbortController();
  private readonly pages = new Map<string, Page>();
  private readonly pool = new PriorityPool<Page>(3);
  private readonly waiting = new Map<string, number>();
  private readonly sprites = new Map<string, Page>();
  private spriteBytes = 0;
  private readonly spriteQueue: Array<{ path: string; priority:number; run: () => Promise<void> }> = [];
  private spriteActive = false;
  private readonly spriteBudget = 64 * 1024 * 1024;
  private bytes = 0;
  private closed = false;
  private readonly budget: number;

  constructor(manifest: Pick<Manifest, 'files'> & Partial<Pick<Manifest,'id'>>, base: string, signal: AbortSignal, source?: Source, budget = 192 * 1024 * 1024) {
    this.catalogId=manifest.id??'';
    this.budget = budget;
    this.manifest = manifest; this.base = base; this.signal = AbortSignal.any([signal, this.controller.signal]); this.source = source;
    Atlas.instances.add(this);
  }

  async acquire(path: string, signal?: AbortSignal, priority=0): Promise<Lease> {
    if (this.closed || this.signal.aborted || signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    this.waiting.set(path, (this.waiting.get(path) ?? 0) + 1);
    try {
      const cached = this.pages.get(path);
      const page = cached ?? await this.pool.run(path, active => this.load(path, active), signal, priority);
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

  /** Copy only the requested frame; serialize copies so readers never pin several pages while waiting. */
  acquireFrame(frame: Texture['frames'][number], signal?: AbortSignal,priority=0): Promise<Lease> {
    const run = async (): Promise<Lease> => {
      const check = (): void => {
        if (this.closed || this.signal.aborted || signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      };
      check();
      const { path, x, y, width, height } = frame;
      if (![x, y, width, height].every(Number.isSafeInteger) || x < 0 || y < 0 || width <= 0 || height <= 0)
        throw new Error('纹理裁剪超出图集范围');
      const key = JSON.stringify([path, x, y, width, height]);
      let sprite = this.sprites.get(key);
      if (!sprite) {
        const bytes = width * height * 4;
        this.trimSprites(bytes);
        const page = await this.acquire(path, signal,priority);
        try {
          check();
          if (x + width > page.image.width || y + height > page.image.height) throw new Error('纹理裁剪超出图集范围');
          this.makeRoom(bytes);
          const image = await createImageBitmap(page.image, x, y, width, height);
          try { check(); } catch (failure) { image.close(); throw failure; }
          sprite = { image, bytes, refs: 0 };
          this.sprites.set(key, sprite); this.spriteBytes += bytes;
        } finally { page.release(); }
      }
      this.sprites.delete(key); this.sprites.set(key, sprite);
      sprite.refs++;
      const retained = sprite;
      let released = false;
      return { image: retained.image, release: () => {
        if (released) return;
        released = true;
        retained.refs--;
      } };
    };
    if(this.sprites.has(JSON.stringify([frame.path,frame.x,frame.y,frame.width,frame.height])))return run();
    return new Promise<Lease>((resolve, reject) => {
      const abort=()=>{
        const index=this.spriteQueue.indexOf(job);
        if(index>=0){this.spriteQueue.splice(index,1);reject(new DOMException('Aborted','AbortError'));}
      };
      const job={path:frame.path,priority,run:async()=>{
        signal?.removeEventListener('abort',abort);
        try{resolve(await run());}catch(error){reject(error);}
      }};
      this.spriteQueue.push(job);
      signal?.addEventListener('abort',abort,{once:true});
      if(signal?.aborted)abort();
      this.drainSprites();
    });
  }

  private drainSprites(): void {
    if (this.spriteActive || !this.spriteQueue.length) return;
    // First paint precedes speculative/animation copies, even when the latter's atlas is resident.
    const priority=Math.min(...this.spriteQueue.map(job=>job.priority));
    const resident=this.spriteQueue.findIndex(job=>job.priority===priority&&this.pages.has(job.path));
    const index=resident<0?this.spriteQueue.findIndex(job=>job.priority===priority):resident;
    const job = this.spriteQueue.splice(index, 1)[0]!;
    this.spriteActive = true;
    void job.run().finally(() => { this.spriteActive = false; this.drainSprites(); });
  }

  private evictSprite(): boolean {
    const unused = [...this.sprites].find(([, sprite]) => sprite.refs === 0);
    if (!unused) return false;
    unused[1].image.close(); this.spriteBytes -= unused[1].bytes; this.sprites.delete(unused[0]);
    return true;
  }

  private trimSprites(size: number): void {
    while (this.spriteBytes + size > this.spriteBudget) {
      if (!this.evictSprite()) throw new Error('可见图标帧超出内存预算');
    }
  }

  private async load(path: string, consumer:AbortSignal): Promise<Page> {
    const signal=AbortSignal.any([this.signal,consumer]);signal.throwIfAborted();
    const file = this.manifest.files.find(file => file.kind === 'image' && file.path === path);
    if (!file || !['textures/' + file.sha256 + '.webp','textures/' + file.sha256 + '.png'].includes(path) || file.bytes > 80 * 1024 * 1024) throw new Error('纹理未在数据集中声明');
    let bytes: Uint8Array;
    if (this.source) bytes = await this.source(file, signal);
    else {
      const response = await fetch(this.base + '/' + path, { signal });
      if (!response.ok) { await response.body?.cancel(); throw new Error('纹理请求失败：' + response.status); }
      bytes = await body(response, file.bytes, file.bytes);
    }
    if (bytes.byteLength !== file.bytes) throw new Error('纹理长度与清单不一致');
    if (await hash(bytes) !== file.sha256) throw new Error('纹理校验失败');
    const content = bytes.buffer instanceof ArrayBuffer ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength) : new Uint8Array(bytes);
    const image = await createImageBitmap(new Blob([content], { type: path.endsWith('.png') ? 'image/png' : 'image/webp' }));
    const size = image.width * image.height * 4;
    if (this.closed || signal.aborted || image.width > 4096 || image.height > 4096) {
      image.close();
      throw new Error('纹理尺寸无效或会话已关闭');
    }
    try { this.makeRoom(size); } catch (failure) { image.close(); throw failure; }
    const page = { image, bytes: size, refs: 0 };
    this.bytes += size; this.pages.set(path, page);
    return page;
  }

  private makeRoom(size: number): void {
    while (this.bytes + this.spriteBytes + size > this.budget) {
      if(!this.evictUnused())throw new Error('当前可见纹理超出内存预算，请缩小每页数量');
    }
    const weight=()=>[...Atlas.instances].reduce((n,a)=>n+a.bytes+a.spriteBytes,0);
    while(weight()+size>Atlas.decodedBudget){
      if(![...Atlas.instances].some(atlas=>atlas.evictUnused()))throw new Error('当前可见纹理超出共享内存预算');
    }
  }

  private evictUnused():boolean {
    const unused=[...this.pages].find(([key,page])=>page.refs===0&&!this.waiting.has(key));
    if(!unused)return this.evictSprite();
    unused[1].image.close();this.bytes-=unused[1].bytes;this.pages.delete(unused[0]);return true;
  }

  close(): void {
    Atlas.instances.delete(this);
    this.closed = true;
    this.pool.close();
    this.controller.abort();
    for (const page of this.pages.values()) page.image.close();
    this.pages.clear(); this.bytes = 0;
    for (const sprite of this.sprites.values()) sprite.image.close();
    this.sprites.clear(); this.spriteBytes = 0;
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
