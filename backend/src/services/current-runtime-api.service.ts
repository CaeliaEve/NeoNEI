import { type RuntimeHealthSummary, getRuntimeHealthSummary } from './runtime-health-summary.service';
import {
  isPortableRuntimePath,
  normalizeRuntimePath,
} from './current-runtime-artifact-index.service';
import {
  acquireCurrentRuntimeSnapshot,
  type CurrentRuntimeSnapshot,
  type CurrentRuntimeSnapshotHandle,
} from './current-runtime-snapshot.service';
import {
  buildCurrentRuntimeApiMeta,
  buildCurrentRuntimeOverview,
  createCurrentRuntimeAssetDelivery,
  createCurrentRuntimeManifestDelivery,
  CURRENT_RUNTIME_API_ERRORS,
  CURRENT_RUNTIME_API_PARAMS,
  getCurrentRuntimeRequiredParamError,
  normalizeCurrentRuntimeRequiredParamValue,
  type CurrentRuntimeApiMeta,
  type CurrentRuntimeApiParamName,
  type CurrentRuntimeAssetDelivery,
  type CurrentRuntimeManifestDelivery,
  type CurrentRuntimeOverview,
} from './current-runtime-api-abi';
import { badRequest, notFound } from '../utils/http';

export type {
  CurrentRuntimeApiMeta,
  CurrentRuntimeAssetDelivery,
  CurrentRuntimeManifestDelivery,
  CurrentRuntimeOverview,
} from './current-runtime-api-abi';

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

function normalizeRequiredCurrentRuntimeParam(value: string | undefined, name: CurrentRuntimeApiParamName): string {
  const normalized = normalizeCurrentRuntimeRequiredParamValue(value, name);
  if (!normalized) throw badRequest(getCurrentRuntimeRequiredParamError(name));
  return normalized;
}

function buildCurrentRuntimeApiContext(snapshot: CurrentRuntimeSnapshot | null): CurrentRuntimeApiContext {
  const capabilities = snapshot?.capabilities ?? {};
  const health = getRuntimeHealthSummary({ snapshot });
  return Object.freeze({
    snapshot,
    health,
    meta: buildCurrentRuntimeApiMeta({
      snapshotRuntimeId: snapshot?.runtimeId,
      healthRuntimeId: health.distData.runtime?.runtimeId,
      healthSource: health.distData.source,
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
  return buildCurrentRuntimeOverview({
    meta,
    runtimeSchemaRevision: snapshot?.runtimeSchemaRevision,
    manifestPath: snapshot?.manifestPath,
  });
}

export function getCurrentRuntimeManifestDelivery(
  context: CurrentRuntimeApiContext,
): CurrentRuntimeManifestDelivery {
  const { snapshot } = context;
  if (!snapshot) throw notFound(CURRENT_RUNTIME_API_ERRORS.manifestMissing);
  return createCurrentRuntimeManifestDelivery({
    payload: snapshot.manifest,
    runtimeId: snapshot.runtimeId,
    manifestPath: snapshot.manifestPath,
    fingerprint: snapshot.fingerprint,
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
  return createCurrentRuntimeAssetDelivery({
    artifact,
    runtimeId: context.meta.runtimeId,
  });
}
