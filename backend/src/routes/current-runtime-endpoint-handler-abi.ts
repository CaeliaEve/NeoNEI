import type { CurrentRuntimeReadOperationKey } from '../services/current-runtime-read.service';
import {
  CURRENT_RUNTIME_ENDPOINTS,
  type CurrentRuntimeEndpointKey,
} from './current-runtime-endpoint-registry';

export type CurrentRuntimeEndpointParamName =
  | 'runtimeId'
  | 'fileName'
  | 'reportName'
  | 'itemId'
  | 'recipePageId'
  | 'controllerItemId';

export type CurrentRuntimeEndpointHandlerKind =
  | 'context-json'
  | 'static-json'
  | 'param-sync-json'
  | 'param-async-json'
  | 'manifest'
  | 'asset-param'
  | 'asset-mounted'
  | 'report';

export type CurrentRuntimeEndpointHandlerDescriptor = Readonly<{
  key: CurrentRuntimeEndpointKey;
  kind: CurrentRuntimeEndpointHandlerKind;
  read?: CurrentRuntimeReadOperationKey;
  param?: CurrentRuntimeEndpointParamName;
  runtimeIdParam?: CurrentRuntimeEndpointParamName;
  immutable?: boolean;
}>;

export const CURRENT_RUNTIME_ENDPOINT_HANDLER_DESCRIPTORS: readonly CurrentRuntimeEndpointHandlerDescriptor[] =
  validateAndFreezeCurrentRuntimeEndpointHandlerDescriptors([
    {
      key: 'current',
      kind: 'context-json',
      read: 'overview',
    },
    {
      key: 'currentManifest',
      kind: 'manifest',
    },
    {
      key: 'currentAssetParam',
      kind: 'asset-param',
      param: 'fileName',
    },
    {
      key: 'currentAssetMounted',
      kind: 'asset-mounted',
    },
    {
      key: 'currentReport',
      kind: 'report',
      param: 'reportName',
    },
    {
      key: 'pinnedManifest',
      kind: 'manifest',
      runtimeIdParam: 'runtimeId',
      immutable: true,
    },
    {
      key: 'pinnedAssetParam',
      kind: 'asset-param',
      param: 'fileName',
      runtimeIdParam: 'runtimeId',
    },
    {
      key: 'pinnedAssetMounted',
      kind: 'asset-mounted',
      runtimeIdParam: 'runtimeId',
    },
    {
      key: 'pinnedReport',
      kind: 'report',
      param: 'reportName',
      runtimeIdParam: 'runtimeId',
    },
    {
      key: 'recipeItem',
      kind: 'param-async-json',
      read: 'recipeProducedBy',
      param: 'itemId',
    },
    {
      key: 'recipeCurrentItem',
      kind: 'param-async-json',
      read: 'recipeProducedBy',
      param: 'itemId',
    },
    {
      key: 'recipeUsage',
      kind: 'param-async-json',
      read: 'recipeUsedIn',
      param: 'itemId',
    },
    {
      key: 'recipePage',
      kind: 'param-async-json',
      read: 'recipePage',
      param: 'recipePageId',
    },
    {
      key: 'recipeCurrentUsage',
      kind: 'param-async-json',
      read: 'recipeUsedIn',
      param: 'itemId',
    },
    {
      key: 'diagnosticsHealth',
      kind: 'context-json',
      read: 'diagnosticsHealth',
    },
    {
      key: 'diagnosticsRuntimeSummary',
      kind: 'context-json',
      read: 'diagnosticsSummary',
    },
    {
      key: 'healthCurrentRuntime',
      kind: 'context-json',
      read: 'diagnosticsHealth',
    },
    {
      key: 'nativeSurfaceMetrics',
      kind: 'context-json',
      read: 'nativeSurfaceMetrics',
    },
    {
      key: 'runtimeSettings',
      kind: 'static-json',
      read: 'settings',
    },
    {
      key: 'runtimeDataGTDiagramsOverview',
      kind: 'static-json',
      read: 'gtDiagramsOverview',
    },
    {
      key: 'runtimeDataForestryGeneticsOverview',
      kind: 'static-json',
      read: 'forestryGeneticsOverview',
    },
    {
      key: 'runtimeDataMultiblockBlueprint',
      kind: 'param-sync-json',
      read: 'multiblockBlueprint',
      param: 'controllerItemId',
    },
  ]);

export const CURRENT_RUNTIME_ENDPOINT_HANDLER_BY_KEY: Readonly<Record<CurrentRuntimeEndpointKey, CurrentRuntimeEndpointHandlerDescriptor>> =
  projectCurrentRuntimeEndpointHandlerMap(CURRENT_RUNTIME_ENDPOINT_HANDLER_DESCRIPTORS);

