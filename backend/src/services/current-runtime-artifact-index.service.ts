import fs from 'fs';
import path from 'path';
import { DIST_DATA_DIR } from '../config/runtime-paths';
import {
  CURRENT_RUNTIME_ARTIFACT_STATUS,
  type CurrentRuntimeArtifactProbe,
  type CurrentRuntimeArtifactReadKind,
} from './current-runtime-artifact-index-abi';

export { CURRENT_RUNTIME_ARTIFACT_STATUS };
export type { CurrentRuntimeArtifactProbe };

export type CurrentRuntimeJsonRecord = Record<string, unknown>;

export type CurrentRuntimeArtifact = Readonly<{
  relativePath: string;
  absolutePath: string;
  bytes: number;
  mtimeMs: number;
}>;

export type CurrentRuntimeJsonArtifactRead = Readonly<{
  probe: CurrentRuntimeArtifactProbe;
  value: CurrentRuntimeJsonRecord | null;
}>;

export type CurrentRuntimeTextArtifactRead = Readonly<{
  probe: CurrentRuntimeArtifactProbe;
  value: string | null;
}>;

export type CurrentRuntimeArtifactInventory = Readonly<{
  artifactsByPath: Readonly<Record<string, CurrentRuntimeArtifact>>;
  probesByPath: Readonly<Record<string, CurrentRuntimeArtifactProbe>>;
  missing: readonly string[];
  invalid: readonly string[];
  errors: readonly string[];
}>;

export const CURRENT_RUNTIME_DIST_DATA_DIR = DIST_DATA_DIR;
export const CURRENT_RUNTIME_DIST_MANIFEST_FILE = path.join(CURRENT_RUNTIME_DIST_DATA_DIR, 'manifest.json');

function asRecord(value: unknown): CurrentRuntimeJsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as CurrentRuntimeJsonRecord : null;
}

function asString(value: unknown): string | null {
  const text = `${value ?? ''}`.trim();
  return text || null;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorCode(error: unknown): string | null {
  return error && typeof error === 'object' && 'code' in error
    ? `${(error as { code?: unknown }).code ?? ''}` || null
    : null;
}

function createCurrentRuntimeArtifactProbe(args: {
  status: CurrentRuntimeArtifactProbe['status'];
  kind: CurrentRuntimeArtifactReadKind;
  path: string;
  relativePath?: string | null;
  bytes?: number | null;
  mtimeMs?: number | null;
  error?: string | null;
}): CurrentRuntimeArtifactProbe {
  return Object.freeze({
    status: args.status,
    kind: args.kind,
    path: args.path,
    relativePath: args.relativePath ?? null,
    bytes: args.bytes ?? null,
    mtimeMs: args.mtimeMs ?? null,
    error: args.error ?? null,
  });
}

export function probeCurrentRuntimeFile(
  filePath: string,
  relativePath: string | null = null,
  kind: CurrentRuntimeArtifactReadKind = 'file',
): CurrentRuntimeArtifactProbe {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      return createCurrentRuntimeArtifactProbe({
        status: CURRENT_RUNTIME_ARTIFACT_STATUS.invalid,
        kind,
        path: filePath,
        relativePath,
        error: `current runtime artifact path is not a file: ${filePath}`,
      });
    }
    return createCurrentRuntimeArtifactProbe({
      status: CURRENT_RUNTIME_ARTIFACT_STATUS.present,
      kind,
      path: filePath,
      relativePath,
      bytes: stat.size,
      mtimeMs: stat.mtimeMs,
    });
  } catch (error) {
    const missing = errorCode(error) === 'ENOENT';
    return createCurrentRuntimeArtifactProbe({
      status: missing
        ? CURRENT_RUNTIME_ARTIFACT_STATUS.missing
        : CURRENT_RUNTIME_ARTIFACT_STATUS.invalid,
      kind,
      path: filePath,
      relativePath,
      error: missing ? `current runtime artifact is missing: ${filePath}` : describeError(error),
    });
  }
}

