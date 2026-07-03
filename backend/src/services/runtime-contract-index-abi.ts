/** Runtime contract index ABI catalog. */

export type RuntimeContractMapValueKind = 'path' | 'glob' | 'description';

export type RuntimeContractMapDescriptor<TKey extends string = string> = Readonly<{
  key: TKey;
  value: string;
  valueKind: RuntimeContractMapValueKind;
}>;

export type RuntimeContractMap<TKey extends string = string> = Readonly<Record<TKey, string>>;

export const CURRENT_RUNTIME_CONTRACT_INDEX_METADATA = Object.freeze({
  contractVersion: 'runtime-contracts/current',
} as const);

export const API_V1_RUNTIME_CONTRACT_INDEX_METADATA = Object.freeze({
  version: 1,
} as const);

export const RUNTIME_SCHEMA_CONTRACT_KEYS = Object.freeze([
  'manifest',
  'browser',
  'search',
  'recipe',
  'texture',
  'error',
  'api',
] as const);
export const RUNTIME_CONTROL_ENDPOINT_KEYS = Object.freeze([
  'patterns',
  'publish',
  'renderContract',
] as const);
export const CURRENT_RUNTIME_NAMESPACE_KEYS = Object.freeze([
  'runtime',
  'ops',
] as const);
export const CURRENT_RUNTIME_ENDPOINT_KEYS = Object.freeze([
  'manifest',
  'distDataManifest',
  'publishManifest',
  'health',
  'contracts',
  'diagnostics',
] as const);
export const CURRENT_RUNTIME_STATIC_RESOURCE_KEYS = Object.freeze([
  'distData',
  'publish',
  'contracts',
] as const);
export const API_V1_RUNTIME_ENDPOINT_KEYS = Object.freeze([
  'manifest',
  'distDataManifest',
  'publishManifest',
] as const);

export type RuntimeSchemaContractKey = (typeof RUNTIME_SCHEMA_CONTRACT_KEYS)[number];
export type RuntimeControlEndpointKey = (typeof RUNTIME_CONTROL_ENDPOINT_KEYS)[number];
export type CurrentRuntimeNamespaceKey = (typeof CURRENT_RUNTIME_NAMESPACE_KEYS)[number];
export type CurrentRuntimeEndpointKey = (typeof CURRENT_RUNTIME_ENDPOINT_KEYS)[number];
export type CurrentRuntimeStaticResourceKey = (typeof CURRENT_RUNTIME_STATIC_RESOURCE_KEYS)[number];
export type ApiV1RuntimeEndpointKey = (typeof API_V1_RUNTIME_ENDPOINT_KEYS)[number];

export function contractMapDescriptor<TKey extends string>(
  key: TKey,
  value: string,
  valueKind: RuntimeContractMapValueKind,
): RuntimeContractMapDescriptor<TKey> {
  return Object.freeze({ key, value, valueKind });
}

export const RUNTIME_SCHEMA_CONTRACT_DESCRIPTORS = validateAndFreezeContractMapDescriptors(
  'runtime schema contract',
  [
    contractMapDescriptor('manifest', '/contracts/runtime/manifest.schema.json', 'path'),
    contractMapDescriptor('browser', '/contracts/runtime/browser.schema.json', 'path'),
    contractMapDescriptor('search', '/contracts/runtime/search.schema.json', 'path'),
    contractMapDescriptor('recipe', '/contracts/runtime/recipe.schema.json', 'path'),
    contractMapDescriptor('texture', '/contracts/runtime/texture.schema.json', 'path'),
    contractMapDescriptor('error', '/contracts/runtime/error.schema.json', 'path'),
    contractMapDescriptor('api', '/contracts/runtime/api.schema.json', 'path'),
  ],
  RUNTIME_SCHEMA_CONTRACT_KEYS,
);

export const RUNTIME_CONTROL_ENDPOINT_DESCRIPTORS = validateAndFreezeContractMapDescriptors(
  'runtime control endpoint',
  [
    contractMapDescriptor('patterns', '/ops/patterns', 'path'),
    contractMapDescriptor('publish', '/ops/publish', 'path'),
    contractMapDescriptor('renderContract', '/ops/render-contract', 'path'),
  ],
  RUNTIME_CONTROL_ENDPOINT_KEYS,
);

export const CURRENT_RUNTIME_NAMESPACE_DESCRIPTORS = validateAndFreezeContractMapDescriptors(
  'current runtime namespace',
  [
    contractMapDescriptor('runtime', 'public read-only runtime API', 'description'),
    contractMapDescriptor('ops', 'authenticated operations API', 'description'),
  ],
  CURRENT_RUNTIME_NAMESPACE_KEYS,
);

export const CURRENT_RUNTIME_ENDPOINT_DESCRIPTORS = validateAndFreezeContractMapDescriptors(
  'current runtime contract endpoint',
  [
    contractMapDescriptor('manifest', '/runtime/manifest', 'path'),
    contractMapDescriptor('distDataManifest', '/dist-data/manifest.json', 'path'),
    contractMapDescriptor('publishManifest', '/runtime/manifest', 'path'),
    contractMapDescriptor('health', '/runtime/health', 'path'),
    contractMapDescriptor('contracts', '/runtime/contracts', 'path'),
    contractMapDescriptor('diagnostics', '/runtime/diagnostics', 'path'),
  ],
  CURRENT_RUNTIME_ENDPOINT_KEYS,
);

