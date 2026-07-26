import fs from 'fs';
import path from 'path';
import { DIST_DATA_DIR } from '../config/runtime-paths';
import { resolveAccelerationCompilerAuthority } from './acceleration-runtime-compiler-authority.service';
import { resolveCurrentRuntimeDistDataDir } from './current-runtime-artifact-index.service';
import {
  acquireCurrentRuntimeSnapshot,
  type CurrentRuntimeSnapshot,
  type CurrentRuntimeSnapshotDiagnostics,
  type CurrentRuntimeSnapshotHandle,
} from './current-runtime-snapshot.service';
import { CURRENT_RUNTIME_SNAPSHOT_STATUS } from './current-runtime-snapshot-abi';
import { getNativeUiRuntimeProofSummary } from './native-ui-runtime-proof.service';
import { getNativeRenderRuntimeDiagnostics } from './native-render-runtime-diagnostics.service';
import {
  RUNTIME_HEALTH_ARTIFACT_ERRORS,
  RUNTIME_HEALTH_ARTIFACT_STATUS,
  RUNTIME_HEALTH_DIST_MANIFEST_RELATIVE_PATH,
  RUNTIME_HEALTH_SCHEMA_VERSION,
  chooseRuntimeHealthSummaryStatus,
  createMissingRuntimeHealthArtifactProbe,
  createRuntimeHealthArtifactProbe,
  resolveRuntimeHealthCacheTtlMs,
  summarizeRuntimeHealthArtifacts,
  type RuntimeHealthArtifactProbe,
  type RuntimeHealthArtifactProbeName,
  type RuntimeHealthArtifactRead,
  type RuntimeHealthArtifactSummaryStatus,
  type RuntimeHealthSummaryStatus,
} from './runtime-health-summary-abi';

type JsonRecord = Record<string, unknown>;

export interface RuntimeHealthSummary {
  schemaVersion: typeof RUNTIME_HEALTH_SCHEMA_VERSION;
  status: RuntimeHealthSummaryStatus;
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
    status: RuntimeHealthArtifactSummaryStatus;
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
    status: CurrentRuntimeSnapshotDiagnostics['status'];
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
    errors: readonly string[];
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

const CACHE_TTL_MS = resolveRuntimeHealthCacheTtlMs();

let cache: { expiresAt: number; summary: RuntimeHealthSummary } | null = null;

function missingRuntimeHealthArtifact(
  name: RuntimeHealthArtifactProbeName,
  key: string = name,
  relativePath: string | null = null,
): RuntimeHealthArtifactRead {
  return Object.freeze({
    probe: createMissingRuntimeHealthArtifactProbe({
      name,
      key,
      path: relativePath ? path.join(DIST_DATA_DIR, relativePath) : null,
      relativePath,
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
          error: RUNTIME_HEALTH_ARTIFACT_ERRORS.jsonObjectRequired,
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

function buildRuntimeSnapshotHealth(
  snapshot: CurrentRuntimeSnapshot | null,
  diagnostics: CurrentRuntimeSnapshotDiagnostics | null = null,
): Pick<RuntimeHealthSummary, 'files' | 'runtimeSnapshot'> {
  if (!snapshot) {
    return {
      files: {
        declared: 0,
        present: 0,
        missing: [],
        totalBytes: 0,
      },
      runtimeSnapshot: {
        status: diagnostics?.status ?? CURRENT_RUNTIME_SNAPSHOT_STATUS.missing,
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
        errors: diagnostics?.errors ?? [],
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
      status: diagnostics?.status ?? CURRENT_RUNTIME_SNAPSHOT_STATUS.ready,
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
      errors: diagnostics?.errors ?? [],
    },
  };
}

function readDistJsonByManifestKey(
  manifest: JsonRecord | null,
  key: RuntimeHealthArtifactProbeName,
  artifactReads: Map<RuntimeHealthArtifactProbeName, RuntimeHealthArtifactRead>,
  generationRoot: string | null,
): JsonRecord | null {
  const files = asRecord(manifest?.files);
  const relativePath = asString(files?.[key]);
  const read = relativePath && generationRoot
    ? readRuntimeHealthJsonArtifact({
      name: key,
      key,
      filePath: path.join(generationRoot, relativePath),
      relativePath,
    })
    : missingRuntimeHealthArtifact(key, key);
  artifactReads.set(key, read);
  return read.value;
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

  let generationRoot: string | null = null;
  try {
    generationRoot = resolveCurrentRuntimeDistDataDir();
  } catch {
    generationRoot = null;
  }
  const manifestPath = generationRoot
    ? path.join(generationRoot, RUNTIME_HEALTH_DIST_MANIFEST_RELATIVE_PATH)
    : path.join(DIST_DATA_DIR, 'current.json');
  const artifactReads = new Map<RuntimeHealthArtifactProbeName, RuntimeHealthArtifactRead>();
  const manifestRead = readRuntimeHealthJsonArtifact({
    name: 'manifest',
    key: 'manifest',
    filePath: manifestPath,
    relativePath: RUNTIME_HEALTH_DIST_MANIFEST_RELATIVE_PATH,
  });
  artifactReads.set('manifest', manifestRead);
  const manifest = manifestRead.value;
  const validationReport = readDistJsonByManifestKey(manifest, 'validationReport', artifactReads, generationRoot);
  const validationCounts = asRecord(validationReport?.counts);
  const validationMissing = asRecord(validationReport?.missing);
  const migrationReadiness = readDistJsonByManifestKey(manifest, 'migrationReadiness', artifactReads, generationRoot);
  const browserContract = readDistJsonByManifestKey(manifest, 'neiBrowserContract', artifactReads, generationRoot);
  const recipeFragmentation = readDistJsonByManifestKey(manifest, 'recipeFragmentation', artifactReads, generationRoot);
  const exportPathHygiene = readDistJsonByManifestKey(manifest, 'exportPathHygiene', artifactReads, generationRoot);
  const externalRuntimePromotionReport = readDistJsonByManifestKey(manifest, 'externalRuntimePromotionReport', artifactReads, generationRoot);
  const artifacts = summarizeRuntimeHealthArtifacts(artifactReads);
  const snapshotHandle: CurrentRuntimeSnapshotHandle | null = pinnedSnapshot ? null : acquireCurrentRuntimeSnapshot();
  try {
    const snapshot = pinnedSnapshot ? optionSnapshot : snapshotHandle?.snapshot ?? null;
    const runtimeSnapshotHealth = buildRuntimeSnapshotHealth(
      snapshot,
      pinnedSnapshot ? null : snapshotHandle?.diagnostics ?? null,
    );
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
      schemaVersion: RUNTIME_HEALTH_SCHEMA_VERSION,
      status: chooseRuntimeHealthSummaryStatus({
        distDataExists: Boolean(generationRoot),
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
        exists: Boolean(generationRoot),
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
