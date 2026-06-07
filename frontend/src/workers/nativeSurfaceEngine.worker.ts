import type {
  NativeSurfaceEngineRequest,
  NativeSurfaceEngineResponse,
  NativeSurfaceEngineWorkerMetrics,
} from "../native-surface/NativeSurfaceEngineProtocol";
import type {
  NativeRendererBackendKind,
  NativeSurfaceId,
  NativeSurfaceViewport,
} from "../native-surface/contracts";

type SurfaceState = {
  initialized: boolean;
  renderer: NativeRendererBackendKind;
  viewport: NativeSurfaceViewport | null;
  enableAnimations: boolean;
  enableHistoryViewport: boolean;
  page: number;
  query: string;
  modId: string | null;
  expandedGroups: string[];
  historyItems: string[];
};

const surfaces = new Map<NativeSurfaceId, SurfaceState>();
let events = 0;
let lastEvent: NativeSurfaceEngineRequest["type"] | null = null;
let lastSurfaceId: NativeSurfaceId | null = null;

function getSurface(surfaceId: NativeSurfaceId): SurfaceState {
  const existing = surfaces.get(surfaceId);
  if (existing) return existing;
  const next: SurfaceState = {
    initialized: false,
    renderer: "compat-canvas",
    viewport: null,
    enableAnimations: false,
    enableHistoryViewport: false,
    page: 1,
    query: "",
    modId: null,
    expandedGroups: [],
    historyItems: [],
  };
  surfaces.set(surfaceId, next);
  return next;
}

function buildMetrics(): NativeSurfaceEngineWorkerMetrics {
  return {
    initializedSurfaces: Array.from(surfaces.values()).filter((surface) => surface.initialized).length,
    events,
    lastEvent,
    lastSurfaceId,
    updatedAt: performance.now(),
  };
}

function handleRequest(message: NativeSurfaceEngineRequest): NativeSurfaceEngineResponse {
  const surface = getSurface(message.surfaceId);
  events += 1;
  lastEvent = message.type;
  lastSurfaceId = message.surfaceId;

  switch (message.type) {
    case "initialize":
      surface.initialized = true;
      surface.renderer = message.preferredRenderer;
      surface.enableAnimations = message.enableAnimations;
      surface.enableHistoryViewport = message.enableHistoryViewport;
      break;
    case "viewport":
      surface.viewport = message.viewport;
      break;
    case "page":
      surface.page = Math.max(1, Math.floor(Number(message.page) || 1));
      break;
    case "search":
      surface.query = `${message.query ?? ""}`;
      break;
    case "modFilter":
      surface.modId = message.modId ? `${message.modId}` : null;
      break;
    case "expandedGroups":
      surface.expandedGroups = Array.from(new Set(message.groupKeys));
      break;
    case "historyItems":
      surface.historyItems = Array.from(new Set(message.itemIds));
      break;
    case "destroy":
      surface.initialized = false;
      break;
  }

  return {
    type: "ack",
    id: message.id,
    surfaceId: message.surfaceId,
    event: message.type,
    metrics: buildMetrics(),
  };
}

self.onmessage = (event: MessageEvent<NativeSurfaceEngineRequest>) => {
  const message = event.data;
  if (!message?.type || !message.surfaceId) return;
  self.postMessage(handleRequest(message));
};