export function readCurrentRuntimeJsonArtifact(
  filePath: string,
  relativePath: string | null = null,
): CurrentRuntimeJsonArtifactRead {
  const fileProbe = probeCurrentRuntimeFile(filePath, relativePath, 'json');
  if (fileProbe.status !== CURRENT_RUNTIME_ARTIFACT_STATUS.present) {
    return Object.freeze({ probe: fileProbe, value: null });
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
    const record = asRecord(parsed);
    if (!record) {
      return Object.freeze({
        probe: createCurrentRuntimeArtifactProbe({
          status: CURRENT_RUNTIME_ARTIFACT_STATUS.invalid,
          kind: 'json',
          path: filePath,
          relativePath,
          bytes: fileProbe.bytes,
          mtimeMs: fileProbe.mtimeMs,
          error: 'current runtime JSON artifact payload must be an object',
        }),
        value: null,
      });
    }
    return Object.freeze({ probe: fileProbe, value: record });
  } catch (error) {
    return Object.freeze({
      probe: createCurrentRuntimeArtifactProbe({
        status: CURRENT_RUNTIME_ARTIFACT_STATUS.invalid,
        kind: 'json',
        path: filePath,
        relativePath,
        bytes: fileProbe.bytes,
        mtimeMs: fileProbe.mtimeMs,
        error: describeError(error),
      }),
      value: null,
    });
  }
}

export function readCurrentRuntimeTextArtifact(
  filePath: string,
  relativePath: string | null = null,
): CurrentRuntimeTextArtifactRead {
  const fileProbe = probeCurrentRuntimeFile(filePath, relativePath, 'text');
  if (fileProbe.status !== CURRENT_RUNTIME_ARTIFACT_STATUS.present) {
    return Object.freeze({ probe: fileProbe, value: null });
  }
  try {
    return Object.freeze({
      probe: fileProbe,
      value: fs.readFileSync(filePath, 'utf8'),
    });
  } catch (error) {
    return Object.freeze({
      probe: createCurrentRuntimeArtifactProbe({
        status: CURRENT_RUNTIME_ARTIFACT_STATUS.invalid,
        kind: 'text',
        path: filePath,
        relativePath,
        bytes: fileProbe.bytes,
        mtimeMs: fileProbe.mtimeMs,
        error: describeError(error),
      }),
      value: null,
    });
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
): CurrentRuntimeArtifactInventory {
  const artifacts: Record<string, CurrentRuntimeArtifact> = {};
  const probes: Record<string, CurrentRuntimeArtifactProbe> = {};
  for (const relativePath of declaredFiles) {
    const absolutePath = resolveDistDataRuntimeFile(relativePath);
    const probe = probeCurrentRuntimeFile(absolutePath, relativePath);
    probes[relativePath] = probe;
    if (probe.status === CURRENT_RUNTIME_ARTIFACT_STATUS.present) {
      artifacts[relativePath] = Object.freeze({
        relativePath,
        absolutePath,
        bytes: probe.bytes ?? 0,
        mtimeMs: probe.mtimeMs ?? 0,
      });
    }
  }
  return Object.freeze({
    artifactsByPath: Object.freeze(artifacts),
    probesByPath: Object.freeze(probes),
    missing: Object.freeze(Object.entries(probes)
      .filter(([, probe]) => probe.status === CURRENT_RUNTIME_ARTIFACT_STATUS.missing)
      .map(([relativePath]) => relativePath)),
    invalid: Object.freeze(Object.entries(probes)
      .filter(([, probe]) => probe.status === CURRENT_RUNTIME_ARTIFACT_STATUS.invalid)
      .map(([relativePath]) => relativePath)),
    errors: Object.freeze(Object.entries(probes)
      .filter(([, probe]) => probe.error)
      .map(([relativePath, probe]) => `${relativePath}: ${probe.error}`)),
  });
}

function fileFingerprint(relativePath: string): string {
  const absolutePath = resolveDistDataRuntimeFile(relativePath);
  const probe = probeCurrentRuntimeFile(absolutePath, relativePath);
  return probe.status === CURRENT_RUNTIME_ARTIFACT_STATUS.present
    ? `${relativePath}:${probe.bytes}:${probe.mtimeMs}`
    : `${relativePath}:${probe.status}`;
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
