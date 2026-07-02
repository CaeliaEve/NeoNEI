import fs from 'fs';
import path from 'path';
import { DATA_DIR, PUBLISH_OUTPUT_DIR } from '../config/runtime-paths';
import { getPublishManifestService } from './publish-manifest.service';
import { getRuntimeHealthSummary, type RuntimeHealthSummary } from './runtime-health-summary.service';

export interface RuntimeDiagnosticsSummary {
  schemaVersion: 'neonei/runtime-diagnostics/current';
  status: RuntimeHealthSummary['status'];
  sourceSignature: string;
  runtimeCacheKey: string;
  publishRevision: string | null;
  publishCompiledAt: string | null;
  browserLayoutKey: string | null;
  readiness: {
    dataDir: boolean;
    publishDir: boolean;
    activePublishRoot: boolean;
    publishBundle: boolean;
    browserLayout: boolean;
    runtimeCacheKey: boolean;
    sourceSignature: boolean;
  };
  mode: {
    publicRuntimeOnly: boolean;
  };
  missing: string[];
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
  missing: readonly string[],
): RuntimeDiagnosticsSummary['status'] {
  if (healthStatus === 'blocked') return 'blocked';
  return missing.length === 0 ? healthStatus : 'degraded';
}

export function getRuntimeDiagnosticsSummary(): RuntimeDiagnosticsSummary {
  const manifest = getPublishManifestService().getRuntimeManifest();
  const health = getRuntimeHealthSummary();
  const publishBundle = manifest.publishBundle;
  const publishRoot = manifest.sourceSignature
    ? path.join(PUBLISH_OUTPUT_DIR, manifest.sourceSignature)
    : null;

  const readiness: RuntimeDiagnosticsSummary['readiness'] = {
    dataDir: fs.existsSync(DATA_DIR),
    publishDir: fs.existsSync(PUBLISH_OUTPUT_DIR),
    activePublishRoot: publishRoot ? fs.existsSync(publishRoot) : false,
    publishBundle: Boolean(publishBundle),
    browserLayout: Boolean(manifest.browserLayoutKey),
    runtimeCacheKey: Boolean(manifest.runtimeCacheKey),
    sourceSignature: Boolean(manifest.sourceSignature),
  };
  const missing = Object.entries(readiness)
    .filter(([, ok]) => !ok)
    .map(([key]) => key);

  return {
    schemaVersion: 'neonei/runtime-diagnostics/current',
    status: chooseDiagnosticsStatus(health.status, missing),
    sourceSignature: manifest.sourceSignature,
    runtimeCacheKey: manifest.runtimeCacheKey,
    publishRevision: manifest.publishRevision,
    publishCompiledAt: manifest.publishCompiledAt,
    browserLayoutKey: manifest.browserLayoutKey,
    readiness,
    mode: {
      publicRuntimeOnly: publicRuntimeOnly(),
    },
    missing,
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
