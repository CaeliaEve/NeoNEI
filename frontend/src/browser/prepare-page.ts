import type {Item} from '../services/api';
import {session} from '../services/api/elysiumFacade';
import {residentFrame, residentSourceFrame,claimResidentCanvas} from './resident';
import {recipeVisualFrame} from './recipe-visuals';
import {withFrameFallback} from './visual-mapping';
import type {Lease} from '../catalog/atlas';

export interface BrowserPageInput { items: Item[]; page: number; context: string }
export interface PreparedBrowserPage extends BrowserPageInput { frames: Map<string, HTMLCanvasElement | null> }

/** Draw complete native-size static first frames off-screen, within the existing decoded atlas budget. */
export async function prepareBrowserPage(input: BrowserPageInput, signal: AbortSignal) {
  const controller = new AbortController();
  const active = AbortSignal.any([signal, controller.signal, AbortSignal.timeout(10000)]);
  const frames = new Map<string, HTMLCanvasElement | null>();
  const reservations:Array<()=>void>=[];
  const dispose = () => { for (const canvas of frames.values()) if (canvas) { canvas.width = 0; canvas.height = 0; } frames.clear();for(const release of reservations.splice(0))release(); };
  let failure: unknown;
  const catalog = input.items.some(item => !(typeof item.residentSprite === 'number' && item.residentSprite >= 0))
    ? await session() : null;
  active.throwIfAborted();
  const results = await Promise.allSettled(input.items.map(async item => {
    let lease: Lease | null = null;
    try {
      active.throwIfAborted();
      if (typeof item.residentSprite === 'number' && item.residentSprite >= 0) {
        lease = await residentFrame(item.residentSprite, active, 0);
      } else {
        const entry = await catalog!.record('browse', item.itemId, active);
        const texture = entry.icon ? await catalog!.record('textures', entry.icon, active) : null;
        if (!texture) { frames.set(item.itemId, null); return; }
        const first = texture.frames[0]!;
        lease = await withFrameFallback(recipeVisualFrame(first, catalog!.manifest.id, active, 0),
          () => residentSourceFrame(first, catalog!.manifest.id, active, 0) ?? catalog!.atlas.acquireFrame(first, active, 0), active);
      }
      active.throwIfAborted();
      const frame = lease.frame;
      const width=frame?.width??lease.image.width,height=frame?.height??lease.image.height;
      reservations.push(catalog?catalog.atlas.claimVisualBytes(width*height*4):claimResidentCanvas(width*height*4));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('无法创建物品首帧缓冲');
      context.imageSmoothingEnabled = false;
      if (frame) context.drawImage(lease.image, frame.x, frame.y, frame.width, frame.height, 0, 0, canvas.width, canvas.height);
      else context.drawImage(lease.image, 0, 0);
      // Transparent native icons are valid: readiness means successful drawing, not nonzero alpha.
      frames.set(item.itemId, canvas);
    } catch (error) {
      failure ??= error;
      controller.abort();
      throw error;
    } finally { lease?.release(); }
  }));
  if (results.some(result => result.status === 'rejected') || active.aborted) {
    dispose();
    throw failure ?? active.reason;
  }
  return {value: {...input, frames} satisfies PreparedBrowserPage, dispose};
}
