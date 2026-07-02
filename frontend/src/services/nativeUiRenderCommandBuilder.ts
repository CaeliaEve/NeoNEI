import type { NativeTextureSpriteCommand } from "../renderers/native/WebGl2NativeRenderer.ts";
import type { NativeUiDynamicPrimitive, NativeUiSlotCell } from "./nativeUiRuntimeRegistry.ts";

export interface NativeUiPreparedBackgroundSource {
  textureKey: string;
  image?: HTMLImageElement | HTMLCanvasElement;
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
  destX?: number;
  destY?: number;
  width: number;
  height: number;
  nineSlice?: {
    borderU: number;
    borderV: number;
  };
}

export interface NativeUiAtlasSpriteSource {
  atlasFile: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NativeUiSpriteCommandBuildOptions<TEntry> {
  dpr: number;
  nowMs: number;
  background: NativeUiPreparedBackgroundSource | null;
  dynamicPrimitives: readonly NativeUiDynamicPrimitive[];
  slotCells: readonly NativeUiSlotCell<TEntry>[];
  slotTextureKey: (cell: NativeUiSlotCell<TEntry>) => string;
  resolveAtlasSource: (entry: TEntry, nowMs: number) => NativeUiAtlasSpriteSource | null;
}

const DYNAMIC_TRACK_COLOR = "rgba(5, 9, 14, 0.72)";
const DYNAMIC_PROGRESS_FILL_COLOR = "rgba(247, 182, 72, 0.86)";
const DYNAMIC_FLUID_FILL_COLOR = "rgba(82, 189, 255, 0.78)";
const DYNAMIC_ENERGY_FILL_COLOR = "rgba(118, 232, 147, 0.78)";
const DYNAMIC_BORDER_COLOR = "rgba(238, 244, 252, 0.22)";

function normalizedDpr(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function clamp01(value: unknown, fallback = 1): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(1, parsed));
}

function normalizeDynamicPrimitiveKind(primitive: NativeUiDynamicPrimitive): string {
  const kind = `${primitive.kind ?? primitive.role ?? ""}`.trim().toLowerCase();
  if (kind.includes("fluid")) return "fluid-bar";
  if (kind.includes("energy") || kind.includes("eu")) return "energy-bar";
  if (kind.includes("progress") || kind.includes("arrow")) return "progress-bar";
  return kind || "indicator";
}

function defaultDynamicFillColor(primitive: NativeUiDynamicPrimitive): string {
  const kind = normalizeDynamicPrimitiveKind(primitive);
  if (kind === "fluid-bar") return DYNAMIC_FLUID_FILL_COLOR;
  if (kind === "energy-bar") return DYNAMIC_ENERGY_FILL_COLOR;
  return DYNAMIC_PROGRESS_FILL_COLOR;
}

function primitiveFillRatio(primitive: NativeUiDynamicPrimitive): number {
  return clamp01(primitive.fill ?? primitive.ratio ?? primitive.value, 1);
}

export function nativeUiSolidTextureKey(color: string): string {
  return `native-dynamic-solid:${color}`;
}

export function nativeUiDynamicPrimitiveColors(primitive: NativeUiDynamicPrimitive): string[] {
  return [
    `${primitive.trackColor ?? DYNAMIC_TRACK_COLOR}`,
    `${primitive.fillColor ?? defaultDynamicFillColor(primitive)}`,
    `${primitive.borderColor ?? DYNAMIC_BORDER_COLOR}`,
  ];
}

export function pushNativeUiTextureSpriteRect(
  commands: NativeTextureSpriteCommand[],
  dprValue: number,
  textureKey: string,
  sourceX: number,
  sourceY: number,
  sourceWidth: number,
  sourceHeight: number,
  destX: number,
  destY: number,
  destWidth: number,
  destHeight: number,
): void {
  if (sourceWidth <= 0 || sourceHeight <= 0 || destWidth <= 0 || destHeight <= 0) return;
  const dpr = normalizedDpr(dprValue);
  commands.push({
    textureKey,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    destX: Math.round(destX * dpr),
    destY: Math.round(destY * dpr),
    destWidth: Math.max(1, Math.round(destWidth * dpr)),
    destHeight: Math.max(1, Math.round(destHeight * dpr)),
  });
}

