import fs from 'fs';
import path from 'path';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { PUBLIC_DIR } from '../config/runtime-paths';
import { resolveAccelerationCompilerAuthority } from '../services/acceleration-runtime-compiler-authority.service';
import { getIndexedRecipesService } from '../services/recipes-indexed.service';
import { getRuntimeRecipePackService } from '../services/runtime-recipe-pack.service';
import { getNativeRenderRuntimeDiagnostics } from '../services/native-render-runtime-diagnostics.service';
import { getRuntimeHealthSummary } from '../services/runtime-health-summary.service';
import { asyncHandler, badRequest, notFound } from '../utils/http';
import { createWeakEtag, setNoStoreHeaders, setStaticAssetCacheHeaders } from '../utils/http-cache';

type JsonRecord = Record<string, unknown>;

const router = Router();
const API_SCHEMA = 'neonei/api/current';
const API_SCHEMA_REVISION = 1;
const DIST_DATA_DIR = path.join(PUBLIC_DIR, 'dist-data');
const DIST_DATA_MANIFEST_FILE = path.join(DIST_DATA_DIR, 'manifest.json');
const CURRENT_RUNTIME_ASSET_ROUTE = '/runtime/current/asset/:fileName(*)';
const PINNED_RUNTIME_ASSET_ROUTE = '/runtime/:runtimeId/asset/:fileName(*)';

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

function notImplemented(message: string): Error & { statusCode: number; code: string } {
  const error = new Error(message) as Error & { statusCode: number; code: string };
  error.statusCode = 501;
  error.code = 'RUNTIME_PACK_QUERY_NOT_IMPLEMENTED';
  return error;
}

function assertCurrentRuntimeId(runtimeId: string | undefined): void {
  const requested = normalizeRequiredParam(runtimeId, 'runtimeId');
  const current = getCurrentMeta().runtimeId;
  if (requested !== current) {
    throw notFound('Runtime id is not the current published runtime');
  }
}

function isExternalRuntimeAuthority(): boolean {
  return resolveAccelerationCompilerAuthority() === 'external-runtime';
}

function assertRecipePagePackBackedOrAllowed(): void {
  if (!isExternalRuntimeAuthority()) return;
  throw notImplemented('Recipe query endpoints are not yet pack-backed for external-runtime authority; use runtime manifest/assets until the pack query surface lands.');
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

function sendRuntimeCurrent(res: Response): void {
  const meta = getCurrentMeta();
  const manifest = getRuntimeManifest();
  const manifestPath = getRuntimeManifestRelativePath();
  const runtimeSchemaRevision = asString(manifest?.schemaRevision)
    ?? asString(manifest?.schema)
    ?? 'runtime.unknown';
  setNoStoreHeaders(res);
  sendOk(res, {
    runtimeId: meta.runtimeId,
    schemaRevision: runtimeSchemaRevision,
    manifestUrl: '/api/runtime/current/manifest',
    runtimeManifestUrl: `/api/runtime/${encodeURIComponent(meta.runtimeId)}/manifest`,
    assetBaseUrl: '/api/runtime/current/asset/',
    runtimeAssetBaseUrl: `/api/runtime/${encodeURIComponent(meta.runtimeId)}/asset/`,
    legacyManifestUrl: '/api/native-runtime/current/manifest',
    capabilities: meta.capabilities,
    manifestPath,
    cache: {
      immutable: true,
      maxAgeSeconds: 31_536_000,
    },
  });
}

function sendRuntimeManifest(res: Response, options: { immutable?: boolean } = {}): void {
  const manifest = getRuntimeManifest();
  if (!manifest) throw notFound('Runtime manifest not found');
  const manifestPath = getRuntimeManifestRelativePath() ?? 'runtime-manifest';
  res.setHeader('ETag', createWeakEtag('runtime-manifest', getCurrentMeta().runtimeId, manifestPath, JSON.stringify(manifest)));
  if (options.immutable) {
    setStaticAssetCacheHeaders(res, {
      maxAge: '365d',
      immutable: true,
      varyAcceptEncoding: true,
    });
  } else {
    setNoStoreHeaders(res);
  }
  sendOk(res, manifest);
}

function sendRuntimeAsset(fileName: string | undefined, res: Response): void {
  const filePath = resolveRuntimeFile(normalizeRequiredParam(fileName, 'fileName'));
  if (!fs.existsSync(filePath)) {
    throw notFound('Runtime file not found');
  }
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) {
    throw notFound('Runtime file not found');
  }
  res.setHeader('ETag', createWeakEtag('runtime-asset', getCurrentMeta().runtimeId, path.relative(DIST_DATA_DIR, filePath), stat.size, stat.mtimeMs));
  setStaticAssetCacheHeaders(res, {
    maxAge: '365d',
    immutable: true,
    varyAcceptEncoding: true,
  });
  res.sendFile(filePath);
}

