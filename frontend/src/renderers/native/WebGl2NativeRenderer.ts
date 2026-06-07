export type NativeRenderCommand = {
  x: number;
  y: number;
  size: number;
  kind: number;
};

export type NativeRendererStats = {
  drawCalls: number;
  vertexCount: number;
};

const VERTEX_SHADER = `#version 300 es
in vec2 a_position;
in vec4 a_color;
uniform vec2 u_resolution;
out vec4 v_color;

void main() {
  vec2 zeroToOne = a_position / u_resolution;
  vec2 clipSpace = zeroToOne * 2.0 - 1.0;
  gl_Position = vec4(clipSpace * vec2(1.0, -1.0), 0.0, 1.0);
  v_color = a_color;
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision mediump float;
in vec4 v_color;
out vec4 outColor;

void main() {
  outColor = v_color;
}
`;

function createShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext): WebGLProgram | null {
  const vertex = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  if (!vertex || !fragment) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

export function parseNativeLayoutCommandBuffer(
  commandBuffer: ArrayBuffer,
  commandStride: number,
  count: number,
): NativeRenderCommand[] {
  if (commandStride < 8 || count <= 0 || commandBuffer.byteLength < commandStride * 4) return [];
  const values = new Uint32Array(commandBuffer);
  const maxCount = Math.min(count, Math.floor(values.length / commandStride));
  const result: NativeRenderCommand[] = [];
  for (let index = 0; index < maxCount; index += 1) {
    const offset = index * commandStride;
    result.push({
      x: values[offset + 1] ?? 0,
      y: values[offset + 2] ?? 0,
      size: values[offset + 3] ?? 0,
      kind: values[offset + 7] ?? 0,
    });
  }
  return result;
}

export class WebGl2NativeRenderer {
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly positionBuffer: WebGLBuffer;
  private readonly colorBuffer: WebGLBuffer;
  private readonly positionLocation: number;
  private readonly colorLocation: number;
  private readonly resolutionLocation: WebGLUniformLocation | null;

  static create(activeCanvas: OffscreenCanvas): WebGl2NativeRenderer | null {
    const gl = activeCanvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      depth: false,
      desynchronized: true,
      powerPreference: 'high-performance',
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      stencil: false,
    });
    if (!gl) return null;
    const program = createProgram(gl);
    const positionBuffer = gl.createBuffer();
    const colorBuffer = gl.createBuffer();
    if (!program || !positionBuffer || !colorBuffer) return null;
    return new WebGl2NativeRenderer(gl, program, positionBuffer, colorBuffer);
  }

  private constructor(
    gl: WebGL2RenderingContext,
    program: WebGLProgram,
    positionBuffer: WebGLBuffer,
    colorBuffer: WebGLBuffer,
  ) {
    this.gl = gl;
    this.program = program;
    this.positionBuffer = positionBuffer;
    this.colorBuffer = colorBuffer;
    this.positionLocation = gl.getAttribLocation(program, 'a_position');
    this.colorLocation = gl.getAttribLocation(program, 'a_color');
    this.resolutionLocation = gl.getUniformLocation(program, 'u_resolution');
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  render(activeWidth: number, activeHeight: number, commands: NativeRenderCommand[]): NativeRendererStats {
    const gl = this.gl;
    gl.viewport(0, 0, activeWidth, activeHeight);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (activeWidth <= 0 || activeHeight <= 0 || commands.length <= 0) {
      return { drawCalls: 0, vertexCount: 0 };
    }

    const positions = new Float32Array(commands.length * 12);
    const colors = new Float32Array(commands.length * 24);
    let positionCursor = 0;
    let colorCursor = 0;
    for (const command of commands) {
      const inset = Math.max(2, Math.floor(command.size * 0.08));
      const x1 = command.x + inset;
      const y1 = command.y + inset;
      const x2 = command.x + command.size - inset;
      const y2 = command.y + command.size - inset;
      positions.set([x1, y1, x2, y1, x1, y2, x1, y2, x2, y1, x2, y2], positionCursor);
      positionCursor += 12;
      const color = command.kind === 0
        ? [0.06, 0.09, 0.13, 0.42]
        : command.kind === 1
          ? [0.08, 0.22, 0.28, 0.52]
          : [0.14, 0.18, 0.32, 0.48];
      for (let i = 0; i < 6; i += 1) {
        colors.set(color, colorCursor);
        colorCursor += 4;
      }
    }

    gl.useProgram(this.program);
    gl.uniform2f(this.resolutionLocation, activeWidth, activeHeight);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STREAM_DRAW);
    gl.enableVertexAttribArray(this.positionLocation);
    gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STREAM_DRAW);
    gl.enableVertexAttribArray(this.colorLocation);
    gl.vertexAttribPointer(this.colorLocation, 4, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLES, 0, commands.length * 6);
    return { drawCalls: 1, vertexCount: commands.length * 6 };
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteBuffer(this.positionBuffer);
    gl.deleteBuffer(this.colorBuffer);
    gl.deleteProgram(this.program);
  }
}
