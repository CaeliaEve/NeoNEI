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

export type CurrentRuntimeReadOperationKey =
  | 'overview'
  | 'recipeProducedBy'
  | 'recipeUsedIn'
  | 'recipePage'
  | 'diagnosticsHealth'
  | 'diagnosticsSummary'
  | 'nativeSurfaceMetrics'
  | 'settings'
  | 'gtDiagramsOverview'
  | 'forestryGeneticsOverview'
  | 'multiblockBlueprint';

export type CurrentRuntimeReadOperationMode =
  | 'context-sync'
  | 'param-async'
  | 'static-sync'
  | 'param-sync';

export type CurrentRuntimeContextReadDescriptor = Readonly<{
  key: CurrentRuntimeReadOperationKey;
  mode: 'context-sync';
  read: (context: CurrentRuntimeApiContext) => unknown;
}>;

export type CurrentRuntimeAsyncParamReadDescriptor = Readonly<{
  key: CurrentRuntimeReadOperationKey;
  mode: 'param-async';
  read: (param: string | undefined) => Promise<unknown>;
}>;

export type CurrentRuntimeStaticReadDescriptor = Readonly<{
  key: CurrentRuntimeReadOperationKey;
  mode: 'static-sync';
  read: () => unknown;
}>;

export type CurrentRuntimeSyncParamReadDescriptor = Readonly<{
  key: CurrentRuntimeReadOperationKey;
  mode: 'param-sync';
  read: (param: string | undefined) => unknown;
}>;

export type CurrentRuntimeReadOperationDescriptor =
  | CurrentRuntimeContextReadDescriptor
  | CurrentRuntimeAsyncParamReadDescriptor
  | CurrentRuntimeStaticReadDescriptor
  | CurrentRuntimeSyncParamReadDescriptor;

const CURRENT_RUNTIME_READ_OPERATION_KEYS = Object.freeze([
  'overview',
  'recipeProducedBy',
  'recipeUsedIn',
  'recipePage',
  'diagnosticsHealth',
  'diagnosticsSummary',
  'nativeSurfaceMetrics',
  'settings',
  'gtDiagramsOverview',
  'forestryGeneticsOverview',
  'multiblockBlueprint',
] as const satisfies readonly CurrentRuntimeReadOperationKey[]);

export const CURRENT_RUNTIME_READ_OPERATION_DESCRIPTORS: readonly CurrentRuntimeReadOperationDescriptor[] =
  validateAndFreezeCurrentRuntimeReadOperationDescriptors([
    {
      key: 'overview',
      mode: 'context-sync',
      read: getCurrentRuntimeOverview,
    },
    {
      key: 'recipeProducedBy',
      mode: 'param-async',
      read: getCurrentRecipeItemProducedBy,
    },
    {
      key: 'recipeUsedIn',
      mode: 'param-async',
      read: getCurrentRecipeItemUsedIn,
    },
    {
      key: 'recipePage',
      mode: 'param-async',
      read: getCurrentRecipePage,
    },
    {
      key: 'diagnosticsHealth',
      mode: 'context-sync',
      read: getCurrentRuntimeDiagnosticsHealth,
    },
    {
      key: 'diagnosticsSummary',
      mode: 'context-sync',
      read: getCurrentRuntimeDiagnosticsSummary,
    },
    {
      key: 'nativeSurfaceMetrics',
      mode: 'context-sync',
      read: getCurrentRuntimeNativeSurfaceMetrics,
    },
    {
      key: 'settings',
      mode: 'static-sync',
      read: getCurrentRuntimeSettings,
    },
    {
      key: 'gtDiagramsOverview',
      mode: 'static-sync',
      read: getCurrentRuntimeGTDiagramsOverview,
    },
    {
      key: 'forestryGeneticsOverview',
      mode: 'static-sync',
      read: getCurrentRuntimeForestryGeneticsOverview,
    },
    {
      key: 'multiblockBlueprint',
      mode: 'param-sync',
      read: getCurrentRuntimeMultiblockBlueprint,
    },
  ]);

