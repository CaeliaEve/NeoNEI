import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const publishRoot = join(repoRoot, "backend", "data", "publish");
const reportDir = join(repoRoot, ".runtime-logs");
const reportPath = join(reportDir, "recipe-v3-benchmark.json");
const gate = process.argv.includes("--gate");
const limits = {
  p50Ms: Number(process.env.RECIPE_V3_MAX_P50_MS ?? 12),
  p95Ms: Number(process.env.RECIPE_V3_MAX_P95_MS ?? 40),
};

function toLocalPublishPath(publicPath) {
  const normalized = `${publicPath ?? ""}`.trim().replace(/\\/g, "/");
  const marker = "/publish/";
  const markerIndex = normalized.indexOf(marker);
  if (markerIndex < 0) return null;
  return join(publishRoot, ...normalized.slice(markerIndex + marker.length).split("/").filter(Boolean));
}

function findLatestManifest() {
  if (!existsSync(publishRoot)) {
    throw new Error(`Publish root not found: ${publishRoot}`);
  }
  const manifests = readdirSync(publishRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const manifestPath = join(publishRoot, entry.name, "manifest.json");
      if (!existsSync(manifestPath)) return null;
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      const recipeBootstrapItems = Array.isArray(manifest.files?.recipeBootstrapItems)
        ? manifest.files.recipeBootstrapItems.length
        : 0;
      return {
        sourceSignature: entry.name,
        manifestPath,
        recipeBootstrapItems,
        mtimeMs: statSync(manifestPath).mtimeMs,
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.mtimeMs - left.mtimeMs);
  if (!manifests.length) {
    throw new Error(`No publish manifests found in ${publishRoot}`);
  }
  return manifests.find((entry) => entry.recipeBootstrapItems > 0) ?? manifests[0];
}

function percentile(values, pct) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((pct / 100) * sorted.length) - 1));
  return sorted[index];
}

const latest = findLatestManifest();
const manifest = JSON.parse(readFileSync(latest.manifestPath, "utf8"));
const itemIds = Array.isArray(manifest.files?.recipeBootstrapItems)
  ? manifest.files.recipeBootstrapItems.slice(0, Number(process.env.RECIPE_V3_SAMPLE_SIZE ?? 128))
  : [];
const basePath = `${manifest.files?.recipeBootstrapBasePath ?? ""}`.trim();
const timings = [];
const missing = [];

for (const itemId of itemIds) {
  const encoded = encodeURIComponent(itemId).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  const payloadPath = toLocalPublishPath(`${basePath}/${encoded}.json`);
  if (!payloadPath || !existsSync(payloadPath)) {
    missing.push(itemId);
    continue;
  }
  const startedAt = performance.now();
  const payload = JSON.parse(readFileSync(payloadPath, "utf8"));
  if (!payload?.item?.itemId && !payload?.itemId) {
    missing.push(itemId);
    continue;
  }
  timings.push(performance.now() - startedAt);
}

const report = {
  sourceSignature: latest.sourceSignature,
  sampled: itemIds.length,
  measured: timings.length,
  missing: missing.slice(0, 50),
  p50Ms: percentile(timings, 50),
  p95Ms: percentile(timings, 95),
  maxMs: timings.length ? Math.max(...timings) : 0,
  avgMs: timings.length ? timings.reduce((sum, value) => sum + value, 0) / timings.length : 0,
  limits,
  failures: [],
};

if (report.measured === 0) {
  report.failures.push("No recipe bootstrap payloads were measured.");
}
if (gate && report.p50Ms > limits.p50Ms) {
  report.failures.push(`p50 ${report.p50Ms.toFixed(2)}ms exceeded ${limits.p50Ms}ms`);
}
if (gate && report.p95Ms > limits.p95Ms) {
  report.failures.push(`p95 ${report.p95Ms.toFixed(2)}ms exceeded ${limits.p95Ms}ms`);
}

mkdirSync(reportDir, { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
console.log(`Wrote ${reportPath}`);
if (report.failures.length > 0) {
  process.exit(1);
}
