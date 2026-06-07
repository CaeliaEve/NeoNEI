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
const RUNTIME_DIR = path.join(PUBLIC_DIR, 'dist-data', 'runtime');
const RUNTIME_MANIFEST_FILE = path.join(RUNTIME_DIR, 'runtime-manifest.json');

function readJson(filePath: string): JsonRecord | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as JsonRecord;
  } catch {
    return null;
  }
}

function getRuntimeManifest(): JsonRecord | null {
  return readJson(RUNTIME_MANIFEST_FILE);
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
}

function asString(value: unknown): string | null {
  const text = `${value ?? ''}`.trim();
  return text || null;
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

function resolveRuntimeFile(fileName: string): string {
  const normalized = `${fileName ?? ''}`.trim().replace(/\\/g, '/');
  if (!normalized || normalized.includes('..') || path.isAbsolute(normalized)) {
    throw badRequest('fileName must be a runtime-relative file path');
  }
  const resolved = path.resolve(RUNTIME_DIR, normalized);
  const runtimeRoot = path.resolve(RUNTIME_DIR);
  if (resolved !== runtimeRoot && !resolved.startsWith(`${runtimeRoot}${path.sep}`)) {
    throw badRequest('fileName escapes runtime root');
  }
  return resolved;
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
