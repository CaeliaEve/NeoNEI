import type {
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

export type NativeSurfaceEngineLayoutCommand = {
  key: string;
  kind: NativeSurfaceEngineEntry["kind"];
  entryIndex: number;
  itemId: string;
  groupKey?: string | null;
  x: number;
  y: number;
  size: number;
  iconX: number;
  iconY: number;
  iconSize: number;
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
  updatedAt: number;
};
