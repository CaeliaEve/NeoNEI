import type { NativeSurfaceEngineRequest } from "./NativeSurfaceEngineProtocol";

export const NATIVE_SURFACE_ENGINE_CLIENT_ERROR_CODES = Object.freeze({
  workerUnavailable: "worker-unavailable",
  workerConstructionFailed: "worker-construction-failed",
  workerPostFailed: "worker-post-failed",
  workerRuntimeError: "worker-runtime-error",
  workerReset: "worker-reset",
  workerMalformedResponse: "worker-malformed-response",
} as const);

export type NativeSurfaceEngineClientErrorCode =
  typeof NATIVE_SURFACE_ENGINE_CLIENT_ERROR_CODES[keyof typeof NATIVE_SURFACE_ENGINE_CLIENT_ERROR_CODES];

type NativeSurfaceEngineClientErrorDescriptor = Readonly<{
  code: NativeSurfaceEngineClientErrorCode;
  pendingPolicy: "reject-pending" | "reject-current";
  terminal: boolean;
}>;

export const NATIVE_SURFACE_ENGINE_CLIENT_ERROR_DESCRIPTORS: readonly NativeSurfaceEngineClientErrorDescriptor[] =
  Object.freeze([
    Object.freeze({
      code: NATIVE_SURFACE_ENGINE_CLIENT_ERROR_CODES.workerUnavailable,
      pendingPolicy: "reject-current",
      terminal: true,
    }),
    Object.freeze({
      code: NATIVE_SURFACE_ENGINE_CLIENT_ERROR_CODES.workerConstructionFailed,
      pendingPolicy: "reject-current",
      terminal: true,
    }),
    Object.freeze({
      code: NATIVE_SURFACE_ENGINE_CLIENT_ERROR_CODES.workerPostFailed,
      pendingPolicy: "reject-current",
      terminal: false,
    }),
    Object.freeze({
      code: NATIVE_SURFACE_ENGINE_CLIENT_ERROR_CODES.workerRuntimeError,
      pendingPolicy: "reject-pending",
      terminal: true,
    }),
    Object.freeze({
      code: NATIVE_SURFACE_ENGINE_CLIENT_ERROR_CODES.workerReset,
      pendingPolicy: "reject-pending",
      terminal: true,
    }),
    Object.freeze({
      code: NATIVE_SURFACE_ENGINE_CLIENT_ERROR_CODES.workerMalformedResponse,
      pendingPolicy: "reject-pending",
      terminal: true,
    }),
  ]);

type NativeSurfaceEngineRequestType = NativeSurfaceEngineRequest["type"];

type NativeSurfaceEngineTransferDescriptor = Readonly<{
  requestType: NativeSurfaceEngineRequestType;
  transferableFields: readonly string[];
  transferables: (message: NativeSurfaceEngineRequest) => Transferable[];
}>;

type NativeSurfaceEngineTransferDescriptorMap = {
  readonly [Key in NativeSurfaceEngineRequestType]: NativeSurfaceEngineTransferDescriptor;
};

const emptyTransferables = () => [];

