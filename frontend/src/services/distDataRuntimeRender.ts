import type {
  BrowserAtlasIndexResponse,
  NativeFramebufferCaptureEntry,
  NativeItemRendererEntry,
  NativeRenderIndex,
  NativeShaderItemEntry,
  NativeTextureSpriteEntry,
} from "../runtime/types";
import { fetchDistDataArrayBuffer, fetchDistDataJson, getDistDataBasePath, joinDistDataAssetPath } from "./distDataRuntimeAssetResolver";
import { parseNativeBinaryPackEnvelope } from "./distDataNativeBinaryPack";
import { parseCompactTexturePayloadToAtlasIndex } from "./distDataRuntimeBinaryTexturePack";
import type { DistDataManifest } from "./distDataRuntimeManifest";

type RenderRuntimeDeps = {
  getDistDataManifest: () => Promise<DistDataManifest | null>;
  getRustTextureBinaryPath: (manifest: DistDataManifest) => Promise<string | null>;
  reportDistDataSchemaMismatch: (manifest: DistDataManifest, path: string, reason: string, details?: unknown) => void;
};

export function createDistDataRuntimeRenderApi(deps: RenderRuntimeDeps) {
  let browserAtlasIndexRequest: Promise<BrowserAtlasIndexResponse | null> | null = null;
  let cachedBrowserAtlasIndex: BrowserAtlasIndexResponse | null = null;
  let nativeRenderIndexRequest: Promise<NativeRenderIndex | null> | null = null;
  let cachedNativeRenderIndex: NativeRenderIndex | null = null;

async function getDistDataBrowserAtlasIndex(): Promise<BrowserAtlasIndexResponse | null> {
  if (cachedBrowserAtlasIndex) {
    return cachedBrowserAtlasIndex;
  }
  if (browserAtlasIndexRequest) {
    return browserAtlasIndexRequest;
  }

  browserAtlasIndexRequest = (async () => {
    const manifest = await deps.getDistDataManifest();
    const rustTexturePath = `${manifest?.files?.rustTexturePack ?? ""}`.trim();
    if (!manifest) {
      return null;
    }
    const rustTextureBinaryPath = await deps.getRustTextureBinaryPath(manifest);
    if (rustTextureBinaryPath) {
      const buffer = await fetchDistDataArrayBuffer(joinDistDataAssetPath(getDistDataBasePath(), rustTextureBinaryPath)).catch(() => null);
      const rustAtlas = buffer
        ? (() => {
            const envelope = parseNativeBinaryPackEnvelope(buffer, "neonei/texture-pack/current");
            return parseCompactTexturePayloadToAtlasIndex(envelope.payload);
          })()
        : null;
      if (!rustAtlas || !Array.isArray(rustAtlas.items)) {
        deps.reportDistDataSchemaMismatch(manifest, rustTextureBinaryPath, "Binary textures.bin atlas is missing items[]", {
          schemaVersion: rustAtlas?.schemaVersion ?? null,
        });
        return null;
      }
      cachedBrowserAtlasIndex = rustAtlas;
      return cachedBrowserAtlasIndex;
    }

    const atlasPath = `${manifest.files?.browserAtlasIndex ?? ""}`.trim();
    if (!atlasPath) {
      return null;
    }
    const payload = await fetchDistDataJson<BrowserAtlasIndexResponse>(joinDistDataAssetPath(getDistDataBasePath(), atlasPath));
    if (!payload || !Array.isArray(payload.items)) {
      deps.reportDistDataSchemaMismatch(manifest, atlasPath, "Dist-data browser atlas index is missing items[]", {
        schemaVersion: payload?.schemaVersion ?? null,
      });
      return null;
    }
    cachedBrowserAtlasIndex = payload;
    return cachedBrowserAtlasIndex;
  })()
    .catch(() => null)
    .finally(() => {
      browserAtlasIndexRequest = null;
    });

  return browserAtlasIndexRequest;
}

async function getDistDataNativeRenderIndex(): Promise<NativeRenderIndex | null> {
  if (cachedNativeRenderIndex) {
    return cachedNativeRenderIndex;
  }
  if (nativeRenderIndexRequest) {
    return nativeRenderIndexRequest;
  }

  nativeRenderIndexRequest = (async () => {
    const manifest = await deps.getDistDataManifest();
    const indexPath = `${manifest?.files?.nativeRenderIndex ?? ""}`.trim();
    if (!manifest || !indexPath) {
      return null;
    }
    const payload = await fetchDistDataJson<NativeRenderIndex>(joinDistDataAssetPath(getDistDataBasePath(), indexPath));
    if (!payload || typeof payload !== "object") {
      deps.reportDistDataSchemaMismatch(manifest, indexPath, "Dist-data native render index is not an object", {
        schemaVersion: (payload as { schemaVersion?: unknown } | null)?.schemaVersion ?? null,
      });
      return null;
    }
    const hasRendererIndex = payload.itemRendererByItemId && typeof payload.itemRendererByItemId === "object";
    if (!hasRendererIndex) {
      deps.reportDistDataSchemaMismatch(manifest, indexPath, "Dist-data native render index is missing itemRendererByItemId", {
        schemaVersion: payload.schemaVersion ?? null,
      });
    }
    cachedNativeRenderIndex = payload;
    return cachedNativeRenderIndex;
  })()
    .catch(() => null)
    .finally(() => {
      nativeRenderIndexRequest = null;
    });

  return nativeRenderIndexRequest;
}

function getItemAssetId(itemId?: string | null): string {
  const normalizedItemId = `${itemId ?? ""}`.trim();
  return normalizedItemId ? `nesqlpp:item/${normalizedItemId}` : "";
}

async function getNativeRendererForItem(itemId?: string | null): Promise<NativeItemRendererEntry | null> {
  const normalizedItemId = `${itemId ?? ""}`.trim();
  if (!normalizedItemId) return null;
  const index = await getDistDataNativeRenderIndex();
  return index?.itemRendererByItemId?.[normalizedItemId] ?? null;
}

async function getNativeShaderForItem(itemId?: string | null): Promise<NativeShaderItemEntry | null> {
  const normalizedItemId = `${itemId ?? ""}`.trim();
  if (!normalizedItemId) return null;
  const index = await getDistDataNativeRenderIndex();
  return index?.shaderByItemId?.[normalizedItemId] ?? null;
}

async function getNativeCaptureByAssetId(assetId?: string | null): Promise<NativeFramebufferCaptureEntry | null> {
  const normalizedAssetId = `${assetId ?? ""}`.trim();
  if (!normalizedAssetId) return null;
  const index = await getDistDataNativeRenderIndex();
  return index?.capturesByAssetId?.[normalizedAssetId] ?? null;
}

async function getNativeCaptureByVariantKey(variantKey?: string | null): Promise<NativeFramebufferCaptureEntry | null> {
  const normalizedVariantKey = `${variantKey ?? ""}`.trim();
  if (!normalizedVariantKey) return null;
  const index = await getDistDataNativeRenderIndex();
  return index?.capturesByVariantKey?.[normalizedVariantKey] ?? null;
}

async function getNativeSpriteByIconName(iconName?: string | null): Promise<NativeTextureSpriteEntry | null> {
  const normalizedIconName = `${iconName ?? ""}`.trim();
  if (!normalizedIconName) return null;
  const index = await getDistDataNativeRenderIndex();
  return index?.spriteByIconName?.[normalizedIconName] ?? null;
}

async function getNativeRenderFactsForItem(itemId?: string | null, renderAssetRef?: string | null): Promise<{
  renderer: NativeItemRendererEntry | null;
  shader: NativeShaderItemEntry | null;
  capture: NativeFramebufferCaptureEntry | null;
} | null> {
  const normalizedItemId = `${itemId ?? ""}`.trim();
  const normalizedAssetId = `${renderAssetRef ?? getItemAssetId(normalizedItemId)}`.trim();
  if (!normalizedItemId && !normalizedAssetId) return null;
  const index = await getDistDataNativeRenderIndex();
  if (!index) return null;
  return {
    renderer: normalizedItemId ? index.itemRendererByItemId?.[normalizedItemId] ?? null : null,
    shader: normalizedItemId ? index.shaderByItemId?.[normalizedItemId] ?? null : null,
    capture: (normalizedAssetId ? index.capturesByAssetId?.[normalizedAssetId] : null)
      ?? (normalizedItemId ? index.capturesByVariantKey?.[normalizedItemId] : null)
      ?? null,
  };
}

  function reset(): void {
    browserAtlasIndexRequest = null;
    cachedBrowserAtlasIndex = null;
    nativeRenderIndexRequest = null;
    cachedNativeRenderIndex = null;
  }

  return {
    getDistDataBrowserAtlasIndex,
    getDistDataNativeRenderIndex,
    getNativeRendererForItem,
    getNativeShaderForItem,
    getNativeCaptureByAssetId,
    getNativeCaptureByVariantKey,
    getNativeSpriteByIconName,
    getNativeRenderFactsForItem,
    reset,
  };
}
