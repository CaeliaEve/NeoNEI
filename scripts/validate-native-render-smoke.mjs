import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const gate = args.includes("--gate");
const selfTest = args.includes("--self-test");
const distDataDir = resolve(
  readArg("--dist-data")
    ?? process.env.DIST_DATA_DIR
    ?? (selfTest
      ? join(repoRoot, ".tmp-runtime", "dist-data-v3-self-test")
      : join(repoRoot, "backend", "public", "dist-data")),
);
const reportDir = join(repoRoot, ".runtime-logs");
const reportPath = join(reportDir, "native-render-smoke.json");

function readArg(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function readJson(relativePath) {
  const filePath = join(distDataDir, relativePath);
  if (!existsSync(filePath)) throw new Error(`Missing dist-data file: ${filePath}`);
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function stableNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalize(value) {
  return `${value ?? ""}`.trim().toLowerCase();
}

function sampleEntries(entries, limit = 20) {
  return entries.slice(0, limit).map((entry) => JSON.parse(JSON.stringify(entry)));
}

function captureSummary(capture) {
  if (!capture) return null;
  return {
    assetId: capture.assetId ?? null,
    variantKey: capture.variantKey ?? null,
    rendererFamily: capture.rendererFamily ?? null,
    renderMode: capture.renderMode ?? null,
    animationMode: capture.animationMode ?? null,
    captureMethod: capture.captureMethod ?? null,
    primaryArtifact: capture.primaryArtifact ?? null,
    framePattern: capture.framePattern ?? null,
    frameCount: stableNumber(capture.frameCount, 0),
    frames: Array.isArray(capture.frames) ? capture.frames.length : 0,
    timeline: Array.isArray(capture.timeline) ? capture.timeline.length : 0,
  };
}

function captureForItem(renderIndex, itemId) {
  const assetId = `nesqlpp:item/${itemId}`;
  return renderIndex.capturesByAssetId?.[assetId] ?? renderIndex.capturesByVariantKey?.[itemId] ?? null;
}

function hasUsableTimeline(entry) {
  if (Array.isArray(entry?.timeline) && entry.timeline.length > 0) return true;
  return stableNumber(entry?.frameCount, 1) <= 1 || stableNumber(entry?.defaultFrameTimeTicks, 0) > 0;
}

const failures = [];
const warnings = [];
const samples = {};
const manifest = readJson("manifest.json");
const nativeRenderPath = manifest.files?.nativeRenderIndex;
if (!nativeRenderPath) {
  failures.push("manifest.files.nativeRenderIndex is missing");
}

let renderIndex = null;
if (nativeRenderPath) {
  renderIndex = readJson(nativeRenderPath);
}

if (renderIndex) {
  if (renderIndex.schemaVersion !== "neonei/native-render-index/v1") {
    failures.push(`unexpected native render schema: ${renderIndex.schemaVersion ?? "unknown"}`);
  }
  if (normalize(renderIndex.backend?.backend) !== "angelica" || renderIndex.backend?.angelicaPresent !== true) {
    failures.push("native render backend is not confirmed as Angelica");
  }
  if (renderIndex.validation?.status !== "ready") {
    failures.push(`native render validation is not ready: ${renderIndex.validation?.summary ?? "no summary"}`);
  }
  if (stableNumber(renderIndex.counts?.textureSprites, 0) <= 0) {
    failures.push("native render index has no texture sprite facts");
  }
  if (stableNumber(renderIndex.counts?.itemRenderers, 0) <= 0) {
    failures.push("native render index has no item renderer facts");
  }

  const animatedSprites = Object.values(renderIndex.spriteByIconName ?? {})
    .filter((entry) => entry?.animated || stableNumber(entry?.frameCount, 1) > 1);
  const animatedWithoutTiming = animatedSprites.filter((entry) => !hasUsableTimeline(entry));
  if (animatedSprites.length <= 0) {
    warnings.push("native render index has no animated sprite facts in this dataset");
  }
  if (animatedWithoutTiming.length > 0) {
    failures.push(`${animatedWithoutTiming.length} animated sprite fact(s) are missing native timing`);
  }

  const shaderItems = Object.entries(renderIndex.shaderByItemId ?? {});
  const captureRequired = shaderItems.filter(([, entry]) => entry?.captureRequired);
  const missingCaptures = captureRequired
    .map(([itemId, shader]) => ({ itemId, shader, capture: captureForItem(renderIndex, itemId) }))
    .filter((entry) => !entry.capture);
  const capturesWithoutFrames = captureRequired
    .map(([itemId, shader]) => ({ itemId, shader, capture: captureForItem(renderIndex, itemId) }))
    .filter((entry) => entry.capture && (!Array.isArray(entry.capture.frames) || entry.capture.frames.length <= 0));
  const capturesWithoutTimeline = captureRequired
    .map(([itemId, shader]) => ({ itemId, shader, capture: captureForItem(renderIndex, itemId) }))
    .filter((entry) => entry.capture && stableNumber(entry.capture.frameCount, 0) > 1 && (!Array.isArray(entry.capture.timeline) || entry.capture.timeline.length <= 0));

  if (captureRequired.length <= 0) {
    warnings.push("native render index has no shader/special item requiring framebuffer capture in this dataset");
  }
  if (missingCaptures.length > 0) {
    failures.push(`${missingCaptures.length} shader/special item(s) require capture but have no capture record`);
  }
  if (capturesWithoutFrames.length > 0) {
    failures.push(`${capturesWithoutFrames.length} shader/special capture(s) have no frame records`);
  }
  if (capturesWithoutTimeline.length > 0) {
    failures.push(`${capturesWithoutTimeline.length} multi-frame shader/special capture(s) have no timeline`);
  }
  if (missingCaptures.length > 0) {
    samples.missingCaptures = sampleEntries(missingCaptures.map(({ itemId, shader }) => ({
      itemId,
      expectedAssetId: `nesqlpp:item/${itemId}`,
      rendererKind: shader?.rendererKind ?? null,
      rendererClass: shader?.rendererClass ?? null,
      shaderFamily: shader?.shaderFamily ?? null,
      preferredExport: shader?.preferredExport ?? null,
    })));
  }
  if (capturesWithoutFrames.length > 0) {
    samples.capturesWithoutFrames = sampleEntries(capturesWithoutFrames.map(({ itemId, shader, capture }) => ({
      itemId,
      rendererKind: shader?.rendererKind ?? null,
      shaderFamily: shader?.shaderFamily ?? null,
      capture: captureSummary(capture),
    })));
  }
  if (capturesWithoutTimeline.length > 0) {
    samples.capturesWithoutTimeline = sampleEntries(capturesWithoutTimeline.map(({ itemId, shader, capture }) => ({
      itemId,
      rendererKind: shader?.rendererKind ?? null,
      shaderFamily: shader?.shaderFamily ?? null,
      capture: captureSummary(capture),
    })));
  }

  const knownKeywords = ["avaritia", "singularity", "infinity", "thaum", "gregtech", "fluid"];
  const knownCoverage = Object.fromEntries(knownKeywords.map((keyword) => [keyword, {
    rendererItems: shaderItems.filter(([itemId, entry]) => normalize(itemId).includes(keyword) || normalize(entry?.rendererKind).includes(keyword) || normalize(entry?.shaderFamily).includes(keyword)).length,
    sprites: Object.values(renderIndex.spriteByIconName ?? {}).filter((entry) => normalize(entry?.iconName).includes(keyword) || normalize(entry?.spriteKey).includes(keyword)).length,
  }]));

  for (const [keyword, coverage] of Object.entries(knownCoverage)) {
    if (coverage.rendererItems + coverage.sprites <= 0) {
      warnings.push(`known render smoke keyword '${keyword}' has no matching native render fact in this dataset`);
    }
  }

  var totals = {
    textureSprites: stableNumber(renderIndex.counts?.textureSprites, 0),
    itemRenderers: stableNumber(renderIndex.counts?.itemRenderers, 0),
    shaderItems: stableNumber(renderIndex.counts?.shaderItems, 0),
    framebufferCaptures: stableNumber(renderIndex.counts?.framebufferCaptures, 0),
    animatedSprites: animatedSprites.length,
    captureRequired: captureRequired.length,
    capturesByAssetId: Object.keys(renderIndex.capturesByAssetId ?? {}).length,
    capturesByVariantKey: Object.keys(renderIndex.capturesByVariantKey ?? {}).length,
  };
}

const report = {
  schemaVersion: "neonei/native-render-smoke/v1",
  generatedAt: new Date().toISOString(),
  distDataDir,
  nativeRenderPath: nativeRenderPath ?? null,
  totals: totals ?? null,
  failures,
  warnings,
  samples,
};

mkdirSync(reportDir, { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
console.log(`Wrote ${reportPath}`);
if (gate && failures.length > 0) process.exit(1);
