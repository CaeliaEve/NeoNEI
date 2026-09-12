import type { Cell, Face } from '@elysium/contracts';
import { frameAt } from './atlas.ts';
import { Diagram } from './diagram.ts';
import { program } from './gpu.ts';
import type { Models, Paint } from './models.ts';
import type { Frame, Volume, Vector } from './scene.ts';

const vertex = `#version 300 es
precision highp float;
layout(location=0) in vec3 position;
layout(location=1) in vec2 texcoord;
layout(location=2) in vec4 color;
layout(location=3) in vec4 instance;
uniform mat3 rotation;
uniform vec3 center;
uniform vec2 scale;
uniform float radius;
uniform bool single;
uniform vec4 placement;
out vec2 uv;
out vec4 tint;
flat out uint identity;
void main() {
  vec4 cell = single ? placement : instance;
  vec3 point = cell.xyz + position - center;
  point.y = -point.y;
  vec3 view = rotation * point;
  gl_Position = vec4(view.xy * scale, -view.z / (radius * 4.), 1.);
  uv = texcoord; tint = color; identity = uint(cell.w);
}`;
const fragment = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D current;
uniform sampler2D next;
uniform float blend;
uniform bool picking;
in vec2 uv;
in vec4 tint;
flat in uint identity;
out vec4 pixel;
void main() {
  vec4 color = mix(texture(current, uv), texture(next, uv), blend) * tint;
  if (color.a <= .1) discard;
  pixel = picking ? vec4(vec3(identity & 255u, (identity >> 8u) & 255u, (identity >> 16u) & 255u) / 255., 1.) : color;
}`;

interface Batch { vertices: WebGLBuffer; layout: WebGLVertexArrayObject; count: number; texture: string; blend: boolean; centers: Vector[] }
interface Group { instances: WebGLBuffer; data: Float32Array; batches: Batch[] }
interface Draw { group: Group; batch: Batch; offset: number; face: number; depth: number }
interface TextureState { paint: Paint; first: WebGLTexture; second: WebGLTexture | null; index: number; next: number }

/** Opaque faces are instanced; translucent faces keep global depth order across placements and materials. */
export class Mesh {
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly uniforms: Record<string, WebGLUniformLocation | null>;
  private readonly groups = new Map<string, Group>();
  private readonly textures = new Map<string, TextureState>();
  private readonly source: Models;
  private markers: Diagram | null = null;
  private transparent: Draw[] = [];
  private order = '';

  constructor(gl: WebGL2RenderingContext, source: Models) {
    this.gl = gl; this.source = source; this.program = program(gl, vertex, fragment);
    this.uniforms = Object.fromEntries(['rotation', 'center', 'scale', 'radius', 'picking', 'current', 'next', 'blend', 'single', 'placement']
      .map(name => [name, gl.getUniformLocation(this.program, name)]));
    try {
      this.markers = new Diagram(gl, true);
      for (const model of source.rows.values()) {
        const instances = gl.createBuffer();
        if (!instances) throw new Error('无法分配模型实例缓冲区');
        const group: Group = { instances, data: new Float32Array(), batches: [] }; this.groups.set(model.id, group);
        const materials = new Map<string, Face[]>();
        for (const face of model.faces) {
          const key = face.pass + ':' + face.texture, faces = materials.get(key) ?? [];
          faces.push(face); materials.set(key, faces);
        }
        for (const faces of materials.values()) this.create(group, faces);
      }
      if (gl.getError() !== gl.NO_ERROR) throw new Error('模型几何无法上传到显卡');
    } catch (error) { this.dispose(); throw error; }
  }

  private create(group: Group, faces: Face[]): void {
    const gl = this.gl, data = new Float32Array(faces.length * 6 * 9);
    let offset = 0;
    for (const face of faces) for (const corner of [0, 1, 2, 0, 2, 3]) {
      const point = face.vertices[corner]!;
      const position = point.at.map(Number), uv = point.uv.map(Number);
      if (position.some(value => !Number.isFinite(value) || Math.abs(value) > 256) || uv.some(value => !Number.isFinite(value) || value < 0 || value > 1)) throw new Error('模型顶点或纹理坐标无效');
      data.set([...position, ...uv, (point.color >>> 24) / 255, ((point.color >>> 16) & 255) / 255, ((point.color >>> 8) & 255) / 255, (point.color & 255) / 255], offset);
      offset += 9;
    }
    const vertices = gl.createBuffer(), layout = gl.createVertexArray();
    if (!vertices || !layout) { gl.deleteBuffer(vertices); gl.deleteVertexArray(layout); throw new Error('无法分配模型几何缓冲区'); }
    const blend = faces[0]!.pass === 'blend';
    const centers = blend ? faces.map(face => [0, 1, 2].map(axis => face.vertices.reduce((sum, vertex) => sum + Number(vertex.at[axis]), 0) / 4) as Vector) : [];
    group.batches.push({ vertices, layout, count: faces.length * 6, texture: faces[0]!.texture, blend, centers });
    gl.bindVertexArray(layout); gl.bindBuffer(gl.ARRAY_BUFFER, vertices); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 36, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 36, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 36, 20);
    gl.bindBuffer(gl.ARRAY_BUFFER, group.instances); gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 16, 0); gl.vertexAttribDivisor(3, 1);
    gl.bindVertexArray(null);
  }

  set(volume: Volume, cells: Cell[]): void {
    const counts = new Map<string, number>(), offsets = new Map<string, number>();
    for (const cell of cells) {
      const id = volume.palette[cell.index]?.model;
      if (id) { if (!this.groups.has(id)) throw new Error('放置位置引用了缺失的模型'); counts.set(id, (counts.get(id) ?? 0) + 1); }
    }
    for (const [id, group] of this.groups) group.data = new Float32Array((counts.get(id) ?? 0) * 4);
    cells.forEach((cell, index) => {
      const id = volume.palette[cell.index]?.model;
      if (!id) return;
      const offset = offsets.get(id) ?? 0, data = this.groups.get(id)!.data;
      data.set(cell.at, offset); data[offset + 3] = index + 1; offsets.set(id, offset + 4);
    });
    this.transparent = []; this.order = '';
    for (const group of this.groups.values()) {
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, group.instances); this.gl.bufferData(this.gl.ARRAY_BUFFER, group.data, this.gl.STATIC_DRAW);
      for (const batch of group.batches) if (batch.blend) for (let offset = 0; offset < group.data.length; offset += 4) for (let face = 0; face < batch.centers.length; face++) {
        if (this.transparent.length >= 100000) throw new Error('透明表面超过当前视图预算，请切换到较小的高度层');
        this.transparent.push({ group, batch, offset, face, depth: 0 });
      }
    }
    this.markers!.set(volume, cells);
  }

  private texture(): WebGLTexture {
    const gl = this.gl, result = gl.createTexture();
    if (!result) throw new Error('无法分配模型纹理');
    gl.bindTexture(gl.TEXTURE_2D, result);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return result;
  }

  private paint(id: string, time: number): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    let state = this.textures.get(id);
    if (!state) {
      const paint = this.source.paints.get(id);
      if (!paint || !paint.frames.length) throw new Error('模型缺少纹理帧');
      state = { paint, first: this.texture(), second: null, index: -1, next: -1 }; this.textures.set(id, state);
    }
    const frame = frameAt(state.paint.texture, time);
    gl.bindTexture(gl.TEXTURE_2D, state.first);
    if (state.index !== frame.index) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, state.paint.frames[frame.index]!); state.index = frame.index;
    }
    gl.activeTexture(gl.TEXTURE1);
    if (frame.blend > 0) {
      state.second ??= this.texture(); gl.bindTexture(gl.TEXTURE_2D, state.second);
      if (state.next !== frame.next) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, state.paint.frames[frame.next]!); state.next = frame.next;
      }
    } else gl.bindTexture(gl.TEXTURE_2D, state.first);
    gl.uniform1f(this.uniforms.blend!, frame.blend);
  }

  draw(frame: Frame): void {
    if (this.source.closed) return;
    const gl = this.gl, uniform = this.uniforms;
    gl.enable(gl.CULL_FACE); gl.frontFace(gl.CW); gl.cullFace(gl.BACK); gl.disable(gl.BLEND); gl.depthMask(true); gl.depthFunc(gl.LESS);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.useProgram(this.program); gl.uniformMatrix3fv(uniform.rotation!, false, frame.rotation);
    gl.uniform3fv(uniform.center!, frame.center); gl.uniform2fv(uniform.scale!, frame.scale); gl.uniform1f(uniform.radius!, frame.radius);
    gl.uniform1i(uniform.picking!, frame.picking ? 1 : 0); gl.uniform1i(uniform.current!, 0); gl.uniform1i(uniform.next!, 1); gl.uniform1i(uniform.single!, 0);
    for (const group of this.groups.values()) if (group.data.length) for (const batch of group.batches) if (!batch.blend || frame.picking) {
      this.paint(batch.texture, frame.time); gl.bindVertexArray(batch.layout); gl.drawArraysInstanced(gl.TRIANGLES, 0, batch.count, group.data.length / 4);
    }
    if (!frame.picking && this.transparent.length) {
      const order = frame.rotation.join(',');
      if (order !== this.order) {
        for (const draw of this.transparent) {
          const data = draw.group.data, at = draw.offset, center = draw.batch.centers[draw.face]!;
          draw.depth = frame.rotation[2]! * (data[at]! + center[0]) - frame.rotation[5]! * (data[at + 1]! + center[1]) + frame.rotation[8]! * (data[at + 2]! + center[2]);
        }
        this.transparent.sort((a, b) => a.depth - b.depth); this.order = order;
      }
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); gl.uniform1i(uniform.single!, 1);
      for (const draw of this.transparent) {
        this.paint(draw.batch.texture, frame.time); gl.bindVertexArray(draw.batch.layout);
        gl.uniform4fv(uniform.placement!, draw.group.data.subarray(draw.offset, draw.offset + 4));
        gl.drawArraysInstanced(gl.TRIANGLES, draw.face * 6, 6, 1);
      }
    }
    gl.bindVertexArray(null); gl.depthMask(true); gl.disable(gl.BLEND); gl.frontFace(gl.CCW);
    this.markers!.draw(frame);
    if (gl.getError() !== gl.NO_ERROR) throw new Error('模型或纹理绘制失败，请检查显卡资源');
  }

  dispose(): void {
    for (const group of this.groups.values()) {
      this.gl.deleteBuffer(group.instances);
      for (const batch of group.batches) { this.gl.deleteBuffer(batch.vertices); this.gl.deleteVertexArray(batch.layout); }
    }
    for (const texture of this.textures.values()) { this.gl.deleteTexture(texture.first); this.gl.deleteTexture(texture.second); }
    this.groups.clear(); this.textures.clear(); this.transparent = [];
    this.markers?.dispose(); this.markers = null; this.gl.deleteProgram(this.program);
  }
}
