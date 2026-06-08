import type { NativeRuntimeManifest } from "./NativeRuntimeManifest";
import type { NativeRendererBackendKind, NativeSurfaceViewport } from "./contracts";

export type NativeRenderBackendKind = "webgpu" | "webgl2";

export type NativeRenderInitializeRequest = {
  type: "initialize";
  id: number;
  canvas: OffscreenCanvas;
  renderer: Exclude<NativeRendererBackendKind, "compat-canvas">;
  manifest?: NativeRuntimeManifest | null;
};

export type NativeRenderTextureDescriptor = {
  key: string;
  url: string;
};

export type NativeRenderSpriteCommand = {
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

export type NativeRenderRequest =
  | NativeRenderInitializeRequest
  | {
    type: "loadTextures";
    id: number;
    textures: NativeRenderTextureDescriptor[];
  }
  | {
    type: "resize";
    id: number;
    viewport: NativeSurfaceViewport;
  }
  | {
    type: "render";
    id: number;
    frameToken: number;
    commandBuffer: ArrayBuffer;
    commandStride: number;
    commandCount: number;
    spriteCommands?: NativeRenderSpriteCommand[];
    nowMs: number;
  }
  | {
    type: "setAnimationEnabled";
    id: number;
    enabled: boolean;
  }
  | {
    type: "dispose";
    id: number;
  }
  | {
    type: "metrics";
    id: number;
  };

export type NativeRendererLimits = {
  maxTextureSize: number;
  maxTextureUnits: number;
};

export type NativeRendererFrameMetrics = {
  requestedBackend: Exclude<NativeRendererBackendKind, "compat-canvas"> | null;
  backend: NativeRenderBackendKind | null;
  webgpuAvailable: boolean;
  webgpuUsable: boolean;
  backendFallbackReason: string | null;
  initialized: boolean;
  frames: number;
  commandCount: number;
  drawCalls: number;
  vertexCount: number;
  textureCount: number;
  textureLoaded: number;
  textureErrors: number;
  textureUploadConcurrency: number;
  textureUploadBatches: number;
  latestTextureUploadToken: number;
  cancelledTextureUploads: number;
  lastTextureUploadMs: number;
  lastTextureReadyDelayMs: number;
  lastFrameMs: number;
  lastParseMs: number;
  lastSpriteNormalizeMs: number;
  lastDrawMs: number;
  frameAvgMs: number;
  frameP95Ms: number;
  frameMaxMs: number;
  latestFrameToken: number;
  droppedStaleFrames: number;
  contextLost: boolean;
  contextLostReason: string | null;
  animationEnabled: boolean;
  width: number;
  height: number;
  updatedAt: number;
};

export type NativeRenderResponse =
  | {
    type: "ready";
    id: number;
    backend: NativeRenderBackendKind;
    limits: NativeRendererLimits;
    metrics: NativeRendererFrameMetrics;
  }
  | {
    type: "frame";
    id: number;
    metrics: NativeRendererFrameMetrics;
  }
  | {
    type: "metrics";
    id: number;
    metrics: NativeRendererFrameMetrics;
  }
  | {
    type: "textureLoaded";
    id: number;
    loaded: number;
    total: number;
    metrics: NativeRendererFrameMetrics;
  }
  | {
    type: "disposed";
    id: number;
    metrics: NativeRendererFrameMetrics;
  }
  | {
    type: "error";
    id: number;
    code: string;
    message: string;
    metrics: NativeRendererFrameMetrics;
  };
