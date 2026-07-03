import type {
  NativeSurfaceEngineLayoutCommand,
  NativeSurfaceEngineSpriteCommand,
} from "../native-surface/NativeSurfaceEngineProtocol";

export type NativeRuntimeTimelineFrame = {
  frameIndex: number;
  durationMs: number;
};

export type NativeRuntimeAtlasFrame = {
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type NativeRuntimeTextureItem = {
  itemId: string;
  rowIndex: number;
  staticAtlas?: {
    atlasFile: string;
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  animatedAtlas?: {
    atlasFile: string;
    frames: NativeRuntimeAtlasFrame[];
    timeline: NativeRuntimeTimelineFrame[];
    frameDurationMs: number | null;
  } | null;
};

export type NativeRuntimeAnimationItem = {
  itemId: string;
  rowIndex: number;
  atlasFile?: string | null;
  timeline: NativeRuntimeTimelineFrame[];
  frameDurationMs: number | null;
};

export type NativeSpriteTimelineWasm = {
  neonei_engine_compact_texture_select_frame_index?: (ptr: number, len: number, rowIndex: number, nowMs: number) => number;
  neonei_engine_compact_animation_select_frame_index?: (ptr: number, len: number, rowIndex: number, nowMs: number) => number;
};

export type NativeSpriteTimelineSurface = {
  runtimeTextureWasmPtr: number;
  runtimeTextureWasmLen: number;
  runtimeAnimationWasmPtr: number;
  runtimeAnimationWasmLen: number;
  textureByItemId: Map<string, NativeRuntimeTextureItem>;
  animationByItemId: Map<string, NativeRuntimeAnimationItem>;
};

export type NativeSurfaceSpriteFrame = {
  spriteCommands: NativeSurfaceEngineSpriteCommand[];
  hasAnimatedSprites: boolean;
  animatedSpriteCount: number;
  missingSpriteCount: number;
  missingSpriteItemIds: string[];
  nextFrameDelayMs: number | null;
};

function toU32(value: number): number {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function normalizeFrameSlot(frameIndex: number, frameCount: number): number {
  if (frameCount <= 0) return 0;
  const integerIndex = Math.floor(Number(frameIndex) || 0);
  return ((integerIndex % frameCount) + frameCount) % frameCount;
}

function selectAtlasFrameByTimelineIndex(
  frames: NativeRuntimeAtlasFrame[],
  frameIndex: number,
): NativeRuntimeAtlasFrame | null {
  if (frames.length <= 0) return null;
  return frames.find((frame) => frame.index === frameIndex)
    ?? frames[normalizeFrameSlot(frameIndex, frames.length)]
    ?? frames[0]
    ?? null;
}

function getItemIdAliases(itemId: string): string[] {
  const normalized = `${itemId ?? ""}`.trim();
  if (!normalized) return [];
  const aliases: string[] = [];
  const parts = normalized.split("~");
  if (parts.length >= 4 && parts[0] === "i") {
    aliases.push(parts.slice(0, 4).join("~"));
    aliases.push([parts[0], parts[1], parts[2], "0"].join("~"));
  }
  return Array.from(new Set(aliases.filter((alias) => alias && alias !== normalized)));
}

function resolveTextureItem(
  textureByItemId: Map<string, NativeRuntimeTextureItem>,
  itemId: string,
): NativeRuntimeTextureItem | undefined {
  const exact = textureByItemId.get(itemId);
  if (exact) return exact;
  for (const alias of getItemIdAliases(itemId)) {
    const aliased = textureByItemId.get(alias);
    if (aliased) return aliased;
  }
  return undefined;
}

function resolveAnimationItem(
  animationByItemId: Map<string, NativeRuntimeAnimationItem>,
  itemId: string,
): NativeRuntimeAnimationItem | undefined {
  const exact = animationByItemId.get(itemId);
  if (exact) return exact;
  for (const alias of getItemIdAliases(itemId)) {
    const aliased = animationByItemId.get(alias);
    if (aliased) return aliased;
  }
  return undefined;
}

function pickTimelineFrame(
  surface: NativeSpriteTimelineSurface,
  texture: NativeRuntimeTextureItem,
  animation: NativeRuntimeAnimationItem | undefined,
  frames: NativeRuntimeAtlasFrame[],
  timeline: NativeRuntimeTimelineFrame[],
  nowMs: number,
  wasmEngine: NativeSpriteTimelineWasm | null,
): NativeRuntimeAtlasFrame | null {
  if (frames.length <= 0) return null;
  const wasmNow = toU32(nowMs);
  const invalidFrame = 0xffffffff;
  const nativeAnimationFrame = animation
    && surface.runtimeAnimationWasmPtr > 0
    && surface.runtimeAnimationWasmLen > 0
    && typeof wasmEngine?.neonei_engine_compact_animation_select_frame_index === "function"
    ? wasmEngine.neonei_engine_compact_animation_select_frame_index(
      surface.runtimeAnimationWasmPtr,
      surface.runtimeAnimationWasmLen,
      toU32(animation.rowIndex),
      wasmNow,
    )
    : invalidFrame;
  if (Number.isFinite(nativeAnimationFrame) && nativeAnimationFrame !== invalidFrame) {
    return selectAtlasFrameByTimelineIndex(frames, nativeAnimationFrame);
  }

  const nativeTextureFrame = surface.runtimeTextureWasmPtr > 0
    && surface.runtimeTextureWasmLen > 0
    && typeof wasmEngine?.neonei_engine_compact_texture_select_frame_index === "function"
    ? wasmEngine.neonei_engine_compact_texture_select_frame_index(
      surface.runtimeTextureWasmPtr,
      surface.runtimeTextureWasmLen,
      toU32(texture.rowIndex),
      wasmNow,
    )
    : invalidFrame;
  if (Number.isFinite(nativeTextureFrame) && nativeTextureFrame !== invalidFrame) {
    return selectAtlasFrameByTimelineIndex(frames, nativeTextureFrame);
  }

  const normalizedTimeline = timeline
    .map((frame) => ({
      frameIndex: toU32(frame.frameIndex),
      durationMs: Math.max(16, toU32(frame.durationMs) || texture.animatedAtlas?.frameDurationMs || 50),
    }))
    .filter((frame) => frame.durationMs > 0);
  if (normalizedTimeline.length <= 0) return frames[0] ?? null;
  const totalDuration = normalizedTimeline.reduce((sum, frame) => sum + frame.durationMs, 0);
  if (totalDuration <= 0) return frames[0] ?? null;
  let cursor = toU32(nowMs) % totalDuration;
  let selectedFrameIndex = normalizedTimeline[0]?.frameIndex ?? 0;
  for (const frame of normalizedTimeline) {
    if (cursor < frame.durationMs) {
      selectedFrameIndex = frame.frameIndex;
      break;
    }
    cursor -= frame.durationMs;
  }
  return selectAtlasFrameByTimelineIndex(frames, selectedFrameIndex);
}

function resolveNextTimelineDelayMs(timeline: NativeRuntimeTimelineFrame[], defaultDurationMs: number | null): number | null {
  const timelineDelay = timeline
    .map((frame) => toU32(frame.durationMs))
    .filter((duration) => duration > 0)
    .reduce((min, duration) => Math.min(min, duration), Number.POSITIVE_INFINITY);
  if (Number.isFinite(timelineDelay) && timelineDelay > 0) return timelineDelay;
  const defaultDelay = toU32(defaultDurationMs ?? 0);
  return defaultDelay > 0 ? defaultDelay : 50;
}

export function buildSpriteFrame(
  surface: NativeSpriteTimelineSurface,
  commands: NativeSurfaceEngineLayoutCommand[],
  nowMs: number,
  wasmEngine: NativeSpriteTimelineWasm | null,
): NativeSurfaceSpriteFrame {
  const sprites: NativeSurfaceEngineSpriteCommand[] = [];
  let animatedSpriteCount = 0;
  let missingSpriteCount = 0;
  const missingSpriteItemIds: string[] = [];
  const noteMissingSprite = (itemId: string) => {
    missingSpriteCount += 1;
    if (missingSpriteItemIds.length < 16) missingSpriteItemIds.push(itemId);
  };
  let nextFrameDelayMs: number | null = null;
  for (const command of commands) {
    if (!command.itemId) continue;
    const texture = resolveTextureItem(surface.textureByItemId, command.itemId);
    if (!texture) {
      noteMissingSprite(command.itemId);
      continue;
    }
    const animation = resolveAnimationItem(surface.animationByItemId, command.itemId);
    const animatedAtlas = texture.animatedAtlas;
    if (animatedAtlas?.atlasFile && animatedAtlas.frames.length > 0) {
      const frame = pickTimelineFrame(
        surface,
        texture,
        animation,
        animatedAtlas.frames,
        animation?.timeline?.length ? animation.timeline : animatedAtlas.timeline,
        nowMs,
        wasmEngine,
      );
      if (frame) {
        animatedSpriteCount += 1;
        const timeline = animation?.timeline?.length ? animation.timeline : animatedAtlas.timeline;
        const delayMs = resolveNextTimelineDelayMs(timeline, animation?.frameDurationMs ?? animatedAtlas.frameDurationMs);
        nextFrameDelayMs = nextFrameDelayMs === null ? delayMs : Math.min(nextFrameDelayMs, delayMs ?? nextFrameDelayMs);
        sprites.push({
          textureKey: animation?.atlasFile || animatedAtlas.atlasFile,
          sourceX: frame.x,
          sourceY: frame.y,
          sourceWidth: frame.width,
          sourceHeight: frame.height,
          destX: command.iconX,
          destY: command.iconY,
          destWidth: command.iconSize,
          destHeight: command.iconSize,
        });
        continue;
      }
    }
    const staticAtlas = texture.staticAtlas;
    if (staticAtlas?.atlasFile && staticAtlas.width > 0 && staticAtlas.height > 0) {
      sprites.push({
        textureKey: staticAtlas.atlasFile,
        sourceX: staticAtlas.x,
        sourceY: staticAtlas.y,
        sourceWidth: staticAtlas.width,
        sourceHeight: staticAtlas.height,
        destX: command.iconX,
        destY: command.iconY,
        destWidth: command.iconSize,
        destHeight: command.iconSize,
      });
      continue;
    }
    noteMissingSprite(command.itemId);
  }
  return {
    spriteCommands: sprites,
    hasAnimatedSprites: animatedSpriteCount > 0,
    animatedSpriteCount,
    missingSpriteCount,
    missingSpriteItemIds,
    nextFrameDelayMs,
  };
}
