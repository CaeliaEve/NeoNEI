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

export type NativeLayoutCommandBatch = Readonly<{
  values: Uint32Array;
  stride: number;
  count: number;
  fieldOffsets: NativeLayoutCommandBufferDescriptor["fieldOffsets"];
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
): NativeLayoutCommandBatch {
  const offsets = Object.values(descriptor.fieldOffsets);
  const descriptorValid = Number.isSafeInteger(descriptor.u32Stride)
    && descriptor.u32Stride > 0
    && offsets.every((offset) => Number.isSafeInteger(offset) && offset >= 0 && offset < descriptor.u32Stride);
  const envelopeValid = commandBuffer instanceof ArrayBuffer
    && commandBuffer.byteLength % Uint32Array.BYTES_PER_ELEMENT === 0
    && Number.isSafeInteger(commandStride)
    && commandStride >= descriptor.u32Stride
    && Number.isSafeInteger(count)
    && count > 0;
  const requiredBytes = envelopeValid
    ? commandStride * count * Uint32Array.BYTES_PER_ELEMENT
    : 0;
  if (
    !descriptorValid
    || !envelopeValid
    || !Number.isSafeInteger(requiredBytes)
    || commandBuffer.byteLength < requiredBytes
  ) {
    return {
      values: new Uint32Array(0),
      stride: descriptor.u32Stride,
      count: 0,
      fieldOffsets: descriptor.fieldOffsets,
    };
  }

  const values = new Uint32Array(commandBuffer);
  return {
    values,
    stride: commandStride,
    count,
    fieldOffsets: descriptor.fieldOffsets,
  };
}
