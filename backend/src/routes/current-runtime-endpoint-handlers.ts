import type { NextFunction, Request, RequestHandler, Response } from 'express';
import {
  assertCurrentRuntimeId,
  withCurrentRuntimeApiContext,
  withCurrentRuntimeApiContextAsync,
} from '../services/current-runtime-api.service';
import {
  getCurrentRuntimeDiagnosticsHealthPayload,
  getCurrentRuntimeDiagnosticsSummaryPayload,
  getCurrentRuntimeForestryGeneticsOverviewPayload,
  getCurrentRuntimeGTDiagramsOverviewPayload,
  getCurrentRuntimeMultiblockBlueprintPayload,
  getCurrentRuntimeNativeSurfaceMetricsPayload,
  getCurrentRuntimeOverviewPayload,
  getCurrentRuntimeRecipePagePayload,
  getCurrentRuntimeRecipeProducedByPayload,
  getCurrentRuntimeRecipeUsedInPayload,
  getCurrentRuntimeSettingsPayload,
} from '../services/current-runtime-read.service';
import { asyncHandler } from '../utils/http';
import type { CurrentRuntimeEndpointKey } from './current-runtime-endpoint-registry';
import {
  assetPathFromMountedRuntimeRequest,
  isRuntimeAssetRequestMethod,
  sendCurrentRuntimeAsset,
  sendCurrentRuntimeManifest,
  sendCurrentRuntimeNoStoreJson,
  sendCurrentRuntimeReport,
} from './current-runtime-transport';

function sendRuntimeCurrent(res: Response): void {
  withCurrentRuntimeApiContext((context) => {
    sendCurrentRuntimeNoStoreJson(res, getCurrentRuntimeOverviewPayload(context), context);
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
    sendCurrentRuntimeNoStoreJson(res, await getCurrentRuntimeRecipeProducedByPayload(itemIdParam), context);
  });
}

async function sendRecipeUsage(itemIdParam: string | undefined, res: Response): Promise<void> {
  await withCurrentRuntimeApiContextAsync(async (context) => {
    sendCurrentRuntimeNoStoreJson(res, await getCurrentRuntimeRecipeUsedInPayload(itemIdParam), context);
  });
}

async function sendRecipePage(recipePageIdParam: string | undefined, res: Response): Promise<void> {
  await withCurrentRuntimeApiContextAsync(async (context) => {
    sendCurrentRuntimeNoStoreJson(res, await getCurrentRuntimeRecipePagePayload(recipePageIdParam), context);
  });
}

function sendDiagnosticsHealth(res: Response): void {
  withCurrentRuntimeApiContext((context) => {
    sendCurrentRuntimeNoStoreJson(res, getCurrentRuntimeDiagnosticsHealthPayload(context), context);
  });
}

function sendDiagnosticsRuntimeSummary(res: Response): void {
  withCurrentRuntimeApiContext((context) => {
    sendCurrentRuntimeNoStoreJson(res, getCurrentRuntimeDiagnosticsSummaryPayload(context), context);
  });
}

function sendRuntimeSettings(res: Response): void {
  withCurrentRuntimeApiContext((context) => {
    sendCurrentRuntimeNoStoreJson(res, getCurrentRuntimeSettingsPayload(), context);
  });
}

function sendGTDiagramsOverview(res: Response): void {
  withCurrentRuntimeApiContext((context) => {
    sendCurrentRuntimeNoStoreJson(res, getCurrentRuntimeGTDiagramsOverviewPayload(), context);
  });
}

function sendForestryGeneticsOverview(res: Response): void {
  withCurrentRuntimeApiContext((context) => {
    sendCurrentRuntimeNoStoreJson(res, getCurrentRuntimeForestryGeneticsOverviewPayload(), context);
  });
}

function sendMultiblockBlueprint(controllerItemIdParam: string | undefined, res: Response): void {
  withCurrentRuntimeApiContext((context) => {
    sendCurrentRuntimeNoStoreJson(
      res,
      getCurrentRuntimeMultiblockBlueprintPayload(controllerItemIdParam),
      context,
    );
  });
}

