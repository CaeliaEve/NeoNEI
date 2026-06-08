#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = resolve(import.meta.dirname, "..");
const playwrightModule = await import(
  pathToFileURL(resolve(repoRoot, "frontend", "node_modules", "@playwright", "test", "index.mjs")).href
);
const { chromium } = playwrightModule;

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i];
  if (!arg.startsWith("--")) continue;
  const [key, inlineValue] = arg.slice(2).split("=");
  const value = inlineValue ?? process.argv[i + 1];
  args.set(key, value);
  if (inlineValue === undefined && value && !value.startsWith("--")) i += 1;
}

const url = args.get("url") || "http://127.0.0.1:5173/";
const outDir = args.has("out-dir") ? resolve(args.get("out-dir")) : resolve(repoRoot, ".tmp-runtime");
const outputPath = args.has("output") ? resolve(args.get("output")) : join(outDir, "native-surface-baseline.json");
const pageFlips = Number(args.get("page-flips") || 30);
const gate = args.has("gate");
const requireWebgpu = args.has("require-webgpu");
const maxSettingsOpenMs = Number(args.get("max-settings-open-ms") || 250);
const maxFlipP95Ms = Number(args.get("max-flip-p95-ms") || 80);
const maxTextureErrors = Number(args.get("max-texture-errors") || 0);
const minTexturesLoaded = Number(args.get("min-textures-loaded") || 1);
const maxHotPathRequests = Number(args.get("max-hot-path-requests") || 0);
const maxLayoutRebuilds = Number(args.get("max-layout-rebuilds") || (pageFlips + 12));
const renderer = `${args.get("renderer") || ""}`.trim().toLowerCase();
const requestedRenderer = renderer === "webgpu" || renderer === "webgl2" || renderer === "auto" ? renderer : null;
const webgpuLaunchArgs = [
  "--enable-unsafe-webgpu",
  "--enable-features=Vulkan",
  "--ignore-gpu-blocklist",
  "--enable-gpu-rasterization",
];

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

