import fs from 'fs';
import path from 'path';
import { DATA_DIR, PUBLISH_OUTPUT_DIR } from '../config/runtime-paths';
import { getPublishManifestService } from './publish-manifest.service';
import { getRuntimeHealthSummary, type RuntimeHealthSummary } from './runtime-health-summary.service';
import {
  RUNTIME_DIAGNOSTICS_READINESS_PROBE_DESCRIPTORS,
  RUNTIME_DIAGNOSTICS_READINESS_STATUS,
  RUNTIME_DIAGNOSTICS_SCHEMA_VERSION,
  type RuntimeDiagnosticsReadinessProbeName,
  type RuntimeDiagnosticsReadinessProbeStatus,
  type RuntimeDiagnosticsReadinessStatus,
} from './runtime-diagnostics-summary-abi';

export type RuntimeDiagnosticsReadinessProbe = Readonly<{
  name: RuntimeDiagnosticsReadinessProbeName;
  status: RuntimeDiagnosticsReadinessProbeStatus;
  required: true;
  path: string | null;
  value: string | null;
  message: string | null;
}>;

export type RuntimeDiagnosticsReadiness = Readonly<{
  status: RuntimeDiagnosticsReadinessStatus;
  probes: Readonly<Record<RuntimeDiagnosticsReadinessProbeName, RuntimeDiagnosticsReadinessProbe>>;
  missing: readonly RuntimeDiagnosticsReadinessProbeName[];
  invalid: readonly RuntimeDiagnosticsReadinessProbeName[];
  errors: readonly string[];
}>;

export interface RuntimeDiagnosticsSummary {
  schemaVersion: typeof RUNTIME_DIAGNOSTICS_SCHEMA_VERSION;
  status: RuntimeHealthSummary['status'];
  sourceSignature: string;
  runtimeCacheKey: string;
  publishRevision: string | null;
  publishCompiledAt: string | null;
  browserLayoutKey: string | null;
  readiness: RuntimeDiagnosticsReadiness;
  mode: {
    publicRuntimeOnly: boolean;
  };
  assets: {
    publishBundleFiles: number;
    hasBrowserWindows: boolean;
    hasRecipeBootstrap: boolean;
    hasRecipeSearch: boolean;
  };
  nativeRender: RuntimeHealthSummary['nativeRender'];
  nativeUi: RuntimeHealthSummary['nativeUi'];
  health: RuntimeHealthSummary;
  compiler: RuntimeHealthSummary['compiler'];
}

function publicRuntimeOnly(): boolean {
  const raw = process.env.NEONEI_PUBLIC_RUNTIME_ONLY;
  return raw === '1' || raw?.toLowerCase() === 'true';
}

function chooseDiagnosticsStatus(
  healthStatus: RuntimeHealthSummary['status'],
  readinessStatus: RuntimeDiagnosticsReadinessStatus,
): RuntimeDiagnosticsSummary['status'] {
  if (healthStatus === 'blocked') return 'blocked';
  if (readinessStatus === RUNTIME_DIAGNOSTICS_READINESS_STATUS.invalid) return 'blocked';
  return readinessStatus === RUNTIME_DIAGNOSTICS_READINESS_STATUS.ready ? healthStatus : 'degraded';
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorCode(error: unknown): string | null {
  return error && typeof error === 'object' && 'code' in error
    ? `${(error as { code?: unknown }).code ?? ''}` || null
    : null;
}

function createRuntimeDiagnosticsReadinessProbe(args: {
  name: RuntimeDiagnosticsReadinessProbeName;
  status: RuntimeDiagnosticsReadinessProbeStatus;
  path?: string | null;
  value?: string | null;
  message?: string | null;
}): RuntimeDiagnosticsReadinessProbe {
  return Object.freeze({
    name: args.name,
    status: args.status,
    required: true,
    path: args.path ?? null,
    value: args.value ?? null,
    message: args.message ?? null,
  });
}

function probeRuntimeDiagnosticsDirectory(
  name: RuntimeDiagnosticsReadinessProbeName,
  directoryPath: string,
): RuntimeDiagnosticsReadinessProbe {
  try {
    const stat = fs.statSync(directoryPath);
    if (!stat.isDirectory()) {
      return createRuntimeDiagnosticsReadinessProbe({
        name,
        status: RUNTIME_DIAGNOSTICS_READINESS_STATUS.invalid,
        path: directoryPath,
        message: `runtime diagnostics path is not a directory: ${directoryPath}`,
      });
    }
    return createRuntimeDiagnosticsReadinessProbe({
      name,
      status: RUNTIME_DIAGNOSTICS_READINESS_STATUS.ready,
      path: directoryPath,
    });
  } catch (error) {
    const missing = errorCode(error) === 'ENOENT';
    return createRuntimeDiagnosticsReadinessProbe({
      name,
      status: missing
        ? RUNTIME_DIAGNOSTICS_READINESS_STATUS.missing
        : RUNTIME_DIAGNOSTICS_READINESS_STATUS.invalid,
      path: directoryPath,
      message: missing
        ? `runtime diagnostics directory is missing: ${directoryPath}`
        : describeError(error),
    });
  }
}

function probeRuntimeDiagnosticsManifestValue(
  name: RuntimeDiagnosticsReadinessProbeName,
  value: unknown,
): RuntimeDiagnosticsReadinessProbe {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) {
    return createRuntimeDiagnosticsReadinessProbe({
      name,
      status: RUNTIME_DIAGNOSTICS_READINESS_STATUS.missing,
      message: `runtime manifest value is missing: ${name}`,
    });
  }
  return createRuntimeDiagnosticsReadinessProbe({
    name,
    status: RUNTIME_DIAGNOSTICS_READINESS_STATUS.ready,
    value: normalized,
  });
}

