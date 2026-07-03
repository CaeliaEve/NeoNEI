import {
  CURRENT_RUNTIME_DIST_MANIFEST_FILE,
  CURRENT_RUNTIME_ARTIFACT_STATUS,
  buildCurrentRuntimeArtifactInventory,
  buildCurrentRuntimeSnapshotFingerprint,
  collectDeclaredRuntimeFilePaths,
  getRuntimeManifestRelativePath,
  isPortableRuntimePath,
  normalizeRuntimePath,
  readCurrentRuntimeJsonArtifact,
  readCurrentRuntimeTextArtifact,
  resolveDistDataRuntimeFile,
  type CurrentRuntimeArtifact,
  type CurrentRuntimeArtifactProbe,
  type CurrentRuntimeJsonRecord,
} from './current-runtime-artifact-index.service';
import {
  CURRENT_RUNTIME_MANIFEST_FIELDS,
  CURRENT_RUNTIME_SNAPSHOT_DEFAULTS,
} from './current-runtime-snapshot-abi';

export type { CurrentRuntimeArtifact } from './current-runtime-artifact-index.service';

type JsonRecord = CurrentRuntimeJsonRecord;

export type CurrentRuntimeSnapshot = Readonly<{
  revision: number;
  runtimeId: string;
  runtimeSchemaRevision: string;
  manifestPath: string;
  manifest: JsonRecord;
  manifestJson: string;
  capabilities: JsonRecord;
  declaredFiles: readonly string[];
  artifactsByPath: Readonly<Record<string, CurrentRuntimeArtifact>>;
  artifactProbesByPath: Readonly<Record<string, CurrentRuntimeArtifactProbe>>;
  fingerprint: string;
}>;

export type CurrentRuntimeSnapshotDiagnostics = Readonly<{
  status: 'ready' | 'missing' | 'invalid';
  probes: Readonly<Record<string, CurrentRuntimeArtifactProbe>>;
  errors: readonly string[];
}>;

export type CurrentRuntimeSnapshotHandle = Readonly<{
  snapshot: CurrentRuntimeSnapshot | null;
  diagnostics: CurrentRuntimeSnapshotDiagnostics;
  acquiredAt: number;
  release: () => void;
}>;

export type CurrentRuntimeSnapshotReadStats = Readonly<{
  activeReaders: number;
  totalAcquires: number;
  currentRevision: number | null;
  currentFingerprint: string | null;
  lastRefreshStatus: CurrentRuntimeSnapshotDiagnostics['status'];
  lastRefreshErrors: readonly string[];
}>;

let currentSnapshot: CurrentRuntimeSnapshot | null = null;
let currentFingerprint: string | null = null;
let currentDiagnostics: CurrentRuntimeSnapshotDiagnostics = Object.freeze({
  status: 'missing',
  probes: Object.freeze({}),
  errors: Object.freeze(['current runtime snapshot has not been acquired yet']),
});
let nextSnapshotRevision = 1;
let activeSnapshotReaders = 0;
let totalSnapshotAcquires = 0;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
}

function asString(value: unknown): string | null {
  const text = `${value ?? ''}`.trim();
  return text || null;
}

function getRuntimeSchemaRevision(manifest: JsonRecord): string {
  return asString(manifest[CURRENT_RUNTIME_MANIFEST_FIELDS.schemaRevision])
    ?? asString(manifest[CURRENT_RUNTIME_MANIFEST_FIELDS.schema])
    ?? CURRENT_RUNTIME_SNAPSHOT_DEFAULTS.unknownSchemaRevision;
}

function getRuntimeId(manifest: JsonRecord): string {
  return asString(manifest[CURRENT_RUNTIME_MANIFEST_FIELDS.runtimeId])
    ?? CURRENT_RUNTIME_SNAPSHOT_DEFAULTS.missingRuntimeId;
}

function publishCurrentRuntimeSnapshot(input: Omit<CurrentRuntimeSnapshot, 'revision'>): CurrentRuntimeSnapshot {
  const snapshot = Object.freeze({
    ...input,
    revision: nextSnapshotRevision,
  });
  nextSnapshotRevision += 1;
  currentSnapshot = snapshot;
  currentFingerprint = input.fingerprint;
  return snapshot;
}

function publishCurrentRuntimeSnapshotDiagnostics(
  probes: Record<string, CurrentRuntimeArtifactProbe>,
): CurrentRuntimeSnapshotDiagnostics {
  const values = Object.values(probes);
  const invalid = values.filter((probe) => probe.status === CURRENT_RUNTIME_ARTIFACT_STATUS.invalid);
  const missing = values.filter((probe) => probe.status === CURRENT_RUNTIME_ARTIFACT_STATUS.missing);
  const diagnostics = Object.freeze({
    status: invalid.length > 0 ? 'invalid' as const : missing.length > 0 ? 'missing' as const : 'ready' as const,
    probes: Object.freeze({ ...probes }),
    errors: Object.freeze(values
      .filter((probe) => probe.error)
      .map((probe) => `${probe.relativePath ?? probe.path}: ${probe.error}`)),
  });
  currentDiagnostics = diagnostics;
  return diagnostics;
}