export function getCurrentRuntimeEndpointHandlerDescriptor(
  key: CurrentRuntimeEndpointKey,
): CurrentRuntimeEndpointHandlerDescriptor {
  const descriptor = CURRENT_RUNTIME_ENDPOINT_HANDLER_BY_KEY[key];
  if (!descriptor) {
    throw new Error(`Unknown current runtime endpoint handler descriptor: ${key}`);
  }
  return descriptor;
}

function validateAndFreezeCurrentRuntimeEndpointHandlerDescriptors(
  descriptors: readonly CurrentRuntimeEndpointHandlerDescriptor[],
): readonly CurrentRuntimeEndpointHandlerDescriptor[] {
  const expected = new Set<CurrentRuntimeEndpointKey>(CURRENT_RUNTIME_ENDPOINTS.map((endpoint) => endpoint.key));
  const seen = new Set<CurrentRuntimeEndpointKey>();

  for (const descriptor of descriptors) {
    if (!descriptor) {
      throw new Error('current runtime endpoint handler descriptor must not be null');
    }
    if (!expected.has(descriptor.key)) {
      throw new Error(`Unknown current runtime endpoint handler descriptor: ${descriptor.key}`);
    }
    if (!seen.add(descriptor.key)) {
      throw new Error(`Duplicate current runtime endpoint handler descriptor: ${descriptor.key}`);
    }
    validateCurrentRuntimeEndpointHandlerDescriptor(descriptor);
  }

  for (const key of expected) {
    if (!seen.has(key)) {
      throw new Error(`Missing current runtime endpoint handler descriptor: ${key}`);
    }
  }

  return Object.freeze(descriptors.map((descriptor) => Object.freeze({ ...descriptor })));
}

function validateCurrentRuntimeEndpointHandlerDescriptor(
  descriptor: CurrentRuntimeEndpointHandlerDescriptor,
): void {
  switch (descriptor.kind) {
    case 'context-json':
    case 'static-json':
      requireRead(descriptor);
      forbidParam(descriptor);
      forbidRuntimeIdParam(descriptor);
      return;
    case 'param-sync-json':
    case 'param-async-json':
      requireRead(descriptor);
      requireParam(descriptor);
      forbidRuntimeIdParam(descriptor);
      return;
    case 'manifest':
      forbidRead(descriptor);
      forbidParam(descriptor);
      return;
    case 'asset-param':
    case 'report':
      forbidRead(descriptor);
      requireParam(descriptor);
      return;
    case 'asset-mounted':
      forbidRead(descriptor);
      forbidParam(descriptor);
      return;
    default: {
      const exhaustive: never = descriptor.kind;
      throw new Error(`Invalid current runtime endpoint handler kind: ${exhaustive}`);
    }
  }
}

function requireRead(descriptor: CurrentRuntimeEndpointHandlerDescriptor): void {
  if (!descriptor.read) {
    throw new Error(`current runtime endpoint handler read operation is required: ${descriptor.key}`);
  }
}

function forbidRead(descriptor: CurrentRuntimeEndpointHandlerDescriptor): void {
  if (descriptor.read) {
    throw new Error(`current runtime endpoint handler read operation is not allowed: ${descriptor.key}`);
  }
}

function requireParam(descriptor: CurrentRuntimeEndpointHandlerDescriptor): void {
  if (!descriptor.param) {
    throw new Error(`current runtime endpoint handler param is required: ${descriptor.key}`);
  }
}

function forbidParam(descriptor: CurrentRuntimeEndpointHandlerDescriptor): void {
  if (descriptor.param) {
    throw new Error(`current runtime endpoint handler param is not allowed: ${descriptor.key}`);
  }
}

function forbidRuntimeIdParam(descriptor: CurrentRuntimeEndpointHandlerDescriptor): void {
  if (descriptor.runtimeIdParam) {
    throw new Error(`current runtime endpoint handler runtimeId param is not allowed: ${descriptor.key}`);
  }
}

function projectCurrentRuntimeEndpointHandlerMap(
  descriptors: readonly CurrentRuntimeEndpointHandlerDescriptor[],
): Readonly<Record<CurrentRuntimeEndpointKey, CurrentRuntimeEndpointHandlerDescriptor>> {
  return Object.freeze(
    descriptors.reduce(
      (map, descriptor) => {
        map[descriptor.key] = descriptor;
        return map;
      },
      {} as Record<CurrentRuntimeEndpointKey, CurrentRuntimeEndpointHandlerDescriptor>,
    ),
  );
}
