/** Current runtime snapshot ABI catalog. */

import {
  CURRENT_RUNTIME_ARTIFACT_STATUS,
  type CurrentRuntimeArtifactProbe,
} from './current-runtime-artifact-index-abi';

type CurrentRuntimeSnapshotDefaultKey = 'missingRuntimeId' | 'unknownSchemaRevision';
type CurrentRuntimeManifestFieldKey = 'schemaRevision' | 'schema' | 'runtimeId' | 'capabilities';
type CurrentRuntimeSnapshotProbeKey = 'distManifest' | 'runtimeManifestText' | 'runtimeManifestJson';
type CurrentRuntimeSnapshotStatusKey = 'ready' | 'missing' | 'invalid';
type CurrentRuntimeSnapshotDiagnosticKey = 'initialSnapshotError';

type CurrentRuntimeStringDescriptor<TKey extends string> = Readonly<{
  key: TKey;
  value: string;
}>;

export type CurrentRuntimeSnapshotStatus =
  typeof CURRENT_RUNTIME_SNAPSHOT_STATUS[keyof typeof CURRENT_RUNTIME_SNAPSHOT_STATUS];

export type CurrentRuntimeSnapshotDiagnostics = Readonly<{
  status: CurrentRuntimeSnapshotStatus;
  probes: Readonly<Record<string, CurrentRuntimeArtifactProbe>>;
  errors: readonly string[];
}>;

export type CurrentRuntimeSnapshotReaderCounters = {
  activeReaders: number;
  totalAcquires: number;
};

export type CurrentRuntimeSnapshotReaderLease = Readonly<{
  acquiredAt: number;
  release: () => void;
}>;

export type CurrentRuntimeSnapshotReadStats = Readonly<{
  activeReaders: number;
  totalAcquires: number;
  currentRevision: number | null;
  currentFingerprint: string | null;
  lastRefreshStatus: CurrentRuntimeSnapshotStatus;
  lastRefreshErrors: readonly string[];
}>;

type CurrentRuntimeSnapshotReadStatsInput = Readonly<{
  readers: CurrentRuntimeSnapshotReaderCounters;
  currentRevision: number | null;
  currentFingerprint: string | null;
  diagnostics: CurrentRuntimeSnapshotDiagnostics;
}>;

