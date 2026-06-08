import fs from 'fs';
import path from 'path';
import { Router, type Response } from 'express';
import { PUBLIC_DIR } from '../config/runtime-paths';
import { getIndexedRecipesService } from '../services/recipes-indexed.service';
import { getNativeRenderRuntimeDiagnostics } from '../services/native-render-runtime-diagnostics.service';
import { getRuntimeHealthSummary } from '../services/runtime-health-summary.service';
import { asyncHandler, badRequest, notFound } from '../utils/http';
import { setNoStoreHeaders, setPublicCacheHeaders } from '../utils/http-cache';

type JsonRecord = Record<string, unknown>;

const router = Router();
const API_SCHEMA = 'neonei/api/current';
const API_SCHEMA_REVISION = 1;
const DIST_DATA_DIR = path.join(PUBLIC_DIR, 'dist-data');
const DIST_DATA_MANIFEST_FILE = path.join(DIST_DATA_DIR, 'manifest.json');

function readJson(filePath: string): JsonRecord | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as JsonRecord;
  } catch {
    return null;
  }
}

function getRuntimeManifest(): JsonRecord | null {
  const manifestPath = getRuntimeManifestFile();
  return manifestPath ? readJson(manifestPath) : null;
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
}

function asString(value: unknown): string | null {
  const text = `${value ?? ''}`.trim();
  return text || null;
}

function isPortableRuntimePath(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const normalized = `${value ?? ''}`.trim().replace(/\\/g, '/');
  return Boolean(normalized)
    && !normalized.includes('..')
    && !path.isAbsolute(normalized)
    && !/^[A-Za-z]:[\\/]/.test(normalized);
}

function getDistDataManifest(): JsonRecord | null {
  return readJson(DIST_DATA_MANIFEST_FILE);
}

function getRuntimeManifestRelativePath(): string | null {
  const distManifest = getDistDataManifest();
  const files = asRecord(distManifest?.files);
  const nativeRuntime = asRecord(distManifest?.nativeRuntime);
  const declared = asString(files?.rustRuntimeManifest)
    ?? asString(nativeRuntime?.runtimeManifest)
    ?? asString(files?.runtimeManifest);
  return isPortableRuntimePath(declared) ? declared.replace(/\\/g, '/') : null;
}

function getRuntimeManifestFile(): string | null {
  const relativePath = getRuntimeManifestRelativePath();
  if (!relativePath) return null;
  return resolveDistDataFile(relativePath);
}

function collectPortableRuntimePaths(value: unknown, output: Set<string>): void {
  if (isPortableRuntimePath(value)) {
    output.add(value.replace(/\\/g, '/'));
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectPortableRuntimePaths(item, output);
    return;
  }
  const record = asRecord(value);
  if (!record) return;
  for (const item of Object.values(record)) collectPortableRuntimePaths(item, output);
}

function getDeclaredRuntimeFilePaths(): Set<string> {
  const declared = new Set<string>();
  const runtimeManifestPath = getRuntimeManifestRelativePath();
  if (runtimeManifestPath) declared.add(runtimeManifestPath);

  const runtimeManifest = getRuntimeManifest();
  const entrypoints = asRecord(runtimeManifest?.entrypoints);
  collectPortableRuntimePaths(entrypoints, declared);
  collectPortableRuntimePaths(runtimeManifest?.files, declared);
  return declared;
}

function getCurrentMeta() {
  const manifest = getRuntimeManifest();
  const capabilities = asRecord(manifest?.capabilities) ?? {};
  const health = getRuntimeHealthSummary();
  return {
    schema: API_SCHEMA,
    schemaRevision: API_SCHEMA_REVISION,
    runtimeId: asString(manifest?.runtimeId) ?? asString(health.distData.runtime?.runtimeId) ?? health.distData.source ?? 'runtime-missing',
    capabilities,
  };
}

function sendOk(res: Response, data: unknown): void {
  res.json({
    ok: true,
    data,
    meta: getCurrentMeta(),
  });
}

