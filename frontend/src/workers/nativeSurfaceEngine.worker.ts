import type {
  NativeSurfaceEngineRequest,
  NativeSurfaceEngineResponse,
  NativeSurfaceEngineEntry,
  NativeSurfaceEngineHit,
  NativeSurfaceEngineLayoutCommand,
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
  itemSize: number;
  query: string;
  modId: string | null;
  expandedGroups: string[];
  historyItems: string[];
  entries: NativeSurfaceEngineEntry[];
  layoutCommands: NativeSurfaceEngineLayoutCommand[];
  lastHit: NativeSurfaceEngineHit;
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
    itemSize: 44,
    query: "",
    modId: null,
    expandedGroups: [],
    historyItems: [],
    entries: [],
    layoutCommands: [],
    lastHit: null,
  };
  surfaces.set(surfaceId, next);
  return next;
}

function rebuildLayout(surface: SurfaceState): void {
  const viewportWidth = Math.max(1, Math.floor(surface.viewport?.width ?? 1));
  const cardSize = Math.max(1, Math.floor(surface.itemSize || 44));
  const iconSize = Math.max(1, Math.floor(cardSize * 0.9));
  const gap = 4;
  const columns = Math.max(1, Math.floor((viewportWidth + gap) / (cardSize + gap)));
  surface.layoutCommands = surface.entries.map((entry, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = col * (cardSize + gap);
    const y = row * (cardSize + gap);
    return {
      key: entry.key,
      kind: entry.kind,
      entryIndex: entry.entryIndex,
      itemId: entry.itemId,
      groupKey: entry.groupKey ?? null,
      x,
      y,
      size: cardSize,
      iconX: x + Math.round((cardSize - iconSize) / 2),
      iconY: y + Math.round((cardSize - iconSize) / 2),
      iconSize,
    };
  });
}

function hitTest(surface: SurfaceState, message: Extract<NativeSurfaceEngineRequest, { type: "hitTest" }>): NativeSurfaceEngineHit {
  const hit = surface.layoutCommands.find((command) =>
    message.x >= command.x
    && message.x <= command.x + command.size
    && message.y >= command.y
    && message.y <= command.y + command.size
  );
  if (!hit) {
    surface.lastHit = null;
    return null;
  }
  surface.lastHit = {
    key: hit.key,
    kind: hit.kind,
    entryIndex: hit.entryIndex,
    itemId: hit.itemId,
    groupKey: hit.groupKey ?? null,
    viewport: message.viewport,
  };
  return surface.lastHit;
}

function buildMetrics(): NativeSurfaceEngineWorkerMetrics {
  const lastSurface = lastSurfaceId ? surfaces.get(lastSurfaceId) : null;
  return {
    initializedSurfaces: Array.from(surfaces.values()).filter((surface) => surface.initialized).length,
    events,
    lastEvent,
    lastSurfaceId,
    layoutCommands: lastSurface?.layoutCommands.length ?? 0,
    lastHit: lastSurface?.lastHit ?? null,
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
      rebuildLayout(surface);
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
    case "compatEntries":
      surface.entries = message.entries;
      rebuildLayout(surface);
      break;
    case "itemSize":
      surface.itemSize = Math.max(1, Math.floor(Number(message.itemSize) || 1));
      rebuildLayout(surface);
      break;
    case "frame":
      rebuildLayout(surface);
      return {
        type: "frame",
        id: message.id,
        surfaceId: message.surfaceId,
        drawCommands: surface.layoutCommands,
        metrics: buildMetrics(),
      };
    case "hitTest":
      return {
        type: "hitTest",
        id: message.id,
        surfaceId: message.surfaceId,
        hit: hitTest(surface, message),
        metrics: buildMetrics(),
      };
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