type CurrentRuntimeSnapshotProbeDescriptor = Readonly<{
  key: CurrentRuntimeSnapshotProbeKey;
  value: CurrentRuntimeSnapshotProbeKey;
  kind: CurrentRuntimeArtifactProbe['kind'];
  relativePath: string | null;
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

function validateAndFreezeCurrentRuntimeSnapshotProbeDescriptors(
  descriptors: readonly CurrentRuntimeSnapshotProbeDescriptor[],
): readonly CurrentRuntimeSnapshotProbeDescriptor[] {
  const expected = new Set<CurrentRuntimeSnapshotProbeKey>([
    'distManifest',
    'runtimeManifestText',
    'runtimeManifestJson',
  ]);
  const seen = new Set<CurrentRuntimeSnapshotProbeKey>();
  const seenValues = new Set<string>();

  for (const descriptor of descriptors) {
    if (!descriptor) {
      throw new Error('current runtime snapshot probe descriptor must not be null');
    }
    if (!expected.has(descriptor.key)) {
      throw new Error(`Unknown current runtime snapshot probe descriptor: ${descriptor.key}`);
    }
    if (descriptor.key !== descriptor.value) {
      throw new Error(`current runtime snapshot probe descriptor value must match key: ${descriptor.key}`);
    }
    if (!seen.add(descriptor.key)) {
      throw new Error(`Duplicate current runtime snapshot probe descriptor: ${descriptor.key}`);
    }
    if (!seenValues.add(descriptor.value)) {
      throw new Error(`Duplicate current runtime snapshot probe descriptor value: ${descriptor.value}`);
    }
    if (!['json', 'text'].includes(descriptor.kind)) {
      throw new Error(`Unsupported current runtime snapshot probe kind: ${descriptor.key}`);
    }
    if (descriptor.relativePath !== null && !descriptor.relativePath.trim()) {
      throw new Error(`current runtime snapshot probe relative path must be non-empty: ${descriptor.key}`);
    }
  }

  for (const key of expected) {
    if (!seen.has(key)) {
      throw new Error(`Missing current runtime snapshot probe descriptor: ${key}`);
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

export const CURRENT_RUNTIME_SNAPSHOT_STATUS_DESCRIPTORS =
  validateAndFreezeStringDescriptors<CurrentRuntimeSnapshotStatusKey>(
    'current runtime snapshot status',
    [
      stringDescriptor('ready', 'ready'),
      stringDescriptor('missing', 'missing'),
      stringDescriptor('invalid', 'invalid'),
    ] as const,
    ['ready', 'missing', 'invalid'] as const,
  );

export const CURRENT_RUNTIME_SNAPSHOT_STATUS =
  projectStringDescriptorMap(CURRENT_RUNTIME_SNAPSHOT_STATUS_DESCRIPTORS);

export const CURRENT_RUNTIME_SNAPSHOT_DIAGNOSTIC_DESCRIPTORS =
  validateAndFreezeStringDescriptors<CurrentRuntimeSnapshotDiagnosticKey>(
    'current runtime snapshot diagnostic',
    [
      stringDescriptor('initialSnapshotError', 'current runtime snapshot has not been acquired yet'),
    ] as const,
    ['initialSnapshotError'] as const,
  );

export const CURRENT_RUNTIME_SNAPSHOT_DIAGNOSTICS =
  projectStringDescriptorMap(CURRENT_RUNTIME_SNAPSHOT_DIAGNOSTIC_DESCRIPTORS);

export const CURRENT_RUNTIME_SNAPSHOT_PROBE_DESCRIPTORS =
  validateAndFreezeCurrentRuntimeSnapshotProbeDescriptors([
    Object.freeze({
      key: 'distManifest',
      value: 'distManifest',
      kind: 'json',
      relativePath: 'manifest.json',
    }),
    Object.freeze({
      key: 'runtimeManifestText',
      value: 'runtimeManifestText',
      kind: 'text',
      relativePath: null,
    }),
    Object.freeze({
      key: 'runtimeManifestJson',
      value: 'runtimeManifestJson',
      kind: 'json',
      relativePath: null,
    }),
  ] as const);

export const CURRENT_RUNTIME_SNAPSHOT_PROBES = Object.freeze(
  CURRENT_RUNTIME_SNAPSHOT_PROBE_DESCRIPTORS.reduce(
    (map, descriptor) => {
      map[descriptor.key] = descriptor;
      return map;
    },
    {} as Record<CurrentRuntimeSnapshotProbeKey, CurrentRuntimeSnapshotProbeDescriptor>,
  ),
);

export function createInitialCurrentRuntimeSnapshotDiagnostics(): CurrentRuntimeSnapshotDiagnostics {
  return Object.freeze({
    status: CURRENT_RUNTIME_SNAPSHOT_STATUS.missing,
    probes: Object.freeze({}),
    errors: Object.freeze([CURRENT_RUNTIME_SNAPSHOT_DIAGNOSTICS.initialSnapshotError]),
  });
}

export function buildCurrentRuntimeSnapshotDiagnostics(
  probes: Record<string, CurrentRuntimeArtifactProbe>,
): CurrentRuntimeSnapshotDiagnostics {
  const values = Object.values(probes);
  const hasInvalid = values.some((probe) => probe.status === CURRENT_RUNTIME_ARTIFACT_STATUS.invalid);
  const hasMissing = values.some((probe) => probe.status === CURRENT_RUNTIME_ARTIFACT_STATUS.missing);
  return Object.freeze({
    status: hasInvalid
      ? CURRENT_RUNTIME_SNAPSHOT_STATUS.invalid
      : hasMissing
        ? CURRENT_RUNTIME_SNAPSHOT_STATUS.missing
        : CURRENT_RUNTIME_SNAPSHOT_STATUS.ready,
    probes: Object.freeze({ ...probes }),
    errors: Object.freeze(values
      .filter((probe) => probe.error)
      .map((probe) => `${probe.relativePath ?? probe.path}: ${probe.error}`)),
  });
}

export function createCurrentRuntimeSnapshotReaderCounters(): CurrentRuntimeSnapshotReaderCounters {
  return { activeReaders: 0, totalAcquires: 0 };
}

export function acquireCurrentRuntimeSnapshotReader(
  counters: CurrentRuntimeSnapshotReaderCounters,
): CurrentRuntimeSnapshotReaderLease {
  counters.activeReaders += 1;
  counters.totalAcquires += 1;

  let released = false;
  return Object.freeze({
    acquiredAt: Date.now(),
    release: () => {
      if (released) return;
      released = true;
      counters.activeReaders = Math.max(0, counters.activeReaders - 1);
    },
  });
}

export function buildCurrentRuntimeSnapshotReadStats(
  input: CurrentRuntimeSnapshotReadStatsInput,
): CurrentRuntimeSnapshotReadStats {
  return Object.freeze({
    activeReaders: input.readers.activeReaders,
    totalAcquires: input.readers.totalAcquires,
    currentRevision: input.currentRevision,
    currentFingerprint: input.currentFingerprint,
    lastRefreshStatus: input.diagnostics.status,
    lastRefreshErrors: input.diagnostics.errors,
  });
}
