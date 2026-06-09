import type { NativeRendererBackend } from "./NativeRendererBackend";
import type { NativeRenderCommand, NativeRendererStats, NativeTextureSpriteCommand } from "./WebGl2NativeRenderer";

type AnyRecord = Record<string, any>;
type GpuNavigator = Navigator & { gpu?: AnyRecord };
type GpuCanvas = OffscreenCanvas & { getContext(type: "webgpu"): AnyRecord | null };

type WebGpuTextureState = {
  texture: AnyRecord;
  bindGroup: AnyRecord;
  width: number;
  height: number;
};

type WebGpuHandles = {
  device: AnyRecord;
  context: AnyRecord;
  format: string;
  chromePipeline: AnyRecord;
  spritePipeline: AnyRecord;
  resolutionBuffer: AnyRecord;
  resolutionBindGroup: AnyRecord;
  sampler: AnyRecord;
};

const CHROME_WGSL = `
struct Resolution {
  size: vec2<f32>,
};

@group(0) @binding(0) var<uniform> u_resolution: Resolution;

struct VertexIn {
  @location(0) position: vec2<f32>,
  @location(1) color: vec4<f32>,
};

struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) color: vec4<f32>,
};

@vertex
fn vs_main(input: VertexIn) -> VertexOut {
  var out: VertexOut;
  let zero_to_one = input.position / u_resolution.size;
  let clip = zero_to_one * 2.0 - vec2<f32>(1.0, 1.0);
  out.position = vec4<f32>(clip * vec2<f32>(1.0, -1.0), 0.0, 1.0);
  out.color = input.color;
  return out;
}

@fragment
fn fs_main(input: VertexOut) -> @location(0) vec4<f32> {
  return input.color;
}
`;

const SPRITE_WGSL = `
struct Resolution {
  size: vec2<f32>,
};

@group(0) @binding(0) var<uniform> u_resolution: Resolution;
@group(1) @binding(0) var u_texture: texture_2d<f32>;
@group(1) @binding(1) var u_sampler: sampler;

struct VertexIn {
  @location(0) position: vec2<f32>,
  @location(1) texcoord: vec2<f32>,
};

struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) texcoord: vec2<f32>,
};

@vertex
fn vs_main(input: VertexIn) -> VertexOut {
  var out: VertexOut;
  let zero_to_one = input.position / u_resolution.size;
  let clip = zero_to_one * 2.0 - vec2<f32>(1.0, 1.0);
  out.position = vec4<f32>(clip * vec2<f32>(1.0, -1.0), 0.0, 1.0);
  out.texcoord = input.texcoord;
  return out;
}

@fragment
fn fs_main(input: VertexOut) -> @location(0) vec4<f32> {
  return textureSample(u_texture, u_sampler, input.texcoord);
}
`;

function hasWebGpu(): boolean {
  return Boolean((navigator as GpuNavigator).gpu);
}

function gpuUsage(name: string): number {
  return Number((globalThis as AnyRecord).GPUBufferUsage?.[name] ?? 0);
}

function textureUsage(name: string): number {
  return Number((globalThis as AnyRecord).GPUTextureUsage?.[name] ?? 0);
}

function createBuffer(device: AnyRecord, values: Float32Array, usage: number): AnyRecord {
  const buffer = device.createBuffer({
    size: Math.max(4, (values.byteLength + 3) & ~3),
    usage,
    mappedAtCreation: true,
  });
  new Float32Array(buffer.getMappedRange()).set(values);
  buffer.unmap();
  return buffer;
}

function pushChromeQuad(
  values: Float32Array,
  cursor: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: number[],
): number {
  const vertices = [x1, y1, x2, y1, x1, y2, x1, y2, x2, y1, x2, y2];
  for (let index = 0; index < vertices.length; index += 2) {
    values[cursor++] = vertices[index];
    values[cursor++] = vertices[index + 1];
    values[cursor++] = color[0];
    values[cursor++] = color[1];
    values[cursor++] = color[2];
    values[cursor++] = color[3];
  }
  return cursor;
}

