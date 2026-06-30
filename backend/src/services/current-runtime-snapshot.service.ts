import fs from 'fs';
import path from 'path';
import { PUBLIC_DIR } from '../config/runtime-paths';

type JsonRecord = Record<string, unknown>;

export type CurrentRuntimeArtifact = Readonly<{
  relativePath: string;
  absolutePath: string;
  bytes: number;
  mtimeMs: number;
}>;

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

const DIST_DATA_DIR = path.join(PUBLIC_DIR, 'dist-data');
const DIST_DATA_MANIFEST_FILE = path.join(DIST_DATA_DIR, 'manifest.json');

let currentSnapshot: CurrentRuntimeSnapshot | null = null;
let currentFingerprint: string | null = null;
let nextSnapshotRevision = 1;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
}

function asString(value: unknown): string | null {
  const text = `${value ?? ''}`.trim();
  return text || null;
}

function readJson(filePath: string): JsonRecord | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as JsonRecord;
  } catch {
    return null;
  }
}

function readText(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function statFile(filePath: string): fs.Stats | null {
  try {
    const stat = fs.statSync(filePath);
    return stat.isFile() ? stat : null;
  } catch {
    return null;
  }
}

export function isPortableRuntimePath(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const normalized = `${value ?? ''}`.trim().replace(/\\/g, '/');
  return Boolean(normalized)
    && !normalized.includes('..')
    && !path.isAbsolute(normalized)
    && !/^[A-Za-z]:[\\/]/.test(normalized);
}

function normalizeRuntimePath(value: string): string {
  return value.trim().replace(/\\/g, '/').replace(/^\/+/, '');
}

export function resolveDistDataRuntimeFile(relativeFileName: string): string {
  const raw = `${relativeFileName ?? ''}`.trim().replace(/\\/g, '/');
  if (!raw || raw.includes('..') || path.isAbsolute(raw) || /^[A-Za-z]:[\\/]/.test(raw)) {
    throw new Error('fileName must be a runtime-relative file path');
  }
  const normalized = normalizeRuntimePath(raw);
  const resolved = path.resolve(DIST_DATA_DIR, normalized);
  const runtimeRoot = path.resolve(DIST_DATA_DIR);
  if (resolved !== runtimeRoot && !resolved.startsWith(`${runtimeRoot}${path.sep}`)) {
    throw new Error('fileName escapes dist-data root');
  }
  return resolved;
}

function getRuntimeManifestRelativePath(distManifest: JsonRecord | null): string | null {
  const files = asRecord(distManifest?.files);
  const nativeRuntime = asRecord(distManifest?.nativeRuntime);
  const declared = asString(files?.rustRuntimeManifest)
    ?? asString(nativeRuntime?.runtimeManifest)
    ?? asString(files?.runtimeManifest);
  return isPortableRuntimePath(declared) ? normalizeRuntimePath(declared) : null;
}

function collectPortableRuntimePaths(value: unknown, output: Set<string>): void {
  if (isPortableRuntimePath(value)) {
    output.add(normalizeRuntimePath(value));
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectPortableRuntimePaths(item, output);
    return;
  }
  const record = asRecord(value);
  if (!record) return;
  for (const item of Object.values(record)) collectPortableRuntimePaths(item, output);
}

function collectDeclaredRuntimeFilePaths(runtimeManifestPath: string, runtimeManifest: JsonRecord): readonly string[] {
  const declared = new Set<string>();
  declared.add(runtimeManifestPath);
  collectPortableRuntimePaths(asRecord(runtimeManifest.entrypoints), declared);
  collectPortableRuntimePaths(runtimeManifest.files, declared);
  return Object.freeze(Array.from(declared).sort((left, right) => left.localeCompare(right)));
}

function buildArtifactInventory(declaredFiles: readonly string[]): Readonly<Record<string, CurrentRuntimeArtifact>> {
  const artifacts: Record<string, CurrentRuntimeArtifact> = {};
  for (const relativePath of declaredFiles) {
    const absolutePath = resolveDistDataRuntimeFile(relativePath);
    const stat = statFile(absolutePath);
    if (!stat) continue;
    artifacts[relativePath] = Object.freeze({
      relativePath,
      absolutePath,
      bytes: stat.size,
      mtimeMs: stat.mtimeMs,
    });
  }
  return Object.freeze(artifacts);
}

function fileFingerprint(relativePath: string): string {
  const absolutePath = resolveDistDataRuntimeFile(relativePath);
  const stat = statFile(absolutePath);
  return stat
    ? `${relativePath}:${stat.size}:${stat.mtimeMs}`
    : `${relativePath}:missing`;
}

function buildSnapshotFingerprint(runtimeManifestPath: string, declaredFiles: readonly string[]): string {
  return [
    fileFingerprint('manifest.json'),
    fileFingerprint(runtimeManifestPath),
    ...declaredFiles.map((relativePath) => fileFingerprint(relativePath)),
  ].join('|');
}

function getRuntimeSchemaRevision(manifest: JsonRecord): string {
  return asString(manifest.schemaRevision)
    ?? asString(manifest.schema)
    ?? 'runtime.unknown';
}

function getRuntimeId(manifest: JsonRecord): string {
  return asString(manifest.runtimeId) ?? 'runtime-missing';
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

export function getCurrentRuntimeSnapshot(): CurrentRuntimeSnapshot | null {
  const distManifest = readJson(DIST_DATA_MANIFEST_FILE);
  const runtimeManifestPath = getRuntimeManifestRelativePath(distManifest);
  if (!runtimeManifestPath) {
    currentSnapshot = null;
    currentFingerprint = null;
    return null;
  }

  const runtimeManifestFile = resolveDistDataRuntimeFile(runtimeManifestPath);
  const runtimeManifestJson = readText(runtimeManifestFile);
  const runtimeManifest = runtimeManifestJson ? readJson(runtimeManifestFile) : null;
  if (!runtimeManifest || !runtimeManifestJson) {
    currentSnapshot = null;
    currentFingerprint = null;
    return null;
  }

  const declaredFiles = collectDeclaredRuntimeFilePaths(runtimeManifestPath, runtimeManifest);
  const fingerprint = buildSnapshotFingerprint(runtimeManifestPath, declaredFiles);
  if (currentSnapshot && currentFingerprint === fingerprint) {
    return currentSnapshot;
  }

  return publishCurrentRuntimeSnapshot({
    runtimeId: getRuntimeId(runtimeManifest),
    runtimeSchemaRevision: getRuntimeSchemaRevision(runtimeManifest),
    manifestPath: runtimeManifestPath,
    manifest: Object.freeze(runtimeManifest),
    manifestJson: runtimeManifestJson,
    capabilities: Object.freeze(asRecord(runtimeManifest.capabilities) ?? {}),
    declaredFiles,
    artifactsByPath: buildArtifactInventory(declaredFiles),
    fingerprint,
  });
}

export function getCurrentRuntimeArtifact(relativeFileName: string): CurrentRuntimeArtifact | null {
  const snapshot = getCurrentRuntimeSnapshot();
  if (!snapshot) return null;
  if (!isPortableRuntimePath(relativeFileName)) return null;
  const normalized = normalizeRuntimePath(relativeFileName);
  if (!snapshot.declaredFiles.includes(normalized)) return null;
  return snapshot.artifactsByPath[normalized] ?? null;
}
