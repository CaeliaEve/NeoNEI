import type { NativeRendererBackend } from "../renderers/native/NativeRendererBackend.ts";
import type { NativeUiAtlasSpriteSource } from "./nativeUiRenderCommandBuilder.ts";
import type { NativeUiSlotCell } from "./nativeUiRuntimeRegistry.ts";
import type { NativeUiTextureRegistry } from "./nativeUiTextureRegistry.ts";

type NativeUiAtlasEntryRecord = Record<string, any>;
type NativeUiAtlasImageSource = HTMLCanvasElement | HTMLImageElement | ImageBitmap | OffscreenCanvas;
type NativeUiTextureRegistrySink = Pick<NativeUiTextureRegistry, "register">;

export interface NativeUiPreparedAtlasSource {
  atlasFile: string;
  staticSource: { x: number; y: number; width: number; height: number } | null;
  frames: Array<{ index: number; x: number; y: number; width: number; height: number }>;
  timeline: Array<{ frameIndex: number; durationMs: number }>;
}

export interface NativeUiAtlasRegistryDeps {
  warmAtlas: (lookupIds: readonly string[]) => Promise<unknown>;
  getAtlasEntry: (lookupId: string) => NativeUiAtlasEntryRecord | null | undefined;
  getAtlasImage: (atlasFile: string) => NativeUiAtlasImageSource | null | undefined;
}

export interface NativeUiAtlasRegistrationOptions<TEntry extends { atlasLookupId?: string | null }> {
  renderer: NativeRendererBackend;
  textureRegistry: NativeUiTextureRegistrySink;
  slotCells: readonly NativeUiSlotCell<TEntry>[];
  deps?: NativeUiAtlasRegistryDeps;
}

export interface NativeUiAtlasRegistrationResult {
  lookupIds: string[];
  preparedSources: Map<string, NativeUiPreparedAtlasSource>;
  missingCount: number;
  hasAnimatedSprites: boolean;
  warmError: string | null;
}

function toAtlasNumber(value: unknown, fallback: number): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  if (value && typeof value === "object" && "value" in value) {
    return toAtlasNumber((value as { value?: unknown }).value, fallback);
  }
  return fallback;
}

function normalizeDuration(value: unknown): number {
  return Math.max(16, Math.round(toAtlasNumber(value, 50)));
}

function normalizeAtlasFile(value: unknown): string | null {
  const normalized = `${value ?? ""}`.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  return normalized || null;
}

function normalizeNativeUiAtlasFrames(frames: unknown): NativeUiPreparedAtlasSource["frames"] {
  return (Array.isArray(frames) ? frames : [])
    .map((frame) => {
      const compact = Array.isArray(frame) ? frame as unknown[] : null;
      const object = frame && typeof frame === "object" ? frame as NativeUiAtlasEntryRecord : {};
      return {
        index: toAtlasNumber(compact?.[0] ?? object.index, 0),
        x: toAtlasNumber(compact?.[1] ?? object.x, 0),
        y: toAtlasNumber(compact?.[2] ?? object.y, 0),
        width: toAtlasNumber(compact?.[3] ?? object.width, 0),
        height: toAtlasNumber(compact?.[4] ?? object.height, 0),
      };
    })
    .filter((frame) => frame.width > 0 && frame.height > 0);
}

function normalizeNativeUiAtlasTimeline(
  timeline: unknown,
  fallbackDurationMs?: unknown,
): NativeUiPreparedAtlasSource["timeline"] {
  return (Array.isArray(timeline) ? timeline : [])
    .map((frame, index) => {
      const compact = Array.isArray(frame) ? frame as unknown[] : null;
      const object = frame && typeof frame === "object" ? frame as NativeUiAtlasEntryRecord : {};
      return {
        frameIndex: toAtlasNumber(compact?.[0] ?? object.frameIndex ?? object.index, index),
        durationMs: normalizeDuration(compact?.[1] ?? object.durationMs ?? fallbackDurationMs),
      };
    })
    .filter((frame) => Number.isFinite(frame.frameIndex));
}

function selectNativeUiAtlasFrameByTimelineIndex(
  frames: NativeUiPreparedAtlasSource["frames"],
  frameIndex: number,
): NativeUiPreparedAtlasSource["frames"][number] | null {
  if (frames.length <= 0) return null;
  const direct = frames.find((frame) => frame.index === frameIndex);
  if (direct) return direct;
  const integerIndex = Math.trunc(Number.isFinite(frameIndex) ? frameIndex : 0);
  const slot = ((integerIndex % frames.length) + frames.length) % frames.length;
  return frames[slot] ?? frames[0] ?? null;
}

function resolveNativeUiAtlasTimelineFrameIndex(
  timeline: NativeUiPreparedAtlasSource["timeline"],
  nowMs: number,
): number {
  if (timeline.length <= 0) return 0;
  if (timeline.length === 1) return timeline[0]?.frameIndex ?? 0;
  const totalDuration = timeline.reduce((sum, frame) => sum + normalizeDuration(frame.durationMs), 0);
  if (totalDuration <= 0) return timeline[0]?.frameIndex ?? 0;
  let cursor = Math.max(0, Math.floor(nowMs)) % totalDuration;
  for (let index = 0; index < timeline.length; index += 1) {
    const frame = timeline[index];
    const duration = normalizeDuration(frame?.durationMs);
    if (cursor < duration) return frame?.frameIndex ?? index;
    cursor -= duration;
  }
  return timeline[timeline.length - 1]?.frameIndex ?? timeline.length - 1;
}

