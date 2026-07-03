export type NativeRenderCommand = {
  x: number;
  y: number;
  size: number;
  kind: number;
  flags: number;
};

export type NativeTextureSpriteCommand = {
  textureKey: string;
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
  destX: number;
  destY: number;
  destWidth: number;
  destHeight: number;
};

export type NativeRendererStats = {
  drawCalls: number;
  vertexCount: number;
  spriteDrawCalls: number;
  spriteVertexCount: number;
};

type NativeLayoutCommandBufferDescriptor = Readonly<{
  u32Stride: number;
  fieldOffsets: Readonly<{
    x: number;
    y: number;
    size: number;
    kind: number;
    flags: number;
  }>;
}>;

export const NATIVE_RENDERER_COMMAND_PROTOCOL_ABI = Object.freeze({
  schema: "neonei/native-renderer-command-protocol/current",
  owner: "native-renderer",
  layoutEncoding: "u32-command-buffer",
  failurePolicy: "fail-closed",
} as const);

export const NATIVE_RENDERER_LAYOUT_COMMAND_BUFFER_DESCRIPTOR: NativeLayoutCommandBufferDescriptor =
  Object.freeze({
    u32Stride: 9,
    fieldOffsets: Object.freeze({
      x: 1,
      y: 2,
      size: 3,
      kind: 7,
      flags: 8,
    }),
  } as const);

export function parseNativeLayoutCommandBuffer(
  commandBuffer: ArrayBuffer,
  commandStride: number,
  count: number,
  descriptor: NativeLayoutCommandBufferDescriptor = NATIVE_RENDERER_LAYOUT_COMMAND_BUFFER_DESCRIPTOR,
): NativeRenderCommand[] {
  if (
    commandStride < descriptor.u32Stride
    || count <= 0
    || commandBuffer.byteLength < commandStride * Uint32Array.BYTES_PER_ELEMENT
  ) {
    return [];
  }

  const values = new Uint32Array(commandBuffer);
  const maxCount = Math.min(count, Math.floor(values.length / commandStride));
  const result: NativeRenderCommand[] = [];
  const offsets = descriptor.fieldOffsets;

  for (let index = 0; index < maxCount; index += 1) {
    const offset = index * commandStride;
    result.push({
      x: values[offset + offsets.x] ?? 0,
      y: values[offset + offsets.y] ?? 0,
      size: values[offset + offsets.size] ?? 0,
      kind: values[offset + offsets.kind] ?? 0,
      flags: values[offset + offsets.flags] ?? 0,
    });
  }

  return result;
}
