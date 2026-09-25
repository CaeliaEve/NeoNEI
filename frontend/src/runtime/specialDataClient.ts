import type {
  ForestryGeneticsOverview,
  GTDiagramsOverview,
  MultiblockBlueprint,
} from './types';
import { http } from '../services/api/core/http';

type CurrentApiEnvelope<T> = {
  ok: true;
  data: T;
};

let gtDiagramsOverviewCache: GTDiagramsOverview | null = null;
let gtDiagramsOverviewInFlight: Promise<GTDiagramsOverview> | null = null;
let forestryGeneticsOverviewCache: ForestryGeneticsOverview | null = null;
let forestryGeneticsOverviewInFlight: Promise<ForestryGeneticsOverview> | null = null;

async function getCurrentRuntimeData<T>(path: string): Promise<T> {
  const response = await http.get<CurrentApiEnvelope<T>>(`/runtime/current/data/${path}`);
  return response.data.data;
}

function cachedOverview<T>(
  cached: T | null,
  inFlight: Promise<T> | null,
  start: () => Promise<T>,
  commit: (value: T | null, request: Promise<T> | null) => void,
): Promise<T> {
  if (cached) {
    return Promise.resolve(cached);
  }
  if (inFlight) {
    return inFlight;
  }
  const request = start()
    .then((payload) => {
      commit(payload, request);
      return payload;
    })
    .finally(() => {
      commit(null, null);
    });
  commit(null, request);
  return request;
}

export const specialDataRuntimeClient = {
  clear(): void {
    gtDiagramsOverviewCache = null;
    gtDiagramsOverviewInFlight = null;
    forestryGeneticsOverviewCache = null;
    forestryGeneticsOverviewInFlight = null;
  },

  getMultiblockBlueprint(controllerItemId: string): Promise<MultiblockBlueprint> {
    return getCurrentRuntimeData<MultiblockBlueprint>(`multiblocks/${encodeURIComponent(controllerItemId)}`);
  },

  getGTDiagramsOverview(): Promise<GTDiagramsOverview> {
    return cachedOverview(
      gtDiagramsOverviewCache,
      gtDiagramsOverviewInFlight,
      () => getCurrentRuntimeData<GTDiagramsOverview>('gt-diagrams/overview'),
      (value, request) => {
        if (value) gtDiagramsOverviewCache = value;
        gtDiagramsOverviewInFlight = request;
      },
    );
  },

  getForestryGeneticsOverview(): Promise<ForestryGeneticsOverview> {
    return cachedOverview(
      forestryGeneticsOverviewCache,
      forestryGeneticsOverviewInFlight,
      () => getCurrentRuntimeData<ForestryGeneticsOverview>('forestry-genetics/overview'),
      (value, request) => {
        if (value) forestryGeneticsOverviewCache = value;
        forestryGeneticsOverviewInFlight = request;
      },
    );
  },
};