function assetPathFromMountedRequest(req: Request): string {
  return decodeURIComponent(req.path.replace(/^\/+/, ''));
}

function sendMountedRuntimeAsset(req: Request, res: Response, next: NextFunction): void {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    next();
    return;
  }
  sendRuntimeAsset(assetPathFromMountedRequest(req), res);
}

function resolveRuntimeReport(reportName: string | undefined): string {
  const normalized = normalizeRequiredParam(reportName, 'reportName')
    .replace(/\.json$/i, '')
    .trim();
  if (!/^[a-z0-9-]+$/i.test(normalized)) {
    throw badRequest('reportName must be a simple report slug');
  }
  const allowedReports: Record<string, string> = {
    'compile-report': 'rust/integrity.json',
    'missing-texture-report': 'rust/missing-texture-report.json',
    'suspicious-texture-report': 'rust/suspicious-texture-report.json',
    'atlas-report': 'textures/atlas-manifest.json',
    'performance-budget-report': 'rust/size-report.json',
    'api-contract-report': 'validation/report.json',
    'deployment-report': 'rust/deployment-report.json',
    'semantic-validation-report': 'rust/semantic-validation-report.json',
  };
  const reportPath = allowedReports[normalized];
  if (!reportPath) {
    throw notFound('Runtime report is not allowed');
  }
  return resolveDistDataFile(reportPath);
}

function sendRuntimeReport(reportName: string | undefined, res: Response): void {
  const filePath = resolveRuntimeReport(reportName);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw notFound('Runtime report not found');
  }
  setNoStoreHeaders(res);
  res.sendFile(filePath);
}

async function sendRecipeItem(itemIdParam: string | undefined, res: Response): Promise<void> {
  setNoStoreHeaders(res);
  const itemId = normalizeRequiredParam(itemIdParam, 'itemId');
  if (isExternalRuntimeAuthority()) {
    const payload = getRuntimeRecipePackService().getItemProducedBy(itemId);
    if (!payload) throw notFound('Recipe item not found in runtime recipe pack');
    sendOk(res, payload);
    return;
  }
  const service = getIndexedRecipesService();
  const summary = await service.getItemRecipeSummary(itemId);
  const recipes = await service.getCraftingRecipesForItem(itemId);
  sendOk(res, {
    itemId,
    summary,
    recipes,
  });
}

async function sendRecipeUsage(itemIdParam: string | undefined, res: Response): Promise<void> {
  setNoStoreHeaders(res);
  const itemId = normalizeRequiredParam(itemIdParam, 'itemId');
  if (isExternalRuntimeAuthority()) {
    const payload = getRuntimeRecipePackService().getItemUsedIn(itemId);
    if (!payload) throw notFound('Recipe item not found in runtime recipe pack');
    sendOk(res, payload);
    return;
  }
  const service = getIndexedRecipesService();
  const summary = await service.getItemRecipeSummary(itemId);
  const usages = await service.getUsageRecipesForItem(itemId);
  sendOk(res, {
    itemId,
    summary,
    usages,
  });
}

async function sendRecipePage(recipePageIdParam: string | undefined, res: Response): Promise<void> {
  assertRecipePagePackBackedOrAllowed();
  setNoStoreHeaders(res);
  const recipePageId = normalizeRequiredParam(recipePageIdParam, 'recipePageId');
  const service = getIndexedRecipesService();
  const page = await service.getRecipePageById(recipePageId);
  if (!page) {
    throw notFound('Recipe page not found');
  }
  sendOk(res, page);
}

function sendDiagnosticsHealth(res: Response): void {
  setNoStoreHeaders(res);
  const health = getRuntimeHealthSummary();
  const manifest = getRuntimeManifest();
  const runtimeFiles = Array.isArray(manifest?.packs) ? manifest.packs.length : health.files.declared;
  sendOk(res, {
    runtimeId: getCurrentMeta().runtimeId,
    schema: asString(manifest?.schema) ?? 'neonei/runtime/current',
    schemaRevision: typeof manifest?.schemaRevision === 'number' ? manifest.schemaRevision : asString(manifest?.schemaRevision),
    integrityOk: health.status !== 'blocked' && health.files.missing.length === 0,
    packCount: runtimeFiles,
    atlasCount: health.counts.browserAtlasItems,
    missingTextures: health.coverage.semanticAtlasMissing,
    missingAnimations: health.coverage.staticWhenExpectedAnimated,
    generatedAt: health.generatedAt,
    sourceExportName: health.distData.source,
    warnings: health.validation.warnings,
    checks: {
      manifest: manifest ? 'ok' : 'missing',
      assets: health.files.missing.length === 0 ? 'ok' : 'missing',
      reports: 'ok',
    },
    health,
  });
}

