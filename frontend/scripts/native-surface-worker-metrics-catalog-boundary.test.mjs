import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const protocolPath = new URL("../src/native-surface/NativeSurfaceEngineProtocol.ts", import.meta.url);
const catalogPath = new URL("../src/workers/nativeSurfaceWorkerMetricsCatalog.ts", import.meta.url);
const retiredMetricsPath = new URL("../src/workers/nativeSurfaceMetrics.ts", import.meta.url);
const engineWorkerPath = new URL("../src/workers/nativeSurfaceEngine.worker.ts", import.meta.url);
const workerStatePath = new URL("../src/workers/nativeSurfaceWorkerState.ts", import.meta.url);

const protocol = readFileSync(protocolPath, "utf8");
const catalog = readFileSync(catalogPath, "utf8");
const engineWorker = readFileSync(engineWorkerPath, "utf8");
const workerState = readFileSync(workerStatePath, "utf8");

function extractWorkerMetricKeys() {
  const match = protocol.match(/export type NativeSurfaceEngineWorkerMetrics = \{([\s\S]*?)\n\};/);
  assert.ok(match, "NativeSurfaceEngineWorkerMetrics type must exist");
  return [...match[1].matchAll(/^\s{2}([A-Za-z]\w*):/gm)].map((entry) => entry[1]);
}

function extractCatalogMetricKeys() {
  return [...catalog.matchAll(/^\s{4}([A-Za-z]\w*): defineNativeSurfaceWorkerMetric/gm)]
    .map((entry) => entry[1]);
}

test("native surface worker metrics ABI is descriptor-owned and protocol-complete", () => {
  assert.match(catalog, /NATIVE_SURFACE_WORKER_METRICS_CATALOG/);
  assert.match(catalog, /schema: "neonei\/native-surface-worker-metrics\/current"/);
  assert.match(catalog, /buildPolicy: "descriptor-table-metrics-projection"/);
  assert.match(catalog, /failurePolicy: "fail-closed-metric-abi"/);
  assert.match(catalog, /type NativeSurfaceWorkerMetricDescriptorMap = \{/);
  assert.match(catalog, /Object\.keys\(NATIVE_SURFACE_WORKER_METRIC_DESCRIPTOR_MAP\)/);
  assert.match(catalog, /for \(const key of NATIVE_SURFACE_WORKER_METRIC_FIELD_ORDER\)/);

  assert.deepEqual(
    extractCatalogMetricKeys().sort(),
    extractWorkerMetricKeys().sort(),
    "Every NativeSurfaceEngineWorkerMetrics field must be backed by exactly one catalog descriptor",
  );
});

test("native surface worker projection source policy is catalog-owned", () => {
  assert.match(catalog, /NATIVE_SURFACE_WORKER_PROJECTION_SOURCE_POLICY/);
  assert.match(catalog, /schema: "neonei\/native-surface-worker-projection-source\/current"/);
  assert.match(catalog, /selectionPolicy: "first-matching-descriptor"/);
  assert.match(catalog, /terminalPolicy: "empty-descriptor-terminal"/);
  assert.match(catalog, /id: "runtime-history-pack"/);
  assert.match(catalog, /id: "runtime-browser-pack"/);
  assert.match(catalog, /id: "empty"/);
  assert.match(catalog, /selectNativeSurfaceWorkerProjectionSource/);
});

test("native surface worker callers depend on the worker metrics catalog, not retired metrics module", () => {
  assert.equal(existsSync(retiredMetricsPath), false);
  assert.match(engineWorker, /from "\.\/nativeSurfaceWorkerMetricsCatalog"/);
  assert.match(workerState, /from '\.\/nativeSurfaceWorkerMetricsCatalog'/);
  assert.doesNotMatch(engineWorker, /from "\.\/nativeSurfaceMetrics"/);
  assert.doesNotMatch(workerState, /from '\.\/nativeSurfaceMetrics'/);
});
