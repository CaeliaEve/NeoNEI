import type { Cell } from '@elysium/contracts';
import { program } from './gpu.ts';
import { ruleColor, type Frame, type Volume } from './scene.ts';

const vertex = `#version 300 es
precision highp float;
layout(location=0) in vec3 position;
layout(location=1) in vec3 normal;
layout(location=2) in vec3 instance;
layout(location=3) in vec3 color;
uniform mat3 rotation;
uniform vec3 center;
uniform vec2 scale;
uniform float radius;
out vec3 shade;
flat out uint identity;
void main() {
  vec3 point = instance + vec3(.5) - center;
  point.y = -point.y;
  vec3 view = rotation * (point + position);
  gl_Position = vec4(view.xy * scale, -view.z / (radius * 4.), 1.);
  shade = color * (.62 + .38 * max(0., dot(rotation * normal, normalize(vec3(.4,.8,1.)))));
  identity = uint(gl_InstanceID) + 1u;
}`;
const fragment = `#version 300 es
precision highp float;
precision highp int;
in vec3 shade;
flat in uint identity;
uniform bool picking;
out vec4 pixel;
void main() {
  pixel = picking ? vec4(vec3(identity & 255u, (identity >> 8u) & 255u, (identity >> 16u) & 255u) / 255., 1.) : vec4(shade, 1.);
}`;

function cube(wire: boolean): Float32Array {
  const vertices: number[] = [], extent = wire ? .503 : .47;
  for (let axis = 0; axis < 3; axis++) for (const sign of [-1, 1]) {
    const normal = [0, 0, 0]; normal[axis] = sign;
    for (const corner of wire ? [0, 1, 1, 2, 2, 3, 3, 0] : [0, 1, 2, 0, 2, 3]) {
      const position = [0, 0, 0]; position[axis] = sign * extent;
      position[(axis + 1) % 3] = (corner === 0 || corner === 3 ? -1 : 1) * extent;
      position[(axis + 2) % 3] = (corner < 2 ? -1 : 1) * extent;
      vertices.push(...position, ...normal);
    }
  }
  return new Float32Array(vertices);
}

/** Instanced schematic cubes, also used for controller outlines over native models. */
export class Diagram {
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly vertices: WebGLBuffer;
  private readonly instances: WebGLBuffer;
  private readonly layout: WebGLVertexArrayObject;
  private readonly uniforms: Record<string, WebGLUniformLocation | null>;
  private readonly wire: boolean;
  private count = 0;

  constructor(gl: WebGL2RenderingContext, wire = false) {
    this.gl = gl; this.wire = wire; this.program = program(gl, vertex, fragment);
    const vertices = gl.createBuffer(), instances = gl.createBuffer(), layout = gl.createVertexArray();
    if (!vertices || !instances || !layout) {
      gl.deleteBuffer(vertices); gl.deleteBuffer(instances); gl.deleteVertexArray(layout); gl.deleteProgram(this.program);
      throw new Error('无法分配三维视图资源');
    }
    this.vertices = vertices; this.instances = instances; this.layout = layout;
    this.uniforms = Object.fromEntries(['rotation', 'center', 'scale', 'radius', 'picking'].map(name => [name, gl.getUniformLocation(this.program, name)]));
    gl.bindVertexArray(layout);
    gl.bindBuffer(gl.ARRAY_BUFFER, vertices); gl.bufferData(gl.ARRAY_BUFFER, cube(wire), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
    gl.bindBuffer(gl.ARRAY_BUFFER, instances);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 24, 0); gl.vertexAttribDivisor(2, 1);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 3, gl.FLOAT, false, 24, 12); gl.vertexAttribDivisor(3, 1);
    gl.bindVertexArray(null);
  }

  set(volume: Volume, cells: Cell[]): void {
    const marked = new Set(volume.markers.map(at => at.join(',')));
    const visible = this.wire ? cells.filter(cell => marked.has(cell.at.join(','))) : cells;
    const data = new Float32Array(visible.length * 6);
    visible.forEach((cell, index) => {
      data.set(cell.at, index * 6); data.set(marked.has(cell.at.join(',')) ? ruleColor(-1) : volume.palette[cell.index]!.color, index * 6 + 3);
    });
    this.count = visible.length;
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.instances); this.gl.bufferData(this.gl.ARRAY_BUFFER, data, this.gl.STATIC_DRAW);
  }

  draw(frame: Frame): void {
    if (this.wire && frame.picking) return;
    const gl = this.gl, uniform = this.uniforms;
    gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND); gl.depthMask(true); gl.depthFunc(this.wire ? gl.LEQUAL : gl.LESS);
    gl.useProgram(this.program); gl.bindVertexArray(this.layout);
    gl.uniformMatrix3fv(uniform.rotation!, false, frame.rotation); gl.uniform3fv(uniform.center!, frame.center);
    gl.uniform2fv(uniform.scale!, frame.scale); gl.uniform1f(uniform.radius!, frame.radius); gl.uniform1i(uniform.picking!, frame.picking ? 1 : 0);
    gl.drawArraysInstanced(this.wire ? gl.LINES : gl.TRIANGLES, 0, this.wire ? 48 : 36, this.count);
    gl.bindVertexArray(null); gl.depthFunc(gl.LESS);
  }

  dispose(): void {
    this.gl.deleteBuffer(this.vertices); this.gl.deleteBuffer(this.instances);
    this.gl.deleteVertexArray(this.layout); this.gl.deleteProgram(this.program);
  }
}