async function clickButtonByLabel(page, labels) {
  const handle = await page.evaluateHandle((candidates) => {
    const buttons = Array.from(document.querySelectorAll("button"));
    return buttons.find((button) => {
      const text = `${button.textContent || ""} ${button.getAttribute("aria-label") || ""} ${button.getAttribute("title") || ""}`;
      return candidates.some((candidate) => text.includes(candidate));
    }) || null;
  }, labels);
  const element = handle.asElement();
  if (element) {
    await element.click();
    return true;
  }
  return false;
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const wantsWebgpuProbe = requireWebgpu || requestedRenderer === "webgpu" || requestedRenderer === "auto";
  let browser;
  try {
    browser = await chromium.launch({
      channel: wantsWebgpuProbe ? "chrome" : undefined,
      headless: true,
      args: webgpuLaunchArgs,
    });
  } catch {
    browser = await chromium.launch({
      headless: true,
      args: webgpuLaunchArgs,
    });
  }
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  if (requestedRenderer) {
    await page.addInitScript((value) => {
      window.localStorage.setItem("neonei:native-render-backend", value);
    }, requestedRenderer);
  }
  const errors = [];
  const hotPathRequests = [];
  page.on("request", (request) => {
    const requestUrl = request.url();
    if (/\/(?:api\/)?browser(?:-|\/)?page-pack|\/(?:api\/)?browser\/pages|pagePackByIds|getBrowserPagePack/i.test(requestUrl)) {
      hotPathRequests.push(requestUrl);
    }
  });
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  const startedAt = Date.now();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForFunction(() => document.querySelectorAll("canvas").length > 0, null, { timeout: 15_000 });
  await page.waitForTimeout(500);
  await page.waitForFunction(
    () => {
      const render = globalThis.__NEONEI_NATIVE_RENDER_METRICS__?.();
      const engine = globalThis.__NEONEI_NATIVE_SURFACE_ENGINE_METRICS__?.();
      return Boolean((render?.frames ?? 0) > 0 && (engine?.layoutCommands ?? 0) > 0);
    },
    null,
    { timeout: 5_000 },
  ).catch(() => {});

  const initial = await page.evaluate(() => ({
    title: document.title,
    webgpuAvailable: Boolean(navigator.gpu),
    canvasCount: document.querySelectorAll("canvas").length,
    imgCount: document.querySelectorAll("img").length,
    bodyScrollDelta: Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
    nativeSurfaceMetrics: globalThis.__NEONEI_NATIVE_SURFACE_METRICS__?.() ?? [],
    nativeEngineMetrics: globalThis.__NEONEI_NATIVE_SURFACE_ENGINE_METRICS__?.() ?? null,
    nativeRenderMetrics: globalThis.__NEONEI_NATIVE_RENDER_METRICS__?.() ?? null,
  }));

  const flipDurations = [];
  for (let i = 0; i < pageFlips; i += 1) {
    const start = performance.now();
    await clickButtonByLabel(page, ["\u4e0b\u4e00\u9875", "Next", ">"]);
    await page.waitForTimeout(16);
    flipDurations.push(performance.now() - start);
  }

  const settingsOpenMs = await page.evaluate(async () => {
    const button = document.querySelector('button[data-native-benchmark="settings-open"]');
    const overlay = document.querySelector('[data-native-benchmark="settings-overlay"]');
    if (!(button instanceof HTMLButtonElement) || !(overlay instanceof HTMLElement)) return Number.POSITIVE_INFINITY;
    const start = performance.now();
    button.click();
    while (performance.now() - start < 3000) {
      if (getComputedStyle(overlay).display !== "none") return performance.now() - start;
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return performance.now() - start;
  });
  const settingsCanvasCount = await page.evaluate(() => document.querySelectorAll("canvas").length);
  await page.evaluate(() => {
    const button = document.querySelector('button[data-native-benchmark="settings-close"]');
    if (button instanceof HTMLButtonElement) button.click();
  });
  await page.waitForTimeout(150);

  const searchMs = await page.evaluate(async () => {
    const input = document.querySelector("input[type='text'], input:not([type])");
    if (!input) return null;
    const start = performance.now();
    input.value = "\u94c1\u952d";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 350));
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return performance.now() - start;
  });
  await page.waitForTimeout(350);

  const final = await page.evaluate(() => ({
    pageText: document.body.innerText.match(/\d+\s*\/\s*\d+/)?.[0] ?? null,
    webgpuAvailable: Boolean(navigator.gpu),
    canvasCount: document.querySelectorAll("canvas").length,
    imgCount: document.querySelectorAll("img").length,
    nativeSurfaceMetrics: globalThis.__NEONEI_NATIVE_SURFACE_METRICS__?.() ?? [],
    nativeEngineMetrics: globalThis.__NEONEI_NATIVE_SURFACE_ENGINE_METRICS__?.() ?? null,
    nativeRenderMetrics: globalThis.__NEONEI_NATIVE_RENDER_METRICS__?.() ?? null,
  }));

  await browser.close();

  const report = {
    schemaVersion: "neonei/native-surface-baseline/current",
    url,
    requestedRenderer,
    generatedAt: new Date().toISOString(),
    elapsedMs: Date.now() - startedAt,
    initial,
    final,
    interactions: {
      pageFlips,
      flipMs: {
        min: Math.min(...flipDurations),
        max: Math.max(...flipDurations),
        avg: flipDurations.reduce((sum, value) => sum + value, 0) / Math.max(1, flipDurations.length),
        p95: percentile(flipDurations, 95),
      },
      settingsOpenMs,
      settingsCanvasCount,
      searchMs,
    },
    errors,
    hotPathRequests,
  };
  const gateFailures = [];
  if (errors.length > 0) {
    gateFailures.push(`${errors.length} console/page error(s) captured`);
  }
  if (hotPathRequests.length > maxHotPathRequests) {
    gateFailures.push(`${hotPathRequests.length} browser page-pack hot-path request(s) captured; max is ${maxHotPathRequests}`);
  }
  if (Number.isFinite(maxFlipP95Ms) && report.interactions.flipMs.p95 > maxFlipP95Ms) {
    gateFailures.push(`page flip p95 ${Math.round(report.interactions.flipMs.p95)}ms exceeds ${maxFlipP95Ms}ms`);
  }
  if ((final.canvasCount ?? 0) <= 0) {
    gateFailures.push("no canvas elements were found");
  }
  if (Number.isFinite(maxSettingsOpenMs) && settingsOpenMs > maxSettingsOpenMs) {
    gateFailures.push(`settings panel open time ${Math.round(settingsOpenMs)}ms exceeds ${maxSettingsOpenMs}ms`);
  }
  if (!final.nativeEngineMetrics) {
    gateFailures.push("native engine metrics are missing");
  } else {
    if (final.nativeEngineMetrics.wasmReady !== true) {
      gateFailures.push("native engine wasmReady is not true");
    }
    if ((final.nativeEngineMetrics.layoutCommands ?? 0) <= 0) {
      gateFailures.push("native engine did not produce layout commands");
    }
    if ((final.nativeEngineMetrics.layoutRebuilds ?? 0) > maxLayoutRebuilds) {
      gateFailures.push(`native engine rebuilt layout ${final.nativeEngineMetrics.layoutRebuilds} time(s); max is ${maxLayoutRebuilds}`);
    }
    if ((final.nativeEngineMetrics.frameRequests ?? 0) <= 0) {
      gateFailures.push("native engine did not receive frame requests");
    }
  }
  if (!final.nativeRenderMetrics) {
    gateFailures.push("native render metrics are missing");
  } else {
    if (requireWebgpu && final.nativeRenderMetrics.backend !== "webgpu") {
      gateFailures.push(
        `required webgpu backend did not initialize (actual: ${final.nativeRenderMetrics.backend ?? "none"}; reason: ${final.nativeRenderMetrics.backendFallbackReason ?? "unknown"})`,
      );
    }
    if (requestedRenderer === "webgpu" && final.nativeRenderMetrics.webgpuUsable === true && final.nativeRenderMetrics.backend !== "webgpu") {
      gateFailures.push(
        `explicit webgpu renderer did not initialize webgpu backend (actual: ${final.nativeRenderMetrics.backend ?? "none"}; reason: ${final.nativeRenderMetrics.backendFallbackReason ?? "unknown"})`,
      );
    }
    if (requestedRenderer === "webgl2" && final.nativeRenderMetrics.backend !== "webgl2") {
      gateFailures.push(`explicit webgl2 renderer did not initialize webgl2 backend (actual: ${final.nativeRenderMetrics.backend ?? "none"})`);
    }
    if ((final.nativeRenderMetrics.frames ?? 0) <= 0) {
      gateFailures.push("native render worker did not submit frames");
    }
    if ((final.nativeRenderMetrics.commandCount ?? 0) <= 0) {
      gateFailures.push("native render worker did not receive command buffers");
    }
    if ((final.nativeRenderMetrics.drawCalls ?? 0) <= 0) {
      gateFailures.push("native render worker did not issue draw calls");
    }
    if ((final.nativeRenderMetrics.textureErrors ?? 0) > maxTextureErrors) {
      gateFailures.push(`native render worker reported ${final.nativeRenderMetrics.textureErrors} texture error(s); max is ${maxTextureErrors}`);
    }
    if ((final.nativeRenderMetrics.textureLoaded ?? 0) < minTexturesLoaded) {
      gateFailures.push(`native render worker loaded ${final.nativeRenderMetrics.textureLoaded ?? 0} texture(s); minimum is ${minTexturesLoaded}`);
    }
    for (const metricName of ["lastParseMs", "lastSpriteNormalizeMs", "lastDrawMs", "frameAvgMs", "frameP95Ms", "frameMaxMs"]) {
      if (!Number.isFinite(Number(final.nativeRenderMetrics[metricName]))) {
        gateFailures.push(`native render metric ${metricName} is missing or non-finite`);
      }
    }
  }

  report.gate = {
    enabled: gate,
    status: gateFailures.length > 0 ? "failed" : "passed",
    failures: gateFailures,
  };

  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`[native-surface-baseline] wrote ${outputPath}`);
  console.log(JSON.stringify({
    pageFlips,
    requestedRenderer,
    requireWebgpu,
    nativeRenderBackend: report.final.nativeRenderMetrics?.backend ?? null,
    webgpuAvailable: Boolean(report.final.nativeRenderMetrics?.webgpuAvailable),
    webgpuUsable: Boolean(report.final.nativeRenderMetrics?.webgpuUsable),
    backendFallbackReason: report.final.nativeRenderMetrics?.backendFallbackReason ?? null,
    flipAvgMs: Math.round(report.interactions.flipMs.avg),
    flipP95Ms: Math.round(report.interactions.flipMs.p95),
    settingsOpenMs: Math.round(settingsOpenMs),
    nativeRuntimeReady: Boolean(report.final.nativeEngineMetrics?.runtimeReady),
    nativeLayoutRebuilds: report.final.nativeEngineMetrics?.layoutRebuilds ?? 0,
    nativeFrameRequests: report.final.nativeEngineMetrics?.frameRequests ?? 0,
    nativeRenderFrames: report.final.nativeRenderMetrics?.frames ?? 0,
    nativeRenderDrawCalls: report.final.nativeRenderMetrics?.drawCalls ?? 0,
    nativeRenderTextureLoaded: report.final.nativeRenderMetrics?.textureLoaded ?? 0,
    nativeRenderLastFrameMs: Math.round(report.final.nativeRenderMetrics?.lastFrameMs ?? 0),
    nativeRenderFrameP95Ms: Math.round(report.final.nativeRenderMetrics?.frameP95Ms ?? 0),
    nativeRenderLastDrawMs: Math.round(report.final.nativeRenderMetrics?.lastDrawMs ?? 0),
    errors: errors.length,
    hotPathRequests: hotPathRequests.length,
    maxFlipP95Ms,
    maxSettingsOpenMs,
    maxLayoutRebuilds,
    minTexturesLoaded,
    maxTextureErrors,
    gate: report.gate,
  }, null, 2));

  if (gate && gateFailures.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`[native-surface-baseline] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
