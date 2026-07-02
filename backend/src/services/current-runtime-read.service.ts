import type { CurrentRuntimeApiContext } from './current-runtime-api.service';
import { getCurrentRuntimeOverview } from './current-runtime-api.service';
import {
  getCurrentRuntimeDiagnosticsHealth,
  getCurrentRuntimeDiagnosticsSummary,
  getCurrentRuntimeNativeSurfaceMetrics,
} from './current-runtime-observability.service';
import {
  getCurrentRecipeItemProducedBy,
  getCurrentRecipeItemUsedIn,
  getCurrentRecipePage,
} from './current-runtime-recipe-api.service';
import { getCurrentRuntimeSettings } from './current-runtime-settings.service';
import {
  getCurrentRuntimeForestryGeneticsOverview,
  getCurrentRuntimeGTDiagramsOverview,
  getCurrentRuntimeMultiblockBlueprint,
} from './current-runtime-special-data.service';

export function getCurrentRuntimeOverviewPayload(context: CurrentRuntimeApiContext): unknown {
  return getCurrentRuntimeOverview(context);
}

export async function getCurrentRuntimeRecipeProducedByPayload(itemIdParam: string | undefined): Promise<unknown> {
  return getCurrentRecipeItemProducedBy(itemIdParam);
}

export async function getCurrentRuntimeRecipeUsedInPayload(itemIdParam: string | undefined): Promise<unknown> {
  return getCurrentRecipeItemUsedIn(itemIdParam);
}

export async function getCurrentRuntimeRecipePagePayload(recipePageIdParam: string | undefined): Promise<unknown> {
  return getCurrentRecipePage(recipePageIdParam);
}

export function getCurrentRuntimeDiagnosticsHealthPayload(context: CurrentRuntimeApiContext): unknown {
  return getCurrentRuntimeDiagnosticsHealth(context);
}

export function getCurrentRuntimeDiagnosticsSummaryPayload(context: CurrentRuntimeApiContext): unknown {
  return getCurrentRuntimeDiagnosticsSummary(context);
}

export function getCurrentRuntimeNativeSurfaceMetricsPayload(context: CurrentRuntimeApiContext): unknown {
  return getCurrentRuntimeNativeSurfaceMetrics(context);
}

export function getCurrentRuntimeSettingsPayload(): unknown {
  return getCurrentRuntimeSettings();
}

export function getCurrentRuntimeGTDiagramsOverviewPayload(): unknown {
  return getCurrentRuntimeGTDiagramsOverview();
}

export function getCurrentRuntimeForestryGeneticsOverviewPayload(): unknown {
  return getCurrentRuntimeForestryGeneticsOverview();
}

export function getCurrentRuntimeMultiblockBlueprintPayload(
  controllerItemIdParam: string | undefined,
): unknown {
  return getCurrentRuntimeMultiblockBlueprint(controllerItemIdParam);
}
