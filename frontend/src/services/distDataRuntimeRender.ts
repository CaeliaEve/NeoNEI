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
import { RUNTIME_PACK_CONTRACTS } from "./distDataRuntimePackAbi";

type RenderRuntimeDeps = {
  getDistDataManifest: () => Promise<DistDataManifest | null>;
  getRustTextureBinaryPath: (manifest: DistDataManifest) => Promise<string | null>;
  reportDistDataSchemaMismatch: (manifest: DistDataManifest, path: string, reason: string, details?: unknown) => void;
};

export const NATIVE_RENDER_INDEX_LOAD_POLICY = Object.freeze({
  id: "distData.nativeRenderIndex.loader",
  requiredManifestField: "files.nativeRenderIndex",
  requiredIndexField: "itemRendererByItemId",
  failurePolicy: "fail-closed",
} as const);

export class NativeRenderIndexLoadError extends Error {
  readonly reason: string;
  readonly details: unknown;

  constructor(reason: string, details?: unknown) {
    super(`Native render index load failed: ${reason}`);
    this.name = "NativeRenderIndexLoadError";
    this.reason = reason;
    this.details = details ?? null;
  }
}

function nativeRenderIndexLoadFailed(reason: string, details?: unknown): NativeRenderIndexLoadError {
  return new NativeRenderIndexLoadError(reason, {
    policy: NATIVE_RENDER_INDEX_LOAD_POLICY.id,
    ...(
      details && typeof details === "object" && !Array.isArray(details)
        ? details as Record<string, unknown>
        : { details: details ?? null }
    ),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function requireNativeRenderIndexTarget(manifest: DistDataManifest | null): {
  manifest: DistDataManifest;
  indexPath: string;
} {
  if (!manifest) {
    throw nativeRenderIndexLoadFailed("dist-data manifest is unavailable");
  }
  const indexPath = `${manifest.files?.nativeRenderIndex ?? ""}`.trim();
  if (!indexPath) {
    throw nativeRenderIndexLoadFailed("manifest is missing files.nativeRenderIndex", {
      manifestSchemaVersion: manifest.schemaVersion ?? null,
    });
  }
  return { manifest, indexPath };
}

function assertNativeRenderIndexPayload(
  reportDistDataSchemaMismatch: RenderRuntimeDeps["reportDistDataSchemaMismatch"],
  manifest: DistDataManifest,
  indexPath: string,
  payload: unknown,
): NativeRenderIndex {
  if (!isRecord(payload)) {
    reportDistDataSchemaMismatch(
      manifest,
      indexPath,
      "Dist-data native render index is not an object",
      { schemaVersion: isRecord(payload) ? payload.schemaVersion ?? null : null },
    );
    throw nativeRenderIndexLoadFailed("native render index payload is not an object", { indexPath });
  }
  if (!isRecord(payload.itemRendererByItemId)) {
    reportDistDataSchemaMismatch(
      manifest,
      indexPath,
      "Dist-data native render index is missing itemRendererByItemId",
      { schemaVersion: payload.schemaVersion ?? null },
    );
    throw nativeRenderIndexLoadFailed("native render index is missing itemRendererByItemId", {
      indexPath,
      schemaVersion: payload.schemaVersion ?? null,
    });
  }
  return payload as NativeRenderIndex;
}

export function createDistDataRuntimeRenderApi(deps: RenderRuntimeDeps) {
  let browserAtlasIndexRequest: Promise<BrowserAtlasIndexResponse | null> | null = null;
  let cachedBrowserAtlasIndex: BrowserAtlasIndexResponse | null = null;
  let nativeRenderIndexRequest: Promise<NativeRenderIndex> | null = null;
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
      let rustAtlas: BrowserAtlasIndexResponse | null = null;
      try {
        const buffer = await fetchDistDataArrayBuffer(joinDistDataAssetPath(getDistDataBasePath(), rustTextureBinaryPath));
        const envelope = parseNativeBinaryPackEnvelope(buffer, RUNTIME_PACK_CONTRACTS.textures.schema);
        rustAtlas = parseCompactTexturePayloadToAtlasIndex(envelope.payload);
      } catch (error) {
        deps.reportDistDataSchemaMismatch(manifest, rustTextureBinaryPath, "Binary textures.bin failed to parse", {
          error: error instanceof Error ? error.message : `${error}`,
        });
        return null;
      }
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

  async function getDistDataNativeRenderIndex(): Promise<NativeRenderIndex> {
    if (cachedNativeRenderIndex) {
      return cachedNativeRenderIndex;
    }
  if (nativeRenderIndexRequest) {
    return nativeRenderIndexRequest;
  }

  nativeRenderIndexRequest = (async () => {
    const { manifest, indexPath } = requireNativeRenderIndexTarget(await deps.getDistDataManifest());
    let payload: unknown;
    try {
      payload = await fetchDistDataJson<unknown>(joinDistDataAssetPath(getDistDataBasePath(), indexPath));
    } catch (error) {
      deps.reportDistDataSchemaMismatch(manifest, indexPath, "Dist-data native render index request failed", {
        error: error instanceof Error ? error.message : `${error}`,
      });
      throw nativeRenderIndexLoadFailed("native render index request failed", {
        indexPath,
        error: error instanceof Error ? error.message : `${error}`,
      });
    }
    cachedNativeRenderIndex = assertNativeRenderIndexPayload(
      deps.reportDistDataSchemaMismatch,
      manifest,
      indexPath,
      payload,
    );
    return cachedNativeRenderIndex;
  })()
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
