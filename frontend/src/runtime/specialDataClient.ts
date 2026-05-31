import { getLabPayload } from './devCompatClient';
import type {
  EcosystemOverview,
  ForestryGeneticsOverview,
  GTDiagramsOverview,
  MultiblockBlueprint,
} from './types';

let ecosystemOverviewCache: EcosystemOverview | null = null;
let ecosystemOverviewInFlight: Promise<EcosystemOverview> | null = null;

export const specialDataRuntimeClient = {
  clear(): void {
    ecosystemOverviewCache = null;
    ecosystemOverviewInFlight = null;
  },

  getEcosystemOverview(): Promise<EcosystemOverview> {
    if (ecosystemOverviewCache) {
      return Promise.resolve(ecosystemOverviewCache);
    }
    if (ecosystemOverviewInFlight) {
      return ecosystemOverviewInFlight;
    }
    const request = getLabPayload<EcosystemOverview>('/ecosystem/overview')
      .then((payload) => {
        ecosystemOverviewCache = payload;
        return payload;
      })
      .finally(() => {
        ecosystemOverviewInFlight = null;
      });
    ecosystemOverviewInFlight = request;
    return request;
  },

  getMultiblockBlueprint(controllerItemId: string): Promise<MultiblockBlueprint> {
    return getLabPayload<MultiblockBlueprint>(`/multiblocks/${encodeURIComponent(controllerItemId)}`);
  },

  getGTDiagramsOverview(): Promise<GTDiagramsOverview> {
    return getLabPayload<GTDiagramsOverview>('/gt-diagrams/overview');
  },

  getForestryGeneticsOverview(): Promise<ForestryGeneticsOverview> {
    return getLabPayload<ForestryGeneticsOverview>('/forestry-genetics/overview');
  },
};