function pushSolidSpriteRect(
  commands: NativeTextureSpriteCommand[],
  dpr: number,
  color: string,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  pushNativeUiTextureSpriteRect(
    commands,
    dpr,
    nativeUiSolidTextureKey(color),
    0,
    0,
    1,
    1,
    x,
    y,
    width,
    height,
  );
}

export function pushNativeUiBackgroundCommands(
  commands: NativeTextureSpriteCommand[],
  dpr: number,
  background: NativeUiPreparedBackgroundSource,
): void {
  const x = Math.max(0, Number(background.destX ?? 0));
  const y = Math.max(0, Number(background.destY ?? 0));
  const width = Math.max(1, Number(background.width ?? 0));
  const height = Math.max(1, Number(background.height ?? 0));
  const nineSlice = background.nineSlice;
  if (!nineSlice) {
    pushNativeUiTextureSpriteRect(
      commands,
      dpr,
      background.textureKey,
      background.sourceX,
      background.sourceY,
      background.sourceWidth,
      background.sourceHeight,
      x,
      y,
      width,
      height,
    );
    return;
  }

  const srcW = Math.max(1, background.sourceWidth);
  const srcH = Math.max(1, background.sourceHeight);
  const borderX = Math.max(0, Math.min(nineSlice.borderU, Math.floor(srcW / 2), Math.floor(width / 2)));
  const borderY = Math.max(0, Math.min(nineSlice.borderV, Math.floor(srcH / 2), Math.floor(height / 2)));
  const srcMidW = Math.max(0, srcW - borderX * 2);
  const srcMidH = Math.max(0, srcH - borderY * 2);
  const dstMidW = Math.max(0, width - borderX * 2);
  const dstMidH = Math.max(0, height - borderY * 2);
  const sx = background.sourceX;
  const sy = background.sourceY;
  const key = background.textureKey;

  pushNativeUiTextureSpriteRect(commands, dpr, key, sx, sy, borderX, borderY, x, y, borderX, borderY);
  pushNativeUiTextureSpriteRect(commands, dpr, key, sx + borderX + srcMidW, sy, borderX, borderY, x + borderX + dstMidW, y, borderX, borderY);
  pushNativeUiTextureSpriteRect(commands, dpr, key, sx, sy + borderY + srcMidH, borderX, borderY, x, y + borderY + dstMidH, borderX, borderY);
  pushNativeUiTextureSpriteRect(commands, dpr, key, sx + borderX + srcMidW, sy + borderY + srcMidH, borderX, borderY, x + borderX + dstMidW, y + borderY + dstMidH, borderX, borderY);
  pushNativeUiTextureSpriteRect(commands, dpr, key, sx + borderX, sy, srcMidW, borderY, x + borderX, y, dstMidW, borderY);
  pushNativeUiTextureSpriteRect(commands, dpr, key, sx + borderX, sy + borderY + srcMidH, srcMidW, borderY, x + borderX, y + borderY + dstMidH, dstMidW, borderY);
  pushNativeUiTextureSpriteRect(commands, dpr, key, sx, sy + borderY, borderX, srcMidH, x, y + borderY, borderX, dstMidH);
  pushNativeUiTextureSpriteRect(commands, dpr, key, sx + borderX + srcMidW, sy + borderY, borderX, srcMidH, x + borderX + dstMidW, y + borderY, borderX, dstMidH);
  pushNativeUiTextureSpriteRect(commands, dpr, key, sx + borderX, sy + borderY, srcMidW, srcMidH, x + borderX, y + borderY, dstMidW, dstMidH);
}

