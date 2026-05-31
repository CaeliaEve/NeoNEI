import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const gate = args.includes("--gate");

function readArg(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

const distDataDir = resolve(
  readArg("--dist-data")
    ?? process.env.DIST_DATA_V3_DIR
    ?? join(repoRoot, "backend", "public", "dist-data"),
);

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function hasString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function fail(failures, code, message, details = {}) {
  failures.push({ code, message, details });
}

function firstArray(value) {
  return Array.isArray(value) ? value : [];
}

const localPathPatterns = [
  { code: "WINDOWS_BACKSLASH_ABSOLUTE_PATH", pattern: /(^|[\s"'`([{:=,])[A-Za-z]:\\[A-Za-z0-9._ -]/ },
  { code: "WINDOWS_SLASH_ABSOLUTE_PATH", pattern: /(^|[\s"'`([{:=,])[A-Za-z]:\/[A-Za-z0-9._ -]/ },
  { code: "MINECRAFT_VERSION_PATH", pattern: /\.minecraft[\\/]versions/i },
  { code: "LOCAL_GTNH_PATH", pattern: /[A-Za-z]:[\\/]GTNH/i },
  { code: "LOCAL_CODEX_PATH", pattern: /[A-Za-z]:[\\/]codex/i },
  { code: "LINUX_MACHINE_ABSOLUTE_PATH", pattern: /(^|[\s"'`([{:=,])\/(?:home|Users|mnt|opt|srv)\// },
];

function toPosix(pathText) {
  return `${pathText ?? ""}`.replace(/\\/g, "/");
}

function isUrlSafeRuntimePath(value) {
  const text = `${value ?? ""}`.trim();
  if (!text) return false;
  if (isAbsolute(text) || /^[A-Za-z]:[\\/]/.test(text)) return false;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) return false;
  if (text.includes("\\") || text.includes("\0")) return false;
  const segments = text.split("/").filter(Boolean);
  return !segments.some((segment) => segment === "." || segment === "..");
}

function validateRuntimePathDeclarations() {
  for (const [key, declaredPath] of Object.entries(manifest?.files ?? {})) {
    if (!isUrlSafeRuntimePath(declaredPath)) {
      fail(failures, "DIST_MANIFEST_PATH_NOT_URL_SAFE", `manifest.files.${key} must be a URL-safe relative path`, {
        path: declaredPath,
      });
    }
  }
}

function* walkRuntimeJsonFiles(rootDir) {
  if (!existsSync(rootDir)) return;
  for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
    const fullPath = join(rootDir, entry.name);
    if (entry.isDirectory()) {
      yield* walkRuntimeJsonFiles(fullPath);
      continue;
    }
    if (entry.isFile() && [".json", ".jsonl"].includes(extname(entry.name).toLowerCase())) {
      yield fullPath;
    }
  }
}

function inspectPortableArtifactText(rootDir, filePath) {
  const text = readFileSync(filePath, "utf8");
  const rel = toPosix(relative(rootDir, filePath));
  for (const rule of localPathPatterns) {
    if (rule.pattern.test(text)) {
      fail(failures, "RUNTIME_ARTIFACT_LOCAL_PATH_LEAK", `Runtime artifact contains machine-specific path text: ${rel}`, {
        path: rel,
        rule: rule.code,
      });
    }
  }
}

function validatePortableArtifacts() {
  const inspected = {
    distDataDeclaredFiles: 0,
    contractJsonFiles: 0,
  };

  const distDataFiles = new Set([manifestPath]);
  for (const declaredPath of Object.values(manifest?.files ?? {})) {
    if (isUrlSafeRuntimePath(declaredPath)) {
      distDataFiles.add(join(distDataDir, declaredPath));
    }
  }
  for (const filePath of distDataFiles) {
    if (!existsSync(filePath) || ![".json", ".jsonl"].includes(extname(filePath).toLowerCase())) {
      continue;
    }
    inspected.distDataDeclaredFiles += 1;
    inspectPortableArtifactText(distDataDir, filePath);
  }

  for (const filePath of walkRuntimeJsonFiles(contractDir)) {
    inspected.contractJsonFiles += 1;
    inspectPortableArtifactText(contractDir, filePath);
  }

  return inspected;
}

const failures = [];
const warnings = [];
const contractDir = join(repoRoot, "contracts", "runtime");
const requiredContractFiles = [
  "manifest.schema.json",
  "browser.schema.json",
  "search.schema.json",
  "recipe.schema.json",
  "texture.schema.json",
  "error.schema.json",
];

for (const fileName of requiredContractFiles) {
  const filePath = join(contractDir, fileName);
  if (!existsSync(filePath)) {
    fail(failures, "CONTRACT_SCHEMA_MISSING", `Missing runtime contract schema: ${fileName}`);
    continue;
  }
  try {
    const schema = readJson(filePath);
    if (!hasString(schema.$id) || !hasString(schema.title) || schema.type !== "object") {
      fail(failures, "CONTRACT_SCHEMA_INVALID", `Invalid runtime contract schema header: ${fileName}`);
    }
  } catch (error) {
    fail(failures, "CONTRACT_SCHEMA_PARSE_FAILED", `Cannot parse runtime contract schema: ${fileName}`, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

const manifestPath = join(distDataDir, "manifest.json");
if (!existsSync(manifestPath)) {
  fail(failures, "DIST_MANIFEST_MISSING", `dist-data manifest not found: ${manifestPath}`);
}

let manifest = null;
if (existsSync(manifestPath)) {
  try {
    manifest = readJson(manifestPath);
  } catch (error) {
    fail(failures, "DIST_MANIFEST_PARSE_FAILED", "dist-data manifest is not valid JSON", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

const requiredManifestFields = ["schemaVersion", "generatedAt", "source", "sourceRepository", "files"];
const requiredFiles = [
  "searchAll",
  "browserCatalog",
  "browserGroups",
  "recipeCategories",
  "recipeItemIndex",
  "recipeUiPayloadIndex",
  "textureManifest",
  "animationTable",
  "browserAtlasIndex",
  "validationReport",
  "migrationReadiness",
];

if (manifest) {
  for (const field of requiredManifestFields) {
    if (field === "files") {
      if (!manifest.files || typeof manifest.files !== "object" || Array.isArray(manifest.files)) {
        fail(failures, "DIST_MANIFEST_FIELD_MISSING", "manifest.files is required");
      }
      continue;
    }
    if (!hasString(manifest[field])) {
      fail(failures, "DIST_MANIFEST_FIELD_MISSING", `manifest.${field} is required`);
    }
  }

  validateRuntimePathDeclarations();

  for (const fileKey of requiredFiles) {
    const relativePath = manifest.files?.[fileKey];
    if (!hasString(relativePath)) {
      fail(failures, "DIST_MANIFEST_FILE_KEY_MISSING", `manifest.files.${fileKey} is required`);
      continue;
    }
    const absolutePath = join(distDataDir, relativePath);
    if (!existsSync(absolutePath)) {
      fail(failures, "DIST_MANIFEST_FILE_MISSING", `Manifest file target missing: ${fileKey}`, {
        path: relativePath,
      });
    }
  }
}

function validateBrowserCatalog() {
  const relativePath = manifest?.files?.browserCatalog;
  if (!hasString(relativePath)) return null;
  const payload = readJson(join(distDataDir, relativePath));
  if (!hasString(payload.schemaVersion)) {
    fail(failures, "BROWSER_SCHEMA_VERSION_MISSING", "browser catalog schemaVersion is required");
  }
  const items = firstArray(payload.items);
  if (items.length === 0) {
    fail(failures, "BROWSER_ITEMS_EMPTY", "browser catalog must contain items");
  }
  for (const [index, item] of items.slice(0, 200).entries()) {
    for (const field of ["itemId", "localizedName", "modId", "renderAssetRef"]) {
      if (!hasString(item?.[field])) {
        fail(failures, "BROWSER_ITEM_FIELD_MISSING", `browser item missing ${field}`, { index });
      }
    }
    if (typeof item?.browserOrder !== "number") {
      fail(failures, "BROWSER_ITEM_ORDER_INVALID", "browser item browserOrder must be numeric", { index });
    }
  }
  return { itemCount: items.length };
}

function validateSearchPack() {
  const relativePath = manifest?.files?.searchAll;
  if (!hasString(relativePath)) return null;
  const payload = readJson(join(distDataDir, relativePath));
  if (!hasString(payload.schemaVersion)) {
    fail(failures, "SEARCH_SCHEMA_VERSION_MISSING", "search pack schemaVersion is required");
  }
  const items = firstArray(payload.items);
  if (items.length === 0) {
    fail(failures, "SEARCH_ITEMS_EMPTY", "search pack must contain items");
  }
  for (const [index, item] of items.slice(0, 200).entries()) {
    if (!hasString(item?.itemId)) {
      fail(failures, "SEARCH_ITEM_ID_MISSING", "search item itemId is required", { index });
    }
  }
  return { itemCount: items.length };
}

function validateTexturePayloads() {
  const textureManifestPath = manifest?.files?.textureManifest;
  const browserAtlasPath = manifest?.files?.browserAtlasIndex;
  const animationTablePath = manifest?.files?.animationTable;
  const result = {};
  if (hasString(textureManifestPath)) {
    const payload = readJson(join(distDataDir, textureManifestPath));
    if (!hasString(payload.schemaVersion)) {
      fail(failures, "TEXTURE_MANIFEST_SCHEMA_VERSION_MISSING", "texture manifest schemaVersion is required");
    }
    result.textureAtlasCount = firstArray(payload.atlases).length;
  }
  if (hasString(browserAtlasPath)) {
    const payload = readJson(join(distDataDir, browserAtlasPath));
    if (!hasString(payload.schemaVersion)) {
      fail(failures, "BROWSER_ATLAS_SCHEMA_VERSION_MISSING", "browser atlas schemaVersion is required");
    }
    const items = firstArray(payload.items);
    if (items.length === 0) {
      fail(failures, "BROWSER_ATLAS_EMPTY", "browser atlas index must contain item entries");
    }
    result.browserAtlasItems = items.length;
  }
  if (hasString(animationTablePath)) {
    const payload = readJson(join(distDataDir, animationTablePath));
    if (!hasString(payload.schemaVersion)) {
      fail(failures, "ANIMATION_TABLE_SCHEMA_VERSION_MISSING", "animation table schemaVersion is required");
    }
    result.animationEntries = firstArray(payload.items ?? payload.entries).length;
  }
  return result;
}

function validateRecipePayloads() {
  const result = {};
  for (const [key, code] of [
    ["recipeCategories", "RECIPE_CATEGORIES_SCHEMA_VERSION_MISSING"],
    ["recipeItemIndex", "RECIPE_ITEM_INDEX_SCHEMA_VERSION_MISSING"],
    ["recipeUiPayloadIndex", "RECIPE_UI_PAYLOAD_INDEX_SCHEMA_VERSION_MISSING"],
  ]) {
    const relativePath = manifest?.files?.[key];
    if (!hasString(relativePath)) continue;
    const payload = readJson(join(distDataDir, relativePath));
    if (!hasString(payload.schemaVersion)) {
      fail(failures, code, `${key} schemaVersion is required`);
    }
    result[key] = true;
  }
  return result;
}

const checked = {};
if (manifest && failures.length === 0) {
  try {
    checked.browser = validateBrowserCatalog();
    checked.search = validateSearchPack();
    checked.textures = validateTexturePayloads();
    checked.recipes = validateRecipePayloads();
    checked.portability = validatePortableArtifacts();
  } catch (error) {
    fail(failures, "DIST_PAYLOAD_VALIDATE_FAILED", "Runtime payload validation threw", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

const report = {
  schemaVersion: "neonei/runtime-contract-validation-report/v1",
  generatedAt: new Date().toISOString(),
  distDataDir,
  sourceRepository: manifest?.sourceRepository ?? null,
  source: manifest?.source ?? null,
  checked,
  failures,
  warnings,
};

const outputDir = join(repoRoot, ".runtime-logs");
mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, "runtime-contract-validation-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));

if (gate && failures.length > 0) {
  process.exit(1);
}
