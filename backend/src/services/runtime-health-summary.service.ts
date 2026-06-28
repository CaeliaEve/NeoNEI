import fs from 'fs';
import path from 'path';
import { PUBLIC_DIR } from '../config/runtime-paths';
import { resolveAccelerationCompilerAuthority } from './acceleration-runtime-compiler-authority.service';
import { getNativeRenderRuntimeDiagnostics } from './native-render-runtime-diagnostics.service';

type JsonRecord = Record<string, unknown>;

export interface RuntimeHealthSummary {
  schemaVersion: 'neonei/runtime-health-summary/current';
  status: 'ok' | 'warning' | 'blocked' | 'degraded';
  generatedAt: string;
  distData: {
    exists: boolean;
    manifestExists: boolean;
    source: string | null;
    sourceRepository: string | null;
    generatedAt: string | null;
    runtime: JsonRecord | null;
  };
  counts: {
    items: number | null;
    recipes: number | null;
    browserItems: number | null;
    browserGroups: number | null;
    searchItems: number | null;
    textures: number | null;
    browserAtlasItems: number | null;
    animatedBrowserAtlasItems: number | null;
    animationTableItems: number | null;
    recipeHandlers: number | null;
    specialDomains: number | null;
  };
  coverage: {
    atlasCoverageRatio: number | null;
    semanticAtlasMissing: number | null;
    expectedAnimatedItems: number | null;
    staticWhenExpectedAnimated: number | null;
    recipeFragmentationDisplaySplits: number | null;
    recipeFragmentationHandlerSplits: number | null;
  };
  validation: {
    migrationReadinessStatus: string | null;
    neiBrowserContractStatus: string | null;
    recipeFragmentationStatus: string | null;
    exportPathHygieneStatus: string | null;
    compilerValidationBlocked: boolean;
    blockedGates: string[];
    warnings: string[];
  };
  files: {
    declared: number;
    present: number;
    missing: Array<{ key: string; path: string }>;
    totalBytes: number;
  };
  compiler: {
    authority: ReturnType<typeof resolveAccelerationCompilerAuthority>;
    externalRuntimePromotion: {
      reportPath: string | null;
      promotedAt: string | null;
      runtimeId: string | null;
      runtimeManifestSchema: string | null;
      copiedFiles: number | null;
    };
  };
  nativeRender: ReturnType<typeof getNativeRenderRuntimeDiagnostics>;
}

const DIST_DATA_DIR = path.join(PUBLIC_DIR, 'dist-data');
const CACHE_TTL_MS = Math.max(1_000, Number(process.env.RUNTIME_HEALTH_SUMMARY_TTL_MS || 10_000));

let cache: { expiresAt: number; summary: RuntimeHealthSummary } | null = null;

function readJson(filePath: string): JsonRecord | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as JsonRecord;
  } catch {
    return null;
  }
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
}

function asString(value: unknown): string | null {
  const text = `${value ?? ''}`.trim();
  return text || null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((entry) => `${entry ?? ''}`.trim()).filter(Boolean) : [];
}

function readDeclaredFileStats(files: JsonRecord | null): RuntimeHealthSummary['files'] {
  const entries = Object.entries(files ?? {})
    .filter(([, value]) => typeof value === 'string' && value.trim().length > 0)
    .map(([key, value]) => ({ key, relativePath: value as string }));

  let present = 0;
  let totalBytes = 0;
  const missing: Array<{ key: string; path: string }> = [];

  for (const entry of entries) {
    const filePath = path.join(DIST_DATA_DIR, entry.relativePath);
    if (!fs.existsSync(filePath)) {
      missing.push({ key: entry.key, path: entry.relativePath });
      continue;
    }
    present += 1;
    try {
      totalBytes += fs.statSync(filePath).size;
    } catch {
      missing.push({ key: entry.key, path: entry.relativePath });
    }
  }

  return {
    declared: entries.length,
    present,
    missing,
    totalBytes,
  };
}

function readDistJsonByManifestKey(manifest: JsonRecord | null, key: string): JsonRecord | null {
  const files = asRecord(manifest?.files);
  const relativePath = asString(files?.[key]);
  if (!relativePath) return null;
  return readJson(path.join(DIST_DATA_DIR, relativePath));
}

function readExternalRuntimePromotionSummary(manifest: JsonRecord | null): RuntimeHealthSummary['compiler']['externalRuntimePromotion'] {
  const files = asRecord(manifest?.files);
  const reportRelativePath = asString(files?.externalRuntimePromotionReport);
  const report = reportRelativePath ? readJson(path.join(DIST_DATA_DIR, reportRelativePath)) : null;
  const copiedFiles = Array.isArray(report?.copiedFiles) ? report.copiedFiles.length : null;
  return {
    reportPath: reportRelativePath,
    promotedAt: asString(report?.promotedAt),
    runtimeId: asString(report?.runtimeId),
    runtimeManifestSchema: asString(report?.runtimeManifestSchema),
    copiedFiles,
  };
}