export function pushNativeUiDynamicPrimitiveCommands(
  commands: NativeTextureSpriteCommand[],
  dpr: number,
  primitive: NativeUiDynamicPrimitive,
): void {
  const x = Math.max(0, Number(primitive.x ?? 0));
  const y = Math.max(0, Number(primitive.y ?? 0));
  const width = Math.max(0, Number(primitive.width ?? 0));
  const height = Math.max(0, Number(primitive.height ?? 0));
  if (width <= 0 || height <= 0) return;

  const [trackColor, fillColor, borderColor] = nativeUiDynamicPrimitiveColors(primitive);
  const borderSize = Math.min(1, Math.floor(Math.min(width, height) / 2));
  const innerX = x + borderSize;
  const innerY = y + borderSize;
  const innerWidth = Math.max(0, width - borderSize * 2);
  const innerHeight = Math.max(0, height - borderSize * 2);
  const fillRatio = primitiveFillRatio(primitive);
  const orientation = primitive.orientation ?? (height > width ? "vertical" : "horizontal");

  pushSolidSpriteRect(commands, dpr, trackColor, innerX, innerY, innerWidth, innerHeight);
  if (orientation === "vertical") {
    const fillHeight = innerHeight * fillRatio;
    pushSolidSpriteRect(commands, dpr, fillColor, innerX, innerY + innerHeight - fillHeight, innerWidth, fillHeight);
  } else {
    pushSolidSpriteRect(commands, dpr, fillColor, innerX, innerY, innerWidth * fillRatio, innerHeight);
  }

  if (borderSize > 0) {
    pushSolidSpriteRect(commands, dpr, borderColor, x, y, width, borderSize);
    pushSolidSpriteRect(commands, dpr, borderColor, x, y + height - borderSize, width, borderSize);
    pushSolidSpriteRect(commands, dpr, borderColor, x, y, borderSize, height);
    pushSolidSpriteRect(commands, dpr, borderColor, x + width - borderSize, y, borderSize, height);
  }
}

export function buildNativeUiSpriteCommands<TEntry>(
  options: NativeUiSpriteCommandBuildOptions<TEntry>,
): NativeTextureSpriteCommand[] {
  const dpr = normalizedDpr(options.dpr);
  const commands: NativeTextureSpriteCommand[] = [];
  const background = options.background;
  if (background) {
    pushNativeUiBackgroundCommands(commands, dpr, background);
  }

  for (const primitive of options.dynamicPrimitives) {
    pushNativeUiDynamicPrimitiveCommands(commands, dpr, primitive);
  }

  for (const cell of options.slotCells) {
    const slotWidth = Math.max(1, Number(cell.width));
    const slotHeight = Math.max(1, Number(cell.height));
    const slotSourceWidth = Math.max(1, Math.round(slotWidth * dpr));
    const slotSourceHeight = Math.max(1, Math.round(slotHeight * dpr));
    if (!background) {
      commands.push({
        textureKey: options.slotTextureKey(cell),
        sourceX: 0,
        sourceY: 0,
        sourceWidth: slotSourceWidth,
        sourceHeight: slotSourceHeight,
        destX: Math.round(cell.x * dpr),
        destY: Math.round(cell.y * dpr),
        destWidth: slotSourceWidth,
        destHeight: slotSourceHeight,
      });
    }

    if (!cell.entry) continue;
    const source = options.resolveAtlasSource(cell.entry, options.nowMs);
    if (!source) continue;
    commands.push({
      textureKey: source.atlasFile,
      sourceX: source.x,
      sourceY: source.y,
      sourceWidth: source.width,
      sourceHeight: source.height,
      destX: Math.round(cell.iconX * dpr),
      destY: Math.round(cell.iconY * dpr),
      destWidth: Math.max(1, Math.round(cell.iconWidth * dpr)),
      destHeight: Math.max(1, Math.round(cell.iconHeight * dpr)),
    });
  }
  return commands;
}
