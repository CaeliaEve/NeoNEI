import {
  CURRENT_RUNTIME_DIST_MANIFEST_FILE,
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
  CURRENT_RUNTIME_SNAPSHOT_PROBES,
  CURRENT_RUNTIME_MANIFEST_FIELDS,
  CURRENT_RUNTIME_SNAPSHOT_DEFAULTS,
  acquireCurrentRuntimeSnapshotReader,
  buildCurrentRuntimeSnapshotDiagnostics,
  buildCurrentRuntimeSnapshotReadStats,
  createCurrentRuntimeSnapshotReaderCounters,
  createInitialCurrentRuntimeSnapshotDiagnostics,
  type CurrentRuntimeSnapshotDiagnostics,
  type CurrentRuntimeSnapshotReadStats,
} from './current-runtime-snapshot-abi';

export type { CurrentRuntimeArtifact } from './current-runtime-artifact-index.service';
export type {
  CurrentRuntimeSnapshotDiagnostics,
  CurrentRuntimeSnapshotReadStats,
} from './current-runtime-snapshot-abi';

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

export type CurrentRuntimeSnapshotHandle = Readonly<{
  snapshot: CurrentRuntimeSnapshot | null;
  diagnostics: CurrentRuntimeSnapshotDiagnostics;
  acquiredAt: number;
  release: () => void;
}>;

let currentSnapshot: CurrentRuntimeSnapshot | null = null;
let currentFingerprint: string | null = null;
let currentDiagnostics: CurrentRuntimeSnapshotDiagnostics = createInitialCurrentRuntimeSnapshotDiagnostics();
let nextSnapshotRevision = 1;
const snapshotReaders = createCurrentRuntimeSnapshotReaderCounters();

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
  const diagnostics = buildCurrentRuntimeSnapshotDiagnostics(probes);
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
  const distManifestRead = readCurrentRuntimeJsonArtifact(
    CURRENT_RUNTIME_DIST_MANIFEST_FILE,
    CURRENT_RUNTIME_SNAPSHOT_PROBES.distManifest.relativePath,
  );
  probes[CURRENT_RUNTIME_SNAPSHOT_PROBES.distManifest.key] = distManifestRead.probe;
  const distManifest = distManifestRead.value;
  const runtimeManifestPath = getRuntimeManifestRelativePath(distManifest);
  if (!runtimeManifestPath) {
    return clearCurrentRuntimeSnapshot(probes);
  }

  const runtimeManifestFile = resolveDistDataRuntimeFile(runtimeManifestPath);
  const runtimeManifestTextRead = readCurrentRuntimeTextArtifact(runtimeManifestFile, runtimeManifestPath);
  probes[CURRENT_RUNTIME_SNAPSHOT_PROBES.runtimeManifestText.key] = runtimeManifestTextRead.probe;
  const runtimeManifestRead = readCurrentRuntimeJsonArtifact(runtimeManifestFile, runtimeManifestPath);
  probes[CURRENT_RUNTIME_SNAPSHOT_PROBES.runtimeManifestJson.key] = runtimeManifestRead.probe;
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
  const reader = acquireCurrentRuntimeSnapshotReader(snapshotReaders);
  try {
    const snapshot = refreshCurrentRuntimeSnapshot();
    return Object.freeze({
      snapshot,
      diagnostics: currentDiagnostics,
      acquiredAt: reader.acquiredAt,
      release: reader.release,
    });
  } catch (error) {
    reader.release();
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
  return buildCurrentRuntimeSnapshotReadStats({
    readers: snapshotReaders,
    currentRevision: currentSnapshot?.revision ?? null,
    currentFingerprint,
    diagnostics: currentDiagnostics,
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
