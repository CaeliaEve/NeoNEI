import {
  nativeRendererProbeFailed,
  nativeRendererProbeSupported,
  nativeRendererProbeUnsupported,
  type NativeRendererProbeResult,
} from "./NativeRendererProbe.ts";
import type {
  NativeLayoutCommandBatch,
  NativeRendererStats,
  NativeTextureSpriteCommand,
} from "./NativeRendererCommandProtocol.ts";

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

function ensureFloat32Capacity(
  values: Float32Array<ArrayBuffer>,
  requiredLength: number,
): Float32Array<ArrayBuffer> {
  if (values.length >= requiredLength) return values;
  let capacity = Math.max(256, values.length || 1);
  while (capacity < requiredLength) capacity *= 2;
  return new Float32Array(capacity);
}

function textureSourceSize(bitmap: TexImageSource): { width: number; height: number } {
  const source = bitmap as TexImageSource & {
    width?: number;
    height?: number;
    videoWidth?: number;
    videoHeight?: number;
    displayWidth?: number;
    displayHeight?: number;
  };
  const width = Number(source.width ?? source.videoWidth ?? source.displayWidth ?? 0);
  const height = Number(source.height ?? source.videoHeight ?? source.displayHeight ?? 0);
  return {
    width: Math.max(1, Number.isFinite(width) ? width : 1),
    height: Math.max(1, Number.isFinite(height) ? height : 1),
  };
}

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
  private chromePositions = new Float32Array(0);
  private chromeColors = new Float32Array(0);
  private spritePositions = new Float32Array(0);
  private spriteTexcoords = new Float32Array(0);

  static probe(activeCanvas: HTMLCanvasElement | OffscreenCanvas): NativeRendererProbeResult {
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
    if (!gl) return nativeRendererProbeUnsupported("webgl2", "webgl2 context unavailable");
    const chromeProgram = createProgram(gl, CHROME_VERTEX_SHADER, CHROME_FRAGMENT_SHADER);
    const spriteProgram = createProgram(gl, SPRITE_VERTEX_SHADER, SPRITE_FRAGMENT_SHADER);
    const chromePositionBuffer = gl.createBuffer();
    const chromeColorBuffer = gl.createBuffer();
    const spritePositionBuffer = gl.createBuffer();
    const spriteTexcoordBuffer = gl.createBuffer();
    if (!chromeProgram || !spriteProgram || !chromePositionBuffer || !chromeColorBuffer || !spritePositionBuffer || !spriteTexcoordBuffer) {
      if (chromeProgram) gl.deleteProgram(chromeProgram);
      if (spriteProgram) gl.deleteProgram(spriteProgram);
      if (chromePositionBuffer) gl.deleteBuffer(chromePositionBuffer);
      if (chromeColorBuffer) gl.deleteBuffer(chromeColorBuffer);
      if (spritePositionBuffer) gl.deleteBuffer(spritePositionBuffer);
      if (spriteTexcoordBuffer) gl.deleteBuffer(spriteTexcoordBuffer);
      return nativeRendererProbeFailed("webgl2", "webgl2 shader program or buffer allocation failed");
    }
    return nativeRendererProbeSupported(
      new WebGl2NativeRenderer(
        gl,
        chromeProgram,
        spriteProgram,
        chromePositionBuffer,
        chromeColorBuffer,
        spritePositionBuffer,
        spriteTexcoordBuffer,
      ),
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

  registerTexture(key: string, bitmap: TexImageSource): boolean {
    const { width, height } = textureSourceSize(bitmap);
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
    commands: NativeLayoutCommandBatch,
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

  private renderChrome(activeWidth: number, activeHeight: number, commands: NativeLayoutCommandBatch) {
    const gl = this.gl;
    if (commands.count <= 0) return { drawCalls: 0, vertexCount: 0 };

    // Allocate exactly for the base quad plus the compact plus/minus marker.
    // This keeps the native chrome path visual-only without inflating per-frame
    // typed-array pressure during fast paging.
    let chromeQuadCount = 0;
    const { values: commandValues, stride, count, fieldOffsets } = commands;
    for (let index = 0; index < count; index += 1) {
      const offset = index * stride;
      const flags = commandValues[offset + fieldOffsets.flags] ?? 0;
      chromeQuadCount += 1;
      if ((flags & 1) !== 0) chromeQuadCount += 2;
      else if ((flags & 2) !== 0 || (flags & 16) !== 0) chromeQuadCount += 1;
    }
    this.chromePositions = ensureFloat32Capacity(this.chromePositions, chromeQuadCount * 12);
    this.chromeColors = ensureFloat32Capacity(this.chromeColors, chromeQuadCount * 24);
    const positions = this.chromePositions;
    const colors = this.chromeColors;
    let positionCursor = 0;
    let colorCursor = 0;
    let vertexCount = 0;
    const pushQuadCorners = (
      x1: number, y1: number, x2: number, y2: number,
      cTL: number[], cTR: number[], cBL: number[], cBR: number[]
    ) => {
      positions.set([x1, y1, x2, y1, x1, y2, x1, y2, x2, y1, x2, y2], positionCursor);
      positionCursor += 12;
      // Triangles: TL-TR-BL and BL-TR-BR
      colors.set(cTL, colorCursor); colorCursor += 4; // V1 (TL)
      colors.set(cTR, colorCursor); colorCursor += 4; // V2 (TR)
      colors.set(cBL, colorCursor); colorCursor += 4; // V3 (BL)
      colors.set(cBL, colorCursor); colorCursor += 4; // V4 (BL)
      colors.set(cTR, colorCursor); colorCursor += 4; // V5 (TR)
      colors.set(cBR, colorCursor); colorCursor += 4; // V6 (BR)
      vertexCount += 6;
    };
    const pushQuad = (x1: number, y1: number, x2: number, y2: number, color: number[]) => {
      pushQuadCorners(x1, y1, x2, y2, color, color, color, color);
    };
    for (let index = 0; index < count; index += 1) {
      const offset = index * stride;
      const x = commandValues[offset + fieldOffsets.x] ?? 0;
      const y = commandValues[offset + fieldOffsets.y] ?? 0;
      const size = commandValues[offset + fieldOffsets.size] ?? 0;
      const flags = commandValues[offset + fieldOffsets.flags] ?? 0;
      const isGroup = (flags & 1) !== 0;
      const isGroupHeader = (flags & 2) !== 0;
      const isHovered = (flags & 4) !== 0;
      const isSelected = (flags & 8) !== 0;
      const isGroupMember = (flags & 16) !== 0;

      const inset = isHovered || isSelected ? 0 : Math.max(2, Math.floor(size * 0.08));
      const x1 = x + inset;
      const y1 = y + inset;
      const x2 = x + size - inset;
      const y2 = y + size - inset;

      let cTL: number[];
      let cTR: number[];
      let cBL: number[];
      let cBR: number[];

      if (isGroupHeader) {
        if (isHovered) {
          cTL = [0.96, 0.62, 0.04, 0.08];
          cTR = [0.96, 0.62, 0.04, 0.04];
          cBL = [0.96, 0.62, 0.04, 0.04];
          cBR = [0.96, 0.62, 0.04, 0.01];
        } else {
          cTL = [0.0, 0.0, 0.0, 0.0];
          cTR = [0.0, 0.0, 0.0, 0.0];
          cBL = [0.0, 0.0, 0.0, 0.0];
          cBR = [0.0, 0.0, 0.0, 0.0];
        }
      } else if (isGroupMember) {
        if (isHovered) {
          cTL = [0.96, 0.62, 0.04, 0.08];
          cTR = [0.96, 0.62, 0.04, 0.04];
          cBL = [0.96, 0.62, 0.04, 0.04];
          cBR = [0.96, 0.62, 0.04, 0.01];
        } else {
          cTL = [0.0, 0.0, 0.0, 0.0];
          cTR = [0.0, 0.0, 0.0, 0.0];
          cBL = [0.0, 0.0, 0.0, 0.0];
          cBR = [0.0, 0.0, 0.0, 0.0];
        }
      } else if (isGroup) {
        if (isHovered) {
          cTL = [0.58, 0.64, 0.72, 0.07];
          cTR = [0.58, 0.64, 0.72, 0.03];
          cBL = [0.58, 0.64, 0.72, 0.03];
          cBR = [0.58, 0.64, 0.72, 0.10];
        } else {
          cTL = [0.0, 0.0, 0.0, 0.22];
          cTR = [0.0, 0.0, 0.0, 0.08];
          cBL = [0.0, 0.0, 0.0, 0.08];
          cBR = [0.0, 0.0, 0.0, 0.32];
        }
      } else if (isHovered) {
        cTL = [0.96, 0.62, 0.04, 0.08];
        cTR = [0.96, 0.62, 0.04, 0.04];
        cBL = [0.96, 0.62, 0.04, 0.04];
        cBR = [0.96, 0.62, 0.04, 0.01];
      } else if (isSelected) {
        cTL = [0.96, 0.62, 0.04, 0.15];
        cTR = [0.96, 0.62, 0.04, 0.08];
        cBL = [0.96, 0.62, 0.04, 0.08];
        cBR = [0.96, 0.62, 0.04, 0.02];
      } else {
        cTL = [0.0, 0.0, 0.0, 0.0];
        cTR = [0.0, 0.0, 0.0, 0.0];
        cBL = [0.0, 0.0, 0.0, 0.0];
        cBR = [0.0, 0.0, 0.0, 0.0];
      }

      pushQuadCorners(x1, y1, x2, y2, cTL, cTR, cBL, cBR);

      // Draw outlines (Completely borderless, no line connectors)

      // Plus/Minus badges (Stable positions: do not shift with hover inset)
      if (isGroup) {
        const plusColor = isHovered ? [0.94, 0.96, 1.0, 0.95] : [0.78, 0.82, 0.88, 0.65]; // Premium starlight white on hover, starlight silver when inactive
        const bx2 = x + size;
        const by1 = y;
        // Horizontal line
        pushQuad(bx2 - 17, by1 + 12.25, bx2 - 9, by1 + 13.75, plusColor);
        // Vertical line
        pushQuad(bx2 - 13.75, by1 + 9, bx2 - 12.25, by1 + 17, plusColor);
      } else if (isGroupHeader || isGroupMember) {
        const minusColor = isHovered ? [0.94, 0.96, 1.0, 0.95] : [0.78, 0.82, 0.88, 0.65]; // Premium starlight white on hover, starlight silver when inactive
        const bx2 = x + size;
        const by1 = y;
        pushQuad(bx2 - 17, by1 + 12.25, bx2 - 9, by1 + 13.75, minusColor);
      }
    }

    gl.useProgram(this.chromeProgram);
    gl.uniform2f(this.chromeResolutionLocation, activeWidth, activeHeight);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.chromePositionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions.subarray(0, positionCursor), gl.STREAM_DRAW);
    gl.enableVertexAttribArray(this.chromePositionLocation);
    gl.vertexAttribPointer(this.chromePositionLocation, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.chromeColorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, colors.subarray(0, colorCursor), gl.STREAM_DRAW);
    gl.enableVertexAttribArray(this.chromeColorLocation);
    gl.vertexAttribPointer(this.chromeColorLocation, 4, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
    return { drawCalls: 1, vertexCount };
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
      this.spritePositions = ensureFloat32Capacity(this.spritePositions, list.length * 12);
      this.spriteTexcoords = ensureFloat32Capacity(this.spriteTexcoords, list.length * 12);
      const positions = this.spritePositions;
      const texcoords = this.spriteTexcoords;
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
      gl.bufferData(gl.ARRAY_BUFFER, positions.subarray(0, cursor), gl.STREAM_DRAW);
      gl.enableVertexAttribArray(this.spritePositionLocation);
      gl.vertexAttribPointer(this.spritePositionLocation, 2, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.spriteTexcoordBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, texcoords.subarray(0, cursor), gl.STREAM_DRAW);
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
