import { resolveManifestRelativeUrl } from '../native-surface/runtimeLoader.ts';
import {
  loadUiPackRuntime,
  type UiPackBinding,
  type UiPackRuntime,
  type UiPackSlot,
  type UiPackTemplate,
} from './uiPackRuntime.ts';
import { isRegisteredRecipeComponentName } from '../components/recipe-display/recipeComponentCatalog.ts';
import { resolveRecipePresentationProfileFromBinding } from '../composables/recipe-display/recipeRendererRegistry.ts';

export type UiStudioFamilyStatus =
  | 'covered'
  | 'partial'
  | 'unmapped-family'
  | 'unregistered-component'
  | 'missing-template'
  | 'unbound';

export interface UiStudioSlotSummary {
  role: string;
  startIndex: number;
  columns: number;
  rows: number;
  x: number;
  y: number;
  slotWidth: number;
  slotHeight: number;
  pitchX: number;
  pitchY: number;
  coordinateSpace: string;
  anchor: string;
}

export interface UiStudioFamilyRow {
  familyKey: string;
  canonicalMachineFamily: string;
  layoutKind: string;
  status: UiStudioFamilyStatus;
  statusLabel: string;
  severity: number;
  gapReason: string;
  recipeCount: number;
  boundRecipeCount: number;
  unboundRecipeCount: number;
  coverageRatio: number;
  templateCount: number;
  templateKey: string | null;
  templateSignature: string | null;
  width: number | null;
  height: number | null;
  yShift: number | null;
  maxRecipesPerPage: number | null;
  slotCount: number;
  dynamicPrimitiveCount: number;
  handlerCount: number;
  uiType: string | null;
  component: string | null;
  renderMode: string | null;
  presentationReason: string | null;
  registeredComponent: boolean;
  sampleRecipeIds: string[];
  sampleBoundRecipeIds: string[];
  sampleUnboundRecipeIds: string[];
  machineTypes: string[];
  recipeTypes: string[];
  modIds: string[];
  handlerClasses: string[];
  slots: UiStudioSlotSummary[];
}

export interface UiStudioSummary {
  familyCount: number;
  templateCount: number;
  bindingCount: number;
  boundRecipeCount: number;
  unboundRecipeCount: number;
  coveredFamilyCount: number;
  partialFamilyCount: number;
  gapFamilyCount: number;
  slotCount: number;
  dynamicPrimitiveCount: number;
  assetCount: number;
  coverageRatio: number;
}

export interface UiStudioPolicySummary {
  packStatus: string;
  assetPolicy: string;
  uiBackgroundStatus: string;
  retiredNativeArtifacts: string[];
  generatedAt: string | null;
  source: string | null;
}

export interface UiStudioReport {
  summary: UiStudioSummary;
  policy: UiStudioPolicySummary;
  families: UiStudioFamilyRow[];
  loadedAt: string;
  manifestUrl: string;
}

export interface UiStudioBuildInput {
  runtime: UiPackRuntime;
  packReport?: UiPackReport | null;
  assetManifest?: UiAssetManifest | null;
  familyCensus?: UiFamilyCensus | null;
  sampleLimit?: number;
}

type JsonRecord = Record<string, unknown>;

type UiPackReport = JsonRecord & {
  generatedAt?: string;
  source?: string;
  status?: string;
  assets?: {
    uiBackgrounds?: {
      status?: string;
    };
  };
};

type UiAssetManifest = JsonRecord & {
  assetPolicy?: string;
  retiredNativeArtifacts?: unknown[];
  generatedAt?: string;
};

type UiFamilyMember = {
  handler?: string;
  modId?: string;
};

type UiFamilyCensusEntry = {
  familyKey?: string;
  canonicalMachineFamily?: string;
  layoutKind?: string;
  width?: number;
  height?: number;
  maxRecipesPerPage?: number;
  members?: UiFamilyMember[];
};

type UiFamilyCensus = JsonRecord & {
  generatedAt?: string;
  source?: string;
  families?: UiFamilyCensusEntry[];
};

type MutableFamilyRow = Omit<UiStudioFamilyRow, 'machineTypes' | 'recipeTypes' | 'modIds' | 'handlerClasses'> & {
  machineTypeCounts: Map<string, number>;
  recipeTypeCounts: Map<string, number>;
  modIdCounts: Map<string, number>;
  handlerClassCounts: Map<string, number>;
  presentationBinding: UiPackBinding | null;
};