export const CURRENT_RUNTIME_ENDPOINT_HANDLERS: Readonly<Record<CurrentRuntimeEndpointKey, RequestHandler>> = Object.freeze({
  current: (_req, res) => {
    sendRuntimeCurrent(res);
  },
  currentManifest: (_req, res) => {
    withCurrentRuntimeApiContext((context) => {
      sendCurrentRuntimeManifest(res, context);
    });
  },
  currentAssetParam: (req, res) => {
    withCurrentRuntimeApiContext((context) => {
      sendCurrentRuntimeAsset(res, context, req.params.fileName);
    });
  },
  currentAssetMounted: sendMountedRuntimeAsset,
  currentReport: (req, res) => {
    sendCurrentRuntimeReport(res, req.params.reportName);
  },
  pinnedManifest: (req, res) => {
    withCurrentRuntimeApiContext((context) => {
      assertCurrentRuntimeId(req.params.runtimeId, context);
      sendCurrentRuntimeManifest(res, context, { immutable: true });
    });
  },
  pinnedAssetParam: (req, res) => {
    withCurrentRuntimeApiContext((context) => {
      assertCurrentRuntimeId(req.params.runtimeId, context);
      sendCurrentRuntimeAsset(res, context, req.params.fileName);
    });
  },
  pinnedAssetMounted: (req, res, next) => {
    if (!isRuntimeAssetRequestMethod(req.method)) {
      next();
      return;
    }
    withCurrentRuntimeApiContext((context) => {
      assertCurrentRuntimeId(req.params.runtimeId, context);
      sendCurrentRuntimeAsset(res, context, assetPathFromMountedRuntimeRequest(req));
    });
  },
  pinnedReport: (req, res) => {
    withCurrentRuntimeApiContext((context) => {
      assertCurrentRuntimeId(req.params.runtimeId, context);
      sendCurrentRuntimeReport(res, req.params.reportName);
    });
  },
  recipeItem: asyncHandler(async (req, res) => {
    await sendRecipeItem(req.params.itemId, res);
  }),
  recipeCurrentItem: asyncHandler(async (req, res) => {
    await sendRecipeItem(req.params.itemId, res);
  }),
  recipeUsage: asyncHandler(async (req, res) => {
    await sendRecipeUsage(req.params.itemId, res);
  }),
  recipePage: asyncHandler(async (req, res) => {
    await sendRecipePage(req.params.recipePageId, res);
  }),
  recipeCurrentUsage: asyncHandler(async (req, res) => {
    await sendRecipeUsage(req.params.itemId, res);
  }),
  diagnosticsHealth: (_req, res) => {
    sendDiagnosticsHealth(res);
  },
  diagnosticsRuntimeSummary: (_req, res) => {
    sendDiagnosticsRuntimeSummary(res);
  },
  healthCurrentRuntime: (_req, res) => {
    sendDiagnosticsHealth(res);
  },
  nativeSurfaceMetrics: (_req, res) => {
    withCurrentRuntimeApiContext((context) => {
      sendCurrentRuntimeNoStoreJson(res, getCurrentRuntimeNativeSurfaceMetricsPayload(context), context);
    });
  },
  runtimeSettings: (_req, res) => {
    sendRuntimeSettings(res);
  },
  runtimeDataGTDiagramsOverview: (_req, res) => {
    sendGTDiagramsOverview(res);
  },
  runtimeDataForestryGeneticsOverview: (_req, res) => {
    sendForestryGeneticsOverview(res);
  },
  runtimeDataMultiblockBlueprint: asyncHandler(async (req, res) => {
    sendMultiblockBlueprint(req.params.controllerItemId, res);
  }),
});

export function getCurrentRuntimeEndpointHandler(key: CurrentRuntimeEndpointKey): RequestHandler {
  return CURRENT_RUNTIME_ENDPOINT_HANDLERS[key];
}