function clearCurrentRuntimeSnapshot(probes: Record<string, CurrentRuntimeArtifactProbe>): null {
  currentSnapshot = null;
  currentFingerprint = null;
  publishCurrentRuntimeSnapshotDiagnostics(probes);
  return null;
}

function refreshCurrentRuntimeSnapshot(): CurrentRuntimeSnapshot | null {
  const probes: Record<string, CurrentRuntimeArtifactProbe> = {};
  const distManifestRead = readCurrentRuntimeJsonArtifact(CURRENT_RUNTIME_DIST_MANIFEST_FILE, 'manifest.json');
  probes.distManifest = distManifestRead.probe;
  const distManifest = distManifestRead.value;
  const runtimeManifestPath = getRuntimeManifestRelativePath(distManifest);
  if (!runtimeManifestPath) {
    return clearCurrentRuntimeSnapshot(probes);
  }

  const runtimeManifestFile = resolveDistDataRuntimeFile(runtimeManifestPath);
  const runtimeManifestTextRead = readCurrentRuntimeTextArtifact(runtimeManifestFile, runtimeManifestPath);
  probes.runtimeManifestText = runtimeManifestTextRead.probe;
  const runtimeManifestRead = readCurrentRuntimeJsonArtifact(runtimeManifestFile, runtimeManifestPath);
  probes.runtimeManifestJson = runtimeManifestRead.probe;
  const runtimeManifestJson = runtimeManifestTextRead.value;
  const runtimeManifest = runtimeManifestRead.value;
  if (!runtimeManifest || !runtimeManifestJson) {
    return clearCurrentRuntimeSnapshot(probes);
  }

  const declaredFiles = collectDeclaredRuntimeFilePaths(runtimeManifestPath, runtimeManifest);
  const fingerprint = buildCurrentRuntimeSnapshotFingerprint(runtimeManifestPath, declaredFiles);
  if (currentSnapshot && currentFingerprint === fingerprint) {
    publishCurrentRuntimeSnapshotDiagnostics({
      ...probes,
      ...currentSnapshot.artifactProbesByPath,
    });
    return currentSnapshot;
  }
  const inventory = buildCurrentRuntimeArtifactInventory(declaredFiles);
  publishCurrentRuntimeSnapshotDiagnostics({
    ...probes,
    ...inventory.probesByPath,
  });

  return publishCurrentRuntimeSnapshot({
    runtimeId: getRuntimeId(runtimeManifest),
    runtimeSchemaRevision: getRuntimeSchemaRevision(runtimeManifest),
    manifestPath: runtimeManifestPath,
    manifest: Object.freeze(runtimeManifest),
    manifestJson: runtimeManifestJson,
    capabilities: Object.freeze(asRecord(runtimeManifest[CURRENT_RUNTIME_MANIFEST_FIELDS.capabilities]) ?? {}),
    declaredFiles,
    artifactsByPath: inventory.artifactsByPath,
    artifactProbesByPath: inventory.probesByPath,
    fingerprint,
  });
}

export function acquireCurrentRuntimeSnapshot(): CurrentRuntimeSnapshotHandle {
  activeSnapshotReaders += 1;
  totalSnapshotAcquires += 1;
  let released = false;
  try {
    const snapshot = refreshCurrentRuntimeSnapshot();
    return Object.freeze({
      snapshot,
      diagnostics: currentDiagnostics,
      acquiredAt: Date.now(),
      release: () => {
        if (released) return;
        released = true;
        activeSnapshotReaders = Math.max(0, activeSnapshotReaders - 1);
      },
    });
  } catch (error) {
    activeSnapshotReaders = Math.max(0, activeSnapshotReaders - 1);
    throw error;
  }
}

export function withCurrentRuntimeSnapshot<T>(reader: (snapshot: CurrentRuntimeSnapshot | null) => T): T {
  const handle = acquireCurrentRuntimeSnapshot();
  try {
    return reader(handle.snapshot);
  } finally {
    handle.release();
  }
}

export function getCurrentRuntimeSnapshotReadStats(): CurrentRuntimeSnapshotReadStats {
  return Object.freeze({
    activeReaders: activeSnapshotReaders,
    totalAcquires: totalSnapshotAcquires,
    currentRevision: currentSnapshot?.revision ?? null,
    currentFingerprint,
    lastRefreshStatus: currentDiagnostics.status,
    lastRefreshErrors: currentDiagnostics.errors,
  });
}

export function getCurrentRuntimeArtifact(relativeFileName: string): CurrentRuntimeArtifact | null {
  return withCurrentRuntimeSnapshot((snapshot) => {
    if (!snapshot) return null;
    if (!isPortableRuntimePath(relativeFileName)) return null;
    const normalized = normalizeRuntimePath(relativeFileName);
    if (!snapshot.declaredFiles.includes(normalized)) return null;
    return snapshot.artifactsByPath[normalized] ?? null;
  });
}
