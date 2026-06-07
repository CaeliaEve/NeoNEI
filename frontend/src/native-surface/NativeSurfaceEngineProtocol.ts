import type {
  NativeSurfaceLayoutCommand,
  NativeRendererBackendKind,
  NativeSurfaceId,
  NativeSurfaceViewportRole,
  NativeSurfaceViewport,
} from "./contracts";

export type NativeSurfaceEngineEntry = {
  key: string;
  kind: "item" | "group-collapsed" | "group-header";
  entryIndex: number;
  itemId: string;
  groupKey?: string | null;
};

export type NativeSurfaceEngineLayoutCommand = NativeSurfaceLayoutCommand;

export const NATIVE_SURFACE_LAYOUT_COMMAND_U32_STRIDE = 8;


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
  updatedAt: number;
};





