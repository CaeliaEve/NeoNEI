import fs from 'fs';
import {
  CURRENT_RUNTIME_DIST_DATA_DIR,
  CURRENT_RUNTIME_DIST_MANIFEST_FILE,
  isPortableRuntimePath,
  normalizeRuntimePath,
  resolveDistDataRuntimeFile,
} from './current-runtime-artifact-index.service';

export interface NativeRenderRuntimeDiagnostics {
  schemaVersion: 'neonei/native-render-runtime-diagnostics/current';
  status: 'ok' | 'degraded' | 'missing';
  distDataRoot: string;
  manifestPath: string;
  nativeRenderIndexPath: string | null;
  checks: {
    manifestPresent: boolean;
    manifestDeclaresNativeRenderIndex: boolean;
    nativeRenderIndexPresent: boolean;
    rendererIndexPresent: boolean;
    captureGateReady: boolean;
  };
  counts: {
    textureSprites: number;
    itemRenderers: number;
    shaderItems: number;
    framebufferCaptures: number;
    itemRendererByItemId: number;
    shaderByItemId: number;
    spriteByIconName: number;
  };
  validation: {
    status: string | null;
    shaderItemsNeedingCapture: number;
    framebufferCaptures: number;
    summary: string | null;
  };
  missing: string[];
}

type DistDataManifest = {
  files?: {
    nativeRenderIndex?: string;
  };
};

type NativeRenderIndex = {
  counts?: Record<string, unknown>;
  itemRendererByItemId?: Record<string, unknown>;
  shaderByItemId?: Record<string, unknown>;
  spriteByIconName?: Record<string, unknown>;
  validation?: {
    status?: string;
    shaderItemsNeedingCapture?: unknown;
    framebufferCaptures?: unknown;
    summary?: string;
  };
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

export function getNativeRenderRuntimeDiagnostics(): NativeRenderRuntimeDiagnostics {
  const distDataRoot = CURRENT_RUNTIME_DIST_DATA_DIR;
  const manifestPath = CURRENT_RUNTIME_DIST_MANIFEST_FILE;
  const manifest = readJson<DistDataManifest>(manifestPath);
  const nativeRenderIndexPath = safeDistDataFile(manifest?.files?.nativeRenderIndex ?? null);
  const nativeRenderIndex = nativeRenderIndexPath ? readJson<NativeRenderIndex>(nativeRenderIndexPath) : null;
  const validation = nativeRenderIndex?.validation ?? null;
  const counts = nativeRenderIndex?.counts ?? {};
  const checks = {
    manifestPresent: Boolean(manifest),
    manifestDeclaresNativeRenderIndex: Boolean(manifest?.files?.nativeRenderIndex),
    nativeRenderIndexPresent: Boolean(nativeRenderIndex),
    rendererIndexPresent: Boolean(nativeRenderIndex?.itemRendererByItemId && typeof nativeRenderIndex.itemRendererByItemId === 'object'),
    captureGateReady: validation?.status !== 'blocked',
  };
  const missing = Object.entries(checks)
    .filter(([, ok]) => !ok)
    .map(([key]) => key);

  return {
    schemaVersion: 'neonei/native-render-runtime-diagnostics/current',
    status: !checks.manifestPresent || !checks.manifestDeclaresNativeRenderIndex || !checks.nativeRenderIndexPresent
      ? 'missing'
      : missing.length === 0 ? 'ok' : 'degraded',
    distDataRoot,
    manifestPath,
    nativeRenderIndexPath,
    checks,
    counts: {
      textureSprites: stableNumber(counts.textureSprites),
      itemRenderers: stableNumber(counts.itemRenderers),
      shaderItems: stableNumber(counts.shaderItems),
      framebufferCaptures: stableNumber(counts.framebufferCaptures),
      itemRendererByItemId: stableNumber(counts.itemRendererByItemId),
      shaderByItemId: stableNumber(counts.shaderByItemId),
      spriteByIconName: stableNumber(counts.spriteByIconName),
    },
    validation: {
      status: validation?.status ?? null,
      shaderItemsNeedingCapture: stableNumber(validation?.shaderItemsNeedingCapture),
      framebufferCaptures: stableNumber(validation?.framebufferCaptures),
      summary: validation?.summary ?? null,
    },
    missing,
  };
}
