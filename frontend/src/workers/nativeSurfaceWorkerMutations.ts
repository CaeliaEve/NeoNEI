import type { NativeSurfaceEngineMutation } from '../native-surface/NativeSurfaceEngineProtocol';
import type { SurfaceState } from './nativeSurfaceWorkerState';

export function applyNativeSurfaceMutation(surface: SurfaceState, mutation: NativeSurfaceEngineMutation): boolean {
  switch (mutation.type) {
    case 'viewport':
      surface.viewport = mutation.viewport;
      return true;
    case 'page':
      surface.page = Math.max(1, Math.floor(Number(mutation.page) || 1));
      return true;
    case 'search': {
      const nextQuery = `${mutation.query ?? ''}`;
      if (surface.query !== nextQuery) {
        surface.query = nextQuery;
        surface.runtimeProjectionCacheKey = null;
      }
      return true;
    }
    case 'modFilter': {
      const nextModId = mutation.modId ? `${mutation.modId}` : null;
      if (surface.modId !== nextModId) {
        surface.modId = nextModId;
        surface.runtimeProjectionCacheKey = null;
      }
      return true;
    }
    case 'expandedGroups':
      surface.expandedGroups = Array.from(new Set(mutation.groupKeys));
      return true;
    case 'historyItems':
      surface.historyItems = Array.from(new Set(mutation.itemIds));
      return true;
    case 'itemSize':
      surface.itemSize = Math.max(1, Math.floor(Number(mutation.itemSize) || 1));
      return true;
    case 'selectedItem':
      surface.selectedItemId = mutation.itemId ? `${mutation.itemId}` : null;
      return true;
  }
}
