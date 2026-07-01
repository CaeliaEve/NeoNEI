import type {
  UiPackBinding,
  UiPackRect,
  UiPackRuntime,
  UiPackSlot,
  UiPackTemplate,
  UiPackTextOverlay,
} from "./uiPackRuntime.ts";

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

export function collectNativeUiDynamicPrimitives(layout: NativeUiLayoutSurface | null): NativeUiDynamicPrimitive[] {
  const primitives: NativeUiDynamicPrimitive[] = [];
  const append = (raw: unknown, kind: string) => {
    for (const primitive of asArray<NativeUiDynamicPrimitive>(raw)) {
      if (!asRecord(primitive)) continue;
      primitives.push({ kind, ...primitive });
    }
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

  return {
    source,
    binding,
    template,
    layout,
    width: positiveDimension(layout?.width, 166),
    height: positiveDimension(layout?.height, 65),
    slots: asArray<NativeUiSlot>(layout?.slots),
    textOverlays: asArray<NativeUiTextOverlay>(layout?.textOverlays),
    dynamicPrimitives: collectNativeUiDynamicPrimitives(layout),
    hotspots: asArray<NativeUiRect>(layout?.hotspots),
    viewports: asArray<NativeUiRect>(layout?.viewports),
  };
}

export function buildNativeUiSlotCells<TEntry>(options: Readonly<{
  slots: readonly NativeUiSlot[];
  slotSize: number;
  resolveRoleEntries: (role: string) => readonly TEntry[];
}>): NativeUiSlotCell<TEntry>[] {
  const slotSize = positiveDimension(options.slotSize, 18);
  const cells: NativeUiSlotCell<TEntry>[] = [];
  options.slots.forEach((slot, groupIndex) => {
    const role = `${slot.role ?? "item-input"}`;
    const columns = Math.max(1, Number(slot.columns ?? 1) || 1);
    const rows = Math.max(1, Number(slot.rows ?? 1) || 1);
    const x0 = Math.max(0, Number(slot.x ?? 0) || 0);
    const y0 = Math.max(0, Number(slot.y ?? 0) || 0);
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
        x: x0 + col * slotSize,
        y: y0 + row * slotSize,
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
