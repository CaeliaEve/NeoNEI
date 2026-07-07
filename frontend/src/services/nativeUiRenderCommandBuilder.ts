import type { NativeTextureSpriteCommand } from "../renderers/native/NativeRendererCommandProtocol.ts";
import type { NativeUiDynamicPrimitive, NativeUiSlotCell } from "./nativeUiRuntimeRegistry.ts";
import { resolveNativeUiRectGeometry } from "./nativeUiGeometryAbi.ts";
import {
  nativeUiDynamicPrimitiveColors,
  nativeUiDynamicPrimitiveTextureSource,
  nativeUiPrimitiveFillRatio,
  nativeUiSolidTextureKey,
  normalizeNativeUiDpr,
} from "./nativeUiRenderResourceCatalog.ts";

export {
  nativeUiDynamicPrimitiveColors,
  nativeUiDynamicPrimitiveTextureSource,
  nativeUiSolidTextureKey,
} from "./nativeUiRenderResourceCatalog.ts";

export interface NativeUiPreparedBackgroundSource {
  textureKey: string;
  status?: string;
  kind?: string;
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
  coversSlotChrome?: boolean;
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
  const dpr = normalizeNativeUiDpr(dprValue);
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
  const geometry = resolveNativeUiRectGeometry(
    primitive,
    `Native UI dynamic primitive ${primitive.kind ?? primitive.role ?? "indicator"}`,
  );
  const { x, y, width, height } = geometry;

  const [trackColor, fillColor, borderColor] = nativeUiDynamicPrimitiveColors(primitive);
  const borderSize = Math.min(1, Math.floor(Math.min(width, height) / 2));
  const innerX = x + borderSize;
  const innerY = y + borderSize;
  const innerWidth = Math.max(0, width - borderSize * 2);
  const innerHeight = Math.max(0, height - borderSize * 2);
  const fillRatio = nativeUiPrimitiveFillRatio(primitive);
  const orientation = primitive.orientation ?? (height > width ? "vertical" : "horizontal");
  const texture = nativeUiDynamicPrimitiveTextureSource(primitive, dpr);
  if (texture) {
    pushNativeUiTextureSpriteRect(
      commands,
      dpr,
      texture.textureKey,
      0,
      0,
      texture.sourceWidth,
      texture.frameHeight,
      x,
      y,
      width,
      height,
    );
    if (orientation === "vertical") {
      const fillHeight = height * fillRatio;
      const sourceFillHeight = texture.frameHeight * fillRatio;
      pushNativeUiTextureSpriteRect(
        commands,
        dpr,
        texture.textureKey,
        0,
        texture.frameHeight + texture.frameHeight - sourceFillHeight,
        texture.sourceWidth,
        sourceFillHeight,
        x,
        y + height - fillHeight,
        width,
        fillHeight,
      );
    } else {
      pushNativeUiTextureSpriteRect(
        commands,
        dpr,
        texture.textureKey,
        0,
        texture.frameHeight,
        texture.sourceWidth * fillRatio,
        texture.frameHeight,
        x,
        y,
        width * fillRatio,
        height,
      );
    }
    return;
  }

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
  const dpr = normalizeNativeUiDpr(options.dpr);
  const commands: NativeTextureSpriteCommand[] = [];
  const background = options.background;
  if (background) {
    pushNativeUiBackgroundCommands(commands, dpr, background);
  }

  for (const primitive of options.dynamicPrimitives) {
    if (
      background?.kind === "gt-modular-ui"
      && `${primitive.source ?? ""}`.trim() === "gtnh-basic-ui-properties-default"
      && !nativeUiDynamicPrimitiveTextureSource(primitive, dpr)
    ) {
      continue;
    }
    pushNativeUiDynamicPrimitiveCommands(commands, dpr, primitive);
  }

  for (const cell of options.slotCells) {
    const slotWidth = Math.max(1, Number(cell.width));
    const slotHeight = Math.max(1, Number(cell.height));
    const slotSourceWidth = Math.max(1, Math.round(slotWidth * dpr));
    const slotSourceHeight = Math.max(1, Math.round(slotHeight * dpr));
    if (background?.coversSlotChrome !== true) {
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
