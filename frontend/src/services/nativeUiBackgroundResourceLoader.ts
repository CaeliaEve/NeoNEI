import { resolveManifestRelativeUrl } from "../native-surface/runtimeLoader.ts";
import type { NativeRendererBackend } from "../renderers/native/NativeRendererBackend.ts";
import type { NativeUiImageRegion, NativeUiLayoutSurface } from "./nativeUiRuntimeRegistry.ts";
import type { NativeUiPreparedBackgroundSource } from "./nativeUiRenderCommandBuilder.ts";
import {
  createNativeUiGtModularBackgroundTexture,
  type NativeUiTextureRegistry,
} from "./nativeUiTextureRegistry.ts";

type NativeUiBackgroundRecord = Record<string, unknown>;
type NativeUiTextureRegistrySink = Pick<NativeUiTextureRegistry, "register">;
type NativeUiImageLoader = (url: string) => Promise<HTMLImageElement>;
type NativeUiAssetUrlResolver = (manifestUrl: string, relativePath: string) => string;

export interface NativeUiBackgroundTextureSpec {
  width: number;
  height: number;
  borderU: number;
  borderV: number;
}

export interface NativeUiBackgroundTargetRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NativeUiBackgroundPrepareOptions {
  renderer: NativeRendererBackend;
  textureRegistry: NativeUiTextureRegistrySink;
  layout: NativeUiLayoutSurface | null;
  manifestUrl?: string | null;
  layoutWidth: number;
  layoutHeight: number;
  dpr: number;
  loadImage?: NativeUiImageLoader;
  resolveUrl?: NativeUiAssetUrlResolver;
  isActive?: () => boolean;
}

export interface NativeUiBackgroundPrepareResult {
  source: NativeUiPreparedBackgroundSource | null;
  error: string | null;
  aborted: boolean;
}

export type NativeUiBackgroundState = "captured" | "semantic" | "ready" | "loading" | "error" | "none";

export interface NativeUiBackgroundStateOptions {
  nativeAssetRef: string | null;
  nativeTextureKey: string | null;
  semanticGtBackground: boolean;
  backgroundAssetRef: string | null;
  source: NativeUiPreparedBackgroundSource | null;
  error: string | null;
}

function asRecord(value: unknown): NativeUiBackgroundRecord | null {
  return value && typeof value === "object" ? value as NativeUiBackgroundRecord : null;
}

function trimToNull(value: unknown): string | null {
  const normalized = `${value ?? ""}`.trim();
  return normalized.length > 0 ? normalized : null;
}

function positiveNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isActive(options: NativeUiBackgroundPrepareOptions): boolean {
  return options.isActive?.() ?? true;
}

async function loadNativeUiImageAsset(url: string): Promise<HTMLImageElement> {
  const module = await import("./animationBudget.ts");
  return module.loadImageAsset(url);
}

export function nativeUiBackgroundAssetRef(layout: NativeUiLayoutSurface | null): string | null {
  return trimToNull(layout?.imageResource);
}

export function nativeUiBackgroundTextureKey(assetRef: string | null): string | null {
  return assetRef ? `ui-background:${assetRef}` : null;
}

export function nativeUiBackgroundImageRegion(layout: NativeUiLayoutSurface | null): NativeUiImageRegion | null {
  const region = layout?.imageRegion;
  if (!region || typeof region !== "object") return null;
  const width = Number(region.width ?? 0);
  const height = Number(region.height ?? 0);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return {
    x: nonNegativeNumber(region.x),
    y: nonNegativeNumber(region.y),
    width,
    height,
  };
}

export function nativeUiNativeBackground(layout: NativeUiLayoutSurface | null): NativeUiBackgroundRecord | null {
  return asRecord(layout?.nativeBackground);
}

export function nativeUiIsSemanticGtBackground(background: NativeUiBackgroundRecord | null): boolean {
  return `${background?.kind ?? ""}` === "gt-modular-ui"
    && ["semantic", "captured"].includes(`${background?.status ?? ""}`);
}

