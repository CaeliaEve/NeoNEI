import { resolveManifestRelativeUrl } from "../native-surface/NativeRuntimeRequestPolicy.ts";
import type { NativeRendererBackend } from "../renderers/native/NativeRendererBackend.ts";
import type { NativeUiLayoutSurface } from "./nativeUiRuntimeRegistry.ts";
import type { NativeUiPreparedBackgroundSource } from "./nativeUiRenderCommandBuilder.ts";
import {
  NATIVE_UI_BACKGROUND_SCALING_NINE_SLICE,
  NATIVE_UI_CANONICAL_NEI_BACKGROUND_KIND,
  NATIVE_UI_GT_BACKGROUND_KIND,
  resolveNativeUiBackgroundContract,
  type NativeUiBackgroundContract,
  type NativeUiBackgroundTargetRect,
  type NativeUiBackgroundTextureSpec,
} from "./nativeUiBackgroundAbi.ts";
import {
  createNativeUiCanonicalNeiBackgroundTexture,
  createNativeUiGtModularBackgroundTexture,
  type NativeUiTextureRegistry,
} from "./nativeUiTextureRegistry.ts";

type NativeUiTextureRegistrySink = Pick<NativeUiTextureRegistry, "register">;
type NativeUiImageLoader = (url: string) => Promise<HTMLImageElement>;
type NativeUiAssetUrlResolver = (manifestUrl: string, relativePath: string) => string;

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
  semanticBackground: boolean;
  source: NativeUiPreparedBackgroundSource | null;
  error: string | null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function trimToNull(value: unknown): string | null {
  const normalized = `${value ?? ""}`.trim();
  return normalized.length > 0 ? normalized : null;
}

function isActive(options: NativeUiBackgroundPrepareOptions): boolean {
  return options.isActive?.() ?? true;
}

async function loadNativeUiImageAsset(url: string): Promise<HTMLImageElement> {
  const module = await import("./animationBudget.ts");
  return module.loadImageAsset(url);
}

export function nativeUiBackgroundTextureKey(assetRef: string | null): string | null {
  return assetRef ? `ui-background:${assetRef}` : null;
}

export function nativeUiNativeBackground(layout: NativeUiLayoutSurface | null): NativeUiBackgroundContract | null {
  return resolveNativeUiBackgroundContract(layout);
}

export function nativeUiIsSemanticGtBackground(background: NativeUiBackgroundContract | null): boolean {
  return background?.kind === NATIVE_UI_GT_BACKGROUND_KIND && background.status === "semantic";
}

export function nativeUiIsSemanticCanonicalNeiBackground(background: NativeUiBackgroundContract | null): boolean {
  return background?.kind === NATIVE_UI_CANONICAL_NEI_BACKGROUND_KIND && background.status === "semantic";
}

export function nativeUiIsSemanticGeneratedBackground(background: NativeUiBackgroundContract | null): boolean {
  return nativeUiIsSemanticGtBackground(background) || nativeUiIsSemanticCanonicalNeiBackground(background);
}

export function nativeUiSemanticBackgroundTextureKey(
  background: NativeUiBackgroundContract | null,
  layoutWidth: number,
  layoutHeight: number,
  dpr: number,
): string | null {
  if (!nativeUiIsSemanticGeneratedBackground(background)) return null;
  return `ui-background:${background.kind}:${layoutWidth}x${layoutHeight}:${dpr}`;
}

export function nativeUiNativeBackgroundAssetRef(background: NativeUiBackgroundContract | null): string | null {
  return background?.assetRef ?? null;
}

export function nativeUiNativeBackgroundTextureKey(background: NativeUiBackgroundContract | null): string | null {
  return nativeUiBackgroundTextureKey(nativeUiNativeBackgroundAssetRef(background));
}

export function nativeUiNativeBackgroundTextureSpec(
  background: NativeUiBackgroundContract | null,
): NativeUiBackgroundTextureSpec {
  if (!background) {
    throw new Error("Native UI background texture spec requires a validated background contract");
  }
  return background.texture;
}

export function nativeUiNativeBackgroundTargetRect(
  background: NativeUiBackgroundContract | null,
  _layoutWidth: number,
  _layoutHeight: number,
): NativeUiBackgroundTargetRect {
  if (!background) {
    throw new Error("Native UI background target rect requires a validated background contract");
  }
  return background.targetRect;
}