const UI_PACK_REPORT_PATH = 'rust/ui-pack/ui_pack_report.json';
const UI_ASSET_MANIFEST_PATH = 'rust/ui-pack/ui_assets.manifest.json';
const UI_FAMILY_CENSUS_PATH = 'rust/ui-pack/ui_family_census.json';
const DEFAULT_SAMPLE_LIMIT = 6;
const TOP_VALUE_LIMIT = 8;

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function pushUniqueSample(values: string[], value: string | null | undefined, limit: number): void {
  const normalized = asText(value);
  if (!normalized || values.length >= limit || values.includes(normalized)) return;
  values.push(normalized);
}

function addCount(counts: Map<string, number>, value: string | null | undefined): void {
  const normalized = asText(value);
  if (!normalized) return;
  counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
}

function topValues(counts: Map<string, number>, limit = TOP_VALUE_LIMIT): string[] {
  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([value]) => value);
}

function toSlotSummary(slot: UiPackSlot): UiStudioSlotSummary {
  return {
    role: slot.role,
    startIndex: slot.startIndex,
    columns: slot.columns,
    rows: slot.rows,
    x: slot.x,
    y: slot.y,
    slotWidth: slot.slotWidth,
    slotHeight: slot.slotHeight,
    pitchX: slot.pitchX,
    pitchY: slot.pitchY,
    coordinateSpace: slot.coordinateSpace,
    anchor: slot.anchor,
  };
}

function createMutableRow(familyKey: string): MutableFamilyRow {
  return {
    familyKey,
    canonicalMachineFamily: '',
    layoutKind: '',
    status: 'missing-template',
    statusLabel: '缺少模板',
    severity: 50,
    gapReason: '',
    recipeCount: 0,
    boundRecipeCount: 0,
    unboundRecipeCount: 0,
    coverageRatio: 0,
    templateCount: 0,
    templateKey: null,
    templateSignature: null,
    width: null,
    height: null,
    yShift: null,
    maxRecipesPerPage: null,
    slotCount: 0,
    dynamicPrimitiveCount: 0,
    handlerCount: 0,
    uiType: null,
    component: null,
    renderMode: null,
    presentationReason: null,
    registeredComponent: false,
    sampleRecipeIds: [],
    sampleBoundRecipeIds: [],
    sampleUnboundRecipeIds: [],
    machineTypeCounts: new Map(),
    recipeTypeCounts: new Map(),
    modIdCounts: new Map(),
    handlerClassCounts: new Map(),
    presentationBinding: null,
    slots: [],
  };
}

function getOrCreateRow(rowsByFamilyKey: Map<string, MutableFamilyRow>, familyKey: string): MutableFamilyRow {
  const normalized = asText(familyKey) || 'unknown';
  let row = rowsByFamilyKey.get(normalized);
  if (!row) {
    row = createMutableRow(normalized);
    rowsByFamilyKey.set(normalized, row);
  }
  return row;
}

function applyTemplate(row: MutableFamilyRow, template: UiPackTemplate): void {
  row.templateCount += 1;
  row.templateKey ??= template.templateKey || null;
  row.templateSignature ??= template.templateSignature || null;
  row.canonicalMachineFamily ||= template.canonicalMachineFamily;
  row.layoutKind ||= template.layoutKind;
  row.width ??= template.width;
  row.height ??= template.height;
  row.yShift ??= template.yShift;
  row.maxRecipesPerPage ??= template.maxRecipesPerPage;
  row.slotCount += template.slots.length;
  row.dynamicPrimitiveCount += template.dynamicPrimitives.length;
  row.handlerCount += template.handlerCount;
  if (row.slots.length === 0) {
    row.slots = template.slots.map(toSlotSummary);
  }
}

function applyBinding(row: MutableFamilyRow, binding: UiPackBinding, sampleLimit: number): void {
  row.recipeCount += 1;
  row.canonicalMachineFamily ||= binding.canonicalMachineFamily;
  row.layoutKind ||= binding.layoutKind;
  addCount(row.machineTypeCounts, binding.machineType);
  addCount(row.recipeTypeCounts, binding.recipeType);
  pushUniqueSample(row.sampleRecipeIds, binding.recipeId, sampleLimit);
  if (binding.bound) {
    row.boundRecipeCount += 1;
    pushUniqueSample(row.sampleBoundRecipeIds, binding.recipeId, sampleLimit);
    row.templateKey ??= binding.templateKey || null;
    row.templateSignature ??= binding.templateSignature || null;
    row.presentationBinding ??= binding;
  } else {
    row.unboundRecipeCount += 1;
    pushUniqueSample(row.sampleUnboundRecipeIds, binding.recipeId, sampleLimit);
  }
}

