import { Router, type NextFunction, type Request, type Response } from 'express';
import {
  assertCurrentRuntimeId,
  getCurrentRuntimeOverview,
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
import { getCurrentRuntimeSettings } from '../services/current-runtime-settings.service';
import { asyncHandler } from '../utils/http';
import {
  assetPathFromMountedRuntimeRequest,
  isRuntimeAssetRequestMethod,
  sendCurrentRuntimeAsset,
  sendCurrentRuntimeManifest,
  sendCurrentRuntimeNoStoreJson,
  sendCurrentRuntimeReport,
} from './current-runtime-transport';


const router = Router();
const CURRENT_RUNTIME_ASSET_ROUTE = '/runtime/current/asset/:fileName(*)';
const PINNED_RUNTIME_ASSET_ROUTE = '/runtime/:runtimeId/asset/:fileName(*)';

function sendRuntimeCurrent(res: Response): void {
  withCurrentRuntimeApiContext((context) => {
    sendCurrentRuntimeNoStoreJson(res, getCurrentRuntimeOverview(context), context);
  });
}

function sendMountedRuntimeAsset(req: Request, res: Response, next: NextFunction): void {
  if (!isRuntimeAssetRequestMethod(req.method)) {
    next();
    return;
  }
  withCurrentRuntimeApiContext((context) => {
    sendCurrentRuntimeAsset(res, context, assetPathFromMountedRuntimeRequest(req));
  });
}

async function sendRecipeItem(itemIdParam: string | undefined, res: Response): Promise<void> {
  await withCurrentRuntimeApiContextAsync(async (context) => {
    sendCurrentRuntimeNoStoreJson(res, await getCurrentRecipeItemProducedBy(itemIdParam), context);
  });
}

async function sendRecipeUsage(itemIdParam: string | undefined, res: Response): Promise<void> {
  await withCurrentRuntimeApiContextAsync(async (context) => {
    sendCurrentRuntimeNoStoreJson(res, await getCurrentRecipeItemUsedIn(itemIdParam), context);
  });
}

async function sendRecipePage(recipePageIdParam: string | undefined, res: Response): Promise<void> {
  await withCurrentRuntimeApiContextAsync(async (context) => {
    sendCurrentRuntimeNoStoreJson(res, await getCurrentRecipePage(recipePageIdParam), context);
  });
}

function sendDiagnosticsHealth(res: Response): void {
  withCurrentRuntimeApiContext((context) => {
    sendCurrentRuntimeNoStoreJson(res, getCurrentRuntimeDiagnosticsHealth(context), context);
  });
}

function sendDiagnosticsRuntimeSummary(res: Response): void {
  withCurrentRuntimeApiContext((context) => {
    sendCurrentRuntimeNoStoreJson(res, getCurrentRuntimeDiagnosticsSummary(context), context);
  });
}

function sendRuntimeSettings(res: Response): void {
  withCurrentRuntimeApiContext((context) => {
    sendCurrentRuntimeNoStoreJson(res, getCurrentRuntimeSettings(), context);
  });
}

router.get('/runtime/current', (_req, res) => {
  sendRuntimeCurrent(res);
});

router.get('/runtime/current/manifest', (_req, res) => {
  withCurrentRuntimeApiContext((context) => {
    sendCurrentRuntimeManifest(res, context);
  });
});

router.get(CURRENT_RUNTIME_ASSET_ROUTE, (req, res) => {
  withCurrentRuntimeApiContext((context) => {
    sendCurrentRuntimeAsset(res, context, req.params.fileName);
  });
});

router.use('/runtime/current/asset', sendMountedRuntimeAsset);

router.get('/runtime/current/reports/:reportName', (req, res) => {
  sendCurrentRuntimeReport(res, req.params.reportName);
});

router.get('/runtime/:runtimeId/manifest', (req, res) => {
  withCurrentRuntimeApiContext((context) => {
    assertCurrentRuntimeId(req.params.runtimeId, context);
    sendCurrentRuntimeManifest(res, context, { immutable: true });
  });
});

router.get(PINNED_RUNTIME_ASSET_ROUTE, (req, res) => {
  withCurrentRuntimeApiContext((context) => {
    assertCurrentRuntimeId(req.params.runtimeId, context);
    sendCurrentRuntimeAsset(res, context, req.params.fileName);
  });
});

router.use('/runtime/:runtimeId/asset', (req, res, next) => {
  if (!isRuntimeAssetRequestMethod(req.method)) {
    next();
    return;
  }
  withCurrentRuntimeApiContext((context) => {
    assertCurrentRuntimeId(req.params.runtimeId, context);
    sendCurrentRuntimeAsset(res, context, assetPathFromMountedRuntimeRequest(req));
  });
});

router.get('/runtime/:runtimeId/reports/:reportName', (req, res) => {
  withCurrentRuntimeApiContext((context) => {
    assertCurrentRuntimeId(req.params.runtimeId, context);
    sendCurrentRuntimeReport(res, req.params.reportName);
  });
});

router.get('/native-runtime/current/manifest', (_req, res) => {
  withCurrentRuntimeApiContext((context) => {
    sendCurrentRuntimeManifest(res, context);
  });
});

router.get('/native-runtime/current/files/:fileName(*)', (req, res) => {
  withCurrentRuntimeApiContext((context) => {
    sendCurrentRuntimeAsset(res, context, req.params.fileName);
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
    sendCurrentRuntimeNoStoreJson(res, getCurrentRuntimeNativeSurfaceMetrics(context), context);
  });
});

router.get('/settings/runtime', (_req, res) => {
  sendRuntimeSettings(res);
});

export default router;