export const NATIVE_SURFACE_ENGINE_TRANSFER_DESCRIPTOR_MAP: NativeSurfaceEngineTransferDescriptorMap =
  Object.freeze({
    connectRenderPort: Object.freeze({
      requestType: "connectRenderPort",
      transferableFields: Object.freeze(["port"] as const),
      transferables: (message) => message.type === "connectRenderPort" ? [message.port] : [],
    }),
    disconnectRenderPort: Object.freeze({
      requestType: "disconnectRenderPort",
      transferableFields: Object.freeze([] as const),
      transferables: emptyTransferables,
    }),
    initialize: Object.freeze({
      requestType: "initialize",
      transferableFields: Object.freeze([] as const),
      transferables: emptyTransferables,
    }),
    runtimePacks: Object.freeze({
      requestType: "runtimePacks",
      transferableFields: Object.freeze(["packs[].buffer"] as const),
      transferables: (message) => {
        if (message.type !== "runtimePacks") return [];
        return message.packs
          .map((pack) => pack.buffer)
          .filter((buffer): buffer is ArrayBuffer => buffer instanceof ArrayBuffer);
      },
    }),
    viewport: Object.freeze({
      requestType: "viewport",
      transferableFields: Object.freeze([] as const),
      transferables: emptyTransferables,
    }),
    page: Object.freeze({
      requestType: "page",
      transferableFields: Object.freeze([] as const),
      transferables: emptyTransferables,
    }),
    search: Object.freeze({
      requestType: "search",
      transferableFields: Object.freeze([] as const),
      transferables: emptyTransferables,
    }),
    modFilter: Object.freeze({
      requestType: "modFilter",
      transferableFields: Object.freeze([] as const),
      transferables: emptyTransferables,
    }),
    expandedGroups: Object.freeze({
      requestType: "expandedGroups",
      transferableFields: Object.freeze([] as const),
      transferables: emptyTransferables,
    }),
    historyItems: Object.freeze({
      requestType: "historyItems",
      transferableFields: Object.freeze([] as const),
      transferables: emptyTransferables,
    }),
    itemSize: Object.freeze({
      requestType: "itemSize",
      transferableFields: Object.freeze([] as const),
      transferables: emptyTransferables,
    }),
    selectedItem: Object.freeze({
      requestType: "selectedItem",
      transferableFields: Object.freeze([] as const),
      transferables: emptyTransferables,
    }),
    mutationBatch: Object.freeze({
      requestType: "mutationBatch",
      transferableFields: Object.freeze([] as const),
      transferables: emptyTransferables,
    }),
    frame: Object.freeze({
      requestType: "frame",
      transferableFields: Object.freeze([] as const),
      transferables: emptyTransferables,
    }),
    hitTest: Object.freeze({
      requestType: "hitTest",
      transferableFields: Object.freeze([] as const),
      transferables: emptyTransferables,
    }),
    destroy: Object.freeze({
      requestType: "destroy",
      transferableFields: Object.freeze([] as const),
      transferables: emptyTransferables,
    }),
  });

export const NATIVE_SURFACE_ENGINE_CLIENT_POLICY = Object.freeze({
  boundary: "native-surface-engine-client",
  owner: "native-surface",
  schema: "neonei/native-surface-engine-client/current",
  failurePolicy: "fail-closed",
  requiresResponsePayload: true,
  errorDescriptors: NATIVE_SURFACE_ENGINE_CLIENT_ERROR_DESCRIPTORS,
  transferDescriptors: NATIVE_SURFACE_ENGINE_TRANSFER_DESCRIPTOR_MAP,
  transferPolicy: "descriptor-owned-transfer-list",
} as const);

function clientErrorDescriptor(
  code: NativeSurfaceEngineClientErrorCode,
): NativeSurfaceEngineClientErrorDescriptor {
  const descriptor = NATIVE_SURFACE_ENGINE_CLIENT_ERROR_DESCRIPTORS.find((candidate) => candidate.code === code);
  if (!descriptor) {
    throw new Error(`Missing native surface engine client error descriptor: ${code}`);
  }
  return descriptor;
}

export class NativeSurfaceEngineClientError extends Error {
  readonly code: NativeSurfaceEngineClientErrorCode;
  readonly cause?: unknown;

  constructor(code: NativeSurfaceEngineClientErrorCode, message: string, cause?: unknown) {
    const descriptor = clientErrorDescriptor(code);
    super(`Native surface engine client failed: ${message}`);
    this.name = "NativeSurfaceEngineClientError";
    this.code = descriptor.code;
    this.cause = cause;
  }
}

export function nativeSurfaceEngineClientFailed(
  code: NativeSurfaceEngineClientErrorCode,
  message: string,
  cause?: unknown,
): NativeSurfaceEngineClientError {
  return new NativeSurfaceEngineClientError(code, message, cause);
}

export function getNativeSurfaceEngineRequestTransferables(
  message: NativeSurfaceEngineRequest,
): Transferable[] {
  const descriptor = NATIVE_SURFACE_ENGINE_TRANSFER_DESCRIPTOR_MAP[message.type];
  if (!descriptor) {
    throw nativeSurfaceEngineClientFailed(
      NATIVE_SURFACE_ENGINE_CLIENT_ERROR_CODES.workerPostFailed,
      `missing transfer descriptor for native surface engine request: ${message.type}`,
      message,
    );
  }
  return descriptor.transferables(message);
}