function chooseStatus(args: {
  manifestExists: boolean;
  missingFileCount: number;
  migrationReadinessStatus: string | null;
  browserContractStatus: string | null;
  recipeFragmentationStatus: string | null;
  compilerValidationBlocked: boolean;
}): RuntimeHealthSummary['status'] {
  if (!args.manifestExists || args.missingFileCount > 0 || args.compilerValidationBlocked) {
    return 'blocked';
  }
  if (args.migrationReadinessStatus === 'blocked') {
    return 'blocked';
  }
  if (
    args.browserContractStatus === 'warning'
    || args.recipeFragmentationStatus === 'warning'
    || args.migrationReadinessStatus === 'warning'
  ) {
    return 'warning';
  }
  if (!fs.existsSync(DIST_DATA_DIR)) {
    return 'degraded';
  }
  return 'ok';
}

export function getRuntimeHealthSummary(): RuntimeHealthSummary {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return cache.summary;
  }

  const manifestPath = path.join(DIST_DATA_DIR, 'manifest.json');
  const manifest = readJson(manifestPath);
  const validationReport = readDistJsonByManifestKey(manifest, 'validationReport');
  const validationCounts = asRecord(validationReport?.counts);
  const validationMissing = asRecord(validationReport?.missing);
  const migrationReadiness = readDistJsonByManifestKey(manifest, 'migrationReadiness');
  const browserContract = readDistJsonByManifestKey(manifest, 'neiBrowserContract');
  const recipeFragmentation = readDistJsonByManifestKey(manifest, 'recipeFragmentation');
  const exportPathHygiene = readDistJsonByManifestKey(manifest, 'exportPathHygiene');
  const files = readDeclaredFileStats(asRecord(manifest?.files));
  const compilerAuthority = resolveAccelerationCompilerAuthority();
  const externalRuntimePromotion = readExternalRuntimePromotionSummary(manifest);

  const compilerValidationBlocked = (asNumber(validationCounts?.manifestBlocked) ?? 0) > 0
    || (asNumber(validationCounts?.nativeRenderCaptureGateBlocked) ?? 0) > 0;
  const migrationReadinessStatus = asString(migrationReadiness?.status);
  const neiBrowserContractStatus = asString(browserContract?.status);
  const recipeFragmentationStatus = asString(recipeFragmentation?.status ?? recipeFragmentation?.reportStatus);
  const exportPathHygieneStatus = asString(exportPathHygiene?.status);

  const summary: RuntimeHealthSummary = {
    schemaVersion: 'neonei/runtime-health-summary/current',
    status: chooseStatus({
      manifestExists: Boolean(manifest),
      missingFileCount: files.missing.length,
      migrationReadinessStatus,
      browserContractStatus: neiBrowserContractStatus,
      recipeFragmentationStatus,
      compilerValidationBlocked,
    }),
    generatedAt: new Date().toISOString(),
    distData: {
      exists: fs.existsSync(DIST_DATA_DIR),
      manifestExists: Boolean(manifest),
      source: asString(manifest?.source),
      sourceRepository: asString(manifest?.sourceRepository),
      generatedAt: asString(manifest?.generatedAt),
      runtime: asRecord(manifest?.runtime),
    },
    counts: {
      items: asNumber(validationCounts?.items),
      recipes: asNumber(validationCounts?.recipes),
      browserItems: asNumber(validationCounts?.browserAtlasItems) ?? asNumber(validationCounts?.browserItems),
      browserGroups: asNumber(validationCounts?.groups),
      searchItems: asNumber(validationCounts?.items),
      textures: asNumber(validationCounts?.textures),
      browserAtlasItems: asNumber(validationCounts?.browserAtlasItems),
      animatedBrowserAtlasItems: asNumber(validationCounts?.animatedBrowserAtlasItems),
      animationTableItems: asNumber(validationCounts?.animationTableItems),
      recipeHandlers: asNumber(validationCounts?.neiHandlers),
      specialDomains: asNumber(validationCounts?.specialDomains),
    },
    coverage: {
      atlasCoverageRatio: (() => {
        const atlasItems = asNumber(validationCounts?.browserAtlasItems);
        const items = asNumber(validationCounts?.items);
        return atlasItems && items ? Number((atlasItems / items).toFixed(6)) : null;
      })(),
      semanticAtlasMissing: asNumber(validationCounts?.semanticMemberMissingAtlas) ?? asNumber(validationMissing?.browserAtlasItems),
      expectedAnimatedItems: asNumber(validationCounts?.expectedAnimatedItems),
      staticWhenExpectedAnimated: asNumber(validationCounts?.staticWhenExpectedAnimated),
      recipeFragmentationDisplaySplits: asNumber(validationCounts?.recipeFragmentationDisplaySplits),
      recipeFragmentationHandlerSplits: asNumber(validationCounts?.recipeFragmentationHandlerSplits),
    },
    validation: {
      migrationReadinessStatus,
      neiBrowserContractStatus,
      recipeFragmentationStatus,
      exportPathHygieneStatus,
      compilerValidationBlocked,
      blockedGates: asStringArray(migrationReadiness?.blockedGates),
      warnings: [
        ...asStringArray(validationReport?.warnings),
        ...asStringArray(browserContract?.warnings),
      ],
    },
    files,
    compiler: {
      authority: compilerAuthority,
      externalRuntimePromotion,
    },
    nativeRender: getNativeRenderRuntimeDiagnostics(),
  };

  cache = {
    expiresAt: now + CACHE_TTL_MS,
    summary,
  };
  return summary;
}
