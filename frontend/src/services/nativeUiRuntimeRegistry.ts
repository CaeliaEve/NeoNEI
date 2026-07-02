import type {
  UiPackBinding,
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

export type NativeUiSlot = UiPackSlot;
export type NativeUiTextOverlay = UiPackTextOverlay;
export type NativeUiRect = UiPackRect;

export interface NativeUiImageRegion {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface NativeUiDynamicPrimitive {
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
}

export interface NativeUiLayoutSurface {
  width?: number;
  height?: number;
  imageResource?: string;
  imageRegion?: NativeUiImageRegion;
  nativeBackground?: Record<string, unknown> | null;
  slots?: NativeUiSlot[];
  textOverlays?: NativeUiTextOverlay[];
  dynamicPrimitives?: NativeUiDynamicPrimitive[];
  progressBars?: NativeUiDynamicPrimitive[];
  fluidBars?: NativeUiDynamicPrimitive[];
  energyBars?: NativeUiDynamicPrimitive[];
  hotspots?: NativeUiRect[];
  viewports?: NativeUiRect[];
}

export type NativeUiSurfaceSource = "ui-pack-template" | "inline-native-layout" | "missing";

export interface NativeUiResolvedSurface {
  source: NativeUiSurfaceSource;
  binding: UiPackBinding | null;
  template: UiPackTemplate | null;
  layout: NativeUiLayoutSurface | null;
  width: number;
  height: number;
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

function positiveDimension(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
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
  return {
    id: `${record.id ?? ""}`,
    kind: `${record.kind ?? ""}`,
    role: `${record.role ?? ""}`,
    label: `${record.label ?? ""}`,
    tooltip: `${record.tooltip ?? ""}`,
    action: `${record.action ?? ""}`,
    itemId: `${record.itemId ?? ""}`,
    payloadKey: `${record.payloadKey ?? ""}`,
    ...geometry,
    coordinateSpace: NATIVE_UI_COORDINATE_SPACE,
    anchor: NATIVE_UI_ANCHOR,
  };
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
  append(layout?.progressBars, "progress-bar");
  append(layout?.fluidBars, "fluid-bar");
  append(layout?.energyBars, "energy-bar");
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
  const binding = recipeId ? runtime?.bindingsByRecipeId.get(recipeId) ?? null : null;
  const template = binding?.templateKey
    ? runtime?.templatesByKey.get(binding.templateKey) ?? null
    : null;

  const layout = template
    ? {
      width: template.width,
      height: template.height,
      imageResource: template.imageResource,
      imageRegion: inlineLayout?.imageRegion,
      nativeBackground: inlineLayout?.nativeBackground ?? normalizeNativeUiLayoutSurface(template)?.nativeBackground,
      slots: template.slots,
      textOverlays: template.textOverlays,
      dynamicPrimitives: inlineLayout?.dynamicPrimitives,
      progressBars: inlineLayout?.progressBars,
      fluidBars: inlineLayout?.fluidBars,
      energyBars: inlineLayout?.energyBars,
      hotspots: inlineLayout?.hotspots ?? template.hotspots,
      viewports: inlineLayout?.viewports ?? template.viewports,
    } satisfies NativeUiLayoutSurface
    : inlineLayout;

  const source: NativeUiSurfaceSource = template
    ? "ui-pack-template"
    : layout
      ? "inline-native-layout"
      : "missing";

  const width = positiveDimension(layout?.width, 166);
  const height = positiveDimension(layout?.height, 65);
  const slots = asArray<NativeUiSlot>(layout?.slots);
  const textOverlays = normalizeNativeUiTextOverlayList(layout?.textOverlays);
  const dynamicPrimitives = collectNativeUiDynamicPrimitives(layout);
  const hotspots = normalizeNativeUiRectList(layout?.hotspots, "hotspot");
  const viewports = normalizeNativeUiRectList(layout?.viewports, "viewport");
  const normalizedLayout: NativeUiLayoutSurface | null = layout
    ? {
      ...layout,
      width,
      height,
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
    slots,
    textOverlays,
    dynamicPrimitives,
    hotspots,
    viewports,
  };
}

export function buildNativeUiSlotCells<TEntry>(options: Readonly<{
  slots: readonly NativeUiSlot[];
  resolveRoleEntries: (role: string) => readonly TEntry[];
}>): NativeUiSlotCell<TEntry>[] {
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

export function createNativeUiFitMatrix(options: Readonly<{
  sourceWidth: number;
  sourceHeight: number;
  availableWidth: number;
  availableHeight: number;
}>): NativeUiFitMatrix {
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
