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
  NATIVE_RENDER_RUNTIME_COUNT_FIELDS,
  NATIVE_RENDER_RUNTIME_DIAGNOSTIC_STATUS,
  NATIVE_RENDER_RUNTIME_DIAGNOSTICS_SCHEMA,
  NATIVE_RENDER_RUNTIME_MANIFEST_KEYS,
  NATIVE_RENDER_RUNTIME_VALIDATION_FIELDS,
  type NativeRenderRuntimeChecks,
  type NativeRenderRuntimeCountField,
  type NativeRenderRuntimeCounts,
  type NativeRenderRuntimeDiagnosticStatus,
  type NativeRenderRuntimeManifestKey,
  type NativeRenderRuntimeValidation,
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

export function getNativeRenderRuntimeDiagnostics(): NativeRenderRuntimeDiagnostics {
  const distDataRoot = CURRENT_RUNTIME_DIST_DATA_DIR;
  const manifestPath = CURRENT_RUNTIME_DIST_MANIFEST_FILE;
  const manifest = readJson<DistDataManifest>(manifestPath);
  const nativeRenderIndexPath = safeDistDataFile(manifest?.files?.[NATIVE_RENDER_RUNTIME_MANIFEST_KEYS.nativeRenderIndex] ?? null);
  const nativeRenderIndex = nativeRenderIndexPath ? readJson<NativeRenderIndex>(nativeRenderIndexPath) : null;
  const validation = nativeRenderIndex?.validation ?? null;
  const validationStatus = validation?.[NATIVE_RENDER_RUNTIME_VALIDATION_FIELDS.status] ?? null;
  const counts = nativeRenderIndex?.counts ?? {};
  const checks = Object.freeze({
    [NATIVE_RENDER_RUNTIME_CHECKS.manifestPresent]: Boolean(manifest),
    [NATIVE_RENDER_RUNTIME_CHECKS.manifestDeclaresNativeRenderIndex]: Boolean(
      manifest?.files?.[NATIVE_RENDER_RUNTIME_MANIFEST_KEYS.nativeRenderIndex],
    ),
    [NATIVE_RENDER_RUNTIME_CHECKS.nativeRenderIndexPresent]: Boolean(nativeRenderIndex),
    [NATIVE_RENDER_RUNTIME_CHECKS.rendererIndexPresent]: Boolean(
      nativeRenderIndex?.itemRendererByItemId && typeof nativeRenderIndex.itemRendererByItemId === 'object',
    ),
    [NATIVE_RENDER_RUNTIME_CHECKS.captureGateReady]: validationStatus !== NATIVE_RENDER_RUNTIME_BLOCKED_STATUS,
  }) satisfies NativeRenderRuntimeChecks;
  const missing = Object.entries(checks)
    .filter(([, ok]) => !ok)
    .map(([key]) => key);

  return {
    schemaVersion: NATIVE_RENDER_RUNTIME_DIAGNOSTICS_SCHEMA,
    status: !checks[NATIVE_RENDER_RUNTIME_CHECKS.manifestPresent]
      || !checks[NATIVE_RENDER_RUNTIME_CHECKS.manifestDeclaresNativeRenderIndex]
      || !checks[NATIVE_RENDER_RUNTIME_CHECKS.nativeRenderIndexPresent]
      ? NATIVE_RENDER_RUNTIME_DIAGNOSTIC_STATUS.missing
      : missing.length === 0 ? NATIVE_RENDER_RUNTIME_DIAGNOSTIC_STATUS.ok : NATIVE_RENDER_RUNTIME_DIAGNOSTIC_STATUS.degraded,
    distDataRoot,
    manifestPath,
    nativeRenderIndexPath,
    checks,
    counts: Object.freeze({
      [NATIVE_RENDER_RUNTIME_COUNT_FIELDS.textureSprites]: readCount(counts, NATIVE_RENDER_RUNTIME_COUNT_FIELDS.textureSprites),
      [NATIVE_RENDER_RUNTIME_COUNT_FIELDS.itemRenderers]: readCount(counts, NATIVE_RENDER_RUNTIME_COUNT_FIELDS.itemRenderers),
      [NATIVE_RENDER_RUNTIME_COUNT_FIELDS.shaderItems]: readCount(counts, NATIVE_RENDER_RUNTIME_COUNT_FIELDS.shaderItems),
      [NATIVE_RENDER_RUNTIME_COUNT_FIELDS.framebufferCaptures]: readCount(counts, NATIVE_RENDER_RUNTIME_COUNT_FIELDS.framebufferCaptures),
      [NATIVE_RENDER_RUNTIME_COUNT_FIELDS.itemRendererByItemId]: readCount(counts, NATIVE_RENDER_RUNTIME_COUNT_FIELDS.itemRendererByItemId),
      [NATIVE_RENDER_RUNTIME_COUNT_FIELDS.shaderByItemId]: readCount(counts, NATIVE_RENDER_RUNTIME_COUNT_FIELDS.shaderByItemId),
      [NATIVE_RENDER_RUNTIME_COUNT_FIELDS.spriteByIconName]: readCount(counts, NATIVE_RENDER_RUNTIME_COUNT_FIELDS.spriteByIconName),
    }) satisfies NativeRenderRuntimeCounts,
    validation: Object.freeze({
      [NATIVE_RENDER_RUNTIME_VALIDATION_FIELDS.status]: validationStatus,
      [NATIVE_RENDER_RUNTIME_VALIDATION_FIELDS.shaderItemsNeedingCapture]: stableNumber(
        validation?.[NATIVE_RENDER_RUNTIME_VALIDATION_FIELDS.shaderItemsNeedingCapture],
      ),
      [NATIVE_RENDER_RUNTIME_VALIDATION_FIELDS.framebufferCaptures]: stableNumber(
        validation?.[NATIVE_RENDER_RUNTIME_VALIDATION_FIELDS.framebufferCaptures],
      ),
      [NATIVE_RENDER_RUNTIME_VALIDATION_FIELDS.summary]: validation?.[NATIVE_RENDER_RUNTIME_VALIDATION_FIELDS.summary] ?? null,
    }) satisfies NativeRenderRuntimeValidation,
    missing,
  };
}
