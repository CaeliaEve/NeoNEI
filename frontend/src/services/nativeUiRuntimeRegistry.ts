import type {
  UiPackBinding,
  UiPackDynamicPrimitive,
  UiPackRect,
  UiPackRuntime,
  UiPackSlot,
  UiPackTemplate,
  UiPackTextOverlay,
} from "./uiPackRuntime.ts";
import {
  NATIVE_UI_ANCHOR,
  NATIVE_UI_COORDINATE_SPACE,
  resolveNativeUiRectGeometry,
  resolveNativeUiSlotGeometry,
} from "./nativeUiGeometryAbi.ts";
import {
  NATIVE_UI_SCALE_MODE,
  resolveNativeUiBackgroundContract,
  type NativeUiBackgroundContract,
} from "./nativeUiBackgroundAbi.ts";
import { resolveNativeUiInteractionPayload } from "./nativeUiInteractionAbi.ts";
import {
  resolveNativeUiSurfaceContract,
  type NativeUiSurfaceContract,
} from "./nativeUiSurfaceAbi.ts";
import { UI_PACK_RUNTIME_STATUS } from "./uiPackRuntimeAbi.ts";

export type NativeUiSlot = UiPackSlot;
export type NativeUiTextOverlay = UiPackTextOverlay;
export type NativeUiRect = UiPackRect;

