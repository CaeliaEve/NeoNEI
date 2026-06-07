export type NativeRenderCommand = {
  x: number;
  y: number;
  size: number;
  kind: number;
};

export type NativeTextureSpriteCommand = {
  textureKey: string;
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
  destX: number;
  destY: number;
  destWidth: number;
  destHeight: number;
};

export type NativeRendererStats = {
  drawCalls: number;
  vertexCount: number;
  spriteDrawCalls: number;
  spriteVertexCount: number;
};

const CHROME_VERTEX_SHADER = `#version 300 es
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

const CHROME_FRAGMENT_SHADER = `#version 300 es
precision mediump float;
in vec4 v_color;
out vec4 outColor;

void main() {
  outColor = v_color;
}
`;

const SPRITE_VERTEX_SHADER = `#version 300 es
in vec2 a_position;
in vec2 a_texcoord;
uniform vec2 u_resolution;
out vec2 v_texcoord;

void main() {
  vec2 zeroToOne = a_position / u_resolution;
  vec2 clipSpace = zeroToOne * 2.0 - 1.0;
  gl_Position = vec4(clipSpace * vec2(1.0, -1.0), 0.0, 1.0);
  v_texcoord = a_texcoord;
}
`;

const SPRITE_FRAGMENT_SHADER = `#version 300 es
precision mediump float;
uniform sampler2D u_texture;
in vec2 v_texcoord;
out vec4 outColor;