export const CURRENT_RUNTIME_READ_OPERATIONS: Readonly<Record<CurrentRuntimeReadOperationKey, CurrentRuntimeReadOperationDescriptor>> =
  projectCurrentRuntimeReadOperations(CURRENT_RUNTIME_READ_OPERATION_DESCRIPTORS);

export function getCurrentRuntimeReadOperation(
  key: CurrentRuntimeReadOperationKey,
): CurrentRuntimeReadOperationDescriptor {
  const descriptor = CURRENT_RUNTIME_READ_OPERATIONS[key];
  if (!descriptor) {
    throw new Error(`Unknown current runtime read operation: ${key}`);
  }
  return descriptor;
}

export function readCurrentRuntimeContextPayload(
  key: CurrentRuntimeReadOperationKey,
  context: CurrentRuntimeApiContext,
): unknown {
  const descriptor = getCurrentRuntimeReadOperation(key);
  if (descriptor.mode !== 'context-sync') {
    throw new Error(`current runtime read operation is not context-sync: ${key}`);
  }
  return descriptor.read(context);
}

export async function readCurrentRuntimeAsyncParamPayload(
  key: CurrentRuntimeReadOperationKey,
  param: string | undefined,
): Promise<unknown> {
  const descriptor = getCurrentRuntimeReadOperation(key);
  if (descriptor.mode !== 'param-async') {
    throw new Error(`current runtime read operation is not param-async: ${key}`);
  }
  return descriptor.read(param);
}

export function readCurrentRuntimeStaticPayload(key: CurrentRuntimeReadOperationKey): unknown {
  const descriptor = getCurrentRuntimeReadOperation(key);
  if (descriptor.mode !== 'static-sync') {
    throw new Error(`current runtime read operation is not static-sync: ${key}`);
  }
  return descriptor.read();
}

export function readCurrentRuntimeSyncParamPayload(
  key: CurrentRuntimeReadOperationKey,
  param: string | undefined,
): unknown {
  const descriptor = getCurrentRuntimeReadOperation(key);
  if (descriptor.mode !== 'param-sync') {
    throw new Error(`current runtime read operation is not param-sync: ${key}`);
  }
  return descriptor.read(param);
}

function validateAndFreezeCurrentRuntimeReadOperationDescriptors(
  descriptors: readonly CurrentRuntimeReadOperationDescriptor[],
): readonly CurrentRuntimeReadOperationDescriptor[] {
  const expected = new Set<CurrentRuntimeReadOperationKey>(CURRENT_RUNTIME_READ_OPERATION_KEYS);
  const seen = new Set<CurrentRuntimeReadOperationKey>();

  for (const descriptor of descriptors) {
    if (!descriptor) {
      throw new Error('current runtime read operation descriptor must not be null');
    }
    if (!expected.has(descriptor.key)) {
      throw new Error(`Unknown current runtime read operation descriptor: ${descriptor.key}`);
    }
    if (!seen.add(descriptor.key)) {
      throw new Error(`Duplicate current runtime read operation descriptor: ${descriptor.key}`);
    }
    if (typeof descriptor.read !== 'function') {
      throw new Error(`current runtime read operation must provide a read function: ${descriptor.key}`);
    }
    if (!['context-sync', 'param-async', 'static-sync', 'param-sync'].includes(descriptor.mode)) {
      throw new Error(`Invalid current runtime read operation mode for ${descriptor.key}: ${descriptor.mode}`);
    }
  }

  for (const key of expected) {
    if (!seen.has(key)) {
      throw new Error(`Missing current runtime read operation descriptor: ${key}`);
    }
  }

  return Object.freeze(descriptors.map((descriptor) => Object.freeze({ ...descriptor })));
}

function projectCurrentRuntimeReadOperations(
  descriptors: readonly CurrentRuntimeReadOperationDescriptor[],
): Readonly<Record<CurrentRuntimeReadOperationKey, CurrentRuntimeReadOperationDescriptor>> {
  return Object.freeze(
    descriptors.reduce(
      (map, descriptor) => {
        map[descriptor.key] = descriptor;
        return map;
      },
      {} as Record<CurrentRuntimeReadOperationKey, CurrentRuntimeReadOperationDescriptor>,
    ),
  );
}