export interface NativeUiImageRegion {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface NativeUiDynamicPrimitive extends Partial<UiPackDynamicPrimitive> {
  kind?: string;
  role?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  coordinateSpace?: string;
  anchor?: string;
  fill?: number;
  value?: number;
  ratio?: number;
  orientation?: "horizontal" | "vertical";
  trackColor?: string;
  fillColor?: string;
  borderColor?: string;
  source?: string;
  textureVariant?: "gt-progress-arrow" | "gt-progress-compress";
}

export interface NativeUiLayoutSurface {
  familyKey?: string;
  canonicalMachineFamily?: string;
  layoutKind?: string;
  width?: number;
  height?: number;
  yShift?: number;
  coordinateSpace?: string;
  scaleMode?: string;
  anchor?: string;
  maxRecipesPerPage?: number;
  imageResource?: string;
  imageRegion?: NativeUiImageRegion;
  nativeBackground?: Record<string, unknown> | NativeUiBackgroundContract | null;
  slots?: NativeUiSlot[];
  textOverlays?: NativeUiTextOverlay[];
  dynamicPrimitives?: NativeUiDynamicPrimitive[];
  hotspots?: NativeUiRect[];
  viewports?: NativeUiRect[];
}

export type NativeUiSurfaceSource = "ui-pack-template" | "missing";

export interface NativeUiResolvedSurface {
  source: NativeUiSurfaceSource;
  binding: UiPackBinding | null;
  template: UiPackTemplate | null;
  layout: NativeUiLayoutSurface | null;
  width: number;
  height: number;
  coordinateSpace: NativeUiSurfaceContract["coordinateSpace"];
  scaleMode: NativeUiSurfaceContract["scaleMode"];
  anchor: NativeUiSurfaceContract["anchor"];
  slots: NativeUiSlot[];
  textOverlays: NativeUiTextOverlay[];
  dynamicPrimitives: NativeUiDynamicPrimitive[];
  hotspots: NativeUiRect[];
  viewports: NativeUiRect[];
}

export interface NativeUiSlotCell<TEntry> {
  key: string;
  role: string;
  x: number;
  y: number;
  width: number;
  height: number;
  iconX: number;
  iconY: number;
  iconWidth: number;
  iconHeight: number;
  entry: TEntry | null;
}

export interface NativeUiFitMatrix {
  sourceWidth: number;
  sourceHeight: number;
  availableWidth: number;
  availableHeight: number;
  scale: number;
  fittedWidth: number;
  fittedHeight: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function positiveDimension(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function normalizeNativeUiLayoutSurface(value: unknown): NativeUiLayoutSurface | null {
  const record = asRecord(value);
  return record ? record as NativeUiLayoutSurface : null;
}

function normalizeNativeUiTextOverlay(value: unknown, index: number): NativeUiTextOverlay {
  const record = asRecord(value);
  if (!record) {
    throw new Error(`Native UI text overlay ${index} must be an object`);
  }
  const geometry = resolveNativeUiRectGeometry(record, `Native UI text overlay ${index}`);
  return {
    text: `${record.text ?? ""}`,
    ...geometry,
    coordinateSpace: NATIVE_UI_COORDINATE_SPACE,
    anchor: NATIVE_UI_ANCHOR,
  };
}

function normalizeNativeUiTextOverlayList(value: unknown): NativeUiTextOverlay[] {
  return asArray<unknown>(value).map((entry, index) => normalizeNativeUiTextOverlay(entry, index));
}

function normalizeNativeUiRect(value: unknown, label: string, index: number): NativeUiRect {
  const record = asRecord(value);
  if (!record) {
    throw new Error(`Native UI ${label} ${index} must be an object`);
  }
  const geometry = resolveNativeUiRectGeometry(record, `Native UI ${label} ${index}`);
  const rect = {
    id: `${record.id ?? ""}`,
    kind: `${record.kind ?? ""}`,
    role: `${record.role ?? ""}`,
    label: `${record.label ?? ""}`,
    tooltip: `${record.tooltip ?? ""}`,
    interactionKind: `${record.interactionKind ?? ""}`,
    interactionTargetKind: `${record.interactionTargetKind ?? ""}`,
    interactionTargetId: `${record.interactionTargetId ?? ""}`,
    interactionPayloadSchema: `${record.interactionPayloadSchema ?? ""}`,
    ...geometry,
    coordinateSpace: NATIVE_UI_COORDINATE_SPACE,
    anchor: NATIVE_UI_ANCHOR,
  } satisfies NativeUiRect;
  resolveNativeUiInteractionPayload(rect, `Native UI ${label} ${index}`);
  return rect;
}

function normalizeNativeUiRectList(value: unknown, label: string): NativeUiRect[] {
  return asArray<unknown>(value).map((entry, index) => normalizeNativeUiRect(entry, label, index));
}

function normalizeNativeUiDynamicPrimitive(
  value: unknown,
  defaultKind: string,
  index: number,
): NativeUiDynamicPrimitive {
  const record = asRecord(value);
  if (!record) {
    throw new Error(`Native UI dynamic primitive ${index} must be an object`);
  }
  const primitiveKind = `${record.kind ?? defaultKind}`.trim();
  const primitive: NativeUiDynamicPrimitive = {
    kind: primitiveKind || undefined,
    role: `${record.role ?? ""}`.trim() || undefined,
    fill: Number.isFinite(Number(record.fill)) ? Number(record.fill) : undefined,
    value: Number.isFinite(Number(record.value)) ? Number(record.value) : undefined,
    ratio: Number.isFinite(Number(record.ratio)) ? Number(record.ratio) : undefined,
    orientation: record.orientation === "horizontal" || record.orientation === "vertical"
      ? record.orientation
      : undefined,
    trackColor: `${record.trackColor ?? ""}`.trim() || undefined,
    fillColor: `${record.fillColor ?? ""}`.trim() || undefined,
    borderColor: `${record.borderColor ?? ""}`.trim() || undefined,
    source: `${record.source ?? ""}`.trim() || undefined,
    textureVariant: record.textureVariant === "gt-progress-arrow" || record.textureVariant === "gt-progress-compress"
      ? record.textureVariant
      : undefined,
  };
  const geometry = resolveNativeUiRectGeometry(
    record,
    `Native UI dynamic primitive ${primitive.kind ?? primitive.role ?? index}`,
  );
  return {
    ...primitive,
    ...geometry,
    coordinateSpace: NATIVE_UI_COORDINATE_SPACE,
    anchor: NATIVE_UI_ANCHOR,
  };
}

export function collectNativeUiDynamicPrimitives(layout: NativeUiLayoutSurface | null): NativeUiDynamicPrimitive[] {
  const primitives: NativeUiDynamicPrimitive[] = [];
  const append = (raw: unknown, kind: string) => {
    const baseIndex = primitives.length;
    asArray<unknown>(raw).forEach((primitive, index) => {
      primitives.push(normalizeNativeUiDynamicPrimitive(primitive, kind, baseIndex + index));
    });
  };
  append(layout?.dynamicPrimitives, "");
  return primitives;
}

export function resolveNativeUiRuntimeSurface(options: Readonly<{
  runtime: UiPackRuntime | null | undefined;
  recipeId: string | null | undefined;
  inlineLayout: NativeUiLayoutSurface | null | undefined;
}>): NativeUiResolvedSurface {
  const runtime = options.runtime ?? null;
  const recipeId = `${options.recipeId ?? ""}`.trim();
  const inlineLayout = options.inlineLayout ?? null;
  if (runtime?.status === UI_PACK_RUNTIME_STATUS.error) {
    throw new Error(
      `Native UI runtime failed for ${runtime.manifestUrl || "<unknown manifest>"}: ${runtime.error || "<missing error detail>"}`,
    );
  }
  const binding = recipeId ? runtime?.bindingsByRecipeId.get(recipeId) ?? null : null;
  if (runtime?.status === UI_PACK_RUNTIME_STATUS.ready && !binding) {
    throw new Error(`Native UI runtime has no recipe binding for recipeId: ${recipeId || "<missing>"}`);
  }
  const template = binding?.templateKey
    ? runtime?.templatesByKey.get(binding.templateKey) ?? null
    : null;
  if (runtime?.status === UI_PACK_RUNTIME_STATUS.ready && binding && !template) {
    throw new Error(`Native UI runtime binding ${binding.recipeId} references missing template: ${binding.templateKey || "<missing>"}`);
  }

  const layout = template
    ? {
      familyKey: template.familyKey,
      canonicalMachineFamily: template.canonicalMachineFamily,
      layoutKind: template.layoutKind,
      width: template.width,
      height: template.height,
      yShift: template.yShift,
      coordinateSpace: template.coordinateSpace,
      scaleMode: template.scaleMode,
      anchor: template.anchor,
      maxRecipesPerPage: template.maxRecipesPerPage,
      imageResource: template.imageResource,
      imageRegion: inlineLayout?.imageRegion,
      nativeBackground: template.nativeBackground,
      slots: template.slots,
      textOverlays: template.textOverlays,
      dynamicPrimitives: template.dynamicPrimitives,
      hotspots: template.hotspots,
      viewports: template.viewports,
    } satisfies NativeUiLayoutSurface
    : null;

  const source: NativeUiSurfaceSource = template ? "ui-pack-template" : "missing";

  const surfaceContract = layout
    ? resolveNativeUiSurfaceContract(layout, "Native UI runtime surface")
    : null;
  const width = positiveDimension(surfaceContract?.width);
  const height = positiveDimension(surfaceContract?.height);
  const nativeBackground = layout
    ? resolveNativeUiBackgroundContract({ ...layout, width, height }, "Native UI runtime surface background")
    : null;
  const slots = asArray<NativeUiSlot>(layout?.slots);
  const textOverlays = normalizeNativeUiTextOverlayList(layout?.textOverlays);
  const dynamicPrimitives = collectNativeUiDynamicPrimitives(layout);
  const hotspots = normalizeNativeUiRectList(layout?.hotspots, "hotspot");
  const viewports = normalizeNativeUiRectList(layout?.viewports, "viewport");
  const normalizedLayout: NativeUiLayoutSurface | null = layout
    ? {
      ...layout,
      width: surfaceContract?.width ?? width,
      height: surfaceContract?.height ?? height,
      coordinateSpace: surfaceContract?.coordinateSpace,
      scaleMode: surfaceContract?.scaleMode,
      anchor: surfaceContract?.anchor,
      nativeBackground,
      slots,
      textOverlays,
      dynamicPrimitives,
      hotspots,
      viewports,
    }
    : null;

  return {
    source,
    binding,
    template,
    layout: normalizedLayout,
    width,
    height,
    coordinateSpace: surfaceContract?.coordinateSpace ?? NATIVE_UI_COORDINATE_SPACE,
    scaleMode: surfaceContract?.scaleMode ?? NATIVE_UI_SCALE_MODE,
    anchor: surfaceContract?.anchor ?? NATIVE_UI_ANCHOR,
    slots,
    textOverlays,
    dynamicPrimitives,
    hotspots,
    viewports,
  };
}

export function buildNativeUiSlotCells<TEntry>(options: Readonly<{
  slots: readonly NativeUiSlot[];
  layout?: NativeUiLayoutSurface | null;
  resolveRoleEntries: (role: string) => readonly TEntry[];
}>): NativeUiSlotCell<TEntry>[] {
  if (isGregTechCountAwareSlotLayout(options.layout)) {
    return buildGregTechCountAwareSlotCells(options);
  }

  const cells: NativeUiSlotCell<TEntry>[] = [];
  options.slots.forEach((slot, groupIndex) => {
    const role = `${slot.role ?? ""}`.trim();
    if (!role) {
      throw new Error(`Native UI slot ${groupIndex} missing required role`);
    }
    const columns = Math.trunc(Number(slot.columns));
    const rows = Math.trunc(Number(slot.rows));
    if (!Number.isFinite(columns) || columns <= 0 || !Number.isFinite(rows) || rows <= 0) {
      throw new Error(`Native UI slot ${role}:${groupIndex} has invalid grid dimensions`);
    }
    const geometry = resolveNativeUiSlotGeometry(slot, `Native UI slot ${role}:${groupIndex}`);
    const entries = options.resolveRoleEntries(role);
    const rawStart = Math.max(0, Number(slot.startIndex ?? 0) || 0);
    const start = rawStart >= entries.length ? 0 : rawStart;
    const count = columns * rows;
    for (let index = 0; index < count; index += 1) {
      const col = index % columns;
      const row = Math.floor(index / columns);
      cells.push({
        key: `${role}:${groupIndex}:${index}`,
        role,
        x: geometry.x + col * geometry.pitchX,
        y: geometry.y + row * geometry.pitchY,
        width: geometry.width,
        height: geometry.height,
        iconX: geometry.iconX + col * geometry.pitchX,
        iconY: geometry.iconY + row * geometry.pitchY,
        iconWidth: geometry.iconWidth,
        iconHeight: geometry.iconHeight,
        entry: entries[start + index] ?? null,
      });
    }
  });
  return cells;
}

function isGregTechCountAwareSlotLayout(layout: NativeUiLayoutSurface | null | undefined): boolean {
  const family = `${layout?.canonicalMachineFamily ?? ""}`.trim().toLowerCase();
  const kind = `${layout?.layoutKind ?? ""}`.trim().toLowerCase();
  return family === "gregtech-machine" && (kind === "machine" || kind === "fluid-machine");
}

function buildGregTechCountAwareSlotCells<TEntry>(options: Readonly<{
  slots: readonly NativeUiSlot[];
  resolveRoleEntries: (role: string) => readonly TEntry[];
}>): NativeUiSlotCell<TEntry>[] {
  const cells: NativeUiSlotCell<TEntry>[] = [];
  options.slots.forEach((slot, groupIndex) => {
    const role = `${slot.role ?? ""}`.trim();
    if (!role) {
      throw new Error(`Native UI slot ${groupIndex} missing required role`);
    }
    const normalizedRole = role.toLowerCase();
    const entries = options.resolveRoleEntries(role);
    const positions = gregTechSlotPositionsForRole(normalizedRole, entries.length);
    if (!positions) {
      appendTemplateSlotCells(cells, slot, groupIndex, entries);
      return;
    }
    if (positions.length === 0) return;
    const geometry = resolveNativeUiSlotGeometry(slot, `Native UI slot ${role}:${groupIndex}`);
    positions.forEach((position, index) => {
      cells.push({
        key: `${role}:${groupIndex}:${index}`,
        role,
        x: position.x,
        y: position.y,
        width: geometry.width,
        height: geometry.height,
        iconX: position.x + Math.floor((geometry.width - geometry.iconWidth) / 2),
        iconY: position.y + Math.floor((geometry.height - geometry.iconHeight) / 2),
        iconWidth: geometry.iconWidth,
        iconHeight: geometry.iconHeight,
        entry: entries[index] ?? null,
      });
    });
  });
  return cells;
}

function appendTemplateSlotCells<TEntry>(
  cells: NativeUiSlotCell<TEntry>[],
  slot: NativeUiSlot,
  groupIndex: number,
  entries: readonly TEntry[],
): void {
  const role = `${slot.role ?? ""}`.trim();
  const columns = Math.trunc(Number(slot.columns));
  const rows = Math.trunc(Number(slot.rows));
  if (!Number.isFinite(columns) || columns <= 0 || !Number.isFinite(rows) || rows <= 0) {
    throw new Error(`Native UI slot ${role}:${groupIndex} has invalid grid dimensions`);
  }
  const geometry = resolveNativeUiSlotGeometry(slot, `Native UI slot ${role}:${groupIndex}`);
  const rawStart = Math.max(0, Number(slot.startIndex ?? 0) || 0);
  const start = rawStart >= entries.length ? 0 : rawStart;
  const count = columns * rows;
  for (let index = 0; index < count; index += 1) {
    const col = index % columns;
    const row = Math.floor(index / columns);
    cells.push({
      key: `${role}:${groupIndex}:${index}`,
      role,
      x: geometry.x + col * geometry.pitchX,
      y: geometry.y + row * geometry.pitchY,
      width: geometry.width,
      height: geometry.height,
      iconX: geometry.iconX + col * geometry.pitchX,
      iconY: geometry.iconY + row * geometry.pitchY,
      iconWidth: geometry.iconWidth,
      iconHeight: geometry.iconHeight,
      entry: entries[start + index] ?? null,
    });
  }
}

function gregTechSlotPositionsForRole(role: string, count: number): Array<{ x: number; y: number }> | null {
  const total = Math.max(0, Math.trunc(Number(count) || 0));
  if (role.includes("fuel")) return [];
  if (role.includes("fluid")) {
    return role.includes("output")
      ? gregTechFluidOutputPositions(total)
      : gregTechFluidInputPositions(total);
  }
  if (role.includes("output")) return gregTechItemOutputPositions(total);
  return gregTechItemInputPositions(total);
}

function gregTechGridPositions(
  totalCount: number,
  xOrigin: number,
  yOrigin: number,
  xDirMaxCount: number,
  yDirMaxCount = 100,
): Array<{ x: number; y: number }> {
  const positions: Array<{ x: number; y: number }> = [];
  let count = 0;
  for (let row = 0; row < yDirMaxCount; row += 1) {
    for (let col = 0; col < xDirMaxCount; col += 1) {
      if (count >= totalCount) return positions;
      positions.push({ x: xOrigin + col * 18, y: yOrigin + row * 18 });
      count += 1;
    }
  }
  return positions;
}

function gregTechItemInputPositions(count: number): Array<{ x: number; y: number }> {
  switch (count) {
    case 0: return [];
    case 1: return gregTechGridPositions(count, 52, 24, 1, 1);
    case 2: return gregTechGridPositions(count, 34, 24, 2, 1);
    case 3: return gregTechGridPositions(count, 16, 24, 3, 1);
    case 4: return gregTechGridPositions(count, 34, 15, 2, 2);
    case 5:
    case 6: return gregTechGridPositions(count, 16, 15, 3, 2);
    default: return gregTechGridPositions(count, 16, 6, 3);
  }
}

function gregTechItemOutputPositions(count: number): Array<{ x: number; y: number }> {
  switch (count) {
    case 0: return [];
    case 1: return gregTechGridPositions(count, 106, 24, 1, 1);
    case 2: return gregTechGridPositions(count, 106, 24, 2, 1);
    case 3: return gregTechGridPositions(count, 106, 24, 3, 1);
    case 4: return gregTechGridPositions(count, 106, 15, 2, 2);
    case 5:
    case 6: return gregTechGridPositions(count, 106, 15, 3, 2);
    default: return gregTechGridPositions(count, 106, 6, 3);
  }
}

function gregTechFluidInputPositions(count: number): Array<{ x: number; y: number }> {
  const positions: Array<{ x: number; y: number }> = [];
  const base = Math.max(70 - count * 18, 16);
  for (let index = 0; index < count; index += 1) {
    positions.push({ x: base + index * 18, y: 62 });
  }
  return positions;
}

function gregTechFluidOutputPositions(count: number): Array<{ x: number; y: number }> {
  const positions: Array<{ x: number; y: number }> = [];
  for (let index = 0; index < count; index += 1) {
    positions.push({ x: 106 + index * 18, y: 62 });
  }
  return positions;
}

export function createNativeUiFitMatrix(options: Readonly<{
  sourceWidth: number;
  sourceHeight: number;
  availableWidth: number;
  availableHeight: number;
  scaleMode: string;
}>): NativeUiFitMatrix {
  if (options.scaleMode !== NATIVE_UI_SCALE_MODE) {
    throw new Error(`Native UI fit matrix uses unsupported scaleMode: ${options.scaleMode}`);
  }
  const sourceWidth = Math.max(1, Math.ceil(options.sourceWidth));
  const sourceHeight = Math.max(1, Math.ceil(options.sourceHeight));
  const availableWidth = options.availableWidth > 0 ? options.availableWidth : sourceWidth;
  const availableHeight = options.availableHeight > 0 ? options.availableHeight : sourceHeight;
  const scale = Math.max(0.05, Math.min(availableWidth / sourceWidth, availableHeight / sourceHeight));
  return {
    sourceWidth,
    sourceHeight,
    availableWidth,
    availableHeight,
    scale,
    fittedWidth: Math.max(1, Math.round(sourceWidth * scale)),
    fittedHeight: Math.max(1, Math.round(sourceHeight * scale)),
  };
}
