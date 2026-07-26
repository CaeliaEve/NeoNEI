import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveElysiumOutputGeneration } from './lib/elysium-output-generation.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = resolve(repoRoot, '..');
const args = process.argv.slice(2);

function readArg(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function gitState(path) {
  return {
    commit: execFileSync('git', ['-C', path, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    dirty: execFileSync('git', ['-C', path, 'status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0,
  };
}

function requireString(value, label, violations) {
  const text = `${value ?? ''}`.trim();
  if (!text) violations.push(label);
  return text;
}

const authority = resolve(readArg('--dist-data') ?? join(workspaceRoot, '.omx', 'performance', 'runs', 'phase-7-real-gtnh', 'compiled-eighth-export'));
const outputDir = resolve(readArg('--output-dir') ?? join(workspaceRoot, '.omx', 'evidence', 'phase-7'));
const resolved = resolveElysiumOutputGeneration(authority);
const manifest = readJson(join(resolved.generationRoot, 'manifest.json'));
const bindingIndexPath = requireString(manifest.files?.rustUiTemplateBindingIndex, 'manifest.files.rustUiTemplateBindingIndex', []);
const templateCatalogPath = requireString(manifest.files?.rustUiTemplateCatalog, 'manifest.files.rustUiTemplateCatalog', []);
const uiPackReportPath = requireString(manifest.files?.rustUiPackReport, 'manifest.files.rustUiPackReport', []);
const bindingIndex = readJson(join(resolved.generationRoot, bindingIndexPath));
const templateCatalog = readJson(join(resolved.generationRoot, templateCatalogPath));
const uiPackReport = readJson(join(resolved.generationRoot, uiPackReportPath));
const uiTypeMappingSource = readFileSync(join(repoRoot, 'frontend', 'src', 'services', 'uiTypeMapping.ts'), 'utf8');
const registeredRendererIds = new Set(Array.from(
  uiTypeMappingSource.matchAll(/^\s{2}([a-z0-9_]+): renderer\(/gm),
  (match) => match[1],
));

const violations = [];
if (bindingIndex.schemaVersion !== 'neonei/ui-template-binding-index/current') violations.push('binding index schema mismatch');
if (templateCatalog.schemaVersion !== 'neonei/ui-template-catalog/current') violations.push('template catalog schema mismatch');
if (uiPackReport.status !== 'ready') violations.push('UI pack report is not ready');
if (uiPackReport.format?.bindingPackVersion !== 2) violations.push('binding pack version is not 2');
if (uiPackReport.format?.bindingStride !== 14) violations.push('binding stride is not 14');
if (!Array.isArray(bindingIndex.bindings)) violations.push('binding index bindings is not an array');
if (!Array.isArray(templateCatalog.templates)) violations.push('template catalog templates is not an array');

const requiredBindingFields = [
  'recipeId',
  'path',
  'payloadKey',
  'captureKey',
  'familyKey',
  'templateKey',
  'presentationSurface',
  'layoutId',
  'rendererId',
];
const recipeIds = new Set();
const rendererCounts = new Map();
const familyRendererCounts = new Map();
const missingFieldSamples = [];
const duplicateRecipeSamples = [];
const unknownRendererSamples = [];
for (const binding of bindingIndex.bindings ?? []) {
  const recipeId = `${binding?.recipeId ?? ''}`.trim();
  if (recipeIds.has(recipeId) && duplicateRecipeSamples.length < 20) duplicateRecipeSamples.push(recipeId);
  if (recipeId) recipeIds.add(recipeId);
  for (const field of requiredBindingFields) {
    if (!`${binding?.[field] ?? ''}`.trim() && missingFieldSamples.length < 20) {
      missingFieldSamples.push({ recipeId: recipeId || null, field });
    }
  }
  const rendererId = `${binding?.rendererId ?? ''}`.trim();
  const familyKey = `${binding?.familyKey ?? ''}`.trim();
  if (rendererId) rendererCounts.set(rendererId, (rendererCounts.get(rendererId) ?? 0) + 1);
  if (rendererId && familyKey) {
    const key = `${familyKey}\u0000${rendererId}`;
    familyRendererCounts.set(key, (familyRendererCounts.get(key) ?? 0) + 1);
  }
  if (rendererId && !registeredRendererIds.has(rendererId) && unknownRendererSamples.length < 20) {
    unknownRendererSamples.push({ recipeId, rendererId });
  }
}
if (missingFieldSamples.length) violations.push(`bindings missing required fields: ${missingFieldSamples.length}+`);
if (duplicateRecipeSamples.length) violations.push(`duplicate binding recipe ids: ${duplicateRecipeSamples.length}+`);
if (unknownRendererSamples.length) violations.push(`unknown renderer ids: ${unknownRendererSamples.length}+`);

const bindingCount = bindingIndex.bindings?.length ?? 0;
const summary = uiPackReport.summary ?? {};
if (bindingCount !== Number(summary.bindingCount)) violations.push('binding count differs from UI pack report');
if (recipeIds.size !== bindingCount) violations.push('unique recipe count differs from binding count');
if (Number(summary.boundRecipeCount) !== bindingCount) violations.push('bound recipe count differs from binding count');
if (Number(summary.unboundRecipeCount) !== 0) violations.push('unbound recipe count is not zero');
if (Number(bindingIndex.summary?.boundRecipeCount) !== bindingCount) violations.push('binding index summary bound count mismatch');
if (Number(bindingIndex.summary?.unboundRecipeCount) !== 0) violations.push('binding index summary unbound count is not zero');
if (Number(templateCatalog.summary?.templateCount) !== (templateCatalog.templates?.length ?? 0)) violations.push('template catalog count mismatch');

if (violations.length > 0) {
  throw new Error(`Phase 7 binding evidence failed:\n- ${violations.join('\n- ')}`);
}

const commits = {
  nesql: gitState(join(workspaceRoot, 'NESQL++')),
  compiler: gitState(join(workspaceRoot, 'elysium-compiler')),
  neonei: gitState(join(workspaceRoot, 'NeoNEI')),
};
const command = `node scripts/generate-phase7-binding-evidence.mjs --dist-data "${authority}" --output-dir "${outputDir}"`;
const common = {
  status: 'passed',
  generatedAtUtc: new Date().toISOString(),
  commit: commits,
  commands: [command],
  source: {
    authorityRoot: resolved.authorityRoot,
    generationRoot: resolved.generationRoot,
    generationId: resolved.generationId,
    runtimeId: resolved.runtimeId,
    rawExportGenerationId: manifest.sourceGenerationId ?? manifest.inputGenerationId ?? null,
  },
};

const rendererCoverage = Array.from(rendererCounts, ([rendererId, recipeCount]) => ({ rendererId, recipeCount }))
  .sort((left, right) => left.rendererId.localeCompare(right.rendererId));
const familyRendererCoverage = Array.from(familyRendererCounts, ([key, recipeCount]) => {
  const [familyKey, rendererId] = key.split('\u0000');
  return { familyKey, rendererId, recipeCount };
}).sort((left, right) => left.familyKey.localeCompare(right.familyKey) || left.rendererId.localeCompare(right.rendererId));

const semanticContract = {
  ...common,
  schemaVersion: 'elysium/phase-7-semantic-contract/v1',
  results: [
    { check: 'binding-index-schema', actual: bindingIndex.schemaVersion, expected: 'neonei/ui-template-binding-index/current', passed: true },
    { check: 'binding-pack-version', actual: uiPackReport.format.bindingPackVersion, expected: 2, passed: true },
    { check: 'binding-stride', actual: uiPackReport.format.bindingStride, expected: 14, passed: true },
    { check: 'exact-binding-coverage', bindingCount, uniqueRecipeCount: recipeIds.size, unboundRecipeCount: 0, passed: true },
    { check: 'required-presentation-fields', fields: requiredBindingFields, missingCount: 0, passed: true },
    { check: 'renderer-registry-authority', registeredRendererCount: registeredRendererIds.size, unknownRendererCount: 0, passed: true },
    { check: 'template-catalog', templateCount: templateCatalog.templates.length, schemaVersion: templateCatalog.schemaVersion, passed: true },
  ],
};

const familyCoverage = {
  ...common,
  schemaVersion: 'elysium/phase-7-family-migration-coverage/v1',
  results: [
    {
      check: 'family-renderer-coverage',
      familyCount: new Set(familyRendererCoverage.map((entry) => entry.familyKey)).size,
      rendererCount: rendererCoverage.length,
      familyRendererPairCount: familyRendererCoverage.length,
      recipeCount: bindingCount,
      unknownRendererCount: 0,
      missingPresentationFieldCount: 0,
      duplicateRecipeIdCount: 0,
      passed: true,
    },
  ],
  rendererCoverage,
  familyRendererCoverage,
};

mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, 'semantic-contract.json'), `${JSON.stringify(semanticContract, null, 2)}\n`, 'utf8');
writeFileSync(join(outputDir, 'family-migration-coverage.json'), `${JSON.stringify(familyCoverage, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  status: 'passed',
  generationId: resolved.generationId,
  bindingCount,
  templateCount: templateCatalog.templates.length,
  rendererCount: rendererCoverage.length,
  familyRendererPairCount: familyRendererCoverage.length,
  outputDir,
}, null, 2));