export function nativeUiSemanticBackgroundTextureKey(
  background: NativeUiBackgroundRecord | null,
  layoutWidth: number,
  layoutHeight: number,
  dpr: number,
): string | null {
  if (!nativeUiIsSemanticGtBackground(background)) return null;
  return `ui-background:gt-modular-ui:${layoutWidth}x${layoutHeight}:${dpr}`;
}

export function nativeUiNativeBackgroundAssetRef(background: NativeUiBackgroundRecord | null): string | null {
  return trimToNull(background?.assetRef);
}

export function nativeUiNativeBackgroundTextureKey(background: NativeUiBackgroundRecord | null): string | null {
  return nativeUiBackgroundTextureKey(nativeUiNativeBackgroundAssetRef(background));
}

function nativeBackgroundRect(
  background: NativeUiBackgroundRecord | null,
  name: "recipeBackgroundOffset" | "recipeBackgroundSize",
): NativeUiBackgroundRecord | null {
  return asRecord(background?.[name]);
}

export function nativeUiNativeBackgroundTextureSpec(
  background: NativeUiBackgroundRecord | null,
): NativeUiBackgroundTextureSpec {
  const texture = asRecord(background?.texture) ?? {};
  const width = positiveNumber(texture.width, 64);
  const height = positiveNumber(texture.height, 64);
  const borderU = nonNegativeNumber(texture.borderU ?? texture.border);
  const borderV = nonNegativeNumber(texture.borderV ?? texture.border, borderU);
  return { width, height, borderU, borderV };
}

export function nativeUiNativeBackgroundTargetRect(
  background: NativeUiBackgroundRecord | null,
  layoutWidth: number,
  layoutHeight: number,
): NativeUiBackgroundTargetRect {
  const offset = nativeBackgroundRect(background, "recipeBackgroundOffset");
  const size = nativeBackgroundRect(background, "recipeBackgroundSize");
  return {
    x: nonNegativeNumber(offset?.x),
    y: nonNegativeNumber(offset?.y),
    width: positiveNumber(size?.width, layoutWidth),
    height: positiveNumber(size?.height, layoutHeight),
  };
}

export function resolveNativeUiBackgroundAssetUrl(
  manifestUrl: string | null | undefined,
  assetRef: string | null,
  resolveUrl: NativeUiAssetUrlResolver = resolveManifestRelativeUrl,
): string | null {
  const manifest = trimToNull(manifestUrl);
  if (!manifest || !assetRef) return null;
  try {
    return resolveUrl(manifest, assetRef);
  } catch {
    return null;
  }
}

export function nativeUiBackgroundState(options: NativeUiBackgroundStateOptions): NativeUiBackgroundState {
  if (options.nativeAssetRef) {
    if (options.error) return "error";
    if (!options.source) return "loading";
    return options.source.textureKey === options.nativeTextureKey ? "captured" : "error";
  }
  if (options.semanticGtBackground) return options.source ? "semantic" : "loading";
  if (!options.backgroundAssetRef) return "none";
  if (options.source) return "ready";
  if (options.error) return "error";
  return "loading";
}

function buildCapturedBackgroundSource(
  textureKey: string,
  image: HTMLImageElement,
  background: NativeUiBackgroundRecord | null,
  layoutWidth: number,
  layoutHeight: number,
): NativeUiPreparedBackgroundSource {
  const texture = nativeUiNativeBackgroundTextureSpec(background);
  const target = nativeUiNativeBackgroundTargetRect(background, layoutWidth, layoutHeight);
  return {
    textureKey,
    image,
    sourceX: 0,
    sourceY: 0,
    sourceWidth: Math.max(1, Math.min(texture.width, image.width)),
    sourceHeight: Math.max(1, Math.min(texture.height, image.height)),
    destX: target.x,
    destY: target.y,
    width: target.width,
    height: target.height,
    nineSlice: `${background?.scaling ?? ""}` === "nine-slice"
      ? { borderU: texture.borderU, borderV: texture.borderV }
      : undefined,
  };
}

