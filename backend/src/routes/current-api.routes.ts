import fs from 'fs';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { resolveAccelerationCompilerAuthority } from '../services/acceleration-runtime-compiler-authority.service';
import { getIndexedRecipesService } from '../services/recipes-indexed.service';
import { getRuntimeRecipePackService } from '../services/runtime-recipe-pack.service';
import { getNativeRenderRuntimeDiagnostics } from '../services/native-render-runtime-diagnostics.service';
import { getRuntimeHealthSummary } from '../services/runtime-health-summary.service';
import {
  getCurrentRuntimeArtifact,
  getCurrentRuntimeSnapshot,
  resolveDistDataRuntimeFile,
} from '../services/current-runtime-snapshot.service';
import { asyncHandler, badRequest, notFound } from '../utils/http';
import { createWeakEtag, setNoStoreHeaders, setStaticAssetCacheHeaders } from '../utils/http-cache';


const router = Router();
const API_SCHEMA = 'neonei/api/current';
const API_SCHEMA_REVISION = 1;
const CURRENT_RUNTIME_ASSET_ROUTE = '/runtime/current/asset/:fileName(*)';
const PINNED_RUNTIME_ASSET_ROUTE = '/runtime/:runtimeId/asset/:fileName(*)';
function asString(value: unknown): string | null {
  const text = `${value ?? ''}`.trim();
  return text || null;
}

function getCurrentMeta() {
  const snapshot = getCurrentRuntimeSnapshot();
  const capabilities = snapshot?.capabilities ?? {};
  const health = getRuntimeHealthSummary();
  return {
    schema: API_SCHEMA,
    schemaRevision: API_SCHEMA_REVISION,
    runtimeId: snapshot?.runtimeId ?? asString(health.distData.runtime?.runtimeId) ?? health.distData.source ?? 'runtime-missing',
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

function resolveRuntimeReportFile(reportPath: string): string {
  try {
    return resolveDistDataRuntimeFile(reportPath);
  } catch {
    throw badRequest('fileName must be a runtime-relative file path');
  }
}

function sendRuntimeCurrent(res: Response): void {
  const meta = getCurrentMeta();
  const snapshot = getCurrentRuntimeSnapshot();
  const manifestPath = snapshot?.manifestPath ?? null;
  const runtimeSchemaRevision = snapshot?.runtimeSchemaRevision ?? 'runtime.unknown';
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
  const snapshot = getCurrentRuntimeSnapshot();
  if (!snapshot) throw notFound('Runtime manifest not found');
  res.setHeader('ETag', createWeakEtag('runtime-manifest', snapshot.runtimeId, snapshot.manifestPath, snapshot.fingerprint));
  if (options.immutable) {
    setStaticAssetCacheHeaders(res, {
      maxAge: '365d',
      immutable: true,
      varyAcceptEncoding: true,
    });
  } else {
    setNoStoreHeaders(res);
  }
  sendOk(res, snapshot.manifest);
}

function sendRuntimeAsset(fileName: string | undefined, res: Response): void {
  const artifact = getCurrentRuntimeArtifact(normalizeRequiredParam(fileName, 'fileName'));
  if (!artifact) throw notFound('Runtime file is not declared by the current runtime manifest');
  res.setHeader('ETag', createWeakEtag('runtime-asset', getCurrentMeta().runtimeId, artifact.relativePath, artifact.bytes, artifact.mtimeMs));
  setStaticAssetCacheHeaders(res, {
    maxAge: '365d',
    immutable: true,
    varyAcceptEncoding: true,
  });
  res.sendFile(artifact.absolutePath);
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
  return resolveRuntimeReportFile(reportPath);
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
  setNoStoreHeaders(res);
  const recipePageId = normalizeRequiredParam(recipePageIdParam, 'recipePageId');
  if (isExternalRuntimeAuthority()) {
    const page = getRuntimeRecipePackService().getRecipePage(recipePageId);
    if (!page) {
      throw notFound('Recipe page not found in runtime recipe pack');
    }
    sendOk(res, page);
    return;
  }
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
  const snapshot = getCurrentRuntimeSnapshot();
  const runtimeFiles = snapshot ? Object.keys(snapshot.artifactsByPath).length : health.files.declared;
  sendOk(res, {
    runtimeId: getCurrentMeta().runtimeId,
    schema: asString(snapshot?.manifest.schema) ?? 'neonei/runtime/current',
    schemaRevision: snapshot?.runtimeSchemaRevision,
    integrityOk: health.status !== 'blocked' && health.files.missing.length === 0,
    packCount: runtimeFiles,
    atlasCount: health.counts.browserAtlasItems,
    missingTextures: health.coverage.semanticAtlasMissing,
    missingAnimations: health.coverage.staticWhenExpectedAnimated,
    generatedAt: health.generatedAt,
    sourceExportName: health.distData.source,
    warnings: health.validation.warnings,
    checks: {
      manifest: snapshot ? 'ok' : 'missing',
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
