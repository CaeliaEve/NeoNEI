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
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  const startedAt = Date.now();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForFunction(() => document.querySelectorAll("canvas").length > 0, null, { timeout: 15_000 });
  await page.waitForTimeout(500);

  const initial = await page.evaluate(() => ({
    title: document.title,
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
    await clickButtonByLabel(page, ["下一页", "▶", "›", ">"]);
    await page.waitForTimeout(16);
    flipDurations.push(performance.now() - start);
  }

  const settingsStart = performance.now();
  await clickButtonByLabel(page, ["打开设置", "设置"]);
  await page.waitForTimeout(350);
  const settingsOpenMs = performance.now() - settingsStart;
  const settingsCanvasCount = await page.evaluate(() => document.querySelectorAll("canvas").length);
  await clickButtonByLabel(page, ["关闭", "Close", "×"]);
  await page.waitForTimeout(150);

  const searchMs = await page.evaluate(async () => {
    const input = document.querySelector("input[type='text'], input:not([type])");
    if (!input) return null;
    const start = performance.now();
    input.value = "铁锭";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 350));
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return performance.now() - start;
  });
  await page.waitForTimeout(350);

  const final = await page.evaluate(() => ({
    pageText: document.body.innerText.match(/\d+\s*\/\s*\d+/)?.[0] ?? null,
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
  };

  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`[native-surface-baseline] wrote ${outputPath}`);
  console.log(JSON.stringify({
    pageFlips,
    flipAvgMs: Math.round(report.interactions.flipMs.avg),
    flipP95Ms: Math.round(report.interactions.flipMs.p95),
    settingsOpenMs: Math.round(settingsOpenMs),
    nativeRuntimeReady: Boolean(report.final.nativeEngineMetrics?.runtimeReady),
    nativeRenderFrames: report.final.nativeRenderMetrics?.frames ?? 0,
    errors: errors.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(`[native-surface-baseline] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});



