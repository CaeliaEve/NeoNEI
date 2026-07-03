import fs from 'fs';
import {
  CURRENT_RUNTIME_DIST_DATA_DIR,
  CURRENT_RUNTIME_DIST_MANIFEST_FILE,
  isPortableRuntimePath,
  normalizeRuntimePath,
  resolveDistDataRuntimeFile,
} from './current-runtime-artifact-index.service';
import {
  NATIVE_RENDER_RUNTIME_ARTIFACT_PROBE_STATUS,
  NATIVE_RENDER_RUNTIME_ARTIFACTS,
  NATIVE_RENDER_RUNTIME_BLOCKED_STATUS,
  NATIVE_RENDER_RUNTIME_CHECKS,
  NATIVE_RENDER_RUNTIME_CHECK_DESCRIPTORS,
  NATIVE_RENDER_RUNTIME_COUNT_FIELD_DESCRIPTORS,
  NATIVE_RENDER_RUNTIME_DIAGNOSTIC_STATUS,
  NATIVE_RENDER_RUNTIME_DIAGNOSTICS_SCHEMA,
  NATIVE_RENDER_RUNTIME_MANIFEST_KEYS,
  NATIVE_RENDER_RUNTIME_VALIDATION_FIELDS,
  NATIVE_RENDER_RUNTIME_VALIDATION_FIELD_DESCRIPTORS,
  type NativeRenderRuntimeArtifactName,
  type NativeRenderRuntimeArtifactProbeStatus,
  type NativeRenderRuntimeChecks,
  type NativeRenderRuntimeCountField,
  type NativeRenderRuntimeCounts,
  type NativeRenderRuntimeDiagnosticStatus,
  type NativeRenderRuntimeManifestKey,
  type NativeRenderRuntimeValidation,
  type NativeRenderRuntimeValidationField,
  type NativeRenderRuntimeValidationFieldDescriptor,
} from './native-render-runtime-diagnostics-abi';

type JsonRecord = Record<string, unknown>;

export type NativeRenderRuntimeArtifactProbe = Readonly<{
  name: NativeRenderRuntimeArtifactName;
  status: NativeRenderRuntimeArtifactProbeStatus;
  path: string | null;
  relativePath: string | null;
  bytes: number | null;
  mtimeMs: number | null;
  error: string | null;
}>;

type NativeRenderRuntimeJsonArtifactProbe<T extends JsonRecord> = NativeRenderRuntimeArtifactProbe & Readonly<{
  data: T | null;
}>;

export interface NativeRenderRuntimeDiagnostics {
  schemaVersion: typeof NATIVE_RENDER_RUNTIME_DIAGNOSTICS_SCHEMA;
  status: NativeRenderRuntimeDiagnosticStatus;
  distDataRoot: string;
  manifestPath: string;
  nativeRenderIndexPath: string | null;
  artifacts: Readonly<Record<NativeRenderRuntimeArtifactName, NativeRenderRuntimeArtifactProbe>>;
  checks: NativeRenderRuntimeChecks;
  counts: NativeRenderRuntimeCounts;
  validation: NativeRenderRuntimeValidation;
  missing: string[];
  errors: string[];
}

type DistDataManifest = JsonRecord & {
  files?: Partial<Record<NativeRenderRuntimeManifestKey, string>>;
};

type NativeRenderIndexValidation = Partial<Record<keyof typeof NATIVE_RENDER_RUNTIME_VALIDATION_FIELDS, unknown>> & {
  [NATIVE_RENDER_RUNTIME_VALIDATION_FIELDS.status]?: string;
  [NATIVE_RENDER_RUNTIME_VALIDATION_FIELDS.summary]?: string;
};

type NativeRenderIndex = JsonRecord & {
  counts?: Partial<Record<NativeRenderRuntimeCountField, unknown>>;
  itemRendererByItemId?: Record<string, unknown>;
  shaderByItemId?: Record<string, unknown>;
  spriteByIconName?: Record<string, unknown>;
  validation?: NativeRenderIndexValidation;
};

function asJsonRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
}

function artifactProbe<T extends JsonRecord>(
  name: NativeRenderRuntimeArtifactName,
  status: NativeRenderRuntimeArtifactProbeStatus,
  options: Readonly<{
    path?: string | null;
    relativePath?: string | null;
    bytes?: number | null;
    mtimeMs?: number | null;
    error?: string | null;
    data?: T | null;
  }> = {},
): NativeRenderRuntimeJsonArtifactProbe<T> {
  return Object.freeze({
    name,
    status,
    path: options.path ?? null,
    relativePath: options.relativePath ?? null,
    bytes: options.bytes ?? null,
    mtimeMs: options.mtimeMs ?? null,
    error: options.error ?? null,
    data: options.data ?? null,
  });
}