function sendDiagnosticsRuntimeSummary(res: Response): void {
  setNoStoreHeaders(res);
  const health = getRuntimeHealthSummary();
  sendOk(res, {
    runtimeId: getCurrentMeta().runtimeId,
    counts: {
      items: health.counts.items,
      groups: health.counts.browserGroups,
      recipes: health.counts.recipes,
      atlasItems: health.counts.browserAtlasItems,
      animatedTextures: health.counts.animatedBrowserAtlasItems ?? health.counts.animationTableItems,
    },
    warnings: health.validation.warnings,
    coverage: health.coverage,
  });
}

function sendRuntimeSettings(res: Response): void {
  setNoStoreHeaders(res);
  sendOk(res, {
    apiBaseUrl: '/api',
    runtimeMode: 'native',
    rendererPreference: 'webgpu-first',
    allowDomGridFallback: false,
    allowPerItemImageHotLoad: false,
    debugPanels: process.env.NEONEI_DEBUG_PANELS === '1' || process.env.NEONEI_DEBUG_PANELS?.toLowerCase() === 'true',
    runtime: {
      currentUrl: '/api/runtime/current',
      manifestUrl: '/api/runtime/current/manifest',
      assetBaseUrl: '/api/runtime/current/asset/',
    },
  });
}

router.get('/runtime/current', (_req, res) => {
  sendRuntimeCurrent(res);
});

router.get('/runtime/current/manifest', (_req, res) => {
  sendRuntimeManifest(res);
});

router.get(CURRENT_RUNTIME_ASSET_ROUTE, (req, res) => {
  sendRuntimeAsset(req.params.fileName, res);
});

router.use('/runtime/current/asset', sendMountedRuntimeAsset);

router.get('/runtime/current/reports/:reportName', (req, res) => {
  sendRuntimeReport(req.params.reportName, res);
});

router.get('/runtime/:runtimeId/manifest', (req, res) => {
  assertCurrentRuntimeId(req.params.runtimeId);
  sendRuntimeManifest(res, { immutable: true });
});

router.get(PINNED_RUNTIME_ASSET_ROUTE, (req, res) => {
  assertCurrentRuntimeId(req.params.runtimeId);
  sendRuntimeAsset(req.params.fileName, res);
});

router.use('/runtime/:runtimeId/asset', (req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    next();
    return;
  }
  assertCurrentRuntimeId(req.params.runtimeId);
  sendRuntimeAsset(assetPathFromMountedRequest(req), res);
});

router.get('/runtime/:runtimeId/reports/:reportName', (req, res) => {
  assertCurrentRuntimeId(req.params.runtimeId);
  sendRuntimeReport(req.params.reportName, res);
});

router.get('/native-runtime/current/manifest', (_req, res) => {
  sendRuntimeManifest(res);
});

router.get('/native-runtime/current/files/:fileName(*)', (req, res) => {
  sendRuntimeAsset(req.params.fileName, res);
});

router.get(
  '/recipes/item/:itemId',
  asyncHandler(async (req, res) => {
    await sendRecipeItem(req.params.itemId, res);
  }),
);

router.get(
  '/recipes/current/item/:itemId',
  asyncHandler(async (req, res) => {
    await sendRecipeItem(req.params.itemId, res);
  }),
);

router.get(
  '/recipes/usage/:itemId',
  asyncHandler(async (req, res) => {
    await sendRecipeUsage(req.params.itemId, res);
  }),
);

router.get(
  '/recipes/page/:recipePageId(*)',
  asyncHandler(async (req, res) => {
    await sendRecipePage(req.params.recipePageId, res);
  }),
);

router.get(
  '/recipes/current/usage/:itemId',
  asyncHandler(async (req, res) => {
    await sendRecipeUsage(req.params.itemId, res);
  }),
);

router.get('/diagnostics/health', (_req, res) => {
  sendDiagnosticsHealth(res);
});

router.get('/diagnostics/runtime-summary', (_req, res) => {
  sendDiagnosticsRuntimeSummary(res);
});

router.get('/health/current/runtime', (_req, res) => {
  sendDiagnosticsHealth(res);
});

router.get('/metrics/current/native-surface', (_req, res) => {
  setNoStoreHeaders(res);
  sendOk(res, {
    nativeRender: getNativeRenderRuntimeDiagnostics(),
    runtimeHealth: getRuntimeHealthSummary(),
  });
});

router.get('/settings/runtime', (_req, res) => {
  sendRuntimeSettings(res);
});

export default router;