function buildImageBackgroundSource(
  textureKey: string,
  image: HTMLImageElement,
  region: NativeUiImageRegion | null,
  layoutWidth: number,
  layoutHeight: number,
): NativeUiPreparedBackgroundSource {
  const sourceX = region ? Math.min(region.x ?? 0, Math.max(0, image.width - 1)) : 0;
  const sourceY = region ? Math.min(region.y ?? 0, Math.max(0, image.height - 1)) : 0;
  const sourceWidth = region
    ? Math.max(1, Math.min(region.width ?? 0, image.width - sourceX))
    : Math.max(1, image.width || layoutWidth);
  const sourceHeight = region
    ? Math.max(1, Math.min(region.height ?? 0, image.height - sourceY))
    : Math.max(1, image.height || layoutHeight);
  return {
    textureKey,
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    width: sourceWidth,
    height: sourceHeight,
  };
}

function emptyBackgroundResult(error: string | null = null, aborted = false): NativeUiBackgroundPrepareResult {
  return { source: null, error, aborted };
}

export async function prepareNativeUiBackgroundSource(
  options: NativeUiBackgroundPrepareOptions,
): Promise<NativeUiBackgroundPrepareResult> {
  const background = nativeUiNativeBackground(options.layout);
  const loadImage = options.loadImage ?? loadNativeUiImageAsset;
  const resolveUrl = options.resolveUrl ?? resolveManifestRelativeUrl;
  let visibleError: string | null = null;

  const nativeAssetRef = nativeUiNativeBackgroundAssetRef(background);
  const nativeTextureKey = nativeUiNativeBackgroundTextureKey(background);
  const nativeAssetUrl = resolveNativeUiBackgroundAssetUrl(options.manifestUrl, nativeAssetRef, resolveUrl);
  if (nativeTextureKey && nativeAssetUrl) {
    try {
      const image = await loadImage(nativeAssetUrl);
      if (!isActive(options)) return emptyBackgroundResult(null, true);
      options.textureRegistry.register(options.renderer, nativeTextureKey, image);
      return {
        source: buildCapturedBackgroundSource(
          nativeTextureKey,
          image,
          background,
          options.layoutWidth,
          options.layoutHeight,
        ),
        error: null,
        aborted: false,
      };
    } catch (error) {
      visibleError = errorMessage(error);
      if (`${background?.status ?? ""}` === "captured") return emptyBackgroundResult(visibleError);
    }
  }

  const semanticTextureKey = nativeUiSemanticBackgroundTextureKey(
    background,
    options.layoutWidth,
    options.layoutHeight,
    options.dpr,
  );
  if (nativeUiIsSemanticGtBackground(background) && semanticTextureKey) {
    const texture = createNativeUiGtModularBackgroundTexture(options.layoutWidth, options.layoutHeight, options.dpr);
    options.textureRegistry.register(options.renderer, semanticTextureKey, texture);
    return {
      source: {
        textureKey: semanticTextureKey,
        image: texture,
        sourceX: 0,
        sourceY: 0,
        sourceWidth: texture.width,
        sourceHeight: texture.height,
        destX: 0,
        destY: 0,
        width: options.layoutWidth,
        height: options.layoutHeight,
      },
      error: visibleError,
      aborted: false,
    };
  }

  const assetRef = nativeUiBackgroundAssetRef(options.layout);
  const textureKey = nativeUiBackgroundTextureKey(assetRef);
  const backgroundUrl = resolveNativeUiBackgroundAssetUrl(options.manifestUrl, assetRef, resolveUrl);
  if (!textureKey || !backgroundUrl) return emptyBackgroundResult(visibleError);

  try {
    const image = await loadImage(backgroundUrl);
    if (!isActive(options)) return emptyBackgroundResult(null, true);
    options.textureRegistry.register(options.renderer, textureKey, image);
    return {
      source: buildImageBackgroundSource(
        textureKey,
        image,
        nativeUiBackgroundImageRegion(options.layout),
        options.layoutWidth,
        options.layoutHeight,
      ),
      error: visibleError,
      aborted: false,
    };
  } catch (error) {
    return emptyBackgroundResult(errorMessage(error));
  }
}