export function resolveNativeUiBackgroundAssetUrl(
  manifestUrl: string | null | undefined,
  assetRef: string | null,
  resolveUrl: NativeUiAssetUrlResolver = resolveManifestRelativeUrl,
): string | null {
  const asset = trimToNull(assetRef);
  if (!asset) return null;
  const manifest = trimToNull(manifestUrl);
  if (!manifest) {
    throw new Error(`Native UI captured background asset requires runtime manifest URL: ${asset}`);
  }
  const resolved = trimToNull(resolveUrl(manifest, asset));
  if (!resolved) {
    throw new Error(`Native UI captured background asset URL is empty: ${asset}`);
  }
  return resolved;
}

export function nativeUiBackgroundState(options: NativeUiBackgroundStateOptions): NativeUiBackgroundState {
  if (options.nativeAssetRef) {
    if (options.error) return "error";
    if (!options.source) return "loading";
    return options.source.textureKey === options.nativeTextureKey ? "captured" : "error";
  }
  if (options.semanticBackground) return options.source ? "semantic" : "loading";
  if (options.error) return "error";
  return "none";
}

function buildCapturedBackgroundSource(
  textureKey: string,
  image: HTMLImageElement,
  background: NativeUiBackgroundContract,
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
    nineSlice: background.scaling === NATIVE_UI_BACKGROUND_SCALING_NINE_SLICE
      ? { borderU: texture.borderU, borderV: texture.borderV }
      : undefined,
  };
}

function emptyBackgroundResult(error: string | null = null, aborted = false): NativeUiBackgroundPrepareResult {
  return { source: null, error, aborted };
}

export async function prepareNativeUiBackgroundSource(
  options: NativeUiBackgroundPrepareOptions,
): Promise<NativeUiBackgroundPrepareResult> {
  let background: NativeUiBackgroundContract | null = null;
  try {
    background = nativeUiNativeBackground(options.layout);
  } catch (error) {
    return emptyBackgroundResult(errorMessage(error));
  }
  if (!background && options.layout) {
    return emptyBackgroundResult("Native UI background ABI is missing");
  }
  const loadImage = options.loadImage ?? loadNativeUiImageAsset;
  const resolveUrl = options.resolveUrl ?? resolveManifestRelativeUrl;
  let visibleError: string | null = null;

  const nativeAssetRef = nativeUiNativeBackgroundAssetRef(background);
  const nativeTextureKey = nativeUiNativeBackgroundTextureKey(background);
  let nativeAssetUrl: string | null = null;
  try {
    nativeAssetUrl = resolveNativeUiBackgroundAssetUrl(options.manifestUrl, nativeAssetRef, resolveUrl);
  } catch (error) {
    visibleError = errorMessage(error);
    if (background?.status === "captured") return emptyBackgroundResult(visibleError);
  }
  if (nativeTextureKey && nativeAssetUrl) {
    try {
      const image = await loadImage(nativeAssetUrl);
      if (!isActive(options)) return emptyBackgroundResult(null, true);
      if (!options.textureRegistry.register(options.renderer, nativeTextureKey, image)) {
        return emptyBackgroundResult(`Native UI captured background texture registration failed: ${nativeTextureKey}`);
      }
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
      if (background?.status === "captured") return emptyBackgroundResult(visibleError);
    }
  }

  const semanticTextureKey = nativeUiSemanticBackgroundTextureKey(
    background,
    options.layoutWidth,
    options.layoutHeight,
    options.dpr,
  );
  if (nativeUiIsSemanticGeneratedBackground(background) && semanticTextureKey) {
    const texture = nativeUiIsSemanticGtBackground(background)
      ? createNativeUiGtModularBackgroundTexture(options.layoutWidth, options.layoutHeight, options.dpr)
      : createNativeUiCanonicalNeiBackgroundTexture(options.layoutWidth, options.layoutHeight, options.dpr);
    if (!options.textureRegistry.register(options.renderer, semanticTextureKey, texture)) {
      return emptyBackgroundResult(`Native UI semantic background texture registration failed: ${semanticTextureKey}`);
    }
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

  return emptyBackgroundResult(visibleError);
}
