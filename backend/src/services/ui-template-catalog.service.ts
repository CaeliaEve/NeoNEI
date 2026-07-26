import fs from 'fs';
import { notFound } from '../utils/http';
import { CURRENT_RUNTIME_ARTIFACT_PATHS } from './current-runtime-artifact-index-abi';
import { resolveDistDataRuntimeFile } from './current-runtime-artifact-index.service';

export interface UiTemplateCatalogSlot {
  role: string;
  startIndex: number;
  columns: number;
  rows: number;
  x: number;
  y: number;
  coordinateSpace: string;
  anchor: string;
  slotWidth: number;
  slotHeight: number;
  pitchX: number;
  pitchY: number;
}

export interface UiTemplateCatalogTextOverlay {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface UiTemplateCatalogDynamicPrimitive {
  kind: string;
  role: string;
  x: number;
  y: number;
  width: number;
  height: number;
  coordinateSpace: string;
  anchor: string;
  orientation: string;
  source: string;
  trackColor: string;
  fillColor: string;
  borderColor: string;
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
  dynamicPrimitives: UiTemplateCatalogDynamicPrimitive[];
  textOverlays: UiTemplateCatalogTextOverlay[];
}

export interface UiTemplateCatalogSummary {
  handlerCount: number;
  templateCount: number;
  familyCount: number;
  layoutKindCount: number;
  slotCount: number;
  primitiveCount: number;
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
  filePath: string;
  mtimeMs: number;
  report: UiTemplateCatalogReport;
  templateIndex: Map<string, UiTemplateCatalogTemplate>;
  familyIndex: Map<string, UiTemplateCatalogTemplate>;
};

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asNumber(value: unknown, defaultValue = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : defaultValue;
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
    coordinateSpace: asString(record.coordinateSpace),
    anchor: asString(record.anchor),
    slotWidth: asNumber(record.slotWidth),
    slotHeight: asNumber(record.slotHeight),
    pitchX: asNumber(record.pitchX),
    pitchY: asNumber(record.pitchY),
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

function normalizeDynamicPrimitive(value: unknown): UiTemplateCatalogDynamicPrimitive | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  return {
    kind: asString(record.kind),
    role: asString(record.role),
    x: asNumber(record.x),
    y: asNumber(record.y),
    width: asNumber(record.width),
    height: asNumber(record.height),
    coordinateSpace: asString(record.coordinateSpace),
    anchor: asString(record.anchor),
    orientation: asString(record.orientation),
    source: asString(record.source),
    trackColor: asString(record.trackColor),
    fillColor: asString(record.fillColor),
    borderColor: asString(record.borderColor),
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
  const dynamicPrimitives = Array.isArray(record.dynamicPrimitives)
    ? record.dynamicPrimitives.map(normalizeDynamicPrimitive).filter((entry): entry is UiTemplateCatalogDynamicPrimitive => Boolean(entry))
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
    dynamicPrimitives,
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
      primitiveCount: asNumber(summaryRecord.primitiveCount),
      overlayCount: asNumber(summaryRecord.overlayCount),
    },
    templates,
  };
}

export class UiTemplateCatalogService {
  private cache: CachedCatalog | null = null;
  private readonly explicitCatalogFilePath: string | null;

  constructor(options: UiTemplateCatalogServiceOptions = {}) {
    this.explicitCatalogFilePath = options.catalogFilePath ?? null;
  }

  private resolveCatalogFilePath(): string {
    return this.explicitCatalogFilePath
      ?? resolveDistDataRuntimeFile(CURRENT_RUNTIME_ARTIFACT_PATHS.uiTemplateCatalog);
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

  getReportOrNull(catalogFilePath = this.resolveCatalogFilePath()): UiTemplateCatalogReport | null {
    if (!fs.existsSync(catalogFilePath)) {
      return null;
    }
    const stat = fs.statSync(catalogFilePath);
    if (this.cache && this.cache.filePath === catalogFilePath && this.cache.mtimeMs === stat.mtimeMs) {
      return this.cache.report;
    }
    const raw = fs.readFileSync(catalogFilePath, 'utf8');
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
    this.cache = { filePath: catalogFilePath, mtimeMs: stat.mtimeMs, report, templateIndex, familyIndex };
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

  private getCacheOrNull(catalogFilePath = this.resolveCatalogFilePath()): CachedCatalog | null {
    if (!fs.existsSync(catalogFilePath)) {
      return null;
    }
    const stat = fs.statSync(catalogFilePath);
    if (this.cache && this.cache.filePath === catalogFilePath && this.cache.mtimeMs === stat.mtimeMs) {
      return this.cache;
    }
    this.getReportOrNull(catalogFilePath);
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
