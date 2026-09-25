import type {
  NativeSurfaceLayoutCommand,
  NativeRendererBackendKind,
  NativeSurfaceId,
  NativeSurfaceViewportRole,
  NativeSurfaceViewport,
} from "./contracts";
import type { NativeRenderSpriteCommand } from "./NativeSurfaceRenderProtocol";
import type { NativeRuntimePackName, NativeRuntimePackSchema } from "./NativeRuntimeManifest";

export type NativeSurfaceEngineEntry = {
  key: string;
  kind: "item" | "group-collapsed" | "group-header";
  entryIndex: number;
  itemId: string;
  groupKey?: string | null;
};

export type NativeSurfaceEngineLayoutCommand = NativeSurfaceLayoutCommand;
export type NativeSurfaceEngineSpriteCommand = NativeRenderSpriteCommand;

export const NATIVE_SURFACE_LAYOUT_COMMAND_U32_STRIDE = 9;

export type NativeSurfaceEngineRuntimePack = {
  name: NativeRuntimePackName;
  path: string;
  url: string;
  schema: NativeRuntimePackSchema;
  byteLength: number;
  payloadLength: number;
  payloadEncoding?: "json" | "compact-browser-table" | "binary";
  buffer: ArrayBuffer;
};

export type NativeSurfaceEngineTooltipData = {
  itemId: string;
  publicItemId?: string | null;
  localizedName?: string | null;
  modId?: string | null;
  internalName?: string | null;
  groupKey?: string | null;
  groupLabel?: string | null;
  groupSize?: number | null;
};

export type NativeSurfaceEngineHit = {
  key: string;
  kind: NativeSurfaceEngineEntry["kind"];
  entryIndex: number;
  itemId: string;
  groupKey?: string | null;
  viewport: NativeSurfaceViewportRole;
  tooltip?: NativeSurfaceEngineTooltipData | null;
} | null;

export type NativeSurfaceEngineRequest =
  | {
    type: "connectRenderPort";
    id: number;
    surfaceId: NativeSurfaceId;
    sessionId: string;
    port: MessagePort;
  }
  | {
    type: "disconnectRenderPort";
    id: number;
    surfaceId: NativeSurfaceId;
    sessionId: string;
  }
  | {
    type: "initialize";
    id: number;
    surfaceId: NativeSurfaceId;
    preferredRenderer: NativeRendererBackendKind;
    enableAnimations: boolean;
    enableHistoryViewport: boolean;
  }
  | {
    type: "runtimePacks";
    id: number;
    surfaceId: NativeSurfaceId;
    manifestUrl: string;
    packs: NativeSurfaceEngineRuntimePack[];
  }
  | {
    type: "viewport";
    id: number;
    surfaceId: NativeSurfaceId;
    viewport: NativeSurfaceViewport;
  }
  | {
    type: "page";
    id: number;
    surfaceId: NativeSurfaceId;
    page: number;
  }
  | {
    type: "search";
    id: number;
    surfaceId: NativeSurfaceId;
    query: string;
  }
  | {
    type: "modFilter";
    id: number;
    surfaceId: NativeSurfaceId;
    modId: string | null;
  }
  | {
    type: "expandedGroups";
    id: number;
    surfaceId: NativeSurfaceId;
    groupKeys: string[];
  }
  | {
    type: "historyItems";
    id: number;
    surfaceId: NativeSurfaceId;
    itemIds: string[];
  }
  | {
    type: "itemSize";
    id: number;
    surfaceId: NativeSurfaceId;
    itemSize: number;
  }
  | {
    type: "selectedItem";
    id: number;
    surfaceId: NativeSurfaceId;
    itemId: string | null;
  }
  | {
    type: "mutationBatch";
    id: number;
    surfaceId: NativeSurfaceId;
    mutations: NativeSurfaceEngineMutation[];
  }
  | {
    type: "frame";
    id: number;
    surfaceId: NativeSurfaceId;
    nowMs: number;
  }
  | {
    type: "hitTest";
    id: number;
    surfaceId: NativeSurfaceId;
    x: number;
    y: number;
    clientX: number;
    clientY: number;
    viewport: NativeSurfaceViewportRole;
  }
  | {
    type: "destroy";
    id: number;
    surfaceId: NativeSurfaceId;
  };

