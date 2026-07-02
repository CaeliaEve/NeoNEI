/** Current runtime snapshot ABI catalog. */

type CurrentRuntimeSnapshotDefaultKey = 'missingRuntimeId' | 'unknownSchemaRevision';
type CurrentRuntimeManifestFieldKey = 'schemaRevision' | 'schema' | 'runtimeId' | 'capabilities';

type CurrentRuntimeStringDescriptor<TKey extends string> = Readonly<{
  key: TKey;
  value: string;
}>;

function stringDescriptor<TKey extends string>(
  key: TKey,
  value: string,
): CurrentRuntimeStringDescriptor<TKey> {
  return Object.freeze({ key, value });
}

function validateAndFreezeStringDescriptors<TKey extends string>(
  label: string,
  descriptors: readonly CurrentRuntimeStringDescriptor<TKey>[],
  expectedKeys: readonly TKey[],
): readonly CurrentRuntimeStringDescriptor<TKey>[] {
  const expected = new Set<TKey>(expectedKeys);
  const seen = new Set<TKey>();
  const seenValues = new Set<string>();

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
    if (!descriptor.value.trim()) {
      throw new Error(`${label} descriptor value must be non-empty: ${descriptor.key}`);
    }
    if (!seenValues.add(descriptor.value)) {
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

function projectStringDescriptorMap<TKey extends string>(
  descriptors: readonly CurrentRuntimeStringDescriptor<TKey>[],
): Readonly<Record<TKey, string>> {
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

export const CURRENT_RUNTIME_SNAPSHOT_DEFAULT_DESCRIPTORS = validateAndFreezeStringDescriptors(
  'current runtime snapshot default',
  [
    stringDescriptor('missingRuntimeId', 'runtime-missing'),
    stringDescriptor('unknownSchemaRevision', 'runtime.unknown'),
  ] as const,
  ['missingRuntimeId', 'unknownSchemaRevision'] as const,
);

export const CURRENT_RUNTIME_SNAPSHOT_DEFAULTS =
  projectStringDescriptorMap(CURRENT_RUNTIME_SNAPSHOT_DEFAULT_DESCRIPTORS);

export const CURRENT_RUNTIME_MANIFEST_FIELD_DESCRIPTORS = validateAndFreezeStringDescriptors(
  'current runtime manifest field',
  [
    stringDescriptor('schemaRevision', 'schemaRevision'),
    stringDescriptor('schema', 'schema'),
    stringDescriptor('runtimeId', 'runtimeId'),
    stringDescriptor('capabilities', 'capabilities'),
  ] as const,
  ['schemaRevision', 'schema', 'runtimeId', 'capabilities'] as const,
);

export const CURRENT_RUNTIME_MANIFEST_FIELDS =
  projectStringDescriptorMap(CURRENT_RUNTIME_MANIFEST_FIELD_DESCRIPTORS);
