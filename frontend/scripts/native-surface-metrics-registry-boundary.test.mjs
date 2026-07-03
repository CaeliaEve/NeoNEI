import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const registryPath = new URL("../src/native-surface/NativeSurfaceMetricsRegistry.ts", import.meta.url);
const retiredFacadePath = new URL("../src/native-surface/NativeSurfaceMetrics.ts", import.meta.url);
const controllerPath = new URL("../src/native-surface/NativeSurfaceController.ts", import.meta.url);
const surfaceComponentPath = new URL("../src/components/native-surface/NativeBrowserSurface.vue", import.meta.url);

const registry = readFileSync(registryPath, "utf8");
const controller = readFileSync(controllerPath, "utf8");
const surfaceComponent = readFileSync(surfaceComponentPath, "utf8");

test("native surface metrics registry owns metrics state and debugfs surface", () => {
  assert.match(registry, /NATIVE_SURFACE_METRICS_REGISTRY_MODULE/);
  assert.match(registry, /schema: "neonei\/native-surface-metrics-registry\/current"/);
  assert.match(registry, /statePolicy: "single-owner-map-registry"/);
  assert.match(registry, /snapshotPolicy: "copy-on-write-metrics-snapshot"/);
  assert.match(registry, /faultBridgePolicy: "fault-control-state-to-metrics-patch"/);
  assert.match(registry, /debugSurfacePolicy: "explicit-debugfs-window-exports"/);
  assert.match(registry, /const metricsBySurface = new Map<NativeSurfaceId, NativeSurfaceMetrics>\(\)/);
  assert.match(registry, /const faultBySurface = new Map<NativeSurfaceId, NativeSurfaceFaultControlState>\(\)/);
  assert.match(registry, /target\.__NEONEI_NATIVE_SURFACE_METRICS__ = getAllNativeSurfaceMetrics/);
  assert.match(registry, /target\.__NEONEI_NATIVE_SURFACE_ENGINE_METRICS__ = getNativeSurfaceEngineMetrics/);
  assert.match(registry, /target\.__NEONEI_NATIVE_RENDER_METRICS__ = getNativeRenderWorkerMetrics/);
});

test("native surface callers depend on the metrics registry, not retired metrics facade", () => {
  assert.equal(existsSync(retiredFacadePath), false);
  assert.match(controller, /from "\.\/NativeSurfaceMetricsRegistry"/);
  assert.match(surfaceComponent, /from "\.\.\/\.\.\/native-surface\/NativeSurfaceMetricsRegistry"/);
  assert.doesNotMatch(controller, /from "\.\/NativeSurfaceMetrics"/);
  assert.doesNotMatch(surfaceComponent, /from "\.\.\/\.\.\/native-surface\/NativeSurfaceMetrics"/);
});
