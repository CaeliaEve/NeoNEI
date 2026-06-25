import fs from 'fs';
import {
  NESQL_UI_PAYLOAD_INDEX_FILE,
  NESQL_UI_TEMPLATE_BINDING_INDEX_FILE,
  NESQL_UI_TEMPLATE_CATALOG_FILE,
} from '../config/runtime-paths';
import { notFound } from '../utils/http';
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
  private readonly bindingIndexFilePath: string;
  private readonly recipeUiPayloadIndexFilePath: string;
  private readonly templateCatalogFilePath: string;
  private readonly templateCatalogService: UiTemplateCatalogService;

  constructor(options: UiTemplateBindingIndexServiceOptions = {}) {
    this.bindingIndexFilePath = options.bindingIndexFilePath ?? NESQL_UI_TEMPLATE_BINDING_INDEX_FILE;
    this.recipeUiPayloadIndexFilePath = options.recipeUiPayloadIndexFilePath ?? NESQL_UI_PAYLOAD_INDEX_FILE;
    this.templateCatalogFilePath = options.templateCatalogFilePath ?? NESQL_UI_TEMPLATE_CATALOG_FILE;
    this.templateCatalogService = new UiTemplateCatalogService({
      catalogFilePath: this.templateCatalogFilePath,
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

  getReportOrNull(): UiTemplateBindingIndexReport | null {
    const compiled = this.getCompiledBindingReport();
    if (compiled) {
      return compiled;
    }

    const recipeIndex = this.getRecipeIndex();
    const templateCatalog = this.getTemplateCatalog();
    if (!recipeIndex || !templateCatalog) {
      return null;
    }
    const cacheKey = `${recipeIndex.mtimeMs}:${templateCatalog.mtimeMs}`;
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
      const template = entry.familyKey ? templateIndex.get(entry.familyKey) ?? this.templateCatalogService.getTemplateByFamilyKey(entry.familyKey) : null;
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
          path: this.recipeUiPayloadIndexFilePath,
          exists: Boolean(recipeIndex),
          recipeCount: recipeIndex.recipes.length,
        },
        uiTemplateCatalog: {
          path: this.templateCatalogFilePath,
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

  private getRecipeIndex(): { mtimeMs: number; recipes: RecipeUiPayloadIndexEntry[] } | null {
    if (!this.recipeUiPayloadIndexFilePath || !fs.existsSync(this.recipeUiPayloadIndexFilePath)) {
      return null;
    }
    const stat = fs.statSync(this.recipeUiPayloadIndexFilePath);
    const recipes = readRecipeUiPayloadIndex(this.recipeUiPayloadIndexFilePath);
    if (!recipes) {
      return null;
    }
    return { mtimeMs: stat.mtimeMs, recipes };
  }

  private getCompiledBindingReport(): UiTemplateBindingIndexReport | null {
    if (!this.bindingIndexFilePath || !fs.existsSync(this.bindingIndexFilePath)) {
      return null;
    }
    const stat = fs.statSync(this.bindingIndexFilePath);
    const cacheKey = `compiled:${stat.mtimeMs}`;
    if (this.cache && this.cache.cacheKey === cacheKey) {
      return this.cache.report;
    }
    const report = readCompiledBindingIndex(this.bindingIndexFilePath);
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

  private getTemplateCatalog(): { mtimeMs: number; report: UiTemplateCatalogReport } | null {
    if (!this.templateCatalogFilePath || !fs.existsSync(this.templateCatalogFilePath)) {
      return null;
    }
    const stat = fs.statSync(this.templateCatalogFilePath);
    const report = this.templateCatalogService.getReportOrNull();
    if (!report) {
      return null;
    }
    return { mtimeMs: stat.mtimeMs, report };
  }

  private getCacheOrNull(): CachedBindingIndex | null {
    const compiled = this.getCompiledBindingReport();
    if (compiled && this.cache) {
      return this.cache;
    }

    const recipeIndex = this.getRecipeIndex();
    const templateCatalog = this.getTemplateCatalog();
    if (!recipeIndex || !templateCatalog) {
      return null;
    }
    const cacheKey = `${recipeIndex.mtimeMs}:${templateCatalog.mtimeMs}`;
    if (this.cache && this.cache.cacheKey === cacheKey) {
      return this.cache;
    }
    this.getReportOrNull();
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
