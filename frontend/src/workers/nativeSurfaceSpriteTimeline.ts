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
  nextFrameDelayMs: number | null;
};

function toU32(value: number): number {
  return Math.max(0, Math.floor(Number(value) || 0));
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
    return frames.find((frame) => frame.index === nativeAnimationFrame)
      ?? frames[nativeAnimationFrame]
      ?? frames[0]
      ?? null;
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
    return frames[nativeTextureFrame] ?? frames[0] ?? null;
  }

  void timeline;
  return null;
}

function resolveNextTimelineDelayMs(timeline: NativeRuntimeTimelineFrame[], fallback: number | null): number | null {
  const timelineDelay = timeline
    .map((frame) => toU32(frame.durationMs))
    .filter((duration) => duration > 0)
    .reduce((min, duration) => Math.min(min, duration), Number.POSITIVE_INFINITY);
  if (Number.isFinite(timelineDelay) && timelineDelay > 0) return timelineDelay;
  const fallbackDelay = toU32(fallback ?? 0);
  return fallbackDelay > 0 ? fallbackDelay : 50;
}

export function buildSpriteFrame(
  surface: NativeSpriteTimelineSurface,
  commands: NativeSurfaceEngineLayoutCommand[],
  nowMs: number,
  wasmEngine: NativeSpriteTimelineWasm | null,
): NativeSurfaceSpriteFrame {
  const sprites: NativeSurfaceEngineSpriteCommand[] = [];
  let animatedSpriteCount = 0;
  let nextFrameDelayMs: number | null = null;
  for (const command of commands) {
    if (!command.itemId) continue;
    const texture = surface.textureByItemId.get(command.itemId);
    if (!texture) continue;
    const animation = surface.animationByItemId.get(command.itemId);
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
    }
  }
  return {
    spriteCommands: sprites,
    hasAnimatedSprites: animatedSpriteCount > 0,
    animatedSpriteCount,
    nextFrameDelayMs,
  };
}
