export type BrowserWebglAtlasDrawCommand = {
  image: HTMLImageElement;
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
  destX: number;
  destY: number;
  destWidth: number;
  destHeight: number;
};

type TextureState = {
  texture: WebGLTexture;
  width: number;
  height: number;
};

const VERTEX_SHADER = `
attribute vec2 a_position;
attribute vec2 a_texcoord;
uniform vec2 u_resolution;
varying vec2 v_texcoord;

void main() {
  vec2 zeroToOne = a_position / u_resolution;
  vec2 clipSpace = zeroToOne * 2.0 - 1.0;
  gl_Position = vec4(clipSpace * vec2(1.0, -1.0), 0.0, 1.0);
  v_texcoord = a_texcoord;
}
`;

const FRAGMENT_SHADER = `
precision mediump float;
uniform sampler2D u_texture;
varying vec2 v_texcoord;

void main() {
  gl_FragColor = texture2D(u_texture, v_texcoord);
}
`;

function createShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
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

function createProgram(gl: WebGLRenderingContext): WebGLProgram | null {
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

export class BrowserWebglAtlasRenderer {
  private readonly gl: WebGLRenderingContext;
  private readonly program: WebGLProgram;
  private readonly positionBuffer: WebGLBuffer;
  private readonly texcoordBuffer: WebGLBuffer;
  private readonly textureCache = new WeakMap<HTMLImageElement, TextureState>();
  private readonly textures = new Set<WebGLTexture>();
  private readonly positionLocation: number;
  private readonly texcoordLocation: number;
  private readonly resolutionLocation: WebGLUniformLocation | null;
  private readonly maxTextureSize: number;

  static create(canvas: HTMLCanvasElement): BrowserWebglAtlasRenderer | null {
    const gl = canvas.getContext("webgl", {
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

    const program = createProgram(gl);
    const positionBuffer = gl.createBuffer();
    const texcoordBuffer = gl.createBuffer();
    if (!program || !positionBuffer || !texcoordBuffer) return null;

    return new BrowserWebglAtlasRenderer(gl, program, positionBuffer, texcoordBuffer);
  }

  private constructor(
    gl: WebGLRenderingContext,
    program: WebGLProgram,
    positionBuffer: WebGLBuffer,
    texcoordBuffer: WebGLBuffer,
  ) {
    this.gl = gl;
    this.program = program;
    this.positionBuffer = positionBuffer;
    this.texcoordBuffer = texcoordBuffer;
    this.positionLocation = gl.getAttribLocation(program, "a_position");
    this.texcoordLocation = gl.getAttribLocation(program, "a_texcoord");
    this.resolutionLocation = gl.getUniformLocation(program, "u_resolution");
    this.maxTextureSize = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE) ?? 0) || 0;

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  }

  canDrawImage(image: HTMLImageElement): boolean {
    const width = Math.max(1, image.naturalWidth || image.width);
    const height = Math.max(1, image.naturalHeight || image.height);
    return this.maxTextureSize > 0 && width <= this.maxTextureSize && height <= this.maxTextureSize;
  }

  warmImages(images: HTMLImageElement[]): number {
    let warmed = 0;
    for (const image of images) {
      if (!this.canDrawImage(image)) {
        continue;
      }
      if (this.ensureTexture(image)) {
        warmed += 1;
      }
    }
    return warmed;
  }

  draw(width: number, height: number, commands: BrowserWebglAtlasDrawCommand[]) {
    const gl = this.gl;
    const canvas = gl.canvas as HTMLCanvasElement;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (width <= 0 || height <= 0 || commands.length === 0) {
      return;
    }

    const commandsByImage = new Map<HTMLImageElement, BrowserWebglAtlasDrawCommand[]>();
    for (const command of commands) {
      const list = commandsByImage.get(command.image);
      if (list) {
        list.push(command);
      } else {
        commandsByImage.set(command.image, [command]);
      }
    }

    gl.useProgram(this.program);
    gl.uniform2f(this.resolutionLocation, width, height);
    for (const [image, list] of commandsByImage) {
      this.drawBatch(image, list);
    }
  }

  private drawBatch(image: HTMLImageElement, commands: BrowserWebglAtlasDrawCommand[]) {
    const gl = this.gl;
    const textureState = this.ensureTexture(image);
    if (!textureState) return;

    const positions = new Float32Array(commands.length * 12);
    const texcoords = new Float32Array(commands.length * 12);
    let cursor = 0;
    for (const command of commands) {
      const x1 = command.destX;
      const y1 = command.destY;
      const x2 = command.destX + command.destWidth;
      const y2 = command.destY + command.destHeight;
      positions.set([x1, y1, x2, y1, x1, y2, x1, y2, x2, y1, x2, y2], cursor);

      const u1 = command.sourceX / textureState.width;
      const v1 = command.sourceY / textureState.height;
      const u2 = (command.sourceX + command.sourceWidth) / textureState.width;
      const v2 = (command.sourceY + command.sourceHeight) / textureState.height;
      texcoords.set([u1, v1, u2, v1, u1, v2, u1, v2, u2, v1, u2, v2], cursor);
      cursor += 12;
    }

    gl.bindTexture(gl.TEXTURE_2D, textureState.texture);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STREAM_DRAW);
    gl.enableVertexAttribArray(this.positionLocation);
    gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.texcoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, texcoords, gl.STREAM_DRAW);
    gl.enableVertexAttribArray(this.texcoordLocation);
    gl.vertexAttribPointer(this.texcoordLocation, 2, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLES, 0, commands.length * 6);
  }

  private ensureTexture(image: HTMLImageElement): TextureState | null {
    const gl = this.gl;
    const cached = this.textureCache.get(image);
    const width = Math.max(1, image.naturalWidth || image.width);
    const height = Math.max(1, image.naturalHeight || image.height);
    if (this.maxTextureSize <= 0 || width > this.maxTextureSize || height > this.maxTextureSize) {
      return null;
    }
    if (cached && cached.width === width && cached.height === height) {
      return cached;
    }
    if (cached) {
      gl.deleteTexture(cached.texture);
      this.textures.delete(cached.texture);
    }

    const texture = gl.createTexture();
    if (!texture) return null;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

    const state = { texture, width, height };
    this.textureCache.set(image, state);
    this.textures.add(texture);
    return state;
  }

  dispose() {
    const gl = this.gl;
    for (const texture of this.textures) {
      gl.deleteTexture(texture);
    }
    this.textures.clear();
    gl.deleteBuffer(this.positionBuffer);
    gl.deleteBuffer(this.texcoordBuffer);
    gl.deleteProgram(this.program);
  }
}