function buildChromeVertices(commands: NativeRenderCommand[]): { vertices: Float32Array; vertexCount: number } {
  // Grouped entries need a visible GPU-native marker. Allocate room for the
  // base slot plus a compact three-layer corner stack; non-group commands use
  // only the base vertices and the final array is trimmed.
  const values = new Float32Array(commands.length * 18 * 6);
  let cursor = 0;
  let vertexCount = 0;
  for (const command of commands) {
    const isGroup = (command.flags & 1) !== 0;
    const isHovered = (command.flags & 4) !== 0;
    const isSelected = (command.flags & 8) !== 0;
    const inset = isHovered || isSelected ? 0 : Math.max(2, Math.floor(command.size * 0.08));
    const x1 = command.x + inset;
    const y1 = command.y + inset;
    const x2 = command.x + command.size - inset;
    const y2 = command.y + command.size - inset;
    const color = isHovered
      ? [0.96, 0.68, 0.24, 0.58]
      : isSelected
        ? [0.14, 0.78, 0.92, 0.62]
      : isGroup
        ? [0.08, 0.42, 0.52, 0.56]
        : command.kind === 0
          ? [0.06, 0.09, 0.13, 0.42]
          : command.kind === 1
            ? [0.08, 0.22, 0.28, 0.52]
            : [0.14, 0.18, 0.32, 0.48];
    cursor = pushChromeQuad(values, cursor, x1, y1, x2, y2, color);
    vertexCount += 6;
    if (isGroup) {
      const badge = Math.max(10, Math.floor(command.size * 0.32));
      const strip = Math.max(3, Math.floor(command.size * 0.07));
      const badgeColor = isHovered ? [1.0, 0.76, 0.28, 0.94] : [0.20, 0.92, 1.0, 0.90];
      const shadowColor = [0.02, 0.12, 0.18, 0.78];
      cursor = pushChromeQuad(values, cursor, x2 - badge - 1, y1, x2, y1 + badge + 1, shadowColor);
      cursor = pushChromeQuad(values, cursor, x2 - badge, y1, x2, y1 + strip, badgeColor);
      cursor = pushChromeQuad(values, cursor, x2 - strip, y1, x2, y1 + badge, badgeColor);
      vertexCount += 18;
    }
  }
  return { vertices: values.slice(0, cursor), vertexCount };
}

function buildSpriteVertices(commands: NativeTextureSpriteCommand[], texture: WebGpuTextureState): Float32Array {
  const values = new Float32Array(commands.length * 6 * 4);
  let cursor = 0;
  for (const command of commands) {
    const x1 = command.destX;
    const y1 = command.destY;
    const x2 = command.destX + command.destWidth;
    const y2 = command.destY + command.destHeight;
    const u1 = command.sourceX / texture.width;
    const v1 = command.sourceY / texture.height;
    const u2 = (command.sourceX + command.sourceWidth) / texture.width;
    const v2 = (command.sourceY + command.sourceHeight) / texture.height;
    const vertices = [
      x1, y1, u1, v1,
      x2, y1, u2, v1,
      x1, y2, u1, v2,
      x1, y2, u1, v2,
      x2, y1, u2, v1,
      x2, y2, u2, v2,
    ];
    values.set(vertices, cursor);
    cursor += vertices.length;
  }
  return values;
}

