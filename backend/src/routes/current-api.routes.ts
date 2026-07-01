import { Router, type NextFunction, type Request, type Response } from 'express';
import {
  assertCurrentRuntimeId,
  getCurrentRuntimeAssetDelivery,
  getCurrentRuntimeManifestDelivery,
  getCurrentRuntimeOverview,
  type CurrentRuntimeApiContext,
  withCurrentRuntimeApiContext,
  withCurrentRuntimeApiContextAsync,
} from '../services/current-runtime-api.service';
import {
  getCurrentRuntimeDiagnosticsHealth,
  getCurrentRuntimeDiagnosticsSummary,
  getCurrentRuntimeNativeSurfaceMetrics,
} from '../services/current-runtime-observability.service';
import {
  getCurrentRecipeItemProducedBy,
  getCurrentRecipeItemUsedIn,
  getCurrentRecipePage,
} from '../services/current-runtime-recipe-api.service';
import { resolveCurrentRuntimeReport } from '../services/current-runtime-report-registry.service';
import { getCurrentRuntimeSettings } from '../services/current-runtime-settings.service';
import { asyncHandler } from '../utils/http';
import { setNoStoreHeaders, setStaticAssetCacheHeaders } from '../utils/http-cache';


const router = Router();
const CURRENT_RUNTIME_ASSET_ROUTE = '/runtime/current/asset/:fileName(*)';
const PINNED_RUNTIME_ASSET_ROUTE = '/runtime/:runtimeId/asset/:fileName(*)';

function sendOk(res: Response, data: unknown, context: CurrentRuntimeApiContext): void {
  res.json({
    ok: true,
    data,
    meta: context.meta,
  });
}

function sendRuntimeCurrent(res: Response): void {
  withCurrentRuntimeApiContext((context) => {
    setNoStoreHeaders(res);
    sendOk(res, getCurrentRuntimeOverview(context), context);
  });
}

function sendRuntimeManifest(
  res: Response,
  context: CurrentRuntimeApiContext,
  options: { immutable?: boolean } = {},
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
  context: CurrentRuntimeApiContext,
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
  withCurrentRuntimeApiContext((context) => {
    sendRuntimeAsset(assetPathFromMountedRequest(req), res, context);
  });
}

function sendRuntimeReport(reportName: string | undefined, res: Response): void {
  const report = resolveCurrentRuntimeReport(reportName);
  setNoStoreHeaders(res);
  res.sendFile(report.absolutePath);
}

async function sendRecipeItem(itemIdParam: string | undefined, res: Response): Promise<void> {
  setNoStoreHeaders(res);
  await withCurrentRuntimeApiContextAsync(async (context) => {
    sendOk(res, await getCurrentRecipeItemProducedBy(itemIdParam), context);
  });
}

async function sendRecipeUsage(itemIdParam: string | undefined, res: Response): Promise<void> {
  setNoStoreHeaders(res);
  await withCurrentRuntimeApiContextAsync(async (context) => {
    sendOk(res, await getCurrentRecipeItemUsedIn(itemIdParam), context);
  });
}

async function sendRecipePage(recipePageIdParam: string | undefined, res: Response): Promise<void> {
  setNoStoreHeaders(res);
  await withCurrentRuntimeApiContextAsync(async (context) => {
    sendOk(res, await getCurrentRecipePage(recipePageIdParam), context);
  });
}

function sendDiagnosticsHealth(res: Response): void {
  withCurrentRuntimeApiContext((context) => {
    setNoStoreHeaders(res);
    sendOk(res, getCurrentRuntimeDiagnosticsHealth(context), context);
  });
}

function sendDiagnosticsRuntimeSummary(res: Response): void {
  withCurrentRuntimeApiContext((context) => {
    setNoStoreHeaders(res);
    sendOk(res, getCurrentRuntimeDiagnosticsSummary(context), context);
  });
}

function sendRuntimeSettings(res: Response): void {
  withCurrentRuntimeApiContext((context) => {
    setNoStoreHeaders(res);
    sendOk(res, getCurrentRuntimeSettings(), context);
  });
}

router.get('/runtime/current', (_req, res) => {
  sendRuntimeCurrent(res);
});

router.get('/runtime/current/manifest', (_req, res) => {
  withCurrentRuntimeApiContext((context) => {
    sendRuntimeManifest(res, context);
  });
});

router.get(CURRENT_RUNTIME_ASSET_ROUTE, (req, res) => {
  withCurrentRuntimeApiContext((context) => {
    sendRuntimeAsset(req.params.fileName, res, context);
  });
});

router.use('/runtime/current/asset', sendMountedRuntimeAsset);

router.get('/runtime/current/reports/:reportName', (req, res) => {
  sendRuntimeReport(req.params.reportName, res);
});

router.get('/runtime/:runtimeId/manifest', (req, res) => {
  withCurrentRuntimeApiContext((context) => {
    assertCurrentRuntimeId(req.params.runtimeId, context);
    sendRuntimeManifest(res, context, { immutable: true });
  });
});

router.get(PINNED_RUNTIME_ASSET_ROUTE, (req, res) => {
  withCurrentRuntimeApiContext((context) => {
    assertCurrentRuntimeId(req.params.runtimeId, context);
    sendRuntimeAsset(req.params.fileName, res, context);
  });
});

router.use('/runtime/:runtimeId/asset', (req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    next();
    return;
  }
  withCurrentRuntimeApiContext((context) => {
    assertCurrentRuntimeId(req.params.runtimeId, context);
    sendRuntimeAsset(assetPathFromMountedRequest(req), res, context);
  });
});

router.get('/runtime/:runtimeId/reports/:reportName', (req, res) => {
  withCurrentRuntimeApiContext((context) => {
    assertCurrentRuntimeId(req.params.runtimeId, context);
    sendRuntimeReport(req.params.reportName, res);
  });
});

router.get('/native-runtime/current/manifest', (_req, res) => {
  withCurrentRuntimeApiContext((context) => {
    sendRuntimeManifest(res, context);
  });
});

router.get('/native-runtime/current/files/:fileName(*)', (req, res) => {
  withCurrentRuntimeApiContext((context) => {
    sendRuntimeAsset(req.params.fileName, res, context);
  });
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
  withCurrentRuntimeApiContext((context) => {
    setNoStoreHeaders(res);
    sendOk(res, getCurrentRuntimeNativeSurfaceMetrics(context), context);
  });
});

router.get('/settings/runtime', (_req, res) => {
  sendRuntimeSettings(res);
});

export default router;
