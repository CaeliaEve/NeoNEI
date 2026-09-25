import type { NativeRenderRequest } from "./NativeSurfaceRenderProtocol";

export const NATIVE_RENDER_WORKER_CLIENT_ERROR_CODES = Object.freeze({
  workerUnavailable: "worker-unavailable",
  workerConstructionFailed: "worker-construction-failed",
  workerPostFailed: "worker-post-failed",
  workerRuntimeError: "worker-runtime-error",
  workerReset: "worker-reset",
  workerMalformedResponse: "worker-malformed-response",
  workerErrorResponse: "worker-error-response",
} as const);

export type NativeRenderWorkerClientErrorCode =
  typeof NATIVE_RENDER_WORKER_CLIENT_ERROR_CODES[keyof typeof NATIVE_RENDER_WORKER_CLIENT_ERROR_CODES];

type NativeRenderWorkerClientErrorDescriptor = Readonly<{
  code: NativeRenderWorkerClientErrorCode;
  pendingPolicy: "reject-pending" | "reject-current";
  terminal: boolean;
}>;

export const NATIVE_RENDER_WORKER_CLIENT_ERROR_DESCRIPTORS: readonly NativeRenderWorkerClientErrorDescriptor[] =
  Object.freeze([
    Object.freeze({
      code: NATIVE_RENDER_WORKER_CLIENT_ERROR_CODES.workerUnavailable,
      pendingPolicy: "reject-current",
      terminal: true,
    }),
    Object.freeze({
      code: NATIVE_RENDER_WORKER_CLIENT_ERROR_CODES.workerConstructionFailed,
      pendingPolicy: "reject-current",
      terminal: true,
    }),
    Object.freeze({
      code: NATIVE_RENDER_WORKER_CLIENT_ERROR_CODES.workerPostFailed,
      pendingPolicy: "reject-current",
      terminal: false,
    }),
    Object.freeze({
      code: NATIVE_RENDER_WORKER_CLIENT_ERROR_CODES.workerRuntimeError,
      pendingPolicy: "reject-pending",
      terminal: true,
    }),
    Object.freeze({
      code: NATIVE_RENDER_WORKER_CLIENT_ERROR_CODES.workerReset,
      pendingPolicy: "reject-pending",
      terminal: true,
    }),
    Object.freeze({
      code: NATIVE_RENDER_WORKER_CLIENT_ERROR_CODES.workerMalformedResponse,
      pendingPolicy: "reject-pending",
      terminal: true,
    }),
    Object.freeze({
      code: NATIVE_RENDER_WORKER_CLIENT_ERROR_CODES.workerErrorResponse,
      pendingPolicy: "reject-current",
      terminal: false,
    }),
  ]);

type NativeRenderRequestType = NativeRenderRequest["type"];

type NativeRenderWorkerTransferDescriptor = Readonly<{
  requestType: NativeRenderRequestType;
  transferableFields: readonly string[];
  transferables: (message: NativeRenderRequest) => Transferable[];
}>;

type NativeRenderWorkerTransferDescriptorMap = {
  readonly [Key in NativeRenderRequestType]: NativeRenderWorkerTransferDescriptor;
};

export const NATIVE_RENDER_WORKER_TRANSFER_DESCRIPTOR_MAP: NativeRenderWorkerTransferDescriptorMap =
  Object.freeze({
    initialize: Object.freeze({
      requestType: "initialize",
      transferableFields: Object.freeze(["canvas"] as const),
      transferables: (message) => message.type === "initialize" ? [message.canvas] : [],
    }),
    connectEnginePort: Object.freeze({
      requestType: "connectEnginePort",
      transferableFields: Object.freeze(["port"] as const),
      transferables: (message) => message.type === "connectEnginePort" ? [message.port] : [],
    }),
    disconnectEnginePort: Object.freeze({
      requestType: "disconnectEnginePort",
      transferableFields: Object.freeze([] as const),
      transferables: () => [],
    }),
    loadTextures: Object.freeze({
      requestType: "loadTextures",
      transferableFields: Object.freeze([] as const),
      transferables: () => [],
    }),
    resize: Object.freeze({
      requestType: "resize",
      transferableFields: Object.freeze([] as const),
      transferables: () => [],
    }),
    setAnimationEnabled: Object.freeze({
      requestType: "setAnimationEnabled",
      transferableFields: Object.freeze([] as const),
      transferables: () => [],
    }),
    dispose: Object.freeze({
      requestType: "dispose",
      transferableFields: Object.freeze([] as const),
      transferables: () => [],
    }),
    metrics: Object.freeze({
      requestType: "metrics",
      transferableFields: Object.freeze([] as const),
      transferables: () => [],
    }),
  });

export const NATIVE_RENDER_WORKER_CLIENT_POLICY = Object.freeze({
  boundary: "native-render-worker-client",
  owner: "native-surface",
  schema: "neonei/native-render-worker-client/current",
  failurePolicy: "fail-closed",
  requiresResponsePayload: true,
  errorDescriptors: NATIVE_RENDER_WORKER_CLIENT_ERROR_DESCRIPTORS,
  transferDescriptors: NATIVE_RENDER_WORKER_TRANSFER_DESCRIPTOR_MAP,
  transferPolicy: "descriptor-owned-transfer-list",
} as const);

function clientErrorDescriptor(
  code: NativeRenderWorkerClientErrorCode,
): NativeRenderWorkerClientErrorDescriptor {
  const descriptor = NATIVE_RENDER_WORKER_CLIENT_ERROR_DESCRIPTORS.find((candidate) => candidate.code === code);
  if (!descriptor) {
    throw new Error(`Missing native render worker client error descriptor: ${code}`);
  }
  return descriptor;
}

export class NativeRenderWorkerClientError extends Error {
  readonly code: NativeRenderWorkerClientErrorCode;
  readonly cause?: unknown;

  constructor(code: NativeRenderWorkerClientErrorCode, message: string, cause?: unknown) {
    const descriptor = clientErrorDescriptor(code);
    super(`Native render worker client failed: ${message}`);
    this.name = "NativeRenderWorkerClientError";
    this.code = descriptor.code;
    this.cause = cause;
  }
}

export function nativeRenderWorkerClientFailed(
  code: NativeRenderWorkerClientErrorCode,
  message: string,
  cause?: unknown,
): NativeRenderWorkerClientError {
  return new NativeRenderWorkerClientError(code, message, cause);
}

export function getNativeRenderRequestTransferables(message: NativeRenderRequest): Transferable[] {
  const descriptor = NATIVE_RENDER_WORKER_TRANSFER_DESCRIPTOR_MAP[message.type];
  if (!descriptor) {
    throw nativeRenderWorkerClientFailed(
      NATIVE_RENDER_WORKER_CLIENT_ERROR_CODES.workerPostFailed,
      `missing transfer descriptor for native render request: ${message.type}`,
      message,
    );
  }
  return descriptor.transferables(message);
}
