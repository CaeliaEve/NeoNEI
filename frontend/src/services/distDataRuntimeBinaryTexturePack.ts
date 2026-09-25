import type { BrowserAtlasIndexResponse } from "../runtime/types";
import { decodeBinaryUtf8 } from "./distDataNativeBinaryPack";

const COMPACT_TEXTURE_MAGIC = "NEITEX1\0";

function compactTextureString(strings: string[], index: number): string {
  return strings[index] ?? "";
}

export function parseCompactTexturePayloadToAtlasIndex(payload: ArrayBuffer): BrowserAtlasIndexResponse {
  const headerBytes = 8 + 6 * 4;
  const rowStride = 10;
  const frameStride = 5;
  if (payload.byteLength < headerBytes) {
    throw new Error(`Compact texture payload is too small: ${payload.byteLength}`);
  }
  const view = new DataView(payload);
  const magic = decodeBinaryUtf8(payload, 0, 8);
  if (magic !== COMPACT_TEXTURE_MAGIC) {
    throw new Error(`Compact texture magic mismatch: ${magic}`);
  }
  const version = view.getUint32(8, true);
  const itemCount = view.getUint32(12, true);
  const stringCount = view.getUint32(16, true);
  const frameCount = view.getUint32(20, true);
  const actualRowStride = view.getUint32(24, true);
  const actualFrameStride = view.getUint32(28, true);
  if (version !== 1 || actualRowStride !== rowStride || actualFrameStride !== frameStride) {
    throw new Error(`Compact texture stride mismatch: version=${version}, row=${actualRowStride}, frame=${actualFrameStride}`);
  }

  const offsetsStart = headerBytes;
  const rowsStart = offsetsStart + stringCount * 4;
  const framesStart = rowsStart + itemCount * rowStride * 4;
  const stringsStart = framesStart + frameCount * frameStride * 4;
  if (stringsStart > payload.byteLength) {
    throw new Error(`Compact texture table exceeds payload length: ${stringsStart}/${payload.byteLength}`);
  }

  const bytes = new Uint8Array(payload);
  const strings: string[] = [];
  for (let index = 0; index < stringCount; index += 1) {
    const offset = view.getUint32(offsetsStart + index * 4, true);
    const start = stringsStart + offset;
    if (start >= payload.byteLength) {
      strings.push("");
      continue;
    }
    let end = start;
    while (end < payload.byteLength && bytes[end] !== 0) {
      end += 1;
    }
    strings.push(decodeBinaryUtf8(payload, start, end - start));
  }

  const items: BrowserAtlasIndexResponse["items"] = [];
  let animatedItemCount = 0;
  for (let index = 0; index < itemCount; index += 1) {
    const rowOffset = rowsStart + index * rowStride * 4;
    const itemId = compactTextureString(strings, view.getUint32(rowOffset, true));
    if (!itemId) continue;
    const staticAtlasFile = compactTextureString(strings, view.getUint32(rowOffset + 4, true));
    const staticX = view.getUint32(rowOffset + 8, true);
    const staticY = view.getUint32(rowOffset + 12, true);
    const staticWidth = view.getUint32(rowOffset + 16, true);
    const staticHeight = view.getUint32(rowOffset + 20, true);
    const animatedAtlasFile = compactTextureString(strings, view.getUint32(rowOffset + 24, true));
    const frameStart = view.getUint32(rowOffset + 28, true);
    const rowFrameCount = view.getUint32(rowOffset + 32, true);
    const frameDurationMs = view.getUint32(rowOffset + 36, true);

    const frames: NonNullable<BrowserAtlasIndexResponse["items"][number]["animatedAtlas"]>["frames"] = [];
    const timeline: NonNullable<BrowserAtlasIndexResponse["items"][number]["animatedAtlas"]>["timeline"] = [];
    for (let frameIndex = 0; frameIndex < rowFrameCount; frameIndex += 1) {
      const absoluteFrameIndex = frameStart + frameIndex;
      if (absoluteFrameIndex >= frameCount) break;
      const frameOffset = framesStart + absoluteFrameIndex * frameStride * 4;
      const width = view.getUint32(frameOffset + 8, true);
      const height = view.getUint32(frameOffset + 12, true);
      if (width <= 0 || height <= 0) continue;
      const frame = {
        index: frameIndex,
        frameIndex,
        timelineIndex: frameIndex,
        durationMs: Math.max(16, view.getUint32(frameOffset + 16, true) || frameDurationMs || 50),
        x: view.getUint32(frameOffset, true),
        y: view.getUint32(frameOffset + 4, true),
        width,
        height,
      };
      frames.push(frame);
      timeline.push(frame);
    }
    const hasAnimatedAtlas = Boolean(animatedAtlasFile && frames.length > 0);
    if (hasAnimatedAtlas) animatedItemCount += 1;
    items.push({
      itemId,
      hasStaticAtlas: Boolean(staticAtlasFile && staticWidth > 0 && staticHeight > 0),
      hasAnimatedAtlas,
      staticAtlas: staticAtlasFile && staticWidth > 0 && staticHeight > 0 ? {
        atlasFile: staticAtlasFile,
        x: staticX,
        y: staticY,
        width: staticWidth,
        height: staticHeight,
      } : null,
      animatedAtlas: hasAnimatedAtlas ? {
        atlasFile: animatedAtlasFile,
        frameDurationMs: frameDurationMs || null,
        frameCount: frames.length,
        frames,
        timeline,
      } : null,
    });
  }

  return {
    schemaVersion: "neonei/texture-pack/current",
    itemCount: items.length,
    animatedItemCount,
    missingAtlasCount: items.filter((item) => !item.hasStaticAtlas && !item.hasAnimatedAtlas).length,
    items,
  };
}