const NATIVE_SURFACE_ENGINE_REQUEST_TYPES = new Set<NativeSurfaceEngineRequest["type"]>([
  "connectRenderPort",
  "disconnectRenderPort",
  "initialize",
  "runtimePacks",
  "viewport",
  "page",
  "search",
  "modFilter",
  "expandedGroups",
  "historyItems",
  "itemSize",
  "selectedItem",
  "mutationBatch",
  "frame",
  "hitTest",
  "destroy",
]);

export function validateNativeSurfaceEngineRequestEnvelope(value: unknown): string | null {
  if (!value || typeof value !== "object") return "request must be an object";
  const request = value as Record<string, unknown>;
  if (!Number.isSafeInteger(request.id)) return "request id must be a safe integer";
  if (typeof request.surfaceId !== "string" || request.surfaceId.length === 0) {
    return "surfaceId must be a non-empty string";
  }
  if (
    typeof request.type !== "string"
    || !NATIVE_SURFACE_ENGINE_REQUEST_TYPES.has(request.type as NativeSurfaceEngineRequest["type"])
  ) {
    return `unsupported request type: ${String(request.type)}`;
  }
  return null;
}

export type NativeSurfaceEngineMutation =
  | { type: "viewport"; viewport: NativeSurfaceViewport }
  | { type: "page"; page: number }
  | { type: "search"; query: string }
  | { type: "modFilter"; modId: string | null }
  | { type: "expandedGroups"; groupKeys: string[] }
  | { type: "historyItems"; itemIds: string[] }
  | { type: "itemSize"; itemSize: number }
  | { type: "selectedItem"; itemId: string | null };

export type NativeSurfaceEngineResponse =
  | {
    type: "error";
    id: number;
    surfaceId: NativeSurfaceId;
    error: string;
    metrics: NativeSurfaceEngineWorkerMetrics;
  }
  | {
    type: "ack";
    id: number;
    surfaceId: NativeSurfaceId;
    event: NativeSurfaceEngineRequest["type"];
    metrics: NativeSurfaceEngineWorkerMetrics;
  }
  | {
    type: "frame";
    id: number;
    surfaceId: NativeSurfaceId;
    frameToken: number;
    rendered: boolean;
    missingTextureKeys: string[];
    hasAnimatedSprites: boolean;
    animatedSpriteCount: number;
    nextFrameDelayMs: number | null;
    metrics: NativeSurfaceEngineWorkerMetrics;
  }
  | {
    type: "hitTest";
    id: number;
    surfaceId: NativeSurfaceId;
    hit: NativeSurfaceEngineHit;
    metrics: NativeSurfaceEngineWorkerMetrics;
  };

export type NativeSurfaceEngineWorkerMetrics = {
  surfaceCount: number;
  initializedSurfaces: number;
  runtimePackBytes: number;
  events: number;
  lastEvent: NativeSurfaceEngineRequest["type"] | null;
  lastSurfaceId: NativeSurfaceId | null;
  layoutCommands: number;
  layoutRebuilds: number;
  frameRequests: number;
  lastHit: NativeSurfaceEngineHit;
  wasmReady: boolean;
  wasmError: string | null;
  runtimeReady: boolean;
  runtimePacks: number;
  runtimeError: string | null;
  projectionSource: "runtime-browser-pack" | "runtime-history-pack" | "empty";
  nativeBrowserEntries: number;
  nativeBrowserProjectedEntries: number;
  nativeBrowserWasmEntries: number;
  nativeBrowserWasmProjectedEntries: number;
  nativeGroupWasmEntries: number;
  nativeStringWasmEntries: number;
  nativeTextureWasmEntries: number;
  nativeAnimationWasmEntries: number;
  nativeBrowserStrings: number;
  currentPage: number;
  currentQuery: string;
  currentModFilter: string | null;
  currentPageSize: number;
  currentWindowEntries: number;
  lastProjectionMs: number;
  lastProjectionTotalEntries: number;
  lastProjectionQuery: string;
  lastProjectionSource: "browser" | "search" | "empty";
  hasAnimatedSprites: boolean;
  animatedSpriteCount: number;
  spriteCommandCount: number;
  missingSpriteCount: number;
  missingSpriteItemIds: string[];
  nextFrameDelayMs: number | null;
  updatedAt: number;
};
