import type { CurrentRuntimeApiContext } from './current-runtime-api.service';
import {
  readCurrentRuntimeAsyncParamPayload,
  readCurrentRuntimeContextPayload,
  readCurrentRuntimeStaticPayload,
  readCurrentRuntimeSyncParamPayload,
} from './current-runtime-read-catalog';

export {
  CURRENT_RUNTIME_READ_OPERATION_DESCRIPTORS,
  CURRENT_RUNTIME_READ_OPERATIONS,
  getCurrentRuntimeReadOperation,
  readCurrentRuntimeAsyncParamPayload,
  readCurrentRuntimeContextPayload,
  readCurrentRuntimeStaticPayload,
  readCurrentRuntimeSyncParamPayload,
  type CurrentRuntimeReadOperationDescriptor,
  type CurrentRuntimeReadOperationKey,
  type CurrentRuntimeReadOperationMode,
} from './current-runtime-read-catalog';

export function getCurrentRuntimeOverviewPayload(context: CurrentRuntimeApiContext): unknown {
  return readCurrentRuntimeContextPayload('overview', context);
}

export async function getCurrentRuntimeRecipeProducedByPayload(itemIdParam: string | undefined): Promise<unknown> {
  return readCurrentRuntimeAsyncParamPayload('recipeProducedBy', itemIdParam);
}

export async function getCurrentRuntimeRecipeUsedInPayload(itemIdParam: string | undefined): Promise<unknown> {
  return readCurrentRuntimeAsyncParamPayload('recipeUsedIn', itemIdParam);
}

export async function getCurrentRuntimeRecipePagePayload(recipePageIdParam: string | undefined): Promise<unknown> {
  return readCurrentRuntimeAsyncParamPayload('recipePage', recipePageIdParam);
}

export function getCurrentRuntimeDiagnosticsHealthPayload(context: CurrentRuntimeApiContext): unknown {
  return readCurrentRuntimeContextPayload('diagnosticsHealth', context);
}

export function getCurrentRuntimeDiagnosticsSummaryPayload(context: CurrentRuntimeApiContext): unknown {
  return readCurrentRuntimeContextPayload('diagnosticsSummary', context);
}

export function getCurrentRuntimeNativeSurfaceMetricsPayload(context: CurrentRuntimeApiContext): unknown {
  return readCurrentRuntimeContextPayload('nativeSurfaceMetrics', context);
}

export function getCurrentRuntimeSettingsPayload(): unknown {
  return readCurrentRuntimeStaticPayload('settings');
}

export function getCurrentRuntimeGTDiagramsOverviewPayload(): unknown {
  return readCurrentRuntimeStaticPayload('gtDiagramsOverview');
}

export function getCurrentRuntimeForestryGeneticsOverviewPayload(): unknown {
  return readCurrentRuntimeStaticPayload('forestryGeneticsOverview');
}

export function getCurrentRuntimeMultiblockBlueprintPayload(
  controllerItemIdParam: string | undefined,
): unknown {
  return readCurrentRuntimeSyncParamPayload('multiblockBlueprint', controllerItemIdParam);
}