function applyFamilyCensus(row: MutableFamilyRow, census: UiFamilyCensusEntry): void {
  row.canonicalMachineFamily ||= asText(census.canonicalMachineFamily);
  row.layoutKind ||= asText(census.layoutKind);
  row.width ??= asNumber(census.width);
  row.height ??= asNumber(census.height);
  row.maxRecipesPerPage ??= asNumber(census.maxRecipesPerPage);
  for (const member of Array.isArray(census.members) ? census.members : []) {
    addCount(row.handlerClassCounts, member.handler);
    addCount(row.modIdCounts, member.modId);
  }
}

function resolvePresentation(row: MutableFamilyRow): void {
  if (!row.presentationBinding) {
    return;
  }
  try {
    const profile = resolveRecipePresentationProfileFromBinding(row.presentationBinding);
    row.uiType = profile.uiConfig.uiType;
    row.component = profile.component;
    row.renderMode = profile.renderMode;
    row.presentationReason = profile.reason;
    row.registeredComponent = profile.renderMode === 'detailed_crafting'
      || isRegisteredRecipeComponentName(profile.component);
  } catch (error) {
    row.presentationReason = error instanceof Error ? error.message : String(error);
  }
}

function finalizeStatus(row: MutableFamilyRow): void {
  row.coverageRatio = row.recipeCount > 0 ? row.boundRecipeCount / row.recipeCount : 0;

  if (row.templateCount === 0 || !row.templateKey) {
    row.status = row.recipeCount > 0 && row.boundRecipeCount === 0 ? 'unbound' : 'missing-template';
    row.statusLabel = row.status === 'unbound' ? '未绑定模板' : '缺少模板';
    row.severity = row.status === 'unbound' ? 90 : 80;
    row.gapReason = row.status === 'unbound'
      ? '该 family 有配方 payload，但没有任何模板绑定；需要先确认导出侧 familyKey/templateKey。'
      : 'UI family census 中存在该 family，但当前模板包没有可用模板。';
    return;
  }

  if (!row.uiType || !row.component) {
    row.status = 'unmapped-family';
    row.statusLabel = '未映射 UI';
    row.severity = 70;
    row.gapReason = row.presentationReason
      || 'UiPackBinding v2 缺少可注册的 rendererId；需要补充声明式 presentation catalog 和对应手写组件。';
    return;
  }

  if (!row.registeredComponent) {
    row.status = 'unregistered-component';
    row.statusLabel = '组件未注册';
    row.severity = 60;
    row.gapReason = `uiType 已解析为 ${row.uiType}，但组件 ${row.component} 未进入组件注册表。`;
    return;
  }

  if (row.unboundRecipeCount > 0) {
    row.status = 'partial';
    row.statusLabel = '部分绑定';
    row.severity = 40;
    row.gapReason = '该 family 已有手写 UI 组件，但仍存在未绑定 recipe payload；优先检查导出模板签名或 family 分流。';
    return;
  }

  row.status = 'covered';
  row.statusLabel = '已适配';
  row.severity = 0;
  row.gapReason = '';
}

function freezeRow(row: MutableFamilyRow): UiStudioFamilyRow {
  return {
    familyKey: row.familyKey,
    canonicalMachineFamily: row.canonicalMachineFamily || 'unknown',
    layoutKind: row.layoutKind || 'unknown',
    status: row.status,
    statusLabel: row.statusLabel,
    severity: row.severity,
    gapReason: row.gapReason,
    recipeCount: row.recipeCount,
    boundRecipeCount: row.boundRecipeCount,
    unboundRecipeCount: row.unboundRecipeCount,
    coverageRatio: row.coverageRatio,
    templateCount: row.templateCount,
    templateKey: row.templateKey,
    templateSignature: row.templateSignature,
    width: row.width,
    height: row.height,
    yShift: row.yShift,
    maxRecipesPerPage: row.maxRecipesPerPage,
    slotCount: row.slotCount,
    dynamicPrimitiveCount: row.dynamicPrimitiveCount,
    handlerCount: row.handlerCount,
    uiType: row.uiType,
    component: row.component,
    renderMode: row.renderMode,
    presentationReason: row.presentationReason,
    registeredComponent: row.registeredComponent,
    sampleRecipeIds: row.sampleRecipeIds,
    sampleBoundRecipeIds: row.sampleBoundRecipeIds,
    sampleUnboundRecipeIds: row.sampleUnboundRecipeIds,
    machineTypes: topValues(row.machineTypeCounts),
    recipeTypes: topValues(row.recipeTypeCounts),
    modIds: topValues(row.modIdCounts),
    handlerClasses: topValues(row.handlerClassCounts, 12),
    slots: row.slots,
  };
}

function asStringArray(values: unknown): string[] {
  return Array.isArray(values) ? values.map(asText).filter(Boolean) : [];
}

