import fs from 'fs';
import path from 'path';
import { PUBLIC_DIR } from '../config/runtime-paths';

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

function safeDistDataFile(distDataRoot: string, relativePath?: string | null): string | null {
  const normalized = `${relativePath ?? ''}`.trim().replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.split('/').some((segment) => segment === '.' || segment === '..')) {
    return null;
  }
  const resolvedRoot = path.resolve(distDataRoot);
  const resolved = path.resolve(resolvedRoot, ...normalized.split('/').filter(Boolean));
  return resolved.startsWith(resolvedRoot) ? resolved : null;
}

export function getNativeRenderRuntimeDiagnostics(): NativeRenderRuntimeDiagnostics {
  const distDataRoot = path.join(PUBLIC_DIR, 'dist-data');
  const manifestPath = path.join(distDataRoot, 'manifest.json');
  const manifest = readJson<DistDataManifest>(manifestPath);
  const nativeRenderIndexPath = safeDistDataFile(distDataRoot, manifest?.files?.nativeRenderIndex ?? null);
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
