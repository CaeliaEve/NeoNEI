import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const distDataDir = resolve(readArg('--dist-data') || process.env.DIST_DATA_V3_DIR || join(repoRoot, 'backend', 'public', 'dist-data'));
const gate = process.argv.includes('--gate');
const outputDir = join(repoRoot, '.runtime-logs');
const outputPath = join(outputDir, 'native-ui-layout-gate.json');

function tryReadJson(relativePath) {
  const filePath = join(distDataDir, relativePath);
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function tryReadUiTemplateHeader(relativePath) {
  const filePath = join(distDataDir, relativePath);
  if (!existsSync(filePath)) return null;
  const bytes = readFileSync(filePath);
  if (bytes.length < 24 || bytes.subarray(0, 8).toString('utf8') !== 'NNEIBIN\0') {
    throw new Error(`invalid NeoNEI binary pack header: ${filePath}`);
  }
  const schemaLength = bytes.readUInt32LE(12);
  const payloadLength = Number(bytes.readBigUInt64LE(16));
  const schemaStart = 24;
  const payloadStart = schemaStart + schemaLength;
  if (payloadStart + payloadLength > bytes.length || bytes.length < payloadStart + 48) {
    throw new Error(`truncated UI template binary pack: ${filePath}`);
  }
  return {
    schema: bytes.subarray(schemaStart, payloadStart).toString('utf8'),
    magic: bytes.subarray(payloadStart, payloadStart + 8).toString('utf8'),
    version: bytes.readUInt32LE(payloadStart + 8),
    templateCount: bytes.readUInt32LE(payloadStart + 12),
    slotCount: bytes.readUInt32LE(payloadStart + 16),
    textOverlayCount: bytes.readUInt32LE(payloadStart + 20),
    hotspotCount: bytes.readUInt32LE(payloadStart + 24),
    viewportCount: bytes.readUInt32LE(payloadStart + 28),
    templateStride: bytes.readUInt32LE(payloadStart + 32),
    slotStride: bytes.readUInt32LE(payloadStart + 36),
    textStride: bytes.readUInt32LE(payloadStart + 40),
    rectStride: bytes.readUInt32LE(payloadStart + 44),
  };
}

function arrayAt(value, key) {
  return Array.isArray(value?.[key]) ? value[key] : [];
}

function text(value) {
  return `${value ?? ''}`.trim();
}

function hasDrawablePrimitive(value) {
  const width = Number(value?.width ?? 0);
  const height = Number(value?.height ?? 0);
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0;
}

function primitiveCount(layout, key) {
  return arrayAt(layout, key).filter(hasDrawablePrimitive).length;
}

function isGtLayout(layout) {
  return text(layout?.canonicalMachineFamily) === 'gregtech-machine';
}

function isGtRecipe(entry) {
  const family = text(entry?.nativeLayout?.canonicalMachineFamily);
  return family === 'gregtech-machine' || text(entry?.familyKey).startsWith('gregtech-machine|');
}

const manifest = tryReadJson('manifest.json');
const nativeUiLayoutReport = tryReadJson(manifest?.files?.rustNativeUiLayoutReport || 'rust/native-ui-layout-report.json');
const uiPackReport = tryReadJson(manifest?.files?.rustUiPackReport || 'rust/ui-pack/ui_pack_report.json');
let uiTemplateHeader = null;
try {
  uiTemplateHeader = tryReadUiTemplateHeader(manifest?.files?.rustUiTemplatesBin || 'rust/ui-pack/ui_templates.bin');
} catch (error) {
  uiTemplateHeader = { error: error instanceof Error ? error.message : String(error) };
}
const handlerLayoutIndex = tryReadJson('recipes/handler-layout-index.json');
const uiPayloadIndex = tryReadJson('recipes/ui-payload-index.json');
const layouts = arrayAt(handlerLayoutIndex, 'layouts');
const recipes = arrayAt(uiPayloadIndex, 'recipes');
const gtLayouts = layouts.filter(isGtLayout);
const gtRecipeEntries = recipes.filter(isGtRecipe);
const gtLayoutsWithProgressBars = gtLayouts.filter((layout) => primitiveCount(layout, 'progressBars') > 0);
const layoutsWithHotspots = layouts.filter((layout) => primitiveCount(layout, 'hotspots') > 0);
const layoutsWithViewports = layouts.filter((layout) => primitiveCount(layout, 'viewports') > 0);
const gtRecipesWithProgressBars = gtRecipeEntries.filter((entry) => primitiveCount(entry?.nativeLayout, 'progressBars') > 0);
const gtRecipesWithHotspots = gtRecipeEntries.filter((entry) => primitiveCount(entry?.nativeLayout, 'hotspots') > 0);
const gtRecipesWithViewports = gtRecipeEntries.filter((entry) => primitiveCount(entry?.nativeLayout, 'viewports') > 0);
const gtRecipesWithBackgroundRegions = gtRecipeEntries.filter((entry) => {
  const region = entry?.nativeLayout?.imageRegion;
  return Number(region?.width ?? 0) > 0 && Number(region?.height ?? 0) > 0;
});

const failures = [];
if (!nativeUiLayoutReport) failures.push('rust native UI layout report is missing');
if (nativeUiLayoutReport?.status === 'blocked') failures.push('rust native UI layout report is blocked');
if (!uiPackReport) failures.push('rust UI pack report is missing');
if (uiPackReport?.format?.templatePackVersion !== 3 || uiPackReport?.format?.rectStride !== 12 || uiPackReport?.format?.hotspotActionFields !== true) {
  failures.push('rust UI pack report does not declare v3 hotspot action IR');
}
if (!uiTemplateHeader) failures.push('rust UI template binary pack is missing');
if (uiTemplateHeader?.error) failures.push(`rust UI template binary pack is invalid: ${uiTemplateHeader.error}`);
if (uiTemplateHeader && !uiTemplateHeader.error && (uiTemplateHeader.schema !== 'neonei/ui-template-pack/current' || uiTemplateHeader.magic !== 'NEIUIT1\0' || uiTemplateHeader.version !== 3 || uiTemplateHeader.rectStride !== 12)) {
  failures.push('rust UI template binary pack is not v3 action-rect format');
}
if (layouts.length === 0) failures.push('handler layout index is empty or missing');
if (gtLayouts.length === 0) failures.push('no gregtech-machine handler layouts found');
if (gtLayouts.length > 0 && gtLayoutsWithProgressBars.length === 0) {
  failures.push('gregtech-machine handler layouts have no drawable progressBars');
}
if (gtRecipeEntries.length > 0 && gtRecipesWithProgressBars.length === 0) {
  failures.push('gregtech-machine recipe UI payloads have no drawable progressBars');
}

const result = {
  schemaVersion: 'neonei/native-ui-layout-gate/v1',
  generatedAt: new Date().toISOString(),
  distDataDir,
  report: {
    declaredPath: manifest?.files?.rustNativeUiLayoutReport ?? null,
    status: nativeUiLayoutReport?.status ?? null,
    counts: nativeUiLayoutReport?.counts ?? null,
  },
  uiPack: {
    declaredReportPath: manifest?.files?.rustUiPackReport ?? null,
    declaredTemplateBinPath: manifest?.files?.rustUiTemplatesBin ?? null,
    status: uiPackReport?.status ?? null,
    summary: uiPackReport?.summary ?? null,
    format: uiPackReport?.format ?? null,
    templateHeader: uiTemplateHeader,
  },
  counts: {
    handlerLayouts: layouts.length,
    handlerLayoutsWithHotspots: layoutsWithHotspots.length,
    handlerLayoutsWithViewports: layoutsWithViewports.length,
    gtHandlerLayouts: gtLayouts.length,
    gtHandlerLayoutsWithProgressBars: gtLayoutsWithProgressBars.length,
    recipeUiPayloads: recipes.length,
    gtRecipeUiPayloads: gtRecipeEntries.length,
    gtRecipeUiPayloadsWithProgressBars: gtRecipesWithProgressBars.length,
    gtRecipeUiPayloadsWithHotspots: gtRecipesWithHotspots.length,
    gtRecipeUiPayloadsWithViewports: gtRecipesWithViewports.length,
    gtRecipeUiPayloadsWithBackgroundRegions: gtRecipesWithBackgroundRegions.length,
  },
  samples: {
    gtHandlerLayoutsMissingProgressBars: gtLayouts
      .filter((layout) => primitiveCount(layout, 'progressBars') === 0)
      .slice(0, 25)
      .map((layout) => ({
        handlerKey: layout?.handlerKey ?? null,
        handlerClass: layout?.handlerClass ?? null,
        layoutKind: layout?.layoutKind ?? null,
      })),
    gtRecipePayloadsMissingProgressBars: gtRecipeEntries
      .filter((entry) => primitiveCount(entry?.nativeLayout, 'progressBars') === 0)
      .slice(0, 25)
      .map((entry) => ({
        recipeId: entry?.recipeId ?? null,
        familyKey: entry?.familyKey ?? null,
        handlerKey: entry?.handlerKey ?? null,
      })),
  },
  failures,
};

mkdirSync(outputDir, { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(result, null, 2));
if (gate && failures.length > 0) process.exitCode = 1;
