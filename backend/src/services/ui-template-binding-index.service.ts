import fs from 'fs';
import { notFound } from '../utils/http';
import { CURRENT_RUNTIME_ARTIFACT_PATHS } from './current-runtime-artifact-index-abi';
import {
  resolveCurrentRuntimeDistDataDir,
  resolveDistDataRuntimeFile,
} from './current-runtime-artifact-index.service';
import {
  UiTemplateCatalogService,
  type UiTemplateCatalogReport,
  type UiTemplateCatalogTemplate,
} from './ui-template-catalog.service';

export interface UiTemplateBindingIndexRecipeSource {
  path: string;
  exists: boolean;
  recipeCount: number;
}

export interface UiTemplateBindingIndexTemplateSource {
  path: string;
  exists: boolean;
  templateCount: number;
  familyCount: number;
  layoutKindCount: number;
}

export interface UiTemplateBindingIndexSource {
  recipeUiPayloadIndex: UiTemplateBindingIndexRecipeSource;
  uiTemplateCatalog: UiTemplateBindingIndexTemplateSource;
}

export interface UiTemplateBindingIndexSummary {
  recipeCount: number;
  boundRecipeCount: number;
  unboundRecipeCount: number;
  templateCount: number;
  familyCount: number;
  layoutKindCount: number;
}

export interface UiTemplateBindingIndexEntry {
  recipeId: string;
  path: string;
  payloadKey: string;
  familyKey: string;
  recipeType: string;
  machineType: string;
  templateKey: string | null;
  templateSignature: string | null;
  canonicalMachineFamily: string | null;
  layoutKind: string | null;
}

export interface UiTemplateBindingIndexReport {
  schemaVersion: string;
  generatedAt: string;
  source: UiTemplateBindingIndexSource;
  summary: UiTemplateBindingIndexSummary;
  bindings: UiTemplateBindingIndexEntry[];
}

export interface UiTemplateBindingIndexServiceOptions {
  bindingIndexFilePath?: string;
  recipeUiPayloadIndexFilePath?: string;
  templateCatalogFilePath?: string;
}

type UiTemplateBindingIndexPaths = Readonly<{
  bindingIndexFilePath: string;
  recipeUiPayloadIndexFilePath: string;
  templateCatalogFilePath: string;
}>;

type RecipeUiPayloadIndexEntry = {
  recipeId: string;
  path: string;
  payloadKey: string;
  familyKey: string;
  recipeType: string;
  machineType: string;
};

type CachedBindingIndex = {
  cacheKey: string;
  report: UiTemplateBindingIndexReport;
  bindingIndex: Map<string, UiTemplateBindingIndexEntry>;
};

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeRecipeIndexEntry(value: unknown): RecipeUiPayloadIndexEntry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const recipeId = asString(record.recipeId);
  const path = asString(record.path);
  if (!recipeId || !path) {
    return null;
  }
  return {
    recipeId,
    path,
    payloadKey: asString(record.payloadKey),
    familyKey: asString(record.familyKey),
    recipeType: asString(record.recipeType),
    machineType: asString(record.machineType),
  };
}

function readRecipeUiPayloadIndex(filePath: string): RecipeUiPayloadIndexEntry[] | null {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  const record = JSON.parse(raw) as Record<string, unknown>;
  const recipes = Array.isArray(record.recipes)
    ? record.recipes.map(normalizeRecipeIndexEntry).filter((entry): entry is RecipeUiPayloadIndexEntry => Boolean(entry))
    : [];
  return recipes;
}

function normalizeBindingIndexEntry(value: unknown): UiTemplateBindingIndexEntry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const recipeId = asString(record.recipeId);
  const path = asString(record.path);
  if (!recipeId || !path) {
    return null;
  }
  return {
    recipeId,
    path,
    payloadKey: asString(record.payloadKey),
    familyKey: asString(record.familyKey),
    recipeType: asString(record.recipeType),
    machineType: asString(record.machineType),
    templateKey: asString(record.templateKey) || null,
    templateSignature: asString(record.templateSignature) || null,
    canonicalMachineFamily: asString(record.canonicalMachineFamily) || null,
    layoutKind: asString(record.layoutKind) || null,
  };
}

