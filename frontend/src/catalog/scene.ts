import type { Cell, Rule } from '@elysium/contracts';
import { Diagram } from './diagram.ts';
import { Mesh } from './mesh.ts';
import type { Models } from './models.ts';

export type Vector = [number, number, number];
export interface Volume { size: Vector; cells: number; markers: Vector[]; palette: Array<{ label: string; air: boolean; color: Vector; group?: number; model?: string | null }> }
export interface Frame { rotation: Float32Array; center: Vector; scale: [number, number]; radius: number; picking: boolean; time: number }

export function ruleColor(index: number, rule?: Rule): Vector {
  if (index < 0) return [1, .68, .2];
  if (rule?.kind === 'air') return [.25, .55, 1];
  if (rule?.kind === 'solid') return [.65, .7, .75];
  const hue = (index * .618034 + .45) % 1;
  return [0, 1, 2].map(channel => .35 + .55 * (1 + Math.cos((hue + channel / 3) * Math.PI * 2)) / 2) as Vector;
}

/** Camera, filtering and picking are shared by rule diagrams and native textured models. */
export class Scene {
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext;
  private readonly renderer: Diagram | Mesh;
  private visible: Cell[] = [];
  private size: Vector = [1, 1, 1];
  private center: Vector = [.5, .5, .5];
  private readonly models: Models | null;
  yaw = Math.PI - .65;
  pitch = .45;
  zoom = .92;
  animate = false;

  constructor(canvas: HTMLCanvasElement, models: Models | null = null) {
    this.canvas = canvas; this.models = models;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error('浏览器未提供 WebGL2，无法显示三维结构。');
    this.gl = gl; this.renderer = models ? new Mesh(gl, models) : new Diagram(gl);
  }

  set(volume: Volume, cells: Cell[], layer: number, selected: number, air: boolean): void {
    if (cells.length !== volume.cells || cells.length > 1_048_576) throw new Error('结构几何数量与清单不一致');
    const key = (at: Vector): number => (at[2] * volume.size[1] + at[1]) * volume.size[0] + at[0];
    const missing = new Map(volume.markers.map(at => [key(at), at]));
    const minimum: Vector = [0, 0, 0], maximum: Vector = [...volume.size];
    this.visible = cells.filter(cell => {
      const state = volume.palette[cell.index];
      if (!state || cell.at.some((value, axis) => value < 0 || value >= volume.size[axis]!)) throw new Error('结构几何引用无效');
      missing.delete(key(cell.at));
      const bounds = state.model ? this.models?.bounds.get(state.model) : null;
      if (bounds) for (let axis = 0; axis < 3; axis++) {
        minimum[axis] = Math.min(minimum[axis]!, cell.at[axis]! + bounds.minimum[axis]!);
        maximum[axis] = Math.max(maximum[axis]!, cell.at[axis]! + bounds.maximum[axis]!);
      }
      const group = state.group ?? cell.index;
      return (layer < 0 || cell.at[1] === layer) && (selected < 0 || group === selected) && (air || !state.air || selected === group);
    });
    if (selected < 0) for (const at of missing.values()) if (layer < 0 || at[1] === layer) this.visible.push({ at, index: -1 });
    this.size = maximum.map((value, axis) => value - minimum[axis]!) as Vector;
    this.center = maximum.map((value, axis) => (value + minimum[axis]!) / 2) as Vector;
    this.renderer.set(volume, this.visible);
    if (this.gl.getError() !== this.gl.NO_ERROR) throw new Error('三维几何加载失败，请检查显卡资源');
    this.draw();
  }

  draw(picking = false): void {
    const gl = this.gl;
    if (gl.isContextLost() || this.models?.closed) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(this.canvas.clientWidth * ratio)), height = Math.max(1, Math.round(this.canvas.clientHeight * ratio));
    if (this.canvas.width !== width || this.canvas.height !== height) { this.canvas.width = width; this.canvas.height = height; }
    gl.viewport(0, 0, width, height); gl.enable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.DITHER); gl.depthMask(true);
    const background = picking ? [0, 0, 0] : [.025, .045, .07];
    gl.clearColor(background[0]!, background[1]!, background[2]!, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw), cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const radius = Math.max(1, Math.hypot(...this.size) / 2);
    this.renderer.draw({ rotation: new Float32Array([cy, -sy * sp, sy * cp, 0, cp, sp, -sy, -cy * sp, cy * cp]),
      center: this.center, scale: [this.zoom / radius * height / width, this.zoom / radius], radius, picking,
      time: this.animate ? performance.now() : 0 });
  }

  pick(clientX: number, clientY: number): Cell | null {
    const bounds = this.canvas.getBoundingClientRect(), gl = this.gl;
    this.draw(true);
    const x = Math.floor((clientX - bounds.left) * this.canvas.width / bounds.width);
    const y = this.canvas.height - 1 - Math.floor((clientY - bounds.top) * this.canvas.height / bounds.height);
    const pixel = new Uint8Array(4);
    gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel); this.draw();
    const id = pixel[0]! + pixel[1]! * 256 + pixel[2]! * 65536;
    return this.visible[id - 1] ?? null;
  }

  reset(): void { this.yaw = Math.PI - .65; this.pitch = .45; this.zoom = .92; this.draw(); }
  dispose(): void { this.visible = []; this.renderer.dispose(); }
}
