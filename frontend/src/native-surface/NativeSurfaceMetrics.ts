import type { NativeSurfaceId, NativeSurfaceMetrics } from "./contracts";

const metricsBySurface = new Map<NativeSurfaceId, NativeSurfaceMetrics>();

export function createNativeSurfaceMetrics(surfaceId: NativeSurfaceId): NativeSurfaceMetrics {
  return {
    surfaceId,
    initialized: false,
    renderer: "compat-canvas",
    entries: 0,
    itemSize: 0,
    viewportWidth: 0,
    viewportHeight: 0,
    animationEnabled: false,
    historyViewportEnabled: false,
    lastEvent: null,
    eventCount: 0,
    updatedAt: performance.now(),
  };
}

export function updateNativeSurfaceMetrics(
  surfaceId: NativeSurfaceId,
  patch: Partial<NativeSurfaceMetrics>,
  eventName: string,
): NativeSurfaceMetrics {
  const current = metricsBySurface.get(surfaceId) ?? createNativeSurfaceMetrics(surfaceId);
  const next: NativeSurfaceMetrics = {
    ...current,
    ...patch,
    surfaceId,
    lastEvent: eventName,
    eventCount: current.eventCount + 1,
    updatedAt: performance.now(),
  };
  metricsBySurface.set(surfaceId, next);
  return next;
}

export function getNativeSurfaceMetrics(surfaceId: NativeSurfaceId): NativeSurfaceMetrics {
  return metricsBySurface.get(surfaceId) ?? createNativeSurfaceMetrics(surfaceId);
}

export function getAllNativeSurfaceMetrics(): NativeSurfaceMetrics[] {
  return Array.from(metricsBySurface.values());
}

export function resetNativeSurfaceMetrics(surfaceId?: NativeSurfaceId): void {
  if (surfaceId) {
    metricsBySurface.delete(surfaceId);
    return;
  }
  metricsBySurface.clear();
}

export function exposeNativeSurfaceMetricsForDebug(): void {
  if (typeof window === "undefined") return;
  const target = window as typeof window & {
    __NEONEI_NATIVE_SURFACE_METRICS__?: () => NativeSurfaceMetrics[];
  };
  target.__NEONEI_NATIVE_SURFACE_METRICS__ = getAllNativeSurfaceMetrics;
}

