import type { NativeRendererBackend } from "./NativeRendererBackend";
import type { NativeRenderCommand, NativeRendererStats, NativeTextureSpriteCommand } from "./WebGl2NativeRenderer";

type GpuNavigator = Navigator & { gpu?: unknown };
type GpuCanvas = OffscreenCanvas & { getContext(type: "webgpu"): unknown };

type WebGpuHandles = {
  adapter: unknown;
  device: unknown;
  context: unknown;
  format: string;
};

function hasWebGpu(): boolean {
  return Boolean((navigator as GpuNavigator).gpu);
}

async function requestWebGpuHandles(canvas: OffscreenCanvas): Promise<WebGpuHandles | null> {
  const gpu = (navigator as GpuNavigator).gpu as {
    requestAdapter?: () => Promise<unknown>;
    getPreferredCanvasFormat?: () => string;
  } | undefined;
  if (!gpu?.requestAdapter) return null;
  const adapter = await gpu.requestAdapter();
  const requestDevice = (adapter as { requestDevice?: () => Promise<unknown> } | null)?.requestDevice;
  if (!adapter || !requestDevice) return null;
  const device = await requestDevice.call(adapter);
  const context = (canvas as GpuCanvas).getContext("webgpu") as {
    configure?: (descriptor: Record<string, unknown>) => void;
  } | null;
  if (!device || !context?.configure) return null;
  const format = gpu.getPreferredCanvasFormat?.() ?? "bgra8unorm";
  context.configure({
    device,
    format,
    alphaMode: "premultiplied",
  });
  return { adapter, device, context, format };
}

export class WebGpuNativeRenderer implements NativeRendererBackend {
  readonly backend = "webgpu" as const;
  private disposed = false;
  private textureKeys = new Set<string>();
  private readonly handles: WebGpuHandles;

  static async create(activeCanvas: OffscreenCanvas): Promise<WebGpuNativeRenderer | null> {
    if (!hasWebGpu()) return null;
    const handles = await requestWebGpuHandles(activeCanvas).catch(() => null);
    if (!handles) return null;
    return new WebGpuNativeRenderer(handles);
  }

  private constructor(handles: WebGpuHandles) {
    this.handles = handles;
  }

  registerTexture(key: string, _bitmap: ImageBitmap): boolean {
    if (this.disposed || !key) return false;
    // Full WebGPU atlas upload is intentionally staged after the backend
    // handshake. The renderer still records residency intent so metrics and
    // future upload code share the same texture registry contract.
    this.textureKeys.add(key);
    return true;
  }

  textureCount(): number {
    return this.textureKeys.size;
  }

  render(
    _activeWidth: number,
    _activeHeight: number,
    commands: NativeRenderCommand[],
    spriteCommands: NativeTextureSpriteCommand[] = [],
  ): NativeRendererStats {
    void this.handles;
    // The WebGPU backend is scaffolded behind explicit selection until the
    // sprite pipeline lands. WebGL2 remains the visible compatible backend.
    return {
      drawCalls: 0,
      vertexCount: 0,
      spriteDrawCalls: 0,
      spriteVertexCount: 0,
    };
  }

  dispose(): void {
    this.disposed = true;
    this.textureKeys.clear();
  }
}
