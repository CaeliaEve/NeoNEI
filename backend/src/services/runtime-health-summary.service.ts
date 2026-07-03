import fs from 'fs';
import path from 'path';
import { DIST_DATA_DIR } from '../config/runtime-paths';
import { resolveAccelerationCompilerAuthority } from './acceleration-runtime-compiler-authority.service';
import { acquireCurrentRuntimeSnapshot, type CurrentRuntimeSnapshot, type CurrentRuntimeSnapshotHandle } from './current-runtime-snapshot.service';
import { getNativeUiRuntimeProofSummary } from './native-ui-runtime-proof.service';
import { getNativeRenderRuntimeDiagnostics } from './native-render-runtime-diagnostics.service';

type JsonRecord = Record<string, unknown>;

export const RUNTIME_HEALTH_ARTIFACT_STATUS = Object.freeze({
  present: 'present',
  missing: 'missing',
  invalid: 'invalid',
} as const);

export type RuntimeHealthArtifactProbeStatus =
  typeof RUNTIME_HEALTH_ARTIFACT_STATUS[keyof typeof RUNTIME_HEALTH_ARTIFACT_STATUS];

export type RuntimeHealthArtifactProbeName =
  | 'manifest'
  | 'validationReport'
  | 'migrationReadiness'
  | 'neiBrowserContract'
  | 'recipeFragmentation'
  | 'exportPathHygiene'
  | 'externalRuntimePromotionReport';

export interface RuntimeHealthArtifactProbe {
  name: RuntimeHealthArtifactProbeName;
  key: string;
  status: RuntimeHealthArtifactProbeStatus;
  path: string | null;
  relativePath: string | null;
  bytes: number | null;
  mtimeMs: number | null;
  error: string | null;
}

type RuntimeHealthArtifactRead = Readonly<{
  probe: RuntimeHealthArtifactProbe;
  value: JsonRecord | null;
}>;

const RUNTIME_HEALTH_REQUIRED_ARTIFACTS = Object.freeze([
  'manifest',
  'validationReport',
  'migrationReadiness',
  'neiBrowserContract',
  'recipeFragmentation',
  'exportPathHygiene',
] as const satisfies readonly RuntimeHealthArtifactProbeName[]);

const RUNTIME_HEALTH_MANIFEST_FILE_ARTIFACTS = Object.freeze([
  'validationReport',
  'migrationReadiness',
  'neiBrowserContract',
  'recipeFragmentation',
  'exportPathHygiene',
  'externalRuntimePromotionReport',
] as const satisfies readonly RuntimeHealthArtifactProbeName[]);


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
  artifacts: {
    status: 'ok' | 'missing' | 'invalid';
    probes: Record<RuntimeHealthArtifactProbeName, RuntimeHealthArtifactProbe>;
    errors: string[];
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
    nativeUiProofStatus: ReturnType<typeof getNativeUiRuntimeProofSummary>['status'];
    nativeUiProofBlocked: boolean;
  };
  files: {
    declared: number;
    present: number;
    missing: Array<{ key: string; path: string }>;
    totalBytes: number;
  };
  runtimeSnapshot: {
    available: boolean;
    revision: number | null;
    runtimeId: string | null;
    runtimeSchemaRevision: string | null;
    manifestPath: string | null;
    fingerprint: string | null;
    declaredFiles: number;
    presentArtifacts: number;
    missingArtifacts: string[];
    totalBytes: number;
  };
  compiler: {
    authority: ReturnType<typeof resolveAccelerationCompilerAuthority>;
    externalRuntimePromotion: {
      reportPath: string | null;
      promotedAt: string | null;
      runtimeId: string | null;
      runtimeManifestSchema: string | null;
      sourceIdentity: string | null;
      copiedFiles: number | null;
    };
  };
  nativeUi: ReturnType<typeof getNativeUiRuntimeProofSummary>;
  nativeRender: ReturnType<typeof getNativeRenderRuntimeDiagnostics>;
}

export type RuntimeHealthSummaryOptions = Readonly<{
  snapshot?: CurrentRuntimeSnapshot | null;
}>;

const CACHE_TTL_MS = Math.max(1_000, Number(process.env.RUNTIME_HEALTH_SUMMARY_TTL_MS || 10_000));

let cache: { expiresAt: number; summary: RuntimeHealthSummary } | null = null;

