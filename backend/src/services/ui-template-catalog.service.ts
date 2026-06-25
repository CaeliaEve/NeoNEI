import fs from 'fs';
import { NESQL_UI_TEMPLATE_CATALOG_FILE } from '../config/runtime-paths';
import { notFound } from '../utils/http';

export interface UiTemplateCatalogSlot {
  role: string;
  startIndex: number;
  columns: number;
  rows: number;
  x: number;
  y: number;
}

export interface UiTemplateCatalogTextOverlay {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface UiTemplateCatalogTemplate {
  templateKey: string;
  templateSignature: string;
  familyKey: string;
  canonicalMachineFamily: string;
  layoutKind: string;
  width: number;
  height: number;
  yShift: number;
  maxRecipesPerPage: number;
  imageResource: string;
  handlerCount: number;
  slotCount: number;
  handlerIds: string[];
  handlerClasses: string[];
  modIds: string[];
  slots: UiTemplateCatalogSlot[];
  textOverlays: UiTemplateCatalogTextOverlay[];
}

export interface UiTemplateCatalogSummary {
  handlerCount: number;
  templateCount: number;
  familyCount: number;
  layoutKindCount: number;
  slotCount: number;
  overlayCount: number;
}

export interface UiTemplateCatalogSource {
  kind: string;
  resource: string;
  censusSchemaVersion: string;
  censusFamilyCount: number;
  censusHandlerCount: number;
  layoutSpecProvider: string;
}

export interface UiTemplateCatalogReport {
  schemaVersion: string;
  generatedAt: string;
  source: UiTemplateCatalogSource;
  summary: UiTemplateCatalogSummary;
  templates: UiTemplateCatalogTemplate[];
}

export interface UiTemplateCatalogServiceOptions {
  catalogFilePath?: string;
}

type CachedCatalog = {
  mtimeMs: number;
  report: UiTemplateCatalogReport;
  templateIndex: Map<string, UiTemplateCatalogTemplate>;
  familyIndex: Map<string, UiTemplateCatalogTemplate>;
};

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(new Set(
    value
      .map((entry) => asString(entry))
      .filter((entry) => Boolean(entry)),
  ));
}

function normalizeSlot(value: unknown): UiTemplateCatalogSlot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  return {
    role: asString(record.role),
    startIndex: asNumber(record.startIndex),
    columns: asNumber(record.columns),
    rows: asNumber(record.rows),
    x: asNumber(record.x),
    y: asNumber(record.y),
  };
}

function normalizeTextOverlay(value: unknown): UiTemplateCatalogTextOverlay | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  return {
    text: asString(record.text),
    x: asNumber(record.x),
    y: asNumber(record.y),
    width: asNumber(record.width),
    height: asNumber(record.height),
  };
}

function normalizeTemplate(value: unknown): UiTemplateCatalogTemplate | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const slots = Array.isArray(record.slots)
    ? record.slots.map(normalizeSlot).filter((entry): entry is UiTemplateCatalogSlot => Boolean(entry))
    : [];
  const textOverlays = Array.isArray(record.textOverlays)
    ? record.textOverlays.map(normalizeTextOverlay).filter((entry): entry is UiTemplateCatalogTextOverlay => Boolean(entry))
    : [];

  return {
    templateKey: asString(record.templateKey),
    templateSignature: asString(record.templateSignature),
    familyKey: asString(record.familyKey),
    canonicalMachineFamily: asString(record.canonicalMachineFamily),
    layoutKind: asString(record.layoutKind),
    width: asNumber(record.width, 176),
    height: asNumber(record.height, 65),
    yShift: asNumber(record.yShift),
    maxRecipesPerPage: asNumber(record.maxRecipesPerPage, 1),
    imageResource: asString(record.imageResource),
    handlerCount: asNumber(record.handlerCount),
    slotCount: asNumber(record.slotCount),
    handlerIds: normalizeStringList(record.handlerIds),
    handlerClasses: normalizeStringList(record.handlerClasses),
    modIds: normalizeStringList(record.modIds),
    slots,
    textOverlays,
  };
}