function readCompiledBindingIndex(filePath: string): UiTemplateBindingIndexReport | null {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  const record = JSON.parse(raw) as Record<string, unknown>;
  const summary = record.summary && typeof record.summary === 'object' && !Array.isArray(record.summary)
    ? record.summary as Record<string, unknown>
    : {};
  const bindings = Array.isArray(record.bindings)
    ? record.bindings.map(normalizeBindingIndexEntry).filter((entry): entry is UiTemplateBindingIndexEntry => Boolean(entry))
    : [];
  return {
    schemaVersion: asString(record.schemaVersion) || 'neonei/ui-template-binding-index/current',
    generatedAt: asString(record.generatedAt),
    source: record.source as UiTemplateBindingIndexSource,
    summary: {
      recipeCount: Number(summary.recipeCount ?? bindings.length),
      boundRecipeCount: Number(summary.boundRecipeCount ?? bindings.filter((entry) => entry.templateKey).length),
      unboundRecipeCount: Number(summary.unboundRecipeCount ?? bindings.filter((entry) => !entry.templateKey).length),
      templateCount: Number(summary.templateCount ?? 0),
      familyCount: Number(summary.familyCount ?? 0),
      layoutKindCount: Number(summary.layoutKindCount ?? 0),
    },
    bindings,
  };
}

export class UiTemplateBindingIndexService {
  private cache: CachedBindingIndex | null = null;
  private readonly explicitBindingIndexFilePath: string | null;
  private readonly explicitRecipeUiPayloadIndexFilePath: string | null;
  private readonly explicitTemplateCatalogFilePath: string | null;
  private readonly templateCatalogService: UiTemplateCatalogService;

  constructor(options: UiTemplateBindingIndexServiceOptions = {}) {
    this.explicitBindingIndexFilePath = options.bindingIndexFilePath ?? null;
    this.explicitRecipeUiPayloadIndexFilePath = options.recipeUiPayloadIndexFilePath ?? null;
    this.explicitTemplateCatalogFilePath = options.templateCatalogFilePath ?? null;
    this.templateCatalogService = new UiTemplateCatalogService({
      catalogFilePath: this.explicitTemplateCatalogFilePath ?? undefined,
    });
  }

  private resolvePaths(): UiTemplateBindingIndexPaths {
    const generationRoot = (
      this.explicitBindingIndexFilePath
      && this.explicitRecipeUiPayloadIndexFilePath
      && this.explicitTemplateCatalogFilePath
    ) ? null : resolveCurrentRuntimeDistDataDir();
    return Object.freeze({
      bindingIndexFilePath: this.explicitBindingIndexFilePath
        ?? resolveDistDataRuntimeFile(CURRENT_RUNTIME_ARTIFACT_PATHS.uiTemplateBindingIndex, generationRoot as string),
      recipeUiPayloadIndexFilePath: this.explicitRecipeUiPayloadIndexFilePath
        ?? resolveDistDataRuntimeFile(CURRENT_RUNTIME_ARTIFACT_PATHS.uiPayloadIndex, generationRoot as string),
      templateCatalogFilePath: this.explicitTemplateCatalogFilePath
        ?? resolveDistDataRuntimeFile(CURRENT_RUNTIME_ARTIFACT_PATHS.uiTemplateCatalog, generationRoot as string),
    });
  }

  getReport(): UiTemplateBindingIndexReport {
    const report = this.getReportOrNull();
    if (!report) {
      throw notFound(
        'Compiled UI template binding index is not available. Re-run the Elysium compiler so dist-data/rust/ui-pack/ui_template_binding_index.json is generated.',
      );
    }
    return report;
  }