export const CURRENT_RUNTIME_STATIC_RESOURCE_DESCRIPTORS = validateAndFreezeContractMapDescriptors(
  'current runtime static resource',
  [
    contractMapDescriptor('distData', '/dist-data/**', 'glob'),
    contractMapDescriptor('publish', '/publish/**', 'glob'),
    contractMapDescriptor('contracts', '/contracts/runtime/**', 'glob'),
  ],
  CURRENT_RUNTIME_STATIC_RESOURCE_KEYS,
);

export const API_V1_RUNTIME_ENDPOINT_DESCRIPTORS = validateAndFreezeContractMapDescriptors(
  'api v1 runtime contract endpoint',
  [
    contractMapDescriptor('manifest', '/api/v1/runtime/manifest', 'path'),
    contractMapDescriptor('distDataManifest', '/dist-data/manifest.json', 'path'),
    contractMapDescriptor('publishManifest', '/api/publish/manifest', 'path'),
  ],
  API_V1_RUNTIME_ENDPOINT_KEYS,
);

export const RUNTIME_SCHEMA_CONTRACTS: RuntimeContractMap<RuntimeSchemaContractKey> =
  projectRuntimeContractMap(RUNTIME_SCHEMA_CONTRACT_DESCRIPTORS);
export const RUNTIME_CONTROL_ENDPOINTS: RuntimeContractMap<RuntimeControlEndpointKey> =
  projectRuntimeContractMap(RUNTIME_CONTROL_ENDPOINT_DESCRIPTORS);
export const CURRENT_RUNTIME_NAMESPACES: RuntimeContractMap<CurrentRuntimeNamespaceKey> =
  projectRuntimeContractMap(CURRENT_RUNTIME_NAMESPACE_DESCRIPTORS);
export const CURRENT_RUNTIME_ENDPOINTS: RuntimeContractMap<CurrentRuntimeEndpointKey> =
  projectRuntimeContractMap(CURRENT_RUNTIME_ENDPOINT_DESCRIPTORS);
export const CURRENT_RUNTIME_STATIC_RESOURCES: RuntimeContractMap<CurrentRuntimeStaticResourceKey> =
  projectRuntimeContractMap(CURRENT_RUNTIME_STATIC_RESOURCE_DESCRIPTORS);
export const API_V1_RUNTIME_ENDPOINTS: RuntimeContractMap<ApiV1RuntimeEndpointKey> =
  projectRuntimeContractMap(API_V1_RUNTIME_ENDPOINT_DESCRIPTORS);

export function validateAndFreezeContractMapDescriptors<TKey extends string>(
  label: string,
  descriptors: readonly RuntimeContractMapDescriptor<TKey>[],
  expectedKeys: readonly TKey[],
): readonly RuntimeContractMapDescriptor<TKey>[] {
  const expected = new Set<string>(expectedKeys);
  const seen = new Set<string>();
  const values = new Set<string>();

  for (const descriptor of descriptors) {
    if (!descriptor) {
      throw new Error(`${label} descriptor must not be null`);
    }
    if (!expected.has(descriptor.key)) {
      throw new Error(`Unknown ${label} descriptor: ${descriptor.key}`);
    }
    if (!seen.add(descriptor.key)) {
      throw new Error(`Duplicate ${label} descriptor: ${descriptor.key}`);
    }
    validateContractValue(label, descriptor);
    if (descriptor.valueKind !== 'description' && !values.add(descriptor.value)) {
      throw new Error(`Duplicate ${label} descriptor value: ${descriptor.value}`);
    }
  }

  for (const key of expectedKeys) {
    if (!seen.has(key)) {
      throw new Error(`Missing ${label} descriptor: ${key}`);
    }
  }

  return Object.freeze(descriptors.map((descriptor) => Object.freeze({ ...descriptor })));
}

export function projectRuntimeContractMap<TKey extends string>(
  descriptors: readonly RuntimeContractMapDescriptor<TKey>[],
): RuntimeContractMap<TKey> {
  return Object.freeze(
    descriptors.reduce(
      (map, descriptor) => {
        map[descriptor.key] = descriptor.value;
        return map;
      },
      {} as Record<TKey, string>,
    ),
  );
}

function validateContractValue<TKey extends string>(
  label: string,
  descriptor: RuntimeContractMapDescriptor<TKey>,
): void {
  if (!descriptor.value.trim()) {
    throw new Error(`${label} descriptor value must be non-empty: ${descriptor.key}`);
  }
  if (descriptor.valueKind === 'path' && !descriptor.value.startsWith('/')) {
    throw new Error(`${label} descriptor path must be absolute: ${descriptor.key}`);
  }
  if (descriptor.valueKind === 'glob') {
    if (!descriptor.value.startsWith('/') || !descriptor.value.includes('**')) {
      throw new Error(`${label} descriptor glob must be absolute and recursive: ${descriptor.key}`);
    }
  }
  if (descriptor.valueKind === 'description' && descriptor.value.startsWith('/')) {
    throw new Error(`${label} descriptor description must not be a path: ${descriptor.key}`);
  }
}
