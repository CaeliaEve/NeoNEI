import type { NativeSurfaceId, NativeSurfaceMetrics } from "./contracts";
import { getNativeSurfaceEngineMetrics } from "./NativeSurfaceEngineClient";
import { getNativeRenderWorkerMetrics } from "./NativeRenderWorkerClient";
import { createNativeRuntimeControlState, toNativeRuntimeMetricsPatch } from "./NativeRuntimeControlPlane";
import {
  clearNativeSurfaceFaultControlState,
  createNativeSurfaceFaultControlState,
  markNativeSurfaceFault,
  toNativeSurfaceFaultMetricsPatch,
  type NativeSurfaceFaultInput,
  type NativeSurfaceFaultControlState,
} from "./NativeSurfaceFaultControlPlane";

export const NATIVE_SURFACE_METRICS_REGISTRY_MODULE = Object.freeze({
  id: "nativeSurface.metricsRegistry",
  schema: "neonei/native-surface-metrics-registry/current",
  statePolicy: "single-owner-map-registry",
  snapshotPolicy: "copy-on-write-metrics-snapshot",
  faultBridgePolicy: "fault-control-state-to-metrics-patch",
  debugSurfacePolicy: "explicit-debugfs-window-exports",
  debugGlobals: Object.freeze([
    "__NEONEI_NATIVE_SURFACE_METRICS__",
    "__NEONEI_NATIVE_SURFACE_ENGINE_METRICS__",
    "__NEONEI_NATIVE_RENDER_METRICS__",
  ] as const),
} as const);

const metricsBySurface = new Map<NativeSurfaceId, NativeSurfaceMetrics>();
const faultBySurface = new Map<NativeSurfaceId, NativeSurfaceFaultControlState>();

function getNativeSurfaceFaultState(surfaceId: NativeSurfaceId): NativeSurfaceFaultControlState {
  const current = faultBySurface.get(surfaceId);
  if (current) return current;
  const initial = createNativeSurfaceFaultControlState();
  faultBySurface.set(surfaceId, initial);
  return initial;
}

export function createNativeSurfaceMetrics(surfaceId: NativeSurfaceId): NativeSurfaceMetrics {
  const nativeRuntime = createNativeRuntimeControlState();
  const nativeSurfaceFault = getNativeSurfaceFaultState(surfaceId);
  return {
    surfaceId,
    initialized: false,
    renderer: "webgl2",
    entries: 0,
    itemSize: 0,
    viewportWidth: 0,
    viewportHeight: 0,
    animationEnabled: false,
    historyViewportEnabled: false,
    ...toNativeRuntimeMetricsPatch(nativeRuntime),
    ...toNativeSurfaceFaultMetricsPatch(nativeSurfaceFault),
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

export function recordNativeSurfaceFault(
  surfaceId: NativeSurfaceId,
  fault: NativeSurfaceFaultInput,
): NativeSurfaceMetrics {
  const state = markNativeSurfaceFault(getNativeSurfaceFaultState(surfaceId), fault);
  faultBySurface.set(surfaceId, state);
  return updateNativeSurfaceMetrics(
    surfaceId,
    toNativeSurfaceFaultMetricsPatch(state),
    `${fault.domain}:${fault.phase}:fault`,
  );
}

export function clearNativeSurfaceFault(
  surfaceId: NativeSurfaceId,
  eventName = "nativeSurfaceFault:clear",
): NativeSurfaceMetrics {
  const state = clearNativeSurfaceFaultControlState(getNativeSurfaceFaultState(surfaceId));
  faultBySurface.set(surfaceId, state);
  return updateNativeSurfaceMetrics(surfaceId, toNativeSurfaceFaultMetricsPatch(state), eventName);
}

export function resetNativeSurfaceMetrics(surfaceId?: NativeSurfaceId): void {
  if (surfaceId) {
    metricsBySurface.delete(surfaceId);
    faultBySurface.delete(surfaceId);
    return;
  }
  metricsBySurface.clear();
  faultBySurface.clear();
}

export function exposeNativeSurfaceMetricsForDebug(): void {
  if (typeof window === "undefined") return;
  const target = window as typeof window & {
    __NEONEI_NATIVE_SURFACE_METRICS__?: () => NativeSurfaceMetrics[];
    __NEONEI_NATIVE_SURFACE_ENGINE_METRICS__?: typeof getNativeSurfaceEngineMetrics;
    __NEONEI_NATIVE_RENDER_METRICS__?: typeof getNativeRenderWorkerMetrics;
  };
  target.__NEONEI_NATIVE_SURFACE_METRICS__ = getAllNativeSurfaceMetrics;
  target.__NEONEI_NATIVE_SURFACE_ENGINE_METRICS__ = getNativeSurfaceEngineMetrics;
  target.__NEONEI_NATIVE_RENDER_METRICS__ = getNativeRenderWorkerMetrics;
}
