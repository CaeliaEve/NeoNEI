import { type RuntimeHealthSummary, getRuntimeHealthSummary } from './runtime-health-summary.service';
import {
  isPortableRuntimePath,
  normalizeRuntimePath,
  type CurrentRuntimeArtifact,
} from './current-runtime-artifact-index.service';
import {
  acquireCurrentRuntimeSnapshot,
  type CurrentRuntimeSnapshot,
  type CurrentRuntimeSnapshotHandle,
} from './current-runtime-snapshot.service';
import {
  buildPinnedRuntimeAssetBaseUrl,
  buildPinnedRuntimeManifestUrl,
  CURRENT_RUNTIME_API_CACHE,
  CURRENT_RUNTIME_API_ERRORS,
  CURRENT_RUNTIME_API_ETAG_KEYS,
  CURRENT_RUNTIME_API_PARAMS,
  CURRENT_RUNTIME_API_SCHEMA,
  CURRENT_RUNTIME_API_SCHEMA_REVISION,
  CURRENT_RUNTIME_API_URLS,
  CURRENT_RUNTIME_MISSING_ID,
  CURRENT_RUNTIME_UNKNOWN_SCHEMA_REVISION,
  type CurrentRuntimeApiParamName,
} from './current-runtime-api-abi';
import { badRequest, notFound } from '../utils/http';
import { createWeakEtag } from '../utils/http-cache';

type JsonRecord = Record<string, unknown>;

export type CurrentRuntimeApiMeta = Readonly<{
  schema: typeof CURRENT_RUNTIME_API_SCHEMA;
  schemaRevision: typeof CURRENT_RUNTIME_API_SCHEMA_REVISION;
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

function requiredParamError(name: CurrentRuntimeApiParamName): string {
  return name === CURRENT_RUNTIME_API_PARAMS.runtimeId
    ? CURRENT_RUNTIME_API_ERRORS.runtimeIdRequired
    : CURRENT_RUNTIME_API_ERRORS.fileNameRequired;
}

function normalizeRequiredCurrentRuntimeParam(value: string | undefined, name: CurrentRuntimeApiParamName): string {
  const normalized = `${value ?? ''}`.trim();
  if (!normalized) throw badRequest(requiredParamError(name));
  return normalized;
}

function buildCurrentRuntimeApiContext(snapshot: CurrentRuntimeSnapshot | null): CurrentRuntimeApiContext {
  const capabilities = snapshot?.capabilities ?? {};
  const health = getRuntimeHealthSummary({ snapshot });
  return Object.freeze({
    snapshot,
    health,
    meta: Object.freeze({
      schema: CURRENT_RUNTIME_API_SCHEMA,
      schemaRevision: CURRENT_RUNTIME_API_SCHEMA_REVISION,
      runtimeId: snapshot?.runtimeId
        ?? asString(health.distData.runtime?.runtimeId)
        ?? health.distData.source
        ?? CURRENT_RUNTIME_MISSING_ID,
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
  const requested = normalizeRequiredCurrentRuntimeParam(runtimeId, CURRENT_RUNTIME_API_PARAMS.runtimeId);
  const current = context.meta.runtimeId;
  if (requested !== current) {
    throw notFound(CURRENT_RUNTIME_API_ERRORS.runtimeNotCurrent);
  }
}

export function getCurrentRuntimeOverview(context: CurrentRuntimeApiContext): CurrentRuntimeOverview {
  const { meta, snapshot } = context;
  return Object.freeze({
    runtimeId: meta.runtimeId,
    schemaRevision: snapshot?.runtimeSchemaRevision ?? CURRENT_RUNTIME_UNKNOWN_SCHEMA_REVISION,
    manifestUrl: CURRENT_RUNTIME_API_URLS.currentManifest,
    runtimeManifestUrl: buildPinnedRuntimeManifestUrl(meta.runtimeId),
    assetBaseUrl: CURRENT_RUNTIME_API_URLS.currentAssetBase,
    runtimeAssetBaseUrl: buildPinnedRuntimeAssetBaseUrl(meta.runtimeId),
    capabilities: meta.capabilities,
    manifestPath: snapshot?.manifestPath ?? null,
    cache: CURRENT_RUNTIME_API_CACHE,
  });
}

export function getCurrentRuntimeManifestDelivery(
  context: CurrentRuntimeApiContext,
): CurrentRuntimeManifestDelivery {
  const { snapshot } = context;
  if (!snapshot) throw notFound(CURRENT_RUNTIME_API_ERRORS.manifestMissing);
  return Object.freeze({
    payload: snapshot.manifest,
    etag: createWeakEtag(
      CURRENT_RUNTIME_API_ETAG_KEYS.manifest,
      snapshot.runtimeId,
      snapshot.manifestPath,
      snapshot.fingerprint,
    ),
  });
}

export function getCurrentRuntimeAssetDelivery(
  fileName: string | undefined,
  context: CurrentRuntimeApiContext,
): CurrentRuntimeAssetDelivery {
  const raw = normalizeRequiredCurrentRuntimeParam(fileName, CURRENT_RUNTIME_API_PARAMS.fileName);
  if (!isPortableRuntimePath(raw)) throw badRequest(CURRENT_RUNTIME_API_ERRORS.filePathInvalid);
  const normalized = normalizeRuntimePath(raw);
  const artifact = context.snapshot?.declaredFiles.includes(normalized)
    ? context.snapshot.artifactsByPath[normalized] ?? null
    : null;
  if (!artifact) throw notFound(CURRENT_RUNTIME_API_ERRORS.fileNotDeclared);
  return Object.freeze({
    artifact,
    etag: createWeakEtag(
      CURRENT_RUNTIME_API_ETAG_KEYS.asset,
      context.meta.runtimeId,
      artifact.relativePath,
      artifact.bytes,
      artifact.mtimeMs,
    ),
  });
}
