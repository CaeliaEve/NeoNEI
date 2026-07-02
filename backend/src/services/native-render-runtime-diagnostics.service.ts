import fs from 'fs';
import {
  CURRENT_RUNTIME_DIST_DATA_DIR,
  CURRENT_RUNTIME_DIST_MANIFEST_FILE,
  isPortableRuntimePath,
  normalizeRuntimePath,
  resolveDistDataRuntimeFile,
} from './current-runtime-artifact-index.service';
import {
  NATIVE_RENDER_RUNTIME_BLOCKED_STATUS,
  NATIVE_RENDER_RUNTIME_CHECKS,
  NATIVE_RENDER_RUNTIME_CHECK_DESCRIPTORS,
  NATIVE_RENDER_RUNTIME_COUNT_FIELD_DESCRIPTORS,
  NATIVE_RENDER_RUNTIME_DIAGNOSTIC_STATUS,
  NATIVE_RENDER_RUNTIME_DIAGNOSTICS_SCHEMA,
  NATIVE_RENDER_RUNTIME_MANIFEST_KEYS,
  NATIVE_RENDER_RUNTIME_VALIDATION_FIELDS,
  NATIVE_RENDER_RUNTIME_VALIDATION_FIELD_DESCRIPTORS,
  type NativeRenderRuntimeChecks,
  type NativeRenderRuntimeCountField,
  type NativeRenderRuntimeCounts,
  type NativeRenderRuntimeDiagnosticStatus,
  type NativeRenderRuntimeManifestKey,
  type NativeRenderRuntimeValidation,
  type NativeRenderRuntimeValidationField,
  type NativeRenderRuntimeValidationFieldDescriptor,
} from './native-render-runtime-diagnostics-abi';

export interface NativeRenderRuntimeDiagnostics {
  schemaVersion: typeof NATIVE_RENDER_RUNTIME_DIAGNOSTICS_SCHEMA;
  status: NativeRenderRuntimeDiagnosticStatus;
  distDataRoot: string;
  manifestPath: string;
  nativeRenderIndexPath: string | null;
  checks: NativeRenderRuntimeChecks;
  counts: NativeRenderRuntimeCounts;
  validation: NativeRenderRuntimeValidation;
  missing: string[];
}

type DistDataManifest = {
  files?: Partial<Record<NativeRenderRuntimeManifestKey, string>>;
};

type NativeRenderIndexValidation = Partial<Record<keyof typeof NATIVE_RENDER_RUNTIME_VALIDATION_FIELDS, unknown>> & {
  [NATIVE_RENDER_RUNTIME_VALIDATION_FIELDS.status]?: string;
  [NATIVE_RENDER_RUNTIME_VALIDATION_FIELDS.summary]?: string;
};

type NativeRenderIndex = {
  counts?: Partial<Record<NativeRenderRuntimeCountField, unknown>>;
  itemRendererByItemId?: Record<string, unknown>;
  shaderByItemId?: Record<string, unknown>;
  spriteByIconName?: Record<string, unknown>;
  validation?: NativeRenderIndexValidation;
};

function readJson<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return null;
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '')) as T;
  } catch {
    return null;
  }
}

function stableNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeDistDataFile(relativePath?: string | null): string | null {
  if (!isPortableRuntimePath(relativePath)) {
    return null;
  }
  try {
    return resolveDistDataRuntimeFile(normalizeRuntimePath(relativePath));
  } catch {
    return null;
  }
}

function readCount(counts: NativeRenderIndex['counts'], field: NativeRenderRuntimeCountField): number {
  return stableNumber(counts?.[field]);
}

function evaluateNativeRenderRuntimeCheck(
  check: keyof NativeRenderRuntimeChecks,
  input: Readonly<{
    manifest: DistDataManifest | null;
    nativeRenderIndex: NativeRenderIndex | null;
    validationStatus: unknown;
  }>,
): boolean {
  switch (check) {
    case NATIVE_RENDER_RUNTIME_CHECKS.manifestPresent:
      return Boolean(input.manifest);
    case NATIVE_RENDER_RUNTIME_CHECKS.manifestDeclaresNativeRenderIndex:
      return Boolean(input.manifest?.files?.[NATIVE_RENDER_RUNTIME_MANIFEST_KEYS.nativeRenderIndex]);
    case NATIVE_RENDER_RUNTIME_CHECKS.nativeRenderIndexPresent:
      return Boolean(input.nativeRenderIndex);
    case NATIVE_RENDER_RUNTIME_CHECKS.rendererIndexPresent:
      return Boolean(
        input.nativeRenderIndex?.itemRendererByItemId
          && typeof input.nativeRenderIndex.itemRendererByItemId === 'object',
      );
    case NATIVE_RENDER_RUNTIME_CHECKS.captureGateReady:
      return input.validationStatus !== NATIVE_RENDER_RUNTIME_BLOCKED_STATUS;
    default:
      throw new Error(`Unknown native render runtime check: ${check}`);
  }
}

function buildNativeRenderRuntimeChecks(
  manifest: DistDataManifest | null,
  nativeRenderIndex: NativeRenderIndex | null,
  validationStatus: unknown,
): NativeRenderRuntimeChecks {
  return Object.freeze(
    NATIVE_RENDER_RUNTIME_CHECK_DESCRIPTORS.reduce(
      (checks, descriptor) => {
        checks[descriptor.name] = evaluateNativeRenderRuntimeCheck(descriptor.name, {
          manifest,
          nativeRenderIndex,
          validationStatus,
        });
        return checks;
      },
      {} as Record<keyof NativeRenderRuntimeChecks, boolean>,
    ),
  );
}

function determineNativeRenderRuntimeStatus(checks: NativeRenderRuntimeChecks): NativeRenderRuntimeDiagnosticStatus {
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

export function getNativeRenderRuntimeDiagnostics(): NativeRenderRuntimeDiagnostics {
  const distDataRoot = CURRENT_RUNTIME_DIST_DATA_DIR;
  const manifestPath = CURRENT_RUNTIME_DIST_MANIFEST_FILE;
  const manifest = readJson<DistDataManifest>(manifestPath);
  const nativeRenderIndexPath = safeDistDataFile(manifest?.files?.[NATIVE_RENDER_RUNTIME_MANIFEST_KEYS.nativeRenderIndex] ?? null);
  const nativeRenderIndex = nativeRenderIndexPath ? readJson<NativeRenderIndex>(nativeRenderIndexPath) : null;
  const validation = nativeRenderIndex?.validation ?? null;
  const validationStatus = validation?.[NATIVE_RENDER_RUNTIME_VALIDATION_FIELDS.status] ?? null;
  const counts = nativeRenderIndex?.counts ?? {};
  const checks = buildNativeRenderRuntimeChecks(manifest, nativeRenderIndex, validationStatus);
  const missing = Object.entries(checks)
    .filter(([, ok]) => !ok)
    .map(([key]) => key);

  return {
    schemaVersion: NATIVE_RENDER_RUNTIME_DIAGNOSTICS_SCHEMA,
    status: determineNativeRenderRuntimeStatus(checks),
    distDataRoot,
    manifestPath,
    nativeRenderIndexPath,
    checks,
    counts: buildNativeRenderRuntimeCounts(counts),
    validation: buildNativeRenderRuntimeValidation(validation),
    missing,
  };
}
