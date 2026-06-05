import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const distDataDir = resolve(process.env.DIST_DATA_V3_DIR || join(repoRoot, "backend", "public", "dist-data"));
const reportPath = join(distDataDir, "validation", "recipe-fragmentation.json");
const outputDir = join(repoRoot, ".runtime-logs");
const outputPath = join(outputDir, "recipe-fragmentation-gate.json");
const gate = process.argv.includes("--gate");

function readJson(path) {
  if (!existsSync(path)) {
    throw new Error(`Missing recipe fragmentation report: ${path}`);
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

function unique(values) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map((value) => `${value ?? ""}`.trim()).filter(Boolean)));
}

function normalize(value) {
  return `${value ?? ""}`.trim().toLowerCase().replace(/\s+/g, " ");
}

const coreCategoryNeedles = [
  "furnace",
  "smelting",
  "crafting",
  "workbench",
  "industrial slaughterhouse",
  "extreme entity crusher",
  "infernal drops",
  "工业屠宰场",
  "熔炉",
  "工作台",
  "合成",
];

function isCoreCategorySplit(entry) {
  const text = normalize([
    entry?.key,
    entry?.displayName,
    ...(unique(entry?.categoryIds)),
    ...(unique(entry?.sourceCategoryIds)),
  ].join(" "));
  return coreCategoryNeedles.some((needle) => text.includes(normalize(needle)));
}

const report = readJson(reportPath);
const suspiciousDisplaySplits = Array.isArray(report?.samples?.suspiciousDisplaySplits)
  ? report.samples.suspiciousDisplaySplits
  : [];
const suspiciousHandlerSplits = Array.isArray(report?.samples?.suspiciousHandlerSplits)
  ? report.samples.suspiciousHandlerSplits
  : [];

const trueDisplaySplits = suspiciousDisplaySplits
  .map((entry) => ({
    ...entry,
    categoryIds: unique(entry?.categoryIds),
    sourceCategoryIds: unique(entry?.sourceCategoryIds),
  }))
  .filter((entry) => entry.categoryIds.length > 1);
const trueHandlerSplits = suspiciousHandlerSplits
  .map((entry) => ({
    ...entry,
    displayNames: unique(entry?.displayNames),
    categoryIds: unique(entry?.categoryIds),
  }))
  .filter((entry) => entry.displayNames.length > 1 || entry.categoryIds.length > 1);
const coreDisplaySplits = trueDisplaySplits.filter(isCoreCategorySplit);
const coreHandlerSplits = trueHandlerSplits.filter(isCoreCategorySplit);

const failures = [];
if (trueDisplaySplits.length > 0) {
  failures.push(`recipe category report has ${trueDisplaySplits.length} true display-name split(s)`);
}
if (trueHandlerSplits.length > 0) {
  failures.push(`recipe category report has ${trueHandlerSplits.length} handler split(s)`);
}
if (coreDisplaySplits.length > 0 || coreHandlerSplits.length > 0) {
  failures.push("core recipe categories are fragmented");
}

const result = {
  schemaVersion: "neonei/recipe-fragmentation-gate/v1",
  generatedAt: new Date().toISOString(),
  distDataDir,
  reportStatus: report?.status ?? null,
  counts: {
    reportedDisplaySplits: Number(report?.counts?.suspiciousDisplaySplits ?? suspiciousDisplaySplits.length) || 0,
    reportedHandlerSplits: Number(report?.counts?.suspiciousHandlerSplits ?? suspiciousHandlerSplits.length) || 0,
    trueDisplaySplits: trueDisplaySplits.length,
    trueHandlerSplits: trueHandlerSplits.length,
    coreDisplaySplits: coreDisplaySplits.length,
    coreHandlerSplits: coreHandlerSplits.length,
  },
  samples: {
    trueDisplaySplits: trueDisplaySplits.slice(0, 25),
    trueHandlerSplits: trueHandlerSplits.slice(0, 25),
    coreDisplaySplits: coreDisplaySplits.slice(0, 25),
    coreHandlerSplits: coreHandlerSplits.slice(0, 25),
  },
  failures,
};

mkdirSync(outputDir, { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(JSON.stringify(result, null, 2));
if (gate && failures.length > 0) {
  process.exitCode = 1;
}
