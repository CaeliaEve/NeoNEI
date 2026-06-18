import fs from 'fs';
import { NESQL_UI_FAMILY_CENSUS_FILE } from '../config/runtime-paths';
import { notFound } from '../utils/http';

export interface UiFamilyCensusMember {
  handler: string;
  modId: string;
  modName: string;
  itemName: string;
  itemNotes: string;
  modRequired: boolean;
  excludedModId: string;
  imageResource: string;
  handlerWidth: number;
  handlerHeight: number;
  yShift: number;
  maxRecipesPerPage: number;
}

export interface UiFamilyCensusFamily {
  familyKey: string;
  canonicalMachineFamily: string;
  layoutKind: string;
  width: number;
  height: number;
  yShift: number;
  maxRecipesPerPage: number;
  imageResource: string;
  members: UiFamilyCensusMember[];
}

export interface UiFamilyCensusSummary {
  handlerCount: number;
  familyCount: number;
  modCount: number;
  layoutKindCount: number;
  nativeFamilyCount: number;
  craftingFamilyCount: number;
  machineFamilyCount: number;
}

export interface UiFamilyCensusSource {
  kind: string;
  resource: string;
  entryCount: number;
  classifier: string;
}

export interface UiFamilyCensusReport {
  schemaVersion: string;
  generatedAt: string;
  source: UiFamilyCensusSource;
  summary: UiFamilyCensusSummary;
  families: UiFamilyCensusFamily[];
}

export interface UiFamilyCensusServiceOptions {
  censusFilePath?: string;
}

type CachedCensus = {
  mtimeMs: number;
  report: UiFamilyCensusReport;
  familyIndex: Map<string, UiFamilyCensusFamily>;
};

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown): boolean {
  return Boolean(value);
}

function normalizeMember(value: unknown): UiFamilyCensusMember | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  return {
    handler: asString(record.handler),
    modId: asString(record.modId),
    modName: asString(record.modName),
    itemName: asString(record.itemName),
    itemNotes: asString(record.itemNotes),
    modRequired: asBoolean(record.modRequired),
    excludedModId: asString(record.excludedModId),
    imageResource: asString(record.imageResource),
    handlerWidth: asNumber(record.handlerWidth),
    handlerHeight: asNumber(record.handlerHeight),
    yShift: asNumber(record.yShift),
    maxRecipesPerPage: asNumber(record.maxRecipesPerPage, 1),
  };
}

function normalizeFamily(value: unknown): UiFamilyCensusFamily | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const members = Array.isArray(record.members)
    ? record.members.map(normalizeMember).filter((entry): entry is UiFamilyCensusMember => Boolean(entry))
    : [];
  return {
    familyKey: asString(record.familyKey),
    canonicalMachineFamily: asString(record.canonicalMachineFamily),
    layoutKind: asString(record.layoutKind),
    width: asNumber(record.width, 166),
    height: asNumber(record.height, 65),
    yShift: asNumber(record.yShift),
    maxRecipesPerPage: asNumber(record.maxRecipesPerPage, 1),
    imageResource: asString(record.imageResource),
    members,
  };
}

function normalizeReport(value: unknown): UiFamilyCensusReport {
  const record = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const sourceRecord = record.source && typeof record.source === 'object' && !Array.isArray(record.source)
    ? record.source as Record<string, unknown>
    : {};
  const summaryRecord = record.summary && typeof record.summary === 'object' && !Array.isArray(record.summary)
    ? record.summary as Record<string, unknown>
    : {};
  const families = Array.isArray(record.families)
    ? record.families.map(normalizeFamily).filter((entry): entry is UiFamilyCensusFamily => Boolean(entry))
    : [];

  return {
    schemaVersion: asString(record.schemaVersion),
    generatedAt: asString(record.generatedAt),
    source: {
      kind: asString(sourceRecord.kind),
      resource: asString(sourceRecord.resource),
      entryCount: asNumber(sourceRecord.entryCount),
      classifier: asString(sourceRecord.classifier),
    },
    summary: {
      handlerCount: asNumber(summaryRecord.handlerCount),
      familyCount: asNumber(summaryRecord.familyCount),
      modCount: asNumber(summaryRecord.modCount),
      layoutKindCount: asNumber(summaryRecord.layoutKindCount),
      nativeFamilyCount: asNumber(summaryRecord.nativeFamilyCount),
      craftingFamilyCount: asNumber(summaryRecord.craftingFamilyCount),
      machineFamilyCount: asNumber(summaryRecord.machineFamilyCount),
    },
    families,
  };
}

export class UiFamilyCensusService {
  private cache: CachedCensus | null = null;
  private readonly censusFilePath: string;

  constructor(options: UiFamilyCensusServiceOptions = {}) {
    this.censusFilePath = options.censusFilePath ?? NESQL_UI_FAMILY_CENSUS_FILE;
  }

  getReport(): UiFamilyCensusReport {
    const report = this.getReportOrNull();
    if (!report) {
      throw notFound(
        'NESQL++ NEI UI family census is not available. Re-export raw-export/validation/ui-family-census.json.',
      );
    }
    return report;
  }

  getReportOrNull(): UiFamilyCensusReport | null {
    if (!this.censusFilePath || !fs.existsSync(this.censusFilePath)) {
      return null;
    }
    const stat = fs.statSync(this.censusFilePath);
    if (this.cache && this.cache.mtimeMs === stat.mtimeMs) {
      return this.cache.report;
    }
    const raw = fs.readFileSync(this.censusFilePath, 'utf8');
    const report = normalizeReport(JSON.parse(raw));
    const familyIndex = new Map<string, UiFamilyCensusFamily>();
    for (const family of report.families) {
      if (family.familyKey) {
        familyIndex.set(family.familyKey, family);
      }
    }
    this.cache = { mtimeMs: stat.mtimeMs, report, familyIndex };
    return report;
  }

  getFamilyByKey(familyKey: string): UiFamilyCensusFamily | null {
    const normalized = `${familyKey ?? ''}`.trim();
    if (!normalized) {
      return null;
    }
    const cache = this.getCacheOrNull();
    return cache?.familyIndex.get(normalized) ?? null;
  }

  getFamilies(): UiFamilyCensusFamily[] {
    return this.getReport().families;
  }

  private getCacheOrNull(): CachedCensus | null {
    if (!this.censusFilePath || !fs.existsSync(this.censusFilePath)) {
      return null;
    }
    const stat = fs.statSync(this.censusFilePath);
    if (this.cache && this.cache.mtimeMs === stat.mtimeMs) {
      return this.cache;
    }
    this.getReportOrNull();
    return this.cache;
  }
}

let instance: UiFamilyCensusService | null = null;

export function getUiFamilyCensusService(): UiFamilyCensusService {
  if (!instance) {
    instance = new UiFamilyCensusService();
  }
  return instance;
}