export function buildUiStudioReport(input: UiStudioBuildInput): UiStudioReport {
  const sampleLimit = Math.max(1, input.sampleLimit ?? DEFAULT_SAMPLE_LIMIT);
  const rowsByFamilyKey = new Map<string, MutableFamilyRow>();

  for (const template of input.runtime.templates) {
    const row = getOrCreateRow(rowsByFamilyKey, template.familyKey);
    applyTemplate(row, template);
  }

  for (const binding of input.runtime.bindings) {
    const row = getOrCreateRow(rowsByFamilyKey, binding.familyKey);
    applyBinding(row, binding, sampleLimit);
  }

  for (const census of Array.isArray(input.familyCensus?.families) ? input.familyCensus.families : []) {
    const familyKey = asText(census.familyKey);
    if (!familyKey) continue;
    applyFamilyCensus(getOrCreateRow(rowsByFamilyKey, familyKey), census);
  }

  const families = Array.from(rowsByFamilyKey.values())
    .map((row) => {
      resolvePresentation(row);
      finalizeStatus(row);
      return freezeRow(row);
    })
    .sort((left, right) => (
      right.severity - left.severity
      || right.unboundRecipeCount - left.unboundRecipeCount
      || right.recipeCount - left.recipeCount
      || left.familyKey.localeCompare(right.familyKey)
    ));

  const coveredFamilyCount = families.filter((row) => row.status === 'covered').length;
  const partialFamilyCount = families.filter((row) => row.status === 'partial').length;
  const gapFamilyCount = families.length - coveredFamilyCount - partialFamilyCount;
  const bindingCount = input.runtime.summary.bindingCount || input.runtime.bindings.length;
  const boundRecipeCount = input.runtime.summary.boundRecipeCount;
  const unboundRecipeCount = input.runtime.summary.unboundRecipeCount;

  return {
    summary: {
      familyCount: families.length,
      templateCount: input.runtime.summary.templateCount || input.runtime.templates.length,
      bindingCount,
      boundRecipeCount,
      unboundRecipeCount,
      coveredFamilyCount,
      partialFamilyCount,
      gapFamilyCount,
      slotCount: input.runtime.summary.slotCount,
      dynamicPrimitiveCount: input.runtime.summary.dynamicPrimitiveCount,
      assetCount: input.runtime.summary.assetCount,
      coverageRatio: bindingCount > 0 ? boundRecipeCount / bindingCount : 0,
    },
    policy: {
      packStatus: asText(input.packReport?.status) || input.runtime.status,
      assetPolicy: asText(input.assetManifest?.assetPolicy) || (input.runtime.summary.assetCount === 0 ? 'web-authored-ui-only' : 'unknown'),
      uiBackgroundStatus: asText(input.packReport?.assets?.uiBackgrounds?.status) || (input.runtime.summary.assetCount === 0 ? 'retired' : 'unknown'),
      retiredNativeArtifacts: asStringArray(input.assetManifest?.retiredNativeArtifacts),
      generatedAt: asText(input.packReport?.generatedAt) || asText(input.familyCensus?.generatedAt) || null,
      source: asText(input.packReport?.source) || asText(input.familyCensus?.source) || null,
    },
    families,
    loadedAt: new Date().toISOString(),
    manifestUrl: input.runtime.manifestUrl,
  };
}

async function fetchRuntimeJsonArtifact<T extends JsonRecord>(
  manifestUrl: string,
  relativePath: string,
): Promise<T | null> {
  try {
    const url = resolveManifestRelativeUrl(manifestUrl, relativePath);
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) return null;
    const payload = await response.json() as unknown;
    return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as T : null;
  } catch (error) {
    console.warn(`[ui-studio] failed to load optional runtime artifact ${relativePath}`, error);
    return null;
  }
}

export async function loadUiStudioReport(manifestUrl?: string): Promise<UiStudioReport> {
  const runtime = await loadUiPackRuntime(manifestUrl);
  if (runtime.status !== 'ready') {
    throw new Error(runtime.error || 'UI Pack runtime is not ready.');
  }

  const [packReport, assetManifest, familyCensus] = await Promise.all([
    fetchRuntimeJsonArtifact<UiPackReport>(runtime.manifestUrl, UI_PACK_REPORT_PATH),
    fetchRuntimeJsonArtifact<UiAssetManifest>(runtime.manifestUrl, UI_ASSET_MANIFEST_PATH),
    fetchRuntimeJsonArtifact<UiFamilyCensus>(runtime.manifestUrl, UI_FAMILY_CENSUS_PATH),
  ]);

  return buildUiStudioReport({
    runtime,
    packReport,
    assetManifest,
    familyCensus,
  });
}