function createRuntimeHealthArtifactProbe(args: {
  name: RuntimeHealthArtifactProbeName;
  key: string;
  status: RuntimeHealthArtifactProbeStatus;
  path: string | null;
  relativePath: string | null;
  bytes?: number | null;
  mtimeMs?: number | null;
  error?: string | null;
}): RuntimeHealthArtifactProbe {
  return Object.freeze({
    name: args.name,
    key: args.key,
    status: args.status,
    path: args.path,
    relativePath: args.relativePath,
    bytes: args.bytes ?? null,
    mtimeMs: args.mtimeMs ?? null,
    error: args.error ?? null,
  });
}

function missingRuntimeHealthArtifact(
  name: RuntimeHealthArtifactProbeName,
  key: string = name,
  relativePath: string | null = null,
): RuntimeHealthArtifactRead {
  return Object.freeze({
    probe: createRuntimeHealthArtifactProbe({
      name,
      key,
      status: RUNTIME_HEALTH_ARTIFACT_STATUS.missing,
      path: relativePath ? path.join(DIST_DATA_DIR, relativePath) : null,
      relativePath,
      error: relativePath
        ? `runtime health artifact is missing: ${relativePath}`
        : `runtime health artifact is not declared: ${key}`,
    }),
    value: null,
  });
}