function normalizeReport(value: unknown): UiTemplateCatalogReport {
  const record = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const sourceRecord = record.source && typeof record.source === 'object' && !Array.isArray(record.source)
    ? record.source as Record<string, unknown>
    : {};
  const summaryRecord = record.summary && typeof record.summary === 'object' && !Array.isArray(record.summary)
    ? record.summary as Record<string, unknown>
    : {};
  const templates = Array.isArray(record.templates)
    ? record.templates.map(normalizeTemplate).filter((entry): entry is UiTemplateCatalogTemplate => Boolean(entry))
    : [];

  return {
    schemaVersion: asString(record.schemaVersion),
    generatedAt: asString(record.generatedAt),
    source: {
      kind: asString(sourceRecord.kind),
      resource: asString(sourceRecord.resource),
      censusSchemaVersion: asString(sourceRecord.censusSchemaVersion),
      censusFamilyCount: asNumber(sourceRecord.censusFamilyCount),
      censusHandlerCount: asNumber(sourceRecord.censusHandlerCount),
      layoutSpecProvider: asString(sourceRecord.layoutSpecProvider),
    },
    summary: {
      handlerCount: asNumber(summaryRecord.handlerCount),
      templateCount: asNumber(summaryRecord.templateCount),
      familyCount: asNumber(summaryRecord.familyCount),
      layoutKindCount: asNumber(summaryRecord.layoutKindCount),
      slotCount: asNumber(summaryRecord.slotCount),
      overlayCount: asNumber(summaryRecord.overlayCount),
    },
    templates,
  };
}

export class UiTemplateCatalogService {
  private cache: CachedCatalog | null = null;
  private readonly catalogFilePath: string;

  constructor(options: UiTemplateCatalogServiceOptions = {}) {
    this.catalogFilePath = options.catalogFilePath ?? NESQL_UI_TEMPLATE_CATALOG_FILE;
  }

  getReport(): UiTemplateCatalogReport {
    const report = this.getReportOrNull();
    if (!report) {
      throw notFound(
        'Compiled UI template catalog is not available. Re-run the Elysium compiler so dist-data/rust/ui-pack/ui_template_catalog.json is generated.',
      );
    }
    return report;
  }

  getReportOrNull(): UiTemplateCatalogReport | null {
    if (!this.catalogFilePath || !fs.existsSync(this.catalogFilePath)) {
      return null;
    }
    const stat = fs.statSync(this.catalogFilePath);
    if (this.cache && this.cache.mtimeMs === stat.mtimeMs) {
      return this.cache.report;
    }
    const raw = fs.readFileSync(this.catalogFilePath, 'utf8');
    const report = normalizeReport(JSON.parse(raw));
    const templateIndex = new Map<string, UiTemplateCatalogTemplate>();
    const familyIndex = new Map<string, UiTemplateCatalogTemplate>();
    for (const template of report.templates) {
      if (template.templateKey) {
        templateIndex.set(template.templateKey, template);
      }
      if (template.familyKey) {
        familyIndex.set(template.familyKey, template);
      }
    }
    this.cache = { mtimeMs: stat.mtimeMs, report, templateIndex, familyIndex };
    return report;
  }

  getTemplateByKey(templateKey: string): UiTemplateCatalogTemplate | null {
    const normalized = `${templateKey ?? ''}`.trim();
    if (!normalized) {
      return null;
    }
    const cache = this.getCacheOrNull();
    return cache?.templateIndex.get(normalized) ?? null;
  }

  getTemplates(): UiTemplateCatalogTemplate[] {
    return this.getReport().templates;
  }

  getTemplateByFamilyKey(familyKey: string): UiTemplateCatalogTemplate | null {
    const normalized = `${familyKey ?? ''}`.trim();
    if (!normalized) {
      return null;
    }
    const cache = this.getCacheOrNull();
    return cache?.familyIndex.get(normalized) ?? null;
  }

  private getCacheOrNull(): CachedCatalog | null {
    if (!this.catalogFilePath || !fs.existsSync(this.catalogFilePath)) {
      return null;
    }
    const stat = fs.statSync(this.catalogFilePath);
    if (this.cache && this.cache.mtimeMs === stat.mtimeMs) {
      return this.cache;
    }
    this.getReportOrNull();
    return this.cache;
  }
}

let instance: UiTemplateCatalogService | null = null;

export function getUiTemplateCatalogService(): UiTemplateCatalogService {
  if (!instance) {
    instance = new UiTemplateCatalogService();
  }
  return instance;
}
