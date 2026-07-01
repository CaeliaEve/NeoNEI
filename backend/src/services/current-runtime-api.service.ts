import { type RuntimeHealthSummary, getRuntimeHealthSummary } from './runtime-health-summary.service';
import {
  acquireCurrentRuntimeSnapshot,
  isPortableRuntimePath,
  normalizeRuntimePath,
  type CurrentRuntimeArtifact,
  type CurrentRuntimeSnapshot,
  type CurrentRuntimeSnapshotHandle,
} from './current-runtime-snapshot.service';
import { badRequest, notFound } from '../utils/http';
import { createWeakEtag } from '../utils/http-cache';

const API_SCHEMA = 'neonei/api/current';
const API_SCHEMA_REVISION = 1;

type JsonRecord = Record<string, unknown>;

export type CurrentRuntimeApiMeta = Readonly<{
  schema: typeof API_SCHEMA;
  schemaRevision: typeof API_SCHEMA_REVISION;
  runtimeId: string;
  capabilities: JsonRecord;
}>;

export type CurrentRuntimeApiContext = Readonly<{
  snapshot: CurrentRuntimeSnapshot | null;
  health: RuntimeHealthSummary;
  meta: CurrentRuntimeApiMeta;
}>;

export type CurrentRuntimeApiContextHandle = Readonly<{
  context: CurrentRuntimeApiContext;
  acquiredAt: number;
  release: () => void;
}>;

export type CurrentRuntimeOverview = Readonly<{
  runtimeId: string;
  schemaRevision: string;
  manifestUrl: string;
  runtimeManifestUrl: string;
  assetBaseUrl: string;
  runtimeAssetBaseUrl: string;
  legacyManifestUrl: string;
  capabilities: JsonRecord;
  manifestPath: string | null;
  cache: Readonly<{
    immutable: true;
    maxAgeSeconds: number;
  }>;
}>;

export type CurrentRuntimeManifestDelivery = Readonly<{
  payload: JsonRecord;
  etag: string;
}>;

export type CurrentRuntimeAssetDelivery = Readonly<{
  artifact: CurrentRuntimeArtifact;
  etag: string;
}>;

function asString(value: unknown): string | null {
  const text = `${value ?? ''}`.trim();
  return text || null;
}

function normalizeRequiredCurrentRuntimeParam(value: string | undefined, name: string): string {
  const normalized = `${value ?? ''}`.trim();
  if (!normalized) throw badRequest(`${name} is required`);
  return normalized;
}

function buildCurrentRuntimeApiContext(snapshot: CurrentRuntimeSnapshot | null): CurrentRuntimeApiContext {
  const capabilities = snapshot?.capabilities ?? {};
  const health = getRuntimeHealthSummary({ snapshot });
  return Object.freeze({
    snapshot,
    health,
    meta: Object.freeze({
      schema: API_SCHEMA,
      schemaRevision: API_SCHEMA_REVISION,
      runtimeId: snapshot?.runtimeId ?? asString(health.distData.runtime?.runtimeId) ?? health.distData.source ?? 'runtime-missing',
      capabilities,
    }),
  });
}

function createApiContextHandle(snapshotHandle: CurrentRuntimeSnapshotHandle): CurrentRuntimeApiContextHandle {
  const context = buildCurrentRuntimeApiContext(snapshotHandle.snapshot);
  let released = false;
  return Object.freeze({
    context,
    acquiredAt: snapshotHandle.acquiredAt,
    release: () => {
      if (released) return;
      released = true;
      snapshotHandle.release();
    },
  });
}

export function acquireCurrentRuntimeApiContext(): CurrentRuntimeApiContextHandle {
  const snapshotHandle = acquireCurrentRuntimeSnapshot();
  try {
    return createApiContextHandle(snapshotHandle);
  } catch (error) {
    snapshotHandle.release();
    throw error;
  }
}

export function withCurrentRuntimeApiContext<T>(reader: (context: CurrentRuntimeApiContext) => T): T {
  const handle = acquireCurrentRuntimeApiContext();
  try {
    return reader(handle.context);
  } finally {
    handle.release();
  }
}

export async function withCurrentRuntimeApiContextAsync<T>(
  reader: (context: CurrentRuntimeApiContext) => Promise<T>,
): Promise<T> {
  const handle = acquireCurrentRuntimeApiContext();
  try {
    return await reader(handle.context);
  } finally {
    handle.release();
  }
}

export function assertCurrentRuntimeId(runtimeId: string | undefined, context: CurrentRuntimeApiContext): void {
  const requested = normalizeRequiredCurrentRuntimeParam(runtimeId, 'runtimeId');
  const current = context.meta.runtimeId;
  if (requested !== current) {
    throw notFound('Runtime id is not the current published runtime');
  }
}

export function getCurrentRuntimeOverview(context: CurrentRuntimeApiContext): CurrentRuntimeOverview {
  const { meta, snapshot } = context;
  return Object.freeze({
    runtimeId: meta.runtimeId,
    schemaRevision: snapshot?.runtimeSchemaRevision ?? 'runtime.unknown',
    manifestUrl: '/api/runtime/current/manifest',
    runtimeManifestUrl: `/api/runtime/${encodeURIComponent(meta.runtimeId)}/manifest`,
    assetBaseUrl: '/api/runtime/current/asset/',
    runtimeAssetBaseUrl: `/api/runtime/${encodeURIComponent(meta.runtimeId)}/asset/`,
    legacyManifestUrl: '/api/native-runtime/current/manifest',
    capabilities: meta.capabilities,
    manifestPath: snapshot?.manifestPath ?? null,
    cache: Object.freeze({
      immutable: true,
      maxAgeSeconds: 31_536_000,
    }),
  });
}

export function getCurrentRuntimeManifestDelivery(
  context: CurrentRuntimeApiContext,
): CurrentRuntimeManifestDelivery {
  const { snapshot } = context;
  if (!snapshot) throw notFound('Runtime manifest not found');
  return Object.freeze({
    payload: snapshot.manifest,
    etag: createWeakEtag('runtime-manifest', snapshot.runtimeId, snapshot.manifestPath, snapshot.fingerprint),
  });
}

export function getCurrentRuntimeAssetDelivery(
  fileName: string | undefined,
  context: CurrentRuntimeApiContext,
): CurrentRuntimeAssetDelivery {
  const raw = normalizeRequiredCurrentRuntimeParam(fileName, 'fileName');
  if (!isPortableRuntimePath(raw)) throw badRequest('fileName must be a runtime-relative file path');
  const normalized = normalizeRuntimePath(raw);
  const artifact = context.snapshot?.declaredFiles.includes(normalized)
    ? context.snapshot.artifactsByPath[normalized] ?? null
    : null;
  if (!artifact) throw notFound('Runtime file is not declared by the current runtime manifest');
  return Object.freeze({
    artifact,
    etag: createWeakEtag('runtime-asset', context.meta.runtimeId, artifact.relativePath, artifact.bytes, artifact.mtimeMs),
  });
}
