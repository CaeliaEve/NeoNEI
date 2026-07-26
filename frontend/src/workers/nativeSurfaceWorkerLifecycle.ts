import type { NativeSurfaceId } from "../native-surface/contracts";
import type { NativeSurfaceEngineRequest } from "../native-surface/NativeSurfaceEngineProtocol";
import type { SurfaceState } from "./nativeSurfaceWorkerState";

type NativeSurfaceClosable = {
  close(reason: string): void;
};

export type DestroyNativeSurfaceOptions<Connection extends NativeSurfaceClosable> = Readonly<{
  surfaceId: NativeSurfaceId;
  surfaces: Map<NativeSurfaceId, SurfaceState>;
  renderConnections: Map<NativeSurfaceId, Connection>;
  disposeWasmPayloads: (surface: SurfaceState) => void;
  reason: string;
}>;

export function admitNativeSurfaceRequest(
  destroyedSurfaceIds: Set<NativeSurfaceId>,
  surfaceId: NativeSurfaceId,
  requestType: NativeSurfaceEngineRequest["type"],
): void {
  if (requestType === "destroy") {
    destroyedSurfaceIds.add(surfaceId);
    return;
  }
  if (requestType === "initialize") {
    return;
  }
  if (requestType !== "disconnectRenderPort" && destroyedSurfaceIds.has(surfaceId)) {
    throw new Error(`Native surface is destroyed: ${surfaceId}`);
  }
}

export function completeNativeSurfaceInitialize(
  destroyedSurfaceIds: Set<NativeSurfaceId>,
  surfaces: Map<NativeSurfaceId, SurfaceState>,
  surfaceId: NativeSurfaceId,
  initializedSurface: SurfaceState,
): boolean {
  if (surfaces.get(surfaceId) !== initializedSurface) return false;
  destroyedSurfaceIds.delete(surfaceId);
  return true;
}

export function releaseNativeSurfaceState(
  surface: SurfaceState,
  disposeWasmPayloads: (surface: SurfaceState) => void,
): void {
  try {
    disposeWasmPayloads(surface);
  } finally {
    surface.runtimePacks.clear();
    surface.runtimeBrowserIndexByItemId.clear();
    surface.groupByKey.clear();
    surface.searchByItemId.clear();
    surface.stringByItemId.clear();
    surface.textureByItemId.clear();
    surface.animationByItemId.clear();

    surface.initialized = false;
    surface.viewport = null;
    surface.expandedGroups = [];
    surface.historyItems = [];
    surface.layoutCommands = [];
    surface.lastHit = null;
    surface.selectedItemId = null;
    surface.runtimeManifestUrl = null;
    surface.runtimeError = null;
    surface.browserPack = null;
    surface.runtimeProjectionCacheKey = null;
    surface.runtimeProjectionIndices = null;
    surface.runtimeVisibleCacheKey = null;
    surface.runtimeVisibleEntries = null;
    surface.currentPageSize = 0;
    surface.currentWindowEntries = 0;
    surface.lastProjectionMs = 0;
    surface.lastProjectionTotalEntries = 0;
    surface.lastProjectionQuery = "";
    surface.lastProjectionSource = "empty";
    surface.hasAnimatedSprites = false;
    surface.animatedSpriteCount = 0;
    surface.spriteCommandCount = 0;
    surface.missingSpriteCount = 0;
    surface.missingSpriteItemIds = [];
    surface.nextFrameDelayMs = null;
  }
}

export function destroyNativeSurface<Connection extends NativeSurfaceClosable>(
  options: DestroyNativeSurfaceOptions<Connection>,
): boolean {
  let firstError: unknown = null;
  const connection = options.renderConnections.get(options.surfaceId);
  if (connection) {
    try {
      connection.close(options.reason);
    } catch (error) {
      firstError = error;
    } finally {
      options.renderConnections.delete(options.surfaceId);
    }
  }

  const surface = options.surfaces.get(options.surfaceId);
  if (!surface) {
    if (firstError) throw firstError;
    return false;
  }

  try {
    releaseNativeSurfaceState(surface, options.disposeWasmPayloads);
  } catch (error) {
    firstError ??= error;
  } finally {
    options.surfaces.delete(options.surfaceId);
  }
  if (firstError) throw firstError;
  return true;
}
