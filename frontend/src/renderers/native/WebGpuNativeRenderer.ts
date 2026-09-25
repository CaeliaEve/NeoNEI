import type { NativeRendererBackend } from "./NativeRendererBackend.ts";
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

type AnyRecord = Record<string, any>;
type GpuNavigator = Navigator & { gpu?: AnyRecord };
type GpuCanvas = OffscreenCanvas & { getContext(type: "webgpu"): AnyRecord | null };

type WebGpuTextureState = {
  texture: AnyRecord;
  bindGroup: AnyRecord;
  width: number;
  height: number;
};

type ReusableGpuBuffer = {
  buffer: AnyRecord;
  capacity: number;
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

export function ensureReusableGpuBuffer(
  device: AnyRecord,
  current: ReusableGpuBuffer | null,
  requiredBytes: number,
  usage: number,
): ReusableGpuBuffer {
  if (current && current.capacity >= requiredBytes) return current;
  let capacity = Math.max(1024, current?.capacity ?? 1);
  while (capacity < requiredBytes) capacity *= 2;
  const replacement = {
    buffer: device.createBuffer({ size: capacity, usage }),
    capacity,
  };
  current?.buffer?.destroy?.();
  return replacement;
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

function pushChromeQuadCorners(
  values: Float32Array,
  cursor: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  cTL: number[],
  cTR: number[],
  cBL: number[],
  cBR: number[],
): number {
  const vertices = [x1, y1, x2, y1, x1, y2, x1, y2, x2, y1, x2, y2];
  // 6 vertices: V1 (TL), V2 (TR), V3 (BL), V4 (BL), V5 (TR), V6 (BR)
  const colors = [cTL, cTR, cBL, cBL, cTR, cBR];
  for (let v = 0; v < 6; v += 1) {
    values[cursor++] = vertices[v * 2];
    values[cursor++] = vertices[v * 2 + 1];
    const color = colors[v];
    values[cursor++] = color[0];
    values[cursor++] = color[1];
    values[cursor++] = color[2];
    values[cursor++] = color[3];
  }
  return cursor;
}

function buildChromeVertices(commands: NativeLayoutCommandBatch): { vertices: Float32Array; vertexCount: number } {
  // Allocate exactly for the base quad plus compact plus/minus marker quads.
  // WebGPU remains opt-in, but it should not pay oversized transient-buffer
  // costs while mirroring the validated WebGL2 native chrome.
  let chromeQuadCount = 0;
  const { values: commandValues, stride, count, fieldOffsets } = commands;
  for (let index = 0; index < count; index += 1) {
    const offset = index * stride;
    const flags = commandValues[offset + fieldOffsets.flags] ?? 0;
    chromeQuadCount += 1;
    if ((flags & 1) !== 0) chromeQuadCount += 2;
    else if ((flags & 2) !== 0 || (flags & 16) !== 0) chromeQuadCount += 1;
  }
  const values = new Float32Array(chromeQuadCount * 6 * 6);
  let cursor = 0;
  let vertexCount = 0;
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

    cursor = pushChromeQuadCorners(values, cursor, x1, y1, x2, y2, cTL, cTR, cBL, cBR);
    vertexCount += 6;

    // Draw outlines (Completely borderless, no line connectors)

    // Plus/Minus badges (Stable positions: do not shift with hover inset)
    if (isGroup) {
      const plusColor = isHovered ? [0.94, 0.96, 1.0, 0.95] : [0.78, 0.82, 0.88, 0.65]; // Premium starlight white on hover, starlight silver when inactive
      const bx2 = x + size;
      const by1 = y;
      // Horizontal line
      cursor = pushChromeQuad(values, cursor, bx2 - 17, by1 + 12.25, bx2 - 9, by1 + 13.75, plusColor);
      // Vertical line
      cursor = pushChromeQuad(values, cursor, bx2 - 13.75, by1 + 9, bx2 - 12.25, by1 + 17, plusColor);
      vertexCount += 12;
    } else if (isGroupHeader || isGroupMember) {
      const minusColor = isHovered ? [0.94, 0.96, 1.0, 0.95] : [0.78, 0.82, 0.88, 0.65]; // Premium starlight white on hover, starlight silver when inactive
      const bx2 = x + size;
      const by1 = y;
      cursor = pushChromeQuad(values, cursor, bx2 - 17, by1 + 12.25, bx2 - 9, by1 + 13.75, minusColor);
      vertexCount += 6;
    }
  }
  return { vertices: values.subarray(0, cursor), vertexCount };
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
  private chromeVertexBuffer: ReusableGpuBuffer | null = null;
  private readonly spriteVertexBuffers = new Map<string, ReusableGpuBuffer>();

  static async probe(activeCanvas: OffscreenCanvas): Promise<NativeRendererProbeResult> {
    WebGpuNativeRenderer.lastInitializationError = null;
    if (!hasWebGpu()) return nativeRendererProbeUnsupported("webgpu", "webgpu navigator API unavailable");
    const handles = await requestWebGpuHandles(activeCanvas).catch((error) => {
      WebGpuNativeRenderer.lastInitializationError = error instanceof Error ? error.message : String(error);
      return null;
    });
    if (!handles && !WebGpuNativeRenderer.lastInitializationError) {
      WebGpuNativeRenderer.lastInitializationError = "webgpu adapter/device/context unavailable";
    }
    if (!handles) {
      return nativeRendererProbeFailed(
        "webgpu",
        WebGpuNativeRenderer.lastInitializationError ?? "webgpu renderer initialization failed",
      );
    }
    return nativeRendererProbeSupported(new WebGpuNativeRenderer(handles));
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
    commands: NativeLayoutCommandBatch,
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
    if (commands.count > 0) {
      const chrome = buildChromeVertices(commands);
      this.chromeVertexBuffer = ensureReusableGpuBuffer(
        device,
        this.chromeVertexBuffer,
        chrome.vertices.byteLength,
        gpuUsage("VERTEX") | gpuUsage("COPY_DST"),
      );
      device.queue.writeBuffer(this.chromeVertexBuffer.buffer, 0, chrome.vertices);
      pass.setPipeline(this.handles.chromePipeline);
      pass.setBindGroup(0, this.handles.resolutionBindGroup);
      pass.setVertexBuffer(0, this.chromeVertexBuffer.buffer);
      pass.draw(chrome.vertexCount);
      drawCalls += 1;
      vertexCount += chrome.vertexCount;
    }

    const spriteStats = this.renderSprites(device, pass, spriteCommands);
    drawCalls += spriteStats.drawCalls;
    vertexCount += spriteStats.vertexCount;
    pass.end();
    device.queue.submit([encoder.finish()]);
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
      const bufferState = ensureReusableGpuBuffer(
        device,
        this.spriteVertexBuffers.get(textureKey) ?? null,
        vertices.byteLength,
        gpuUsage("VERTEX") | gpuUsage("COPY_DST"),
      );
      this.spriteVertexBuffers.set(textureKey, bufferState);
      device.queue.writeBuffer(bufferState.buffer, 0, vertices);
      pass.setBindGroup(1, texture.bindGroup);
      pass.setVertexBuffer(0, bufferState.buffer);
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
    this.chromeVertexBuffer?.buffer?.destroy?.();
    this.chromeVertexBuffer = null;
    for (const buffer of this.spriteVertexBuffers.values()) {
      buffer.buffer?.destroy?.();
    }
    this.spriteVertexBuffers.clear();
    this.handles.resolutionBuffer?.destroy?.();
  }
}
