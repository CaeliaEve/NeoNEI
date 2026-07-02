import { getForestryGeneticsService, type ForestryGeneticsOverview } from './forestry-genetics.service';
import { getGTDiagramsService, type GTDiagramOverview } from './gt-diagrams.service';
import { getMultiblocksService, type MultiblockBlueprint } from './multiblocks.service';
import { badRequest, notFound } from '../utils/http';

export function getCurrentRuntimeGTDiagramsOverview(): GTDiagramOverview {
  return getGTDiagramsService().getOverview();
}

export function getCurrentRuntimeForestryGeneticsOverview(): ForestryGeneticsOverview {
  return getForestryGeneticsService().getOverview();
}

export function getCurrentRuntimeMultiblockBlueprint(controllerItemId: string | undefined): MultiblockBlueprint {
  const normalizedControllerItemId = `${controllerItemId ?? ''}`.trim();
  if (!normalizedControllerItemId) {
    throw badRequest('controllerItemId is required');
  }

  const blueprint = getMultiblocksService().getBlueprintByControllerItemId(normalizedControllerItemId);
  if (!blueprint) {
    throw notFound('Multiblock blueprint not found');
  }
  return blueprint;
}