async function requestWebGpuHandles(canvas: OffscreenCanvas): Promise<WebGpuHandles | null> {
  const gpu = (navigator as GpuNavigator).gpu;
  if (!gpu?.requestAdapter) return null;
  const adapter = await gpu.requestAdapter();
  if (!adapter?.requestDevice) return null;
  const device = await adapter.requestDevice();
  const context = (canvas as GpuCanvas).getContext("webgpu");
  if (!device || !context?.configure) return null;
  const format = gpu.getPreferredCanvasFormat?.() ?? "bgra8unorm";
  context.configure({ device, format, alphaMode: "premultiplied" });

  const resolutionBuffer = device.createBuffer({
    size: 16,
    usage: gpuUsage("UNIFORM") | gpuUsage("COPY_DST"),
  });
  const chromeModule = device.createShaderModule({ code: CHROME_WGSL });
  const spriteModule = device.createShaderModule({ code: SPRITE_WGSL });
  const resolutionBindGroupLayout = device.createBindGroupLayout({
    entries: [{ binding: 0, visibility: 1, buffer: { type: "uniform" } }],
  });
  const spriteBindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: 2, texture: { sampleType: "float" } },
      { binding: 1, visibility: 2, sampler: { type: "filtering" } },
    ],
  });
  const chromePipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [resolutionBindGroupLayout] }),
    vertex: {
      module: chromeModule,
      entryPoint: "vs_main",
      buffers: [{
        arrayStride: 24,
        attributes: [
          { shaderLocation: 0, offset: 0, format: "float32x2" },
          { shaderLocation: 1, offset: 8, format: "float32x4" },
        ],
      }],
    },
    fragment: {
      module: chromeModule,
      entryPoint: "fs_main",
      targets: [{ format, blend: { color: { srcFactor: "one", dstFactor: "one-minus-src-alpha" }, alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" } } }],
    },
    primitive: { topology: "triangle-list" },
  });
  const spritePipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [resolutionBindGroupLayout, spriteBindGroupLayout] }),
    vertex: {
      module: spriteModule,
      entryPoint: "vs_main",
      buffers: [{
        arrayStride: 16,
        attributes: [
          { shaderLocation: 0, offset: 0, format: "float32x2" },
          { shaderLocation: 1, offset: 8, format: "float32x2" },
        ],
      }],
    },
    fragment: {
      module: spriteModule,
      entryPoint: "fs_main",
      targets: [{ format, blend: { color: { srcFactor: "one", dstFactor: "one-minus-src-alpha" }, alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" } } }],
    },
    primitive: { topology: "triangle-list" },
  });
  const resolutionBindGroup = device.createBindGroup({
    layout: resolutionBindGroupLayout,
    entries: [{ binding: 0, resource: { buffer: resolutionBuffer } }],
  });
  const sampler = device.createSampler({ magFilter: "nearest", minFilter: "nearest", addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge" });
  return { device, context, format, chromePipeline, spritePipeline, resolutionBuffer, resolutionBindGroup, sampler };
}

export class WebGpuNativeRenderer implements NativeRendererBackend {
  readonly backend = "webgpu" as const;
  static lastInitializationError: string | null = null;
  private disposed = false;
  private contextLost = false;
  private contextLostReason: string | null = null;
  private textureCache = new Map<string, WebGpuTextureState>();
  private readonly handles: WebGpuHandles;

  static async create(activeCanvas: OffscreenCanvas): Promise<WebGpuNativeRenderer | null> {
    WebGpuNativeRenderer.lastInitializationError = null;
    if (!hasWebGpu()) return null;
    const handles = await requestWebGpuHandles(activeCanvas).catch((error) => {
      WebGpuNativeRenderer.lastInitializationError = error instanceof Error ? error.message : String(error);
      return null;
    });
    if (!handles && !WebGpuNativeRenderer.lastInitializationError) {
      WebGpuNativeRenderer.lastInitializationError = "webgpu adapter/device/context unavailable";
    }
    if (!handles) return null;
    return new WebGpuNativeRenderer(handles);
  }

  private constructor(handles: WebGpuHandles) {
    this.handles = handles;
    void handles.device.lost?.then?.((info: AnyRecord) => {
      this.contextLost = true;
      this.contextLostReason = `${info?.reason ?? "unknown"}${info?.message ? `: ${info.message}` : ""}`;
      this.dispose();
    });
  }

  registerTexture(key: string, bitmap: ImageBitmap): boolean {
    if (this.disposed || this.contextLost || !key) return false;
    const { device, sampler } = this.handles;
    const width = Math.max(1, bitmap.width);
    const height = Math.max(1, bitmap.height);
    const previous = this.textureCache.get(key);
    previous?.texture?.destroy?.();
    const texture = device.createTexture({
      size: [width, height, 1],
      format: "rgba8unorm",
      usage: textureUsage("TEXTURE_BINDING") | textureUsage("COPY_DST") | textureUsage("RENDER_ATTACHMENT"),
    });
    device.queue.copyExternalImageToTexture(
      { source: bitmap },
      { texture },
      [width, height],
    );
    const bindGroup = device.createBindGroup({
      layout: this.handles.spritePipeline.getBindGroupLayout(1),
      entries: [
        { binding: 0, resource: texture.createView() },
        { binding: 1, resource: sampler },
      ],
    });
    this.textureCache.set(key, { texture, bindGroup, width, height });
    return true;
  }

  textureCount(): number {
    return this.textureCache.size;
  }

  diagnostics() {
    return {
      contextLost: this.contextLost,
      contextLostReason: this.contextLostReason,
    };
  }

  render(
    activeWidth: number,
    activeHeight: number,
    commands: NativeRenderCommand[],
    spriteCommands: NativeTextureSpriteCommand[] = [],
  ): NativeRendererStats {
    if (this.disposed || this.contextLost || activeWidth <= 0 || activeHeight <= 0) {
      return { drawCalls: 0, vertexCount: 0, spriteDrawCalls: 0, spriteVertexCount: 0 };
    }
    const { device, context } = this.handles;
    device.queue.writeBuffer(this.handles.resolutionBuffer, 0, new Float32Array([activeWidth, activeHeight, 0, 0]));
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        loadOp: "clear",
        storeOp: "store",
      }],
    });

    let drawCalls = 0;
    let vertexCount = 0;
    const transientBuffers: AnyRecord[] = [];
    if (commands.length > 0) {
      const chrome = buildChromeVertices(commands);
      const chromeBuffer = createBuffer(device, chrome.vertices, gpuUsage("VERTEX") | gpuUsage("COPY_DST"));
      transientBuffers.push(chromeBuffer);
      pass.setPipeline(this.handles.chromePipeline);
      pass.setBindGroup(0, this.handles.resolutionBindGroup);
      pass.setVertexBuffer(0, chromeBuffer);
      pass.draw(chrome.vertexCount);
      drawCalls += 1;
      vertexCount += chrome.vertexCount;
    }

    const spriteStats = this.renderSprites(device, pass, spriteCommands, transientBuffers);
    drawCalls += spriteStats.drawCalls;
    vertexCount += spriteStats.vertexCount;
    pass.end();
    device.queue.submit([encoder.finish()]);
    void device.queue.onSubmittedWorkDone?.()
      ?.finally?.(() => {
        for (const buffer of transientBuffers) {
          buffer.destroy?.();
        }
      });
    return {
      drawCalls,
      vertexCount,
      spriteDrawCalls: spriteStats.drawCalls,
      spriteVertexCount: spriteStats.vertexCount,
    };
  }

  private renderSprites(
    device: AnyRecord,
    pass: AnyRecord,
    commands: NativeTextureSpriteCommand[],
    transientBuffers: AnyRecord[],
  ) {
    const byTexture = new Map<string, NativeTextureSpriteCommand[]>();
    for (const command of commands) {
      if (!this.textureCache.has(command.textureKey)) continue;
      const list = byTexture.get(command.textureKey);
      if (list) list.push(command);
      else byTexture.set(command.textureKey, [command]);
    }
    let drawCalls = 0;
    let vertexCount = 0;
    if (byTexture.size <= 0) return { drawCalls, vertexCount };
    pass.setPipeline(this.handles.spritePipeline);
    pass.setBindGroup(0, this.handles.resolutionBindGroup);
    for (const [textureKey, list] of byTexture) {
      const texture = this.textureCache.get(textureKey);
      if (!texture) continue;
      const vertices = buildSpriteVertices(list, texture);
      const buffer = createBuffer(device, vertices, gpuUsage("VERTEX") | gpuUsage("COPY_DST"));
      transientBuffers.push(buffer);
      pass.setBindGroup(1, texture.bindGroup);
      pass.setVertexBuffer(0, buffer);
      pass.draw(list.length * 6);
      drawCalls += 1;
      vertexCount += list.length * 6;
    }
    return { drawCalls, vertexCount };
  }

  dispose(): void {
    this.disposed = true;
    for (const texture of this.textureCache.values()) {
      texture.texture?.destroy?.();
    }
    this.textureCache.clear();
    this.handles.resolutionBuffer?.destroy?.();
  }
}
