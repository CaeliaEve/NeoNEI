import type {
  NativeRendererBackendKind,
  NativeSurfaceId,
  NativeSurfaceViewport,
} from "./contracts";

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
    type: "destroy";
    id: number;
    surfaceId: NativeSurfaceId;
  };

export type NativeSurfaceEngineResponse = {
  type: "ack";
  id: number;
  surfaceId: NativeSurfaceId;
  event: NativeSurfaceEngineRequest["type"];
  metrics: NativeSurfaceEngineWorkerMetrics;
};

export type NativeSurfaceEngineWorkerMetrics = {
  initializedSurfaces: number;
  events: number;
  lastEvent: NativeSurfaceEngineRequest["type"] | null;
  lastSurfaceId: NativeSurfaceId | null;
  updatedAt: number;
};
