import type {
  NativeSurfaceLayoutCommand,
  NativeRendererBackendKind,
  NativeSurfaceId,
  NativeSurfaceViewportRole,
  NativeSurfaceViewport,
} from "./contracts";
import type { NativeRuntimePackName, NativeRuntimePackSchema } from "./NativeRuntimeManifest";

export type NativeSurfaceEngineEntry = {
  key: string;
  kind: "item" | "group-collapsed" | "group-header";
  entryIndex: number;
  itemId: string;
  groupKey?: string | null;
};

export type NativeSurfaceEngineLayoutCommand = NativeSurfaceLayoutCommand;

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


export type NativeSurfaceEngineHit = {
  key: string;
  kind: NativeSurfaceEngineEntry["kind"];
  entryIndex: number;
  itemId: string;
  groupKey?: string | null;
  viewport: NativeSurfaceViewportRole;
} | null;

export type NativeSurfaceEngineRequest =
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
    type: "compatEntries";
    id: number;
    surfaceId: NativeSurfaceId;
    entries: NativeSurfaceEngineEntry[];
  }
  | {
    type: "itemSize";
    id: number;
    surfaceId: NativeSurfaceId;
    itemSize: number;
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

export type NativeSurfaceEngineMutation =
  | { type: "viewport"; viewport: NativeSurfaceViewport }
  | { type: "page"; page: number }
  | { type: "search"; query: string }
  | { type: "modFilter"; modId: string | null }
  | { type: "expandedGroups"; groupKeys: string[] }
  | { type: "historyItems"; itemIds: string[] }
  | { type: "compatEntries"; entries: NativeSurfaceEngineEntry[] }
  | { type: "itemSize"; itemSize: number };

export type NativeSurfaceEngineResponse =
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
    drawCommands: NativeSurfaceEngineLayoutCommand[];
    commandBuffer: ArrayBuffer;
    commandStride: number;
    commandCount: number;
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
  initializedSurfaces: number;
  events: number;
  lastEvent: NativeSurfaceEngineRequest["type"] | null;
  lastSurfaceId: NativeSurfaceId | null;
  layoutCommands: number;
  lastHit: NativeSurfaceEngineHit;
  wasmReady: boolean;
  wasmError: string | null;
  runtimeReady: boolean;
  runtimePacks: number;
  runtimeError: string | null;
  projectionSource: "runtime-browser-pack" | "compat-entries" | "empty";
  nativeBrowserEntries: number;
  nativeBrowserProjectedEntries: number;
  nativeBrowserWasmEntries: number;
  nativeBrowserWasmProjectedEntries: number;
  nativeBrowserStrings: number;
  updatedAt: number;
};