void main() {
  outColor = texture(u_texture, v_texcoord);
}
`;

type TextureState = {
  texture: WebGLTexture;
  width: number;
  height: number;
};

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

function createProgram(gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string): WebGLProgram | null {
  const vertex = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
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
  readonly backend = "webgl2" as const;
  private readonly gl: WebGL2RenderingContext;
  private readonly chromeProgram: WebGLProgram;
  private readonly spriteProgram: WebGLProgram;
  private readonly chromePositionBuffer: WebGLBuffer;
  private readonly chromeColorBuffer: WebGLBuffer;
  private readonly spritePositionBuffer: WebGLBuffer;
  private readonly spriteTexcoordBuffer: WebGLBuffer;
  private readonly chromePositionLocation: number;
  private readonly chromeColorLocation: number;
  private readonly chromeResolutionLocation: WebGLUniformLocation | null;
  private readonly spritePositionLocation: number;
  private readonly spriteTexcoordLocation: number;
  private readonly spriteResolutionLocation: WebGLUniformLocation | null;
  private readonly textureCache = new Map<string, TextureState>();
  private readonly maxTextureSize: number;

  static create(activeCanvas: OffscreenCanvas): WebGl2NativeRenderer | null {
    const gl = activeCanvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      depth: false,
      desynchronized: true,
      powerPreference: "high-performance",
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      stencil: false,
    });
    if (!gl) return null;
    const chromeProgram = createProgram(gl, CHROME_VERTEX_SHADER, CHROME_FRAGMENT_SHADER);
    const spriteProgram = createProgram(gl, SPRITE_VERTEX_SHADER, SPRITE_FRAGMENT_SHADER);
    const chromePositionBuffer = gl.createBuffer();
    const chromeColorBuffer = gl.createBuffer();
    const spritePositionBuffer = gl.createBuffer();
    const spriteTexcoordBuffer = gl.createBuffer();
    if (!chromeProgram || !spriteProgram || !chromePositionBuffer || !chromeColorBuffer || !spritePositionBuffer || !spriteTexcoordBuffer) {
      return null;
    }
    return new WebGl2NativeRenderer(
      gl,
      chromeProgram,
      spriteProgram,
      chromePositionBuffer,
      chromeColorBuffer,
      spritePositionBuffer,
      spriteTexcoordBuffer,
    );
  }

  private constructor(
    gl: WebGL2RenderingContext,
    chromeProgram: WebGLProgram,
    spriteProgram: WebGLProgram,
    chromePositionBuffer: WebGLBuffer,
    chromeColorBuffer: WebGLBuffer,
    spritePositionBuffer: WebGLBuffer,
    spriteTexcoordBuffer: WebGLBuffer,
  ) {
    this.gl = gl;
    this.chromeProgram = chromeProgram;
    this.spriteProgram = spriteProgram;
    this.chromePositionBuffer = chromePositionBuffer;
    this.chromeColorBuffer = chromeColorBuffer;
    this.spritePositionBuffer = spritePositionBuffer;
    this.spriteTexcoordBuffer = spriteTexcoordBuffer;
    this.chromePositionLocation = gl.getAttribLocation(chromeProgram, "a_position");
    this.chromeColorLocation = gl.getAttribLocation(chromeProgram, "a_color");
    this.chromeResolutionLocation = gl.getUniformLocation(chromeProgram, "u_resolution");
    this.spritePositionLocation = gl.getAttribLocation(spriteProgram, "a_position");
    this.spriteTexcoordLocation = gl.getAttribLocation(spriteProgram, "a_texcoord");
    this.spriteResolutionLocation = gl.getUniformLocation(spriteProgram, "u_resolution");
    this.maxTextureSize = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE) ?? 0) || 0;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  }

  registerTexture(key: string, bitmap: ImageBitmap): boolean {
    const width = Math.max(1, bitmap.width);
    const height = Math.max(1, bitmap.height);
    if (this.maxTextureSize <= 0 || width > this.maxTextureSize || height > this.maxTextureSize) {
      return false;
    }
    const gl = this.gl;
    const previous = this.textureCache.get(key);
    if (previous) gl.deleteTexture(previous.texture);
    const texture = gl.createTexture();
    if (!texture) return false;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
    this.textureCache.set(key, { texture, width, height });
    return true;
  }

  textureCount(): number {
    return this.textureCache.size;
  }

  render(
    activeWidth: number,
    activeHeight: number,
    commands: NativeRenderCommand[],
    spriteCommands: NativeTextureSpriteCommand[] = [],
  ): NativeRendererStats {
    const gl = this.gl;
    gl.viewport(0, 0, activeWidth, activeHeight);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (activeWidth <= 0 || activeHeight <= 0) {
      return { drawCalls: 0, vertexCount: 0, spriteDrawCalls: 0, spriteVertexCount: 0 };
    }

    const chromeStats = this.renderChrome(activeWidth, activeHeight, commands);
    const spriteStats = this.renderSprites(activeWidth, activeHeight, spriteCommands);
    return {
      drawCalls: chromeStats.drawCalls + spriteStats.drawCalls,
      vertexCount: chromeStats.vertexCount + spriteStats.vertexCount,
      spriteDrawCalls: spriteStats.drawCalls,
      spriteVertexCount: spriteStats.vertexCount,
    };
  }

  private renderChrome(activeWidth: number, activeHeight: number, commands: NativeRenderCommand[]) {
    const gl = this.gl;
    if (commands.length <= 0) return { drawCalls: 0, vertexCount: 0 };

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

    gl.useProgram(this.chromeProgram);
    gl.uniform2f(this.chromeResolutionLocation, activeWidth, activeHeight);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.chromePositionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STREAM_DRAW);
    gl.enableVertexAttribArray(this.chromePositionLocation);
    gl.vertexAttribPointer(this.chromePositionLocation, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.chromeColorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STREAM_DRAW);
    gl.enableVertexAttribArray(this.chromeColorLocation);
    gl.vertexAttribPointer(this.chromeColorLocation, 4, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLES, 0, commands.length * 6);
    return { drawCalls: 1, vertexCount: commands.length * 6 };
  }

  private renderSprites(activeWidth: number, activeHeight: number, commands: NativeTextureSpriteCommand[]) {
    const gl = this.gl;
    const byTexture = new Map<string, NativeTextureSpriteCommand[]>();
    for (const command of commands) {
      if (!this.textureCache.has(command.textureKey)) continue;
      const list = byTexture.get(command.textureKey);
      if (list) list.push(command);
      else byTexture.set(command.textureKey, [command]);
    }
    if (byTexture.size <= 0) return { drawCalls: 0, vertexCount: 0 };

    gl.useProgram(this.spriteProgram);
    gl.uniform2f(this.spriteResolutionLocation, activeWidth, activeHeight);
    let drawCalls = 0;
    let vertexCount = 0;
    for (const [textureKey, list] of byTexture) {
      const texture = this.textureCache.get(textureKey);
      if (!texture) continue;
      const positions = new Float32Array(list.length * 12);
      const texcoords = new Float32Array(list.length * 12);
      let cursor = 0;
      for (const command of list) {
        const x1 = command.destX;
        const y1 = command.destY;
        const x2 = command.destX + command.destWidth;
        const y2 = command.destY + command.destHeight;
        positions.set([x1, y1, x2, y1, x1, y2, x1, y2, x2, y1, x2, y2], cursor);

        const u1 = command.sourceX / texture.width;
        const v1 = command.sourceY / texture.height;
        const u2 = (command.sourceX + command.sourceWidth) / texture.width;
        const v2 = (command.sourceY + command.sourceHeight) / texture.height;
        texcoords.set([u1, v1, u2, v1, u1, v2, u1, v2, u2, v1, u2, v2], cursor);
        cursor += 12;
      }

      gl.bindTexture(gl.TEXTURE_2D, texture.texture);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.spritePositionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STREAM_DRAW);
      gl.enableVertexAttribArray(this.spritePositionLocation);
      gl.vertexAttribPointer(this.spritePositionLocation, 2, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.spriteTexcoordBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, texcoords, gl.STREAM_DRAW);
      gl.enableVertexAttribArray(this.spriteTexcoordLocation);
      gl.vertexAttribPointer(this.spriteTexcoordLocation, 2, gl.FLOAT, false, 0, 0);

      gl.drawArrays(gl.TRIANGLES, 0, list.length * 6);
      drawCalls += 1;
      vertexCount += list.length * 6;
    }
    return { drawCalls, vertexCount };
  }

  dispose(): void {
    const gl = this.gl;
    for (const texture of this.textureCache.values()) {
      gl.deleteTexture(texture.texture);
    }
    this.textureCache.clear();
    gl.deleteBuffer(this.chromePositionBuffer);
    gl.deleteBuffer(this.chromeColorBuffer);
    gl.deleteBuffer(this.spritePositionBuffer);
    gl.deleteBuffer(this.spriteTexcoordBuffer);
    gl.deleteProgram(this.chromeProgram);
    gl.deleteProgram(this.spriteProgram);
  }
}