async function defaultAtlasDeps(): Promise<NativeUiAtlasRegistryDeps> {
  const atlas = await import("./globalBrowserAtlas.ts");
  return {
    warmAtlas: atlas.warmGlobalBrowserAtlasForItemsDetailed,
    getAtlasEntry: atlas.getGlobalBrowserAtlasEntry,
    getAtlasImage: atlas.getLoadedGlobalAtlasImage,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function collectNativeUiAtlasLookupIds<TEntry extends { atlasLookupId?: string | null }>(
  slotCells: readonly NativeUiSlotCell<TEntry>[],
): string[] {
  const ids = new Set<string>();
  for (const cell of slotCells) {
    const lookupId = `${cell.entry?.atlasLookupId ?? ""}`.trim();
    if (lookupId) ids.add(lookupId);
  }
  return [...ids];
}

export function prepareNativeUiAtlasSource(entry: NativeUiAtlasEntryRecord | null | undefined): NativeUiPreparedAtlasSource | null {
  if (!entry) return null;
  const animatedAtlas = entry.animatedAtlas && typeof entry.animatedAtlas === "object"
    ? entry.animatedAtlas as NativeUiAtlasEntryRecord
    : null;
  const animatedAtlasFile = normalizeAtlasFile(animatedAtlas?.atlasFile);
  if (animatedAtlasFile) {
    const frames = normalizeNativeUiAtlasFrames(animatedAtlas?.frames);
    const timeline = normalizeNativeUiAtlasTimeline(animatedAtlas?.timeline, animatedAtlas?.frameDurationMs);
    if (frames.length > 0 && timeline.length > 0) {
      return {
        atlasFile: animatedAtlasFile,
        staticSource: null,
        frames,
        timeline,
      };
    }
  }

  const staticAtlas = entry.staticAtlas && typeof entry.staticAtlas === "object"
    ? entry.staticAtlas as NativeUiAtlasEntryRecord
    : null;
  const atlasFile = normalizeAtlasFile(staticAtlas?.atlasFile);
  const width = toAtlasNumber(staticAtlas?.width, 0);
  const height = toAtlasNumber(staticAtlas?.height, 0);
  if (!atlasFile || width <= 0 || height <= 0) return null;
  return {
    atlasFile,
    staticSource: {
      x: toAtlasNumber(staticAtlas?.x, 0),
      y: toAtlasNumber(staticAtlas?.y, 0),
      width,
      height,
    },
    frames: [],
    timeline: [],
  };
}

export function resolveNativeUiAtlasSpriteSource<TEntry extends { atlasLookupId?: string | null }>(
  preparedSources: ReadonlyMap<string, NativeUiPreparedAtlasSource>,
  entry: TEntry,
  nowMs: number,
): NativeUiAtlasSpriteSource | null {
  const prepared = preparedSources.get(`${entry.atlasLookupId ?? ""}`.trim());
  if (!prepared) return null;
  if (prepared.frames.length > 0 && prepared.timeline.length > 0) {
    const frameIndex = resolveNativeUiAtlasTimelineFrameIndex(prepared.timeline, nowMs);
    const frame = selectNativeUiAtlasFrameByTimelineIndex(prepared.frames, frameIndex);
    if (!frame) return null;
    return {
      atlasFile: prepared.atlasFile,
      x: frame.x,
      y: frame.y,
      width: frame.width,
      height: frame.height,
    };
  }
  if (!prepared.staticSource) return null;
  return {
    atlasFile: prepared.atlasFile,
    x: prepared.staticSource.x,
    y: prepared.staticSource.y,
    width: prepared.staticSource.width,
    height: prepared.staticSource.height,
  };
}

export async function registerNativeUiAtlasSources<TEntry extends { atlasLookupId?: string | null }>(
  options: NativeUiAtlasRegistrationOptions<TEntry>,
): Promise<NativeUiAtlasRegistrationResult> {
  const lookupIds = collectNativeUiAtlasLookupIds(options.slotCells);
  const preparedSources = new Map<string, NativeUiPreparedAtlasSource>();
  const deps = options.deps ?? await defaultAtlasDeps();
  let warmError: string | null = null;
  try {
    await deps.warmAtlas(lookupIds);
  } catch (error) {
    warmError = errorMessage(error);
  }

  let missingCount = 0;
  let hasAnimatedSprites = false;
  for (const lookupId of lookupIds) {
    const prepared = prepareNativeUiAtlasSource(deps.getAtlasEntry(lookupId));
    const image = prepared?.atlasFile ? deps.getAtlasImage(prepared.atlasFile) : null;
    if (!prepared || !image) {
      missingCount += 1;
      continue;
    }
    if (options.textureRegistry.register(options.renderer, prepared.atlasFile, image)) {
      preparedSources.set(lookupId, prepared);
      hasAnimatedSprites = hasAnimatedSprites || prepared.frames.length > 0;
    } else {
      missingCount += 1;
    }
  }

  return {
    lookupIds,
    preparedSources,
    missingCount,
    hasAnimatedSprites,
    warmError,
  };
}
