import { canonical, type Build, type Model, type Texture } from '@elysium/contracts';
import type { Catalog } from './client.ts';

export interface Paint { texture: Texture; frames: ImageBitmap[] }

/** Cropped sprite frames have a separate bounded lifetime; large shared atlas pages can be released immediately. */
export class Models {
  readonly rows = new Map<string, Model>();
  readonly paints = new Map<string, Paint>();
  readonly bounds = new Map<string, { minimum: [number, number, number]; maximum: [number, number, number] }>();
  closed = false;
  get animated(): boolean { return [...this.paints.values()].some(paint => paint.frames.length > 1); }
  get smooth(): boolean { return [...this.paints.values()].some(paint => paint.texture.interpolate && paint.frames.length > 1); }

  static async load(catalog: Catalog, build: Build, signal: AbortSignal): Promise<Models> {
    const result = new Models(), textures = new Map<string, Texture>();
    signal.addEventListener('abort', () => result.close(), { once: true });
    try {
      const ids = [...new Set(build.palette.flatMap(entry => entry.model ? [entry.model] : []))];
      let faces = 0;
      for (let offset = 0; offset < ids.length;) {
        signal.throwIfAborted();
        const page = await catalog.models(build.id, offset, signal);
        if (page.offset !== offset || page.total !== ids.length || !page.rows.length) throw new Error('模型分页与构建引用不一致');
        for (const [index, model] of page.rows.entries()) {
          if (model.id !== ids[offset + index]) throw new Error('返回的模型与构建引用不一致');
          faces += model.faces.length;
          if (faces > 262144) throw new Error('当前结构的三维模型超过视图预算');
          result.rows.set(model.id, model);
          if (model.hidden !== (model.faces.length === 0)) throw new Error('模型可见状态与几何不一致');
          const minimum: [number, number, number] = [Infinity, Infinity, Infinity], maximum: [number, number, number] = [-Infinity, -Infinity, -Infinity];
          for (const face of model.faces) for (const vertex of face.vertices) for (let axis = 0; axis < 3; axis++) {
            const value = Number(vertex.at[axis]);
            if (!Number.isFinite(value) || Math.abs(value) > 256) throw new Error('模型坐标超出支持范围');
            minimum[axis] = Math.min(minimum[axis]!, value); maximum[axis] = Math.max(maximum[axis]!, value);
          }
          if (!model.hidden) result.bounds.set(model.id, { minimum, maximum });
        }
        for (const texture of page.textures) {
          const previous = textures.get(texture.id);
          if (previous && canonical(previous) !== canonical(texture)) throw new Error('模型纹理在不同分页中不一致');
          textures.set(texture.id, texture);
        }
        offset += page.rows.length;
      }
      const used = new Set([...result.rows.values()].flatMap(model => model.faces.map(face => face.texture)));
      if (used.size !== textures.size || [...used].some(id => !textures.has(id))) throw new Error('模型纹理引用缺失或包含多余记录');
      let bytes = 0;
      // Acquire one atlas page at a time. Retaining all pages used by a machine can exceed the atlas cache budget.
      for (const texture of textures.values()) {
        bytes += texture.width * texture.height * texture.frames.length * 4;
        if (bytes > 128 * 1024 * 1024) throw new Error('当前结构的模型纹理超过视图预算');
        const paint: Paint = { texture, frames: [] }; result.paints.set(texture.id, paint);
        for (const frame of texture.frames) {
          signal.throwIfAborted();
          const lease = await catalog.atlas.acquire(frame.path, signal);
          try {
            if (frame.width !== texture.width || frame.height !== texture.height || frame.x + frame.width > lease.image.width || frame.y + frame.height > lease.image.height) {
              throw new Error('模型纹理区域超出图集边界');
            }
            const bitmap = await createImageBitmap(lease.image, frame.x, frame.y, frame.width, frame.height, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
            if (signal.aborted || result.closed) { bitmap.close(); signal.throwIfAborted(); throw new Error('模型读取已关闭'); }
            paint.frames.push(bitmap);
          } finally { lease.release(); }
        }
      }
      signal.throwIfAborted();
      return result;
    } catch (error) { result.close(); throw error; }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const paint of this.paints.values()) paint.frames.forEach(frame => frame.close());
    this.paints.clear(); this.rows.clear(); this.bounds.clear();
  }
}