function readJsonArtifact<T extends JsonRecord>(
  name: NativeRenderRuntimeArtifactName,
  filePath: string,
  relativePath: string | null,
): NativeRenderRuntimeJsonArtifactProbe<T> {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch (error) {
    return artifactProbe<T>(name, NATIVE_RENDER_RUNTIME_ARTIFACT_PROBE_STATUS.missing, {
      path: filePath,
      relativePath,
      error: `${name} artifact is missing: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  if (!stat.isFile()) {
    return artifactProbe<T>(name, NATIVE_RENDER_RUNTIME_ARTIFACT_PROBE_STATUS.missing, {
      path: filePath,
      relativePath,
      error: `${name} artifact is not a file`,
    });
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
    const record = asJsonRecord(parsed);
    if (!record) {
      return artifactProbe<T>(name, NATIVE_RENDER_RUNTIME_ARTIFACT_PROBE_STATUS.invalid, {
        path: filePath,
        relativePath,
        bytes: stat.size,
        mtimeMs: stat.mtimeMs,
        error: `${name} artifact must be a JSON object`,
      });
    }
    return artifactProbe<T>(name, NATIVE_RENDER_RUNTIME_ARTIFACT_PROBE_STATUS.present, {
      path: filePath,
      relativePath,
      bytes: stat.size,
      mtimeMs: stat.mtimeMs,
      data: record as T,
    });
  } catch (error) {
    return artifactProbe<T>(name, NATIVE_RENDER_RUNTIME_ARTIFACT_PROBE_STATUS.invalid, {
      path: filePath,
      relativePath,
      bytes: stat.size,
      mtimeMs: stat.mtimeMs,
      error: `${name} artifact is invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

function resolveNativeRenderIndexArtifact(
  manifestArtifact: NativeRenderRuntimeJsonArtifactProbe<DistDataManifest>,
): NativeRenderRuntimeJsonArtifactProbe<NativeRenderIndex> {
  if (manifestArtifact.status !== NATIVE_RENDER_RUNTIME_ARTIFACT_PROBE_STATUS.present || !manifestArtifact.data) {
    return artifactProbe<NativeRenderIndex>(
      NATIVE_RENDER_RUNTIME_ARTIFACTS.nativeRenderIndex,
      NATIVE_RENDER_RUNTIME_ARTIFACT_PROBE_STATUS.missing,
      { error: 'native render index cannot be resolved because manifest artifact is not readable' },
    );
  }

  const declaredPath = manifestArtifact.data.files?.[NATIVE_RENDER_RUNTIME_MANIFEST_KEYS.nativeRenderIndex] ?? null;
  if (!declaredPath) {
    return artifactProbe<NativeRenderIndex>(
      NATIVE_RENDER_RUNTIME_ARTIFACTS.nativeRenderIndex,
      NATIVE_RENDER_RUNTIME_ARTIFACT_PROBE_STATUS.missing,
      { error: 'manifest does not declare files.nativeRenderIndex' },
    );
  }

  if (!isPortableRuntimePath(declaredPath)) {
    return artifactProbe<NativeRenderIndex>(
      NATIVE_RENDER_RUNTIME_ARTIFACTS.nativeRenderIndex,
      NATIVE_RENDER_RUNTIME_ARTIFACT_PROBE_STATUS.invalid,
      {
        relativePath: `${declaredPath}`,
        error: 'manifest files.nativeRenderIndex must be a runtime-relative portable path',
      },
    );
  }

  const relativePath = normalizeRuntimePath(declaredPath);
  try {
    return readJsonArtifact<NativeRenderIndex>(
      NATIVE_RENDER_RUNTIME_ARTIFACTS.nativeRenderIndex,
      resolveDistDataRuntimeFile(relativePath),
      relativePath,
    );
  } catch (error) {
    return artifactProbe<NativeRenderIndex>(
      NATIVE_RENDER_RUNTIME_ARTIFACTS.nativeRenderIndex,
      NATIVE_RENDER_RUNTIME_ARTIFACT_PROBE_STATUS.invalid,
      {
        relativePath,
        error: `native render index path cannot be resolved: ${error instanceof Error ? error.message : String(error)}`,
      },
    );
  }
}

function stableNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function readCount(counts: NativeRenderIndex['counts'], field: NativeRenderRuntimeCountField): number {
  return stableNumber(counts?.[field]);
}

function evaluateNativeRenderRuntimeCheck(
  check: keyof NativeRenderRuntimeChecks,
  input: Readonly<{
    manifestArtifact: NativeRenderRuntimeJsonArtifactProbe<DistDataManifest>;
    nativeRenderIndexArtifact: NativeRenderRuntimeJsonArtifactProbe<NativeRenderIndex>;
    manifestDeclaresNativeRenderIndex: boolean;
    nativeRenderIndexPathPortable: boolean;
    nativeRenderIndex: NativeRenderIndex | null;
    validationStatus: unknown;
  }>,
): boolean {
  switch (check) {
    case NATIVE_RENDER_RUNTIME_CHECKS.manifestPresent:
      return input.manifestArtifact.status !== NATIVE_RENDER_RUNTIME_ARTIFACT_PROBE_STATUS.missing;
    case NATIVE_RENDER_RUNTIME_CHECKS.manifestValidJson:
      return input.manifestArtifact.status === NATIVE_RENDER_RUNTIME_ARTIFACT_PROBE_STATUS.present;
    case NATIVE_RENDER_RUNTIME_CHECKS.manifestDeclaresNativeRenderIndex:
      return input.manifestDeclaresNativeRenderIndex;
    case NATIVE_RENDER_RUNTIME_CHECKS.nativeRenderIndexPathPortable:
      return input.nativeRenderIndexPathPortable;
    case NATIVE_RENDER_RUNTIME_CHECKS.nativeRenderIndexPresent:
      return input.nativeRenderIndexArtifact.status !== NATIVE_RENDER_RUNTIME_ARTIFACT_PROBE_STATUS.missing;
    case NATIVE_RENDER_RUNTIME_CHECKS.nativeRenderIndexValidJson:
      return input.nativeRenderIndexArtifact.status === NATIVE_RENDER_RUNTIME_ARTIFACT_PROBE_STATUS.present;
    case NATIVE_RENDER_RUNTIME_CHECKS.rendererIndexPresent:
      return Boolean(
        input.nativeRenderIndex?.itemRendererByItemId
          && typeof input.nativeRenderIndex.itemRendererByItemId === 'object'
          && !Array.isArray(input.nativeRenderIndex.itemRendererByItemId),
      );
    case NATIVE_RENDER_RUNTIME_CHECKS.captureGateReady:
      return input.validationStatus !== NATIVE_RENDER_RUNTIME_BLOCKED_STATUS;
    default:
      throw new Error(`Unknown native render runtime check: ${check}`);
  }
}

function buildNativeRenderRuntimeChecks(input: Readonly<{
  manifestArtifact: NativeRenderRuntimeJsonArtifactProbe<DistDataManifest>;
  nativeRenderIndexArtifact: NativeRenderRuntimeJsonArtifactProbe<NativeRenderIndex>;
  manifestDeclaresNativeRenderIndex: boolean;
  nativeRenderIndexPathPortable: boolean;
  nativeRenderIndex: NativeRenderIndex | null;
  validationStatus: unknown;
}>): NativeRenderRuntimeChecks {
  return Object.freeze(
    NATIVE_RENDER_RUNTIME_CHECK_DESCRIPTORS.reduce(
      (checks, descriptor) => {
        checks[descriptor.name] = evaluateNativeRenderRuntimeCheck(descriptor.name, input);
        return checks;
      },
      {} as Record<keyof NativeRenderRuntimeChecks, boolean>,
    ),
  );
}

function determineNativeRenderRuntimeStatus(
  checks: NativeRenderRuntimeChecks,
  artifacts: readonly NativeRenderRuntimeArtifactProbe[],
): NativeRenderRuntimeDiagnosticStatus {
  if (artifacts.some((artifact) => artifact.status === NATIVE_RENDER_RUNTIME_ARTIFACT_PROBE_STATUS.invalid)) {
    return NATIVE_RENDER_RUNTIME_DIAGNOSTIC_STATUS.invalid;
  }
  if (NATIVE_RENDER_RUNTIME_CHECK_DESCRIPTORS.some((descriptor) => (
    descriptor.requiredForStatus === 'missing' && !checks[descriptor.name]
  ))) {
    return NATIVE_RENDER_RUNTIME_DIAGNOSTIC_STATUS.missing;
  }
  if (NATIVE_RENDER_RUNTIME_CHECK_DESCRIPTORS.some((descriptor) => !checks[descriptor.name])) {
    return NATIVE_RENDER_RUNTIME_DIAGNOSTIC_STATUS.degraded;
  }
  return NATIVE_RENDER_RUNTIME_DIAGNOSTIC_STATUS.ok;
}

function buildNativeRenderRuntimeCounts(counts: NativeRenderIndex['counts']): NativeRenderRuntimeCounts {
  return Object.freeze(
    NATIVE_RENDER_RUNTIME_COUNT_FIELD_DESCRIPTORS.reduce(
      (output, descriptor) => {
        output[descriptor.field] = readCount(counts, descriptor.field);
        return output;
      },
      {} as Record<NativeRenderRuntimeCountField, number>,
    ),
  );
}

function readValidationField(
  validation: NativeRenderIndexValidation | null,
  descriptor: NativeRenderRuntimeValidationFieldDescriptor,
): number | string | null {
  switch (descriptor.valueKind) {
    case 'status': {
      const value = validation?.[descriptor.field];
      return typeof value === 'string' ? value : null;
    }
    case 'count':
      return stableNumber(validation?.[descriptor.field]);
    case 'summary': {
      const value = validation?.[descriptor.field];
      return typeof value === 'string' ? value : null;
    }
    default:
      throw new Error(`Unknown native render runtime validation field kind: ${descriptor.valueKind}`);
  }
}

function buildNativeRenderRuntimeValidation(
  validation: NativeRenderIndexValidation | null,
): NativeRenderRuntimeValidation {
  return Object.freeze(
    NATIVE_RENDER_RUNTIME_VALIDATION_FIELD_DESCRIPTORS.reduce(
      (output, descriptor) => {
        output[descriptor.field] = readValidationField(validation, descriptor) as never;
        return output;
      },
      {} as Record<NativeRenderRuntimeValidationField, number | string | null>,
    ),
  ) as NativeRenderRuntimeValidation;
}

function artifactErrorMessages(
  artifacts: readonly NativeRenderRuntimeArtifactProbe[],
): string[] {
  return artifacts
    .filter((artifact) => artifact.error)
    .map((artifact) => `${artifact.name}: ${artifact.error}`);
}

export function getNativeRenderRuntimeDiagnostics(): NativeRenderRuntimeDiagnostics {
  const distDataRoot = CURRENT_RUNTIME_DIST_DATA_DIR;
  const manifestPath = CURRENT_RUNTIME_DIST_MANIFEST_FILE;
  const manifestArtifact = readJsonArtifact<DistDataManifest>(
    NATIVE_RENDER_RUNTIME_ARTIFACTS.manifest,
    manifestPath,
    'manifest.json',
  );
  const nativeRenderIndexArtifact = resolveNativeRenderIndexArtifact(manifestArtifact);
  const nativeRenderIndex = nativeRenderIndexArtifact.data;
  const validation = nativeRenderIndex?.validation ?? null;
  const validationStatus = validation?.[NATIVE_RENDER_RUNTIME_VALIDATION_FIELDS.status] ?? null;
  const counts = nativeRenderIndex?.counts ?? {};
  const manifestNativeRenderIndexPath =
    manifestArtifact.data?.files?.[NATIVE_RENDER_RUNTIME_MANIFEST_KEYS.nativeRenderIndex] ?? null;
  const manifestDeclaresNativeRenderIndex = typeof manifestNativeRenderIndexPath === 'string'
    && manifestNativeRenderIndexPath.trim().length > 0;
  const nativeRenderIndexPathPortable = manifestDeclaresNativeRenderIndex
    && isPortableRuntimePath(manifestNativeRenderIndexPath);
  const checks = buildNativeRenderRuntimeChecks({
    manifestArtifact,
    nativeRenderIndexArtifact,
    manifestDeclaresNativeRenderIndex,
    nativeRenderIndexPathPortable,
    nativeRenderIndex,
    validationStatus,
  });
  const missing = Object.entries(checks)
    .filter(([, ok]) => !ok)
    .map(([key]) => key);
  const artifacts = Object.freeze({
    manifest: manifestArtifact,
    nativeRenderIndex: nativeRenderIndexArtifact,
  });
  const artifactList = [manifestArtifact, nativeRenderIndexArtifact] as const;

  return {
    schemaVersion: NATIVE_RENDER_RUNTIME_DIAGNOSTICS_SCHEMA,
    status: determineNativeRenderRuntimeStatus(checks, artifactList),
    distDataRoot,
    manifestPath,
    nativeRenderIndexPath: nativeRenderIndexArtifact.path,
    artifacts,
    checks,
    counts: buildNativeRenderRuntimeCounts(counts),
    validation: buildNativeRenderRuntimeValidation(validation),
    missing,
    errors: artifactErrorMessages(artifactList),
  };
}