function readRuntimeHealthJsonArtifact(args: {
  name: RuntimeHealthArtifactProbeName;
  key?: string;
  filePath: string;
  relativePath: string | null;
}): RuntimeHealthArtifactRead {
  const key = args.key ?? args.name;
  if (!fs.existsSync(args.filePath)) {
    return missingRuntimeHealthArtifact(args.name, key, args.relativePath);
  }
  let stats: fs.Stats;
  try {
    stats = fs.statSync(args.filePath);
  } catch (error) {
    return Object.freeze({
      probe: createRuntimeHealthArtifactProbe({
        name: args.name,
        key,
        status: RUNTIME_HEALTH_ARTIFACT_STATUS.invalid,
        path: args.filePath,
        relativePath: args.relativePath,
        error: error instanceof Error ? error.message : String(error),
      }),
      value: null,
    });
  }
  try {
    const payload = JSON.parse(fs.readFileSync(args.filePath, 'utf8')) as unknown;
    const record = asRecord(payload);
    if (!record) {
      return Object.freeze({
        probe: createRuntimeHealthArtifactProbe({
          name: args.name,
          key,
          status: RUNTIME_HEALTH_ARTIFACT_STATUS.invalid,
          path: args.filePath,
          relativePath: args.relativePath,
          bytes: stats.size,
          mtimeMs: stats.mtimeMs,
          error: 'runtime health artifact JSON payload must be an object',
        }),
        value: null,
      });
    }
    return Object.freeze({
      probe: createRuntimeHealthArtifactProbe({
        name: args.name,
        key,
        status: RUNTIME_HEALTH_ARTIFACT_STATUS.present,
        path: args.filePath,
        relativePath: args.relativePath,
        bytes: stats.size,
        mtimeMs: stats.mtimeMs,
      }),
      value: record,
    });
  } catch (error) {
    return Object.freeze({
      probe: createRuntimeHealthArtifactProbe({
        name: args.name,
        key,
        status: RUNTIME_HEALTH_ARTIFACT_STATUS.invalid,
        path: args.filePath,
        relativePath: args.relativePath,
        bytes: stats.size,
        mtimeMs: stats.mtimeMs,
        error: error instanceof Error ? error.message : String(error),
      }),
      value: null,
    });
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

function buildRuntimeSnapshotHealth(snapshot: CurrentRuntimeSnapshot | null): Pick<RuntimeHealthSummary, 'files' | 'runtimeSnapshot'> {
  if (!snapshot) {
    return {
      files: {
        declared: 0,
        present: 0,
        missing: [],
        totalBytes: 0,
      },
      runtimeSnapshot: {
        available: false,
        revision: null,
        runtimeId: null,
        runtimeSchemaRevision: null,
        manifestPath: null,
        fingerprint: null,
        declaredFiles: 0,
        presentArtifacts: 0,
        missingArtifacts: [],
        totalBytes: 0,
      },
    };
  }

  const artifactPaths = new Set(Object.keys(snapshot.artifactsByPath));
  const missingArtifacts = snapshot.declaredFiles.filter((relativePath) => !artifactPaths.has(relativePath));
  const totalBytes = Object.values(snapshot.artifactsByPath)
    .reduce((total, artifact) => total + artifact.bytes, 0);

  return {
    files: {
      declared: snapshot.declaredFiles.length,
      present: artifactPaths.size,
      missing: missingArtifacts.map((relativePath) => ({ key: relativePath, path: relativePath })),
      totalBytes,
    },
    runtimeSnapshot: {
      available: true,
      revision: snapshot.revision,
      runtimeId: snapshot.runtimeId,
      runtimeSchemaRevision: snapshot.runtimeSchemaRevision,
      manifestPath: snapshot.manifestPath,
      fingerprint: snapshot.fingerprint,
      declaredFiles: snapshot.declaredFiles.length,
      presentArtifacts: artifactPaths.size,
      missingArtifacts,
      totalBytes,
    },
  };
}

function readDistJsonByManifestKey(
  manifest: JsonRecord | null,
  key: RuntimeHealthArtifactProbeName,
  artifactReads: Map<RuntimeHealthArtifactProbeName, RuntimeHealthArtifactRead>,
): JsonRecord | null {
  const files = asRecord(manifest?.files);
  const relativePath = asString(files?.[key]);
  const read = relativePath
    ? readRuntimeHealthJsonArtifact({
      name: key,
      key,
      filePath: path.join(DIST_DATA_DIR, relativePath),
      relativePath,
    })
    : missingRuntimeHealthArtifact(key, key);
  artifactReads.set(key, read);
  return read.value;
}

function summarizeRuntimeHealthArtifacts(
  artifactReads: Map<RuntimeHealthArtifactProbeName, RuntimeHealthArtifactRead>,
): RuntimeHealthSummary['artifacts'] {
  const probes = Object.fromEntries(
    (['manifest', ...RUNTIME_HEALTH_MANIFEST_FILE_ARTIFACTS] as RuntimeHealthArtifactProbeName[])
      .map((name) => [name, artifactReads.get(name)?.probe ?? missingRuntimeHealthArtifact(name).probe]),
  ) as Record<RuntimeHealthArtifactProbeName, RuntimeHealthArtifactProbe>;
  const required = new Set<RuntimeHealthArtifactProbeName>(RUNTIME_HEALTH_REQUIRED_ARTIFACTS);
  const requiredProbes = Object.values(probes).filter((probe) => required.has(probe.name));
  const status = requiredProbes.some((probe) => probe.status === RUNTIME_HEALTH_ARTIFACT_STATUS.invalid)
    ? 'invalid'
    : requiredProbes.some((probe) => probe.status === RUNTIME_HEALTH_ARTIFACT_STATUS.missing)
      ? 'missing'
      : 'ok';
  return Object.freeze({
    status,
    probes,
    errors: Object.values(probes)
      .filter((probe) => probe.error)
      .map((probe) => `${probe.name}: ${probe.error}`),
  });
}

function readExternalRuntimePromotionSummary(
  manifest: JsonRecord | null,
  report: JsonRecord | null,
): RuntimeHealthSummary['compiler']['externalRuntimePromotion'] {
  const files = asRecord(manifest?.files);
  const reportRelativePath = asString(files?.externalRuntimePromotionReport);
  const copiedFiles = Array.isArray(report?.copiedFiles) ? report.copiedFiles.length : null;
  const sourceIdentity = asRecord(report?.sourceIdentity);
  return {
    reportPath: reportRelativePath,
    promotedAt: asString(report?.promotedAt),
    runtimeId: asString(report?.runtimeId),
    runtimeManifestSchema: asString(report?.runtimeManifestSchema),
    sourceIdentity: asString(sourceIdentity?.identity),
    copiedFiles,
  };
}

function chooseStatus(args: {
  manifestExists: boolean;
  runtimeSnapshotAvailable: boolean;
  missingFileCount: number;
  migrationReadinessStatus: string | null;
  browserContractStatus: string | null;
  recipeFragmentationStatus: string | null;
  compilerValidationBlocked: boolean;
  nativeUiProofBlocked: boolean;
  artifactStatus: RuntimeHealthSummary['artifacts']['status'];
}): RuntimeHealthSummary['status'] {
  if (
    args.artifactStatus !== 'ok'
    || !args.manifestExists
    || !args.runtimeSnapshotAvailable
    || args.missingFileCount > 0
    || args.compilerValidationBlocked
    || args.nativeUiProofBlocked
  ) {
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

function hasPinnedSnapshotOption(options: RuntimeHealthSummaryOptions): boolean {
  return Object.prototype.hasOwnProperty.call(options, 'snapshot');
}

function cacheMatchesSnapshot(summary: RuntimeHealthSummary, snapshot: CurrentRuntimeSnapshot | null): boolean {
  const runtimeSnapshot = summary.runtimeSnapshot;
  return runtimeSnapshot.revision === (snapshot?.revision ?? null)
    && runtimeSnapshot.fingerprint === (snapshot?.fingerprint ?? null);
}

export function getRuntimeHealthSummary(options: RuntimeHealthSummaryOptions = {}): RuntimeHealthSummary {
  const now = Date.now();
  const pinnedSnapshot = hasPinnedSnapshotOption(options);
  const optionSnapshot = options.snapshot ?? null;
  if (cache && cache.expiresAt > now && (!pinnedSnapshot || cacheMatchesSnapshot(cache.summary, optionSnapshot))) {
    return cache.summary;
  }

  const manifestPath = path.join(DIST_DATA_DIR, 'manifest.json');
  const artifactReads = new Map<RuntimeHealthArtifactProbeName, RuntimeHealthArtifactRead>();
  const manifestRead = readRuntimeHealthJsonArtifact({
    name: 'manifest',
    key: 'manifest',
    filePath: manifestPath,
    relativePath: 'manifest.json',
  });
  artifactReads.set('manifest', manifestRead);
  const manifest = manifestRead.value;
  const validationReport = readDistJsonByManifestKey(manifest, 'validationReport', artifactReads);
  const validationCounts = asRecord(validationReport?.counts);
  const validationMissing = asRecord(validationReport?.missing);
  const migrationReadiness = readDistJsonByManifestKey(manifest, 'migrationReadiness', artifactReads);
  const browserContract = readDistJsonByManifestKey(manifest, 'neiBrowserContract', artifactReads);
  const recipeFragmentation = readDistJsonByManifestKey(manifest, 'recipeFragmentation', artifactReads);
  const exportPathHygiene = readDistJsonByManifestKey(manifest, 'exportPathHygiene', artifactReads);
  const externalRuntimePromotionReport = readDistJsonByManifestKey(manifest, 'externalRuntimePromotionReport', artifactReads);
  const artifacts = summarizeRuntimeHealthArtifacts(artifactReads);
  const snapshotHandle: CurrentRuntimeSnapshotHandle | null = pinnedSnapshot ? null : acquireCurrentRuntimeSnapshot();
  try {
    const snapshot = pinnedSnapshot ? optionSnapshot : snapshotHandle?.snapshot ?? null;
    const runtimeSnapshotHealth = buildRuntimeSnapshotHealth(snapshot);
    const files = runtimeSnapshotHealth.files;
    const compilerAuthority = resolveAccelerationCompilerAuthority();
    const externalRuntimePromotion = readExternalRuntimePromotionSummary(manifest, externalRuntimePromotionReport);
    const nativeUi = getNativeUiRuntimeProofSummary(manifest, snapshot);

    const rawCompilerValidationBlocked = (asNumber(validationCounts?.manifestBlocked) ?? 0) > 0
      || (asNumber(validationCounts?.nativeRenderCaptureGateBlocked) ?? 0) > 0;
    const nativeUiProofBlocked = nativeUi.status !== 'ok';
    const migrationReadinessStatus = asString(migrationReadiness?.status);
    const neiBrowserContractStatus = asString(browserContract?.status);
    const recipeFragmentationStatus = asString(recipeFragmentation?.status ?? recipeFragmentation?.reportStatus);
    const exportPathHygieneStatus = asString(exportPathHygiene?.status);

    const summary: RuntimeHealthSummary = {
      schemaVersion: 'neonei/runtime-health-summary/current',
      status: chooseStatus({
        manifestExists: Boolean(manifest),
        runtimeSnapshotAvailable: runtimeSnapshotHealth.runtimeSnapshot.available,
        missingFileCount: files.missing.length,
        migrationReadinessStatus,
        browserContractStatus: neiBrowserContractStatus,
        recipeFragmentationStatus,
        compilerValidationBlocked: rawCompilerValidationBlocked,
        nativeUiProofBlocked,
        artifactStatus: artifacts.status,
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
      artifacts,
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
        compilerValidationBlocked: rawCompilerValidationBlocked || nativeUiProofBlocked,
        blockedGates: asStringArray(migrationReadiness?.blockedGates),
        warnings: [
          ...asStringArray(validationReport?.warnings),
          ...asStringArray(browserContract?.warnings),
        ],
        nativeUiProofStatus: nativeUi.status,
        nativeUiProofBlocked,
      },
      files,
      runtimeSnapshot: runtimeSnapshotHealth.runtimeSnapshot,
      compiler: {
        authority: compilerAuthority,
        externalRuntimePromotion,
      },
      nativeUi,
      nativeRender: getNativeRenderRuntimeDiagnostics(),
    };

    cache = {
      expiresAt: now + CACHE_TTL_MS,
      summary,
    };
    return summary;
  } finally {
    snapshotHandle?.release();
  }
}
