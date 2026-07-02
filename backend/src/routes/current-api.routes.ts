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
import {
  getCurrentRuntimeForestryGeneticsOverview,
  getCurrentRuntimeGTDiagramsOverview,
  getCurrentRuntimeMultiblockBlueprint,
} from '../services/current-runtime-special-data.service';
import { asyncHandler } from '../utils/http';
import { mountCurrentRuntimeEndpoint } from './current-runtime-endpoint-registry';
import {
  assetPathFromMountedRuntimeRequest,
  isRuntimeAssetRequestMethod,
  sendCurrentRuntimeAsset,
  sendCurrentRuntimeManifest,
  sendCurrentRuntimeNoStoreJson,
  sendCurrentRuntimeReport,
} from './current-runtime-transport';


const router = Router();

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

function sendGTDiagramsOverview(res: Response): void {
  withCurrentRuntimeApiContext((context) => {
    sendCurrentRuntimeNoStoreJson(res, getCurrentRuntimeGTDiagramsOverview(), context);
  });
}

function sendForestryGeneticsOverview(res: Response): void {
  withCurrentRuntimeApiContext((context) => {
    sendCurrentRuntimeNoStoreJson(res, getCurrentRuntimeForestryGeneticsOverview(), context);
  });
}

function sendMultiblockBlueprint(controllerItemIdParam: string | undefined, res: Response): void {
  withCurrentRuntimeApiContext((context) => {
    sendCurrentRuntimeNoStoreJson(
      res,
      getCurrentRuntimeMultiblockBlueprint(controllerItemIdParam),
      context,
    );
  });
}

mountCurrentRuntimeEndpoint(router, 'current', (_req, res) => {
  sendRuntimeCurrent(res);
});

mountCurrentRuntimeEndpoint(router, 'currentManifest', (_req, res) => {
  withCurrentRuntimeApiContext((context) => {
    sendCurrentRuntimeManifest(res, context);
  });
});

mountCurrentRuntimeEndpoint(router, 'currentAssetParam', (req, res) => {
  withCurrentRuntimeApiContext((context) => {
    sendCurrentRuntimeAsset(res, context, req.params.fileName);
  });
});

mountCurrentRuntimeEndpoint(router, 'currentAssetMounted', sendMountedRuntimeAsset);

mountCurrentRuntimeEndpoint(router, 'currentReport', (req, res) => {
  sendCurrentRuntimeReport(res, req.params.reportName);
});

mountCurrentRuntimeEndpoint(router, 'pinnedManifest', (req, res) => {
  withCurrentRuntimeApiContext((context) => {
    assertCurrentRuntimeId(req.params.runtimeId, context);
    sendCurrentRuntimeManifest(res, context, { immutable: true });
  });
});

mountCurrentRuntimeEndpoint(router, 'pinnedAssetParam', (req, res) => {
  withCurrentRuntimeApiContext((context) => {
    assertCurrentRuntimeId(req.params.runtimeId, context);
    sendCurrentRuntimeAsset(res, context, req.params.fileName);
  });
});

mountCurrentRuntimeEndpoint(router, 'pinnedAssetMounted', (req, res, next) => {
  if (!isRuntimeAssetRequestMethod(req.method)) {
    next();
    return;
  }
  withCurrentRuntimeApiContext((context) => {
    assertCurrentRuntimeId(req.params.runtimeId, context);
    sendCurrentRuntimeAsset(res, context, assetPathFromMountedRuntimeRequest(req));
  });
});

mountCurrentRuntimeEndpoint(router, 'pinnedReport', (req, res) => {
  withCurrentRuntimeApiContext((context) => {
    assertCurrentRuntimeId(req.params.runtimeId, context);
    sendCurrentRuntimeReport(res, req.params.reportName);
  });
});
mountCurrentRuntimeEndpoint(
  router,
  'recipeItem',
  asyncHandler(async (req, res) => {
    await sendRecipeItem(req.params.itemId, res);
  }),
);

mountCurrentRuntimeEndpoint(
  router,
  'recipeCurrentItem',
  asyncHandler(async (req, res) => {
    await sendRecipeItem(req.params.itemId, res);
  }),
);

mountCurrentRuntimeEndpoint(
  router,
  'recipeUsage',
  asyncHandler(async (req, res) => {
    await sendRecipeUsage(req.params.itemId, res);
  }),
);

mountCurrentRuntimeEndpoint(
  router,
  'recipePage',
  asyncHandler(async (req, res) => {
    await sendRecipePage(req.params.recipePageId, res);
  }),
);

mountCurrentRuntimeEndpoint(
  router,
  'recipeCurrentUsage',
  asyncHandler(async (req, res) => {
    await sendRecipeUsage(req.params.itemId, res);
  }),
);

mountCurrentRuntimeEndpoint(router, 'diagnosticsHealth', (_req, res) => {
  sendDiagnosticsHealth(res);
});

mountCurrentRuntimeEndpoint(router, 'diagnosticsRuntimeSummary', (_req, res) => {
  sendDiagnosticsRuntimeSummary(res);
});

mountCurrentRuntimeEndpoint(router, 'healthCurrentRuntime', (_req, res) => {
  sendDiagnosticsHealth(res);
});

mountCurrentRuntimeEndpoint(router, 'nativeSurfaceMetrics', (_req, res) => {
  withCurrentRuntimeApiContext((context) => {
    sendCurrentRuntimeNoStoreJson(res, getCurrentRuntimeNativeSurfaceMetrics(context), context);
  });
});

mountCurrentRuntimeEndpoint(router, 'runtimeSettings', (_req, res) => {
  sendRuntimeSettings(res);
});

mountCurrentRuntimeEndpoint(router, 'runtimeDataGTDiagramsOverview', (_req, res) => {
  sendGTDiagramsOverview(res);
});

mountCurrentRuntimeEndpoint(router, 'runtimeDataForestryGeneticsOverview', (_req, res) => {
  sendForestryGeneticsOverview(res);
});

mountCurrentRuntimeEndpoint(
  router,
  'runtimeDataMultiblockBlueprint',
  asyncHandler(async (req, res) => {
    sendMultiblockBlueprint(req.params.controllerItemId, res);
  }),
);

export default router;
