import { Router, type NextFunction, type Request, type Response } from 'express';
import { resolveAccelerationCompilerAuthority } from '../services/acceleration-runtime-compiler-authority.service';
import { getIndexedRecipesService } from '../services/recipes-indexed.service';
import { getRuntimeRecipePackService } from '../services/runtime-recipe-pack.service';
import {
  assertCurrentRuntimeId,
  createCurrentRuntimeApiContext,
  getCurrentRuntimeAssetDelivery,
  getCurrentRuntimeDiagnosticsHealth,
  getCurrentRuntimeDiagnosticsSummary,
  getCurrentRuntimeManifestDelivery,
  getCurrentRuntimeNativeSurfaceMetrics,
  getCurrentRuntimeOverview,
  type CurrentRuntimeApiContext,
} from '../services/current-runtime-api.service';
import { resolveCurrentRuntimeReport } from '../services/current-runtime-report-registry.service';
import { asyncHandler, badRequest, notFound } from '../utils/http';
import { setNoStoreHeaders, setStaticAssetCacheHeaders } from '../utils/http-cache';


const router = Router();
const CURRENT_RUNTIME_ASSET_ROUTE = '/runtime/current/asset/:fileName(*)';
const PINNED_RUNTIME_ASSET_ROUTE = '/runtime/:runtimeId/asset/:fileName(*)';

function sendOk(res: Response, data: unknown, context = createCurrentRuntimeApiContext()): void {
  res.json({
    ok: true,
    data,
    meta: context.meta,
  });
}

function normalizeRequiredParam(value: string | undefined, name: string): string {
  const normalized = `${value ?? ''}`.trim();
  if (!normalized) throw badRequest(`${name} is required`);
  return normalized;
}

function isExternalRuntimeAuthority(): boolean {
  return resolveAccelerationCompilerAuthority() === 'external-runtime';
}

function sendRuntimeCurrent(res: Response): void {
  const context = createCurrentRuntimeApiContext();
  setNoStoreHeaders(res);
  sendOk(res, getCurrentRuntimeOverview(context), context);
}

function sendRuntimeManifest(
  res: Response,
  options: { immutable?: boolean } = {},
  context = createCurrentRuntimeApiContext(),
): void {
  const manifest = getCurrentRuntimeManifestDelivery(context);
  res.setHeader('ETag', manifest.etag);
  if (options.immutable) {
    setStaticAssetCacheHeaders(res, {
      maxAge: '365d',
      immutable: true,
      varyAcceptEncoding: true,
    });
  } else {
    setNoStoreHeaders(res);
  }
  sendOk(res, manifest.payload, context);
}

function sendRuntimeAsset(
  fileName: string | undefined,
  res: Response,
  context = createCurrentRuntimeApiContext(),
): void {
  const asset = getCurrentRuntimeAssetDelivery(fileName, context);
  res.setHeader('ETag', asset.etag);
  setStaticAssetCacheHeaders(res, {
    maxAge: '365d',
    immutable: true,
    varyAcceptEncoding: true,
  });
  res.sendFile(asset.artifact.absolutePath);
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

function sendRuntimeReport(reportName: string | undefined, res: Response): void {
  const report = resolveCurrentRuntimeReport(reportName);
  setNoStoreHeaders(res);
  res.sendFile(report.absolutePath);
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
  const context = createCurrentRuntimeApiContext();
  sendOk(res, getCurrentRuntimeDiagnosticsHealth(context), context);
}

function sendDiagnosticsRuntimeSummary(res: Response): void {
  setNoStoreHeaders(res);
  const context = createCurrentRuntimeApiContext();
  sendOk(res, getCurrentRuntimeDiagnosticsSummary(context), context);
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
  const context = createCurrentRuntimeApiContext();
  assertCurrentRuntimeId(req.params.runtimeId, context);
  sendRuntimeManifest(res, { immutable: true }, context);
});

router.get(PINNED_RUNTIME_ASSET_ROUTE, (req, res) => {
  const context = createCurrentRuntimeApiContext();
  assertCurrentRuntimeId(req.params.runtimeId, context);
  sendRuntimeAsset(req.params.fileName, res, context);
});

router.use('/runtime/:runtimeId/asset', (req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    next();
    return;
  }
  const context = createCurrentRuntimeApiContext();
  assertCurrentRuntimeId(req.params.runtimeId, context);
  sendRuntimeAsset(assetPathFromMountedRequest(req), res, context);
});

router.get('/runtime/:runtimeId/reports/:reportName', (req, res) => {
  const context = createCurrentRuntimeApiContext();
  assertCurrentRuntimeId(req.params.runtimeId, context);
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
  const context = createCurrentRuntimeApiContext();
  sendOk(res, getCurrentRuntimeNativeSurfaceMetrics(context), context);
});

router.get('/settings/runtime', (_req, res) => {
  sendRuntimeSettings(res);
});

export default router;
