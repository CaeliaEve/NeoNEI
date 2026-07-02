import {
  CURRENT_RUNTIME_DIST_MANIFEST_FILE,
  buildCurrentRuntimeArtifactInventory,
  buildCurrentRuntimeSnapshotFingerprint,
  collectDeclaredRuntimeFilePaths,
  getRuntimeManifestRelativePath,
  isPortableRuntimePath,
  normalizeRuntimePath,
  readCurrentRuntimeJson,
  readCurrentRuntimeText,
  resolveDistDataRuntimeFile,
  type CurrentRuntimeArtifact,
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
  fingerprint: string;
}>;

export type CurrentRuntimeSnapshotHandle = Readonly<{
  snapshot: CurrentRuntimeSnapshot | null;
  acquiredAt: number;
  release: () => void;
}>;

export type CurrentRuntimeSnapshotReadStats = Readonly<{
  activeReaders: number;
  totalAcquires: number;
  currentRevision: number | null;
  currentFingerprint: string | null;
}>;

let currentSnapshot: CurrentRuntimeSnapshot | null = null;
let currentFingerprint: string | null = null;
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

function clearCurrentRuntimeSnapshot(): null {
  currentSnapshot = null;
  currentFingerprint = null;
  return null;
}

function refreshCurrentRuntimeSnapshot(): CurrentRuntimeSnapshot | null {
  const distManifest = readCurrentRuntimeJson(CURRENT_RUNTIME_DIST_MANIFEST_FILE);
  const runtimeManifestPath = getRuntimeManifestRelativePath(distManifest);
  if (!runtimeManifestPath) {
    return clearCurrentRuntimeSnapshot();
  }

  const runtimeManifestFile = resolveDistDataRuntimeFile(runtimeManifestPath);
  const runtimeManifestJson = readCurrentRuntimeText(runtimeManifestFile);
  const runtimeManifest = runtimeManifestJson ? readCurrentRuntimeJson(runtimeManifestFile) : null;
  if (!runtimeManifest || !runtimeManifestJson) {
    return clearCurrentRuntimeSnapshot();
  }

  const declaredFiles = collectDeclaredRuntimeFilePaths(runtimeManifestPath, runtimeManifest);
  const fingerprint = buildCurrentRuntimeSnapshotFingerprint(runtimeManifestPath, declaredFiles);
  if (currentSnapshot && currentFingerprint === fingerprint) {
    return currentSnapshot;
  }

  return publishCurrentRuntimeSnapshot({
    runtimeId: getRuntimeId(runtimeManifest),
    runtimeSchemaRevision: getRuntimeSchemaRevision(runtimeManifest),
    manifestPath: runtimeManifestPath,
    manifest: Object.freeze(runtimeManifest),
    manifestJson: runtimeManifestJson,
    capabilities: Object.freeze(asRecord(runtimeManifest[CURRENT_RUNTIME_MANIFEST_FIELDS.capabilities]) ?? {}),
    declaredFiles,
    artifactsByPath: buildCurrentRuntimeArtifactInventory(declaredFiles),
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
