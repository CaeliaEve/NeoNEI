import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const distDataDir = resolve(process.env.DIST_DATA_V3_DIR || join(repoRoot, ".tmp-runtime", "dist-data-v3-self-test"));
const reportDir = join(repoRoot, ".runtime-logs");
const reportPath = join(reportDir, "browser-atlas-v3-benchmark.json");
const gate = process.argv.includes("--gate");
const minCoverage = Number(process.env.BROWSER_ATLAS_V3_MIN_COVERAGE ?? 1);

function readJson(relativePath) {
  const filePath = join(distDataDir, relativePath);
  if (!existsSync(filePath)) {
    throw new Error(`Missing dist-data file: ${filePath}`);
  }
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function normalizeFile(value) {
  return `${value ?? ""}`.trim().replace(/\\/g, "/").replace(/^\/+/, "");
}

const manifest = readJson("manifest.json");
const files = manifest.files ?? {};
const catalog = readJson(files.browserCatalog ?? "browser/item-catalog.json");
const atlasIndex = readJson(files.browserAtlasIndex ?? "textures/browser-atlas-index.json");
const animationTable = readJson(files.animationTable ?? "textures/animation-table.json");

const itemIds = (catalog.items ?? [])
  .map((item) => `${item?.itemId ?? ""}`.trim())
  .filter(Boolean);
const atlasEntries = new Map();
for (const entry of atlasIndex.items ?? []) {
  if (entry?.itemId) atlasEntries.set(entry.itemId, entry);
}
const animationItems = new Set((animationTable.items ?? []).map((entry) => entry?.itemId).filter(Boolean));

const missingAtlas = [];
const animatedMissingTable = [];
const atlasFiles = new Set();
let drawableCount = 0;
let staticCount = 0;
let animatedCount = 0;
for (const itemId of itemIds) {
  const entry = atlasEntries.get(itemId);
  const staticFile = normalizeFile(entry?.staticAtlas?.atlasFile);
  const animatedFile = normalizeFile(entry?.animatedAtlas?.atlasFile);
  if (!staticFile && !animatedFile) {
    missingAtlas.push(itemId);
    continue;
  }
  drawableCount += 1;
  if (staticFile) {
    staticCount += 1;
    atlasFiles.add(staticFile);
  }
  if (animatedFile) {
    animatedCount += 1;
    atlasFiles.add(animatedFile);
    if (!animationItems.has(itemId)) animatedMissingTable.push(itemId);
  }
}

const coverage = itemIds.length > 0 ? drawableCount / itemIds.length : 1;
const report = {
  distDataDir,
  source: manifest.source ?? null,
  sourceRepository: manifest.sourceRepository ?? null,
  itemCount: itemIds.length,
  atlasEntryCount: atlasEntries.size,
  drawableCount,
  staticCount,
  animatedCount,
  atlasFileCount: atlasFiles.size,
  coverage,
  missingAtlas: missingAtlas.slice(0, 100),
  animatedMissingTable: animatedMissingTable.slice(0, 100),
  limits: { minCoverage },
  failures: [],
};

if (gate && coverage < minCoverage) {
  report.failures.push(`atlas coverage ${coverage.toFixed(6)} below ${minCoverage}`);
}
if (gate && animatedMissingTable.length > 0) {
  report.failures.push(`animation table missing ${animatedMissingTable.length} animated item(s)`);
}

mkdirSync(reportDir, { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
console.log(`Wrote ${reportPath}`);
if (report.failures.length > 0) process.exit(1);