function normalizeRequiredParam(value: string | undefined, name: string): string {
  const normalized = `${value ?? ''}`.trim();
  if (!normalized) throw badRequest(`${name} is required`);
  return normalized;
}

function resolveDistDataFile(relativeFileName: string): string {
  const normalized = `${relativeFileName ?? ''}`.trim().replace(/\\/g, '/');
  if (!normalized || normalized.includes('..') || path.isAbsolute(normalized)) {
    throw badRequest('fileName must be a runtime-relative file path');
  }
  const resolved = path.resolve(DIST_DATA_DIR, normalized);
  const runtimeRoot = path.resolve(DIST_DATA_DIR);
  if (resolved !== runtimeRoot && !resolved.startsWith(`${runtimeRoot}${path.sep}`)) {
    throw badRequest('fileName escapes dist-data root');
  }
  return resolved;
}

function resolveRuntimeFile(fileName: string): string {
  const normalized = `${fileName ?? ''}`.trim().replace(/\\/g, '/');
  const declaredRuntimeFiles = getDeclaredRuntimeFilePaths();
  if (!declaredRuntimeFiles.has(normalized)) {
    throw notFound('Runtime file is not declared by the current runtime manifest');
  }
  return resolveDistDataFile(normalized);
}

router.get('/native-runtime/current/manifest', (_req, res) => {
  setNoStoreHeaders(res);
  const manifest = getRuntimeManifest();
  if (!manifest) throw notFound('Runtime manifest not found');
  sendOk(res, manifest);
});

router.get('/native-runtime/current/files/:fileName(*)', (req, res) => {
  const filePath = resolveRuntimeFile(normalizeRequiredParam(req.params.fileName, 'fileName'));
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw notFound('Runtime file not found');
  }
  setPublicCacheHeaders(res, {
    maxAgeSeconds: 31_536_000,
    staleWhileRevalidateSeconds: 86_400,
  });
  res.sendFile(filePath);
});

router.get(
  '/recipes/current/item/:itemId',
  asyncHandler(async (req, res) => {
    setNoStoreHeaders(res);
    const itemId = normalizeRequiredParam(req.params.itemId, 'itemId');
    const service = getIndexedRecipesService();
    const summary = await service.getItemRecipeSummary(itemId);
    const recipes = await service.getCraftingRecipesForItem(itemId);
    sendOk(res, {
      itemId,
      summary,
      recipes,
    });
  }),
);

router.get(
  '/recipes/current/usage/:itemId',
  asyncHandler(async (req, res) => {
    setNoStoreHeaders(res);
    const itemId = normalizeRequiredParam(req.params.itemId, 'itemId');
    const service = getIndexedRecipesService();
    const summary = await service.getItemRecipeSummary(itemId);
    const usages = await service.getUsageRecipesForItem(itemId);
    sendOk(res, {
      itemId,
      summary,
      usages,
    });
  }),
);

router.get('/health/current/runtime', (_req, res) => {
  setNoStoreHeaders(res);
  const health = getRuntimeHealthSummary();
  const manifest = getRuntimeManifest();
  const runtimeFiles = Array.isArray(manifest?.packs) ? manifest.packs.length : health.files.declared;
  sendOk(res, {
    runtimeId: getCurrentMeta().runtimeId,
    schema: asString(manifest?.schema) ?? 'neonei/runtime/current',
    schemaRevision: typeof manifest?.schemaRevision === 'number' ? manifest.schemaRevision : null,
    integrityOk: health.status !== 'blocked' && health.files.missing.length === 0,
    packCount: runtimeFiles,
    atlasCount: health.counts.browserAtlasItems,
    missingTextures: health.coverage.semanticAtlasMissing,
    missingAnimations: health.coverage.staticWhenExpectedAnimated,
    generatedAt: health.generatedAt,
    sourceExportName: health.distData.source,
    warnings: health.validation.warnings,
    health,
  });
});

router.get('/metrics/current/native-surface', (_req, res) => {
  setNoStoreHeaders(res);
  sendOk(res, {
    nativeRender: getNativeRenderRuntimeDiagnostics(),
    runtimeHealth: getRuntimeHealthSummary(),
  });
});

export default router;