function probeRuntimeDiagnosticsManifestObject(
  name: RuntimeDiagnosticsReadinessProbeName,
  value: unknown,
): RuntimeDiagnosticsReadinessProbe {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return createRuntimeDiagnosticsReadinessProbe({
      name,
      status: RUNTIME_DIAGNOSTICS_READINESS_STATUS.missing,
      message: `runtime manifest object is missing: ${name}`,
    });
  }
  return createRuntimeDiagnosticsReadinessProbe({
    name,
    status: RUNTIME_DIAGNOSTICS_READINESS_STATUS.ready,
  });
}

function summarizeRuntimeDiagnosticsReadiness(
  probes: Readonly<Record<RuntimeDiagnosticsReadinessProbeName, RuntimeDiagnosticsReadinessProbe>>,
): RuntimeDiagnosticsReadiness {
  const values = Object.values(probes);
  const invalid = values
    .filter((probe) => probe.status === RUNTIME_DIAGNOSTICS_READINESS_STATUS.invalid)
    .map((probe) => probe.name);
  const missing = values
    .filter((probe) => probe.status === RUNTIME_DIAGNOSTICS_READINESS_STATUS.missing)
    .map((probe) => probe.name);
  const status = invalid.length > 0
    ? RUNTIME_DIAGNOSTICS_READINESS_STATUS.invalid
    : missing.length > 0
      ? RUNTIME_DIAGNOSTICS_READINESS_STATUS.missing
      : RUNTIME_DIAGNOSTICS_READINESS_STATUS.ready;

  return Object.freeze({
    status,
    probes,
    missing: Object.freeze(missing),
    invalid: Object.freeze(invalid),
    errors: Object.freeze(values
      .filter((probe) => probe.message)
      .map((probe) => `${probe.name}: ${probe.message}`)),
  });
}

type RuntimeManifest = ReturnType<ReturnType<typeof getPublishManifestService>['getRuntimeManifest']>;

function buildRuntimeDiagnosticsReadiness(manifest: RuntimeManifest): RuntimeDiagnosticsReadiness {
  const publishRoot = manifest.sourceSignature
    ? path.join(PUBLISH_OUTPUT_DIR, manifest.sourceSignature)
    : null;
  const probes = {} as Record<RuntimeDiagnosticsReadinessProbeName, RuntimeDiagnosticsReadinessProbe>;

  for (const descriptor of RUNTIME_DIAGNOSTICS_READINESS_PROBE_DESCRIPTORS) {
    switch (descriptor.name) {
      case 'dataDir':
        probes[descriptor.name] = probeRuntimeDiagnosticsDirectory(descriptor.name, DATA_DIR);
        break;
      case 'publishDir':
        probes[descriptor.name] = probeRuntimeDiagnosticsDirectory(descriptor.name, PUBLISH_OUTPUT_DIR);
        break;
      case 'activePublishRoot':
        probes[descriptor.name] = publishRoot
          ? probeRuntimeDiagnosticsDirectory(descriptor.name, publishRoot)
          : createRuntimeDiagnosticsReadinessProbe({
            name: descriptor.name,
            status: RUNTIME_DIAGNOSTICS_READINESS_STATUS.missing,
            message: 'runtime manifest source signature is required before probing active publish root',
          });
        break;
      case 'publishBundle':
        probes[descriptor.name] = probeRuntimeDiagnosticsManifestObject(descriptor.name, manifest.publishBundle);
        break;
      case 'browserLayout':
        probes[descriptor.name] = probeRuntimeDiagnosticsManifestValue(descriptor.name, manifest.browserLayoutKey);
        break;
      case 'runtimeCacheKey':
        probes[descriptor.name] = probeRuntimeDiagnosticsManifestValue(descriptor.name, manifest.runtimeCacheKey);
        break;
      case 'sourceSignature':
        probes[descriptor.name] = probeRuntimeDiagnosticsManifestValue(descriptor.name, manifest.sourceSignature);
        break;
      default: {
        const exhaustive: never = descriptor.name;
        throw new Error(`Unhandled runtime diagnostics readiness probe: ${exhaustive}`);
      }
    }
  }

  return summarizeRuntimeDiagnosticsReadiness(Object.freeze(probes));
}

export function getRuntimeDiagnosticsSummary(): RuntimeDiagnosticsSummary {
  const manifest = getPublishManifestService().getRuntimeManifest();
  const health = getRuntimeHealthSummary();
  const publishBundle = manifest.publishBundle;
  const readiness = buildRuntimeDiagnosticsReadiness(manifest);

  return {
    schemaVersion: RUNTIME_DIAGNOSTICS_SCHEMA_VERSION,
    status: chooseDiagnosticsStatus(health.status, readiness.status),
    sourceSignature: manifest.sourceSignature,
    runtimeCacheKey: manifest.runtimeCacheKey,
    publishRevision: manifest.publishRevision,
    publishCompiledAt: manifest.publishCompiledAt,
    browserLayoutKey: manifest.browserLayoutKey,
    readiness,
    mode: {
      publicRuntimeOnly: publicRuntimeOnly(),
    },
    assets: {
      publishBundleFiles: publishBundle ? Object.keys(publishBundle.files ?? {}).length : 0,
      hasBrowserWindows: Boolean(publishBundle?.files?.browserPageWindows?.length),
      hasRecipeBootstrap: Boolean(publishBundle?.files?.recipeBootstrapBasePath),
      hasRecipeSearch: Boolean(publishBundle?.files?.recipeSearchBasePath),
    },
    nativeRender: health.nativeRender,
    nativeUi: health.nativeUi,
    health,
    compiler: health.compiler,
  };
}
