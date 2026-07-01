import fs from 'fs';
import path from 'path';
import { PUBLIC_DIR } from '../config/runtime-paths';

export type CurrentRuntimeJsonRecord = Record<string, unknown>;

export type CurrentRuntimeArtifact = Readonly<{
  relativePath: string;
  absolutePath: string;
  bytes: number;
  mtimeMs: number;
}>;

export const CURRENT_RUNTIME_DIST_DATA_DIR = path.join(PUBLIC_DIR, 'dist-data');
export const CURRENT_RUNTIME_DIST_MANIFEST_FILE = path.join(CURRENT_RUNTIME_DIST_DATA_DIR, 'manifest.json');

function asRecord(value: unknown): CurrentRuntimeJsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as CurrentRuntimeJsonRecord : null;
}

function asString(value: unknown): string | null {
  const text = `${value ?? ''}`.trim();
  return text || null;
}

function statRuntimeFile(filePath: string): fs.Stats | null {
  try {
    const stat = fs.statSync(filePath);
    return stat.isFile() ? stat : null;
  } catch {
    return null;
  }
}

export function readCurrentRuntimeJson(filePath: string): CurrentRuntimeJsonRecord | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as CurrentRuntimeJsonRecord;
  } catch {
    return null;
  }
}

export function readCurrentRuntimeText(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf8');
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

export function normalizeRuntimePath(value: string): string {
  return value.trim().replace(/\\/g, '/').replace(/^\/+/, '');
}

export function resolveDistDataRuntimeFile(relativeFileName: string): string {
  const raw = `${relativeFileName ?? ''}`.trim().replace(/\\/g, '/');
  if (!raw || raw.includes('..') || path.isAbsolute(raw) || /^[A-Za-z]:[\\/]/.test(raw)) {
    throw new Error('fileName must be a runtime-relative file path');
  }
  const normalized = normalizeRuntimePath(raw);
  const resolved = path.resolve(CURRENT_RUNTIME_DIST_DATA_DIR, normalized);
  const runtimeRoot = path.resolve(CURRENT_RUNTIME_DIST_DATA_DIR);
  if (resolved !== runtimeRoot && !resolved.startsWith(`${runtimeRoot}${path.sep}`)) {
    throw new Error('fileName escapes dist-data root');
  }
  return resolved;
}

export function getRuntimeManifestRelativePath(distManifest: CurrentRuntimeJsonRecord | null): string | null {
  const files = asRecord(distManifest?.files);
  const nativeRuntime = asRecord(distManifest?.nativeRuntime);
  const declared = asString(files?.rustRuntimeManifest)
    ?? asString(nativeRuntime?.runtimeManifest)
    ?? asString(files?.runtimeManifest);
  return isPortableRuntimePath(declared) ? normalizeRuntimePath(declared) : null;
}

function addPortableRuntimePath(value: unknown, output: Set<string>): void {
  if (isPortableRuntimePath(value)) {
    output.add(normalizeRuntimePath(value));
  }
}

function collectEntrypointRuntimePaths(value: unknown, output: Set<string>): void {
  const record = asRecord(value);
  if (!record) return;
  for (const item of Object.values(record)) addPortableRuntimePath(item, output);
}

function collectManifestRuntimeFiles(value: unknown, output: Set<string>): void {
  addPortableRuntimePath(value, output);
  if (Array.isArray(value)) {
    for (const item of value) {
      const record = asRecord(item);
      if (record) {
        addPortableRuntimePath(record.path, output);
      } else {
        addPortableRuntimePath(item, output);
      }
    }
    return;
  }
  const record = asRecord(value);
  if (!record) return;
  for (const item of Object.values(record)) addPortableRuntimePath(item, output);
}

export function collectDeclaredRuntimeFilePaths(
  runtimeManifestPath: string,
  runtimeManifest: CurrentRuntimeJsonRecord,
): readonly string[] {
  const declared = new Set<string>();
  declared.add(runtimeManifestPath);
  collectEntrypointRuntimePaths(runtimeManifest.entrypoints, declared);
  collectManifestRuntimeFiles(runtimeManifest.files, declared);
  return Object.freeze(Array.from(declared).sort((left, right) => left.localeCompare(right)));
}

export function buildCurrentRuntimeArtifactInventory(
  declaredFiles: readonly string[],
): Readonly<Record<string, CurrentRuntimeArtifact>> {
  const artifacts: Record<string, CurrentRuntimeArtifact> = {};
  for (const relativePath of declaredFiles) {
    const absolutePath = resolveDistDataRuntimeFile(relativePath);
    const stat = statRuntimeFile(absolutePath);
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
  const stat = statRuntimeFile(absolutePath);
  return stat
    ? `${relativePath}:${stat.size}:${stat.mtimeMs}`
    : `${relativePath}:missing`;
}

export function buildCurrentRuntimeSnapshotFingerprint(
  runtimeManifestPath: string,
  declaredFiles: readonly string[],
): string {
  return [
    fileFingerprint('manifest.json'),
    fileFingerprint(runtimeManifestPath),
    ...declaredFiles.map((relativePath) => fileFingerprint(relativePath)),
  ].join('|');
}