  getReportOrNull(paths = this.resolvePaths()): UiTemplateBindingIndexReport | null {
    const compiled = this.getCompiledBindingReport(paths.bindingIndexFilePath);
    if (compiled) {
      return compiled;
    }

    const recipeIndex = this.getRecipeIndex(paths.recipeUiPayloadIndexFilePath);
    const templateCatalog = this.getTemplateCatalog(paths.templateCatalogFilePath);
    if (!recipeIndex || !templateCatalog) {
      return null;
    }
    const cacheKey = `${paths.recipeUiPayloadIndexFilePath}:${recipeIndex.mtimeMs}:${paths.templateCatalogFilePath}:${templateCatalog.mtimeMs}`;
    if (this.cache && this.cache.cacheKey === cacheKey) {
      return this.cache.report;
    }

    const templateIndex = new Map<string, UiTemplateCatalogTemplate>();
    for (const template of templateCatalog.report.templates) {
      if (template.familyKey) {
        templateIndex.set(template.familyKey, template);
      }
    }

    const bindings: UiTemplateBindingIndexEntry[] = [];
    const bindingIndex = new Map<string, UiTemplateBindingIndexEntry>();
    let boundRecipeCount = 0;
    for (const entry of recipeIndex.recipes) {
      const template = entry.familyKey ? templateIndex.get(entry.familyKey) ?? null : null;
      const binding: UiTemplateBindingIndexEntry = {
        recipeId: entry.recipeId,
        path: entry.path,
        payloadKey: entry.payloadKey,
        familyKey: entry.familyKey,
        recipeType: entry.recipeType,
        machineType: entry.machineType,
        templateKey: template?.templateKey ?? null,
        templateSignature: template?.templateSignature ?? null,
        canonicalMachineFamily: template?.canonicalMachineFamily ?? null,
        layoutKind: template?.layoutKind ?? null,
      };
      if (binding.templateKey) {
        boundRecipeCount += 1;
      }
      bindingIndex.set(binding.recipeId, binding);
      bindings.push(binding);
    }

    const report: UiTemplateBindingIndexReport = {
      schemaVersion: 'neonei/ui-template-binding-index/current',
      generatedAt: new Date().toISOString(),
      source: {
        recipeUiPayloadIndex: {
          path: paths.recipeUiPayloadIndexFilePath,
          exists: Boolean(recipeIndex),
          recipeCount: recipeIndex.recipes.length,
        },
        uiTemplateCatalog: {
          path: paths.templateCatalogFilePath,
          exists: Boolean(templateCatalog),
          templateCount: templateCatalog.report.summary.templateCount,
          familyCount: templateCatalog.report.summary.familyCount,
          layoutKindCount: templateCatalog.report.summary.layoutKindCount,
        },
      },
      summary: {
        recipeCount: bindings.length,
        boundRecipeCount,
        unboundRecipeCount: Math.max(0, bindings.length - boundRecipeCount),
        templateCount: templateCatalog.report.summary.templateCount,
        familyCount: templateCatalog.report.summary.familyCount,
        layoutKindCount: templateCatalog.report.summary.layoutKindCount,
      },
      bindings,
    };

    this.cache = {
      cacheKey,
      report,
      bindingIndex,
    };
    return report;
  }

  getBindingByRecipeId(recipeId: string): UiTemplateBindingIndexEntry | null {
    const normalized = `${recipeId ?? ''}`.trim();
    if (!normalized) {
      return null;
    }
    const cache = this.getCacheOrNull();
    return cache?.bindingIndex.get(normalized) ?? null;
  }

  getBindings(): UiTemplateBindingIndexEntry[] {
    return this.getReport().bindings;
  }

  private getRecipeIndex(filePath: string): { mtimeMs: number; recipes: RecipeUiPayloadIndexEntry[] } | null {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const stat = fs.statSync(filePath);
    const recipes = readRecipeUiPayloadIndex(filePath);
    if (!recipes) {
      return null;
    }
    return { mtimeMs: stat.mtimeMs, recipes };
  }

  private getCompiledBindingReport(filePath: string): UiTemplateBindingIndexReport | null {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const stat = fs.statSync(filePath);
    const cacheKey = `compiled:${filePath}:${stat.mtimeMs}`;
    if (this.cache && this.cache.cacheKey === cacheKey) {
      return this.cache.report;
    }
    const report = readCompiledBindingIndex(filePath);
    if (!report) {
      return null;
    }
    const bindingIndex = new Map<string, UiTemplateBindingIndexEntry>();
    for (const binding of report.bindings) {
      bindingIndex.set(binding.recipeId, binding);
    }
    this.cache = { cacheKey, report, bindingIndex };
    return report;
  }

  private getTemplateCatalog(filePath: string): { mtimeMs: number; report: UiTemplateCatalogReport } | null {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const stat = fs.statSync(filePath);
    const report = this.templateCatalogService.getReportOrNull(filePath);
    if (!report) {
      return null;
    }
    return { mtimeMs: stat.mtimeMs, report };
  }

  private getCacheOrNull(paths = this.resolvePaths()): CachedBindingIndex | null {
    const compiled = this.getCompiledBindingReport(paths.bindingIndexFilePath);
    if (compiled && this.cache) {
      return this.cache;
    }

    const recipeIndex = this.getRecipeIndex(paths.recipeUiPayloadIndexFilePath);
    const templateCatalog = this.getTemplateCatalog(paths.templateCatalogFilePath);
    if (!recipeIndex || !templateCatalog) {
      return null;
    }
    const cacheKey = `${paths.recipeUiPayloadIndexFilePath}:${recipeIndex.mtimeMs}:${paths.templateCatalogFilePath}:${templateCatalog.mtimeMs}`;
    if (this.cache && this.cache.cacheKey === cacheKey) {
      return this.cache;
    }
    this.getReportOrNull(paths);
    return this.cache;
  }
}

let instance: UiTemplateBindingIndexService | null = null;

export function getUiTemplateBindingIndexService(): UiTemplateBindingIndexService {
  if (!instance) {
    instance = new UiTemplateBindingIndexService();
  }
  return instance;
}
