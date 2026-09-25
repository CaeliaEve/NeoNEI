import type { NativeRenderSpriteCommand } from "./NativeSurfaceRenderProtocol";

export const NATIVE_RENDER_PIPELINE_PROTOCOL = Object.freeze({
  schema: "neonei/native-render-pipeline/current",
  topology: "engine-worker-to-render-worker-message-channel",
  ownershipPolicy: "engine-to-render-single-transfer",
  mainThreadFramePolicy: "control-plane-only-no-frame-payload",
  failurePolicy: "fail-closed-recreate-both-workers",
  handshakePolicy: "render-port-ready-before-engine-frame",
} as const);

export type NativeRenderPipelineHandshake = {
  type: "pipelineHandshake";
  sessionId: string;
};

export type NativeRenderPipelineReady = {
  type: "pipelineReady";
  sessionId: string;
};

export type NativeRenderPipelineFrameRequest = {
  type: "renderFrame";
  sessionId: string;
  frameToken: number;
  commandBuffer: ArrayBuffer;
  commandStride: number;
  commandCount: number;
  spriteCommands: NativeRenderSpriteCommand[];
  nowMs: number;
};

export type NativeRenderPipelineFrameRendered = {
  type: "frameRendered";
  sessionId: string;
  frameToken: number;
  status: "rendered" | "deferred";
  missingTextureKeys: string[];
};

export type NativeRenderPipelineError = {
  type: "pipelineError";
  sessionId: string;
  frameToken: number | null;
  code: string;
  message: string;
};

export type NativeRenderPipelineMessage =
  | NativeRenderPipelineHandshake
  | NativeRenderPipelineReady
  | NativeRenderPipelineFrameRequest
  | NativeRenderPipelineFrameRendered
  | NativeRenderPipelineError;

export function getNativeRenderPipelineTransferables(
  message: NativeRenderPipelineMessage,
): Transferable[] {
  return message.type === "renderFrame" ? [message.commandBuffer] : [];
}

export function isNativeRenderPipelineMessage(value: unknown): value is NativeRenderPipelineMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  if (typeof message.sessionId !== "string" || message.sessionId.length === 0) return false;
  switch (message.type) {
    case "pipelineHandshake":
    case "pipelineReady":
      return true;
    case "renderFrame":
      return Number.isSafeInteger(message.frameToken)
        && message.commandBuffer instanceof ArrayBuffer
        && Number.isSafeInteger(message.commandStride)
        && Number.isSafeInteger(message.commandCount)
        && Array.isArray(message.spriteCommands)
        && typeof message.nowMs === "number";
    case "frameRendered":
      return Number.isSafeInteger(message.frameToken)
        && (message.status === "rendered" || message.status === "deferred")
        && Array.isArray(message.missingTextureKeys)
        && message.missingTextureKeys.every((key) => typeof key === "string" && key.length > 0);
    case "pipelineError":
      return (message.frameToken === null || Number.isSafeInteger(message.frameToken))
        && typeof message.code === "string"
        && message.code.length > 0
        && typeof message.message === "string";
    default:
      return false;
  }
}
