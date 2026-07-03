import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const protocolPath = new URL("../src/native-surface/NativeSurfaceRenderProtocol.ts", import.meta.url);
const catalogPath = new URL("../src/workers/nativeRenderFrameMetricsCatalog.ts", import.meta.url);
const workerPath = new URL("../src/workers/nativeRender.worker.ts", import.meta.url);

const protocol = readFileSync(protocolPath, "utf8");
const catalog = readFileSync(catalogPath, "utf8");
const worker = readFileSync(workerPath, "utf8");

function extractFrameMetricKeys() {
  const match = protocol.match(/export type NativeRendererFrameMetrics = \{([\s\S]*?)\n\};/);
  assert.ok(match, "NativeRendererFrameMetrics type must exist");
  return [...match[1].matchAll(/^\s{2}([A-Za-z]\w*):/gm)].map((entry) => entry[1]);
}

function extractCatalogMetricKeys() {
  return [...catalog.matchAll(/^\s{4}([A-Za-z]\w*): defineNativeRenderFrameMetric/gm)]
    .map((entry) => entry[1]);
}

test("native render frame metrics ABI is descriptor-owned and protocol-complete", () => {
  assert.match(catalog, /NATIVE_RENDER_FRAME_METRICS_CATALOG/);
  assert.match(catalog, /schema: "neonei\/native-render-frame-metrics\/current"/);
  assert.match(catalog, /buildPolicy: "descriptor-table-frame-metrics-projection"/);
  assert.match(catalog, /failurePolicy: "fail-closed-render-metric-abi"/);
  assert.match(catalog, /type NativeRenderFrameMetricDescriptorMap = \{/);
  assert.match(catalog, /Object\.keys\(NATIVE_RENDER_FRAME_METRIC_DESCRIPTOR_MAP\)/);
  assert.match(catalog, /for \(const key of NATIVE_RENDER_FRAME_METRIC_FIELD_ORDER\)/);
  assert.deepEqual(
    extractCatalogMetricKeys().sort(),
    extractFrameMetricKeys().sort(),
    "Every NativeRendererFrameMetrics field must be backed by exactly one catalog descriptor",
  );
});

test("native render worker delegates frame metrics projection to the catalog", () => {
  assert.match(worker, /from "\.\/nativeRenderFrameMetricsCatalog"/);
  assert.match(worker, /return buildNativeRenderFrameMetrics\(\{/);
  assert.doesNotMatch(worker, /frameP95Ms: percentile\(frameSamples, 95\)/);
  assert.doesNotMatch(worker, /webgpuUsable: backend === "webgpu"/);
});
