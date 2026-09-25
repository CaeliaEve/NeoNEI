import type {
  NativeSurfaceEngineRequest,
  NativeSurfaceEngineResponse,
  NativeSurfaceEngineWorkerMetrics,
} from "./NativeSurfaceEngineProtocol";
import type { NativeSurfaceId } from "./contracts";
import { createNativeWorkerClientSession } from "./NativeWorkerClientOpsCatalog.ts";
import {
  getNativeSurfaceEngineRequestTransferables,
  NATIVE_SURFACE_ENGINE_CLIENT_ERROR_CODES,
  NATIVE_SURFACE_ENGINE_CLIENT_POLICY,
  nativeSurfaceEngineClientFailed,
  type NativeSurfaceEngineClientErrorCode,
} from "./NativeSurfaceEngineClientPolicyCatalog.ts";

export {
  NativeSurfaceEngineClientError,
  NATIVE_SURFACE_ENGINE_CLIENT_POLICY,
  type NativeSurfaceEngineClientErrorCode,
} from "./NativeSurfaceEngineClientPolicyCatalog.ts";

type NativeSurfaceEngineRequestWithoutId = NativeSurfaceEngineRequest extends infer Request
  ? Request extends NativeSurfaceEngineRequest
    ? Omit<Request, "id">
    : never
  : never;

const nativeSurfaceEngineClient = createNativeWorkerClientSession<
  NativeSurfaceEngineRequest,
  NativeSurfaceEngineRequestWithoutId,
  NativeSurfaceEngineResponse,
  NativeSurfaceEngineWorkerMetrics,
  NativeSurfaceEngineClientErrorCode
>({
  boundary: NATIVE_SURFACE_ENGINE_CLIENT_POLICY.boundary,
  workerUrl: () => new URL("../workers/nativeSurfaceEngine.worker.ts", import.meta.url),
  unavailableCode: NATIVE_SURFACE_ENGINE_CLIENT_ERROR_CODES.workerUnavailable,
  constructionFailedCode: NATIVE_SURFACE_ENGINE_CLIENT_ERROR_CODES.workerConstructionFailed,
  postFailedCode: NATIVE_SURFACE_ENGINE_CLIENT_ERROR_CODES.workerPostFailed,
  runtimeErrorCode: NATIVE_SURFACE_ENGINE_CLIENT_ERROR_CODES.workerRuntimeError,
  resetCode: NATIVE_SURFACE_ENGINE_CLIENT_ERROR_CODES.workerReset,
  malformedResponseCode: NATIVE_SURFACE_ENGINE_CLIENT_ERROR_CODES.workerMalformedResponse,
  unavailableMessage: "Worker API is unavailable",
  constructionFailedMessage: "unable to construct native surface engine worker",
  postFailedMessage: "unable to post native surface engine worker request",
  runtimeErrorMessage: "native surface engine worker runtime error",
  resetMessage: "native surface engine worker reset",
  malformedResponseMessage: "native surface engine worker returned a response without a numeric request id",
  createError: nativeSurfaceEngineClientFailed,
  transferables: getNativeSurfaceEngineRequestTransferables,
  metrics: (response) => response.metrics ?? null,
  responseFailure: (response) => response.type === "error"
    ? {
      code: NATIVE_SURFACE_ENGINE_CLIENT_ERROR_CODES.workerRuntimeError,
      message: response.error,
    }
    : null,
});

export function getNativeSurfaceEngineMetrics(): NativeSurfaceEngineWorkerMetrics | null {
  return nativeSurfaceEngineClient.getMetrics();
}

export function postNativeSurfaceEngineEvent(
  request: NativeSurfaceEngineRequestWithoutId,
): Promise<NativeSurfaceEngineResponse> {
  return nativeSurfaceEngineClient.post(request);
}

export async function connectNativeSurfaceEngineRenderPort(
  surfaceId: NativeSurfaceId,
  sessionId: string,
  port: MessagePort,
): Promise<void> {
  const response = await postNativeSurfaceEngineEvent({
    type: "connectRenderPort",
    surfaceId,
    sessionId,
    port,
  });
  if (response.type !== "ack" || response.event !== "connectRenderPort") {
    throw nativeSurfaceEngineClientFailed(
      NATIVE_SURFACE_ENGINE_CLIENT_ERROR_CODES.workerRuntimeError,
      `native surface engine rejected render pipeline connection: ${response.type}`,
      response,
    );
  }
}

export async function disconnectNativeSurfaceEngineRenderPort(
  surfaceId: NativeSurfaceId,
  sessionId: string,
): Promise<void> {
  const response = await postNativeSurfaceEngineEvent({
    type: "disconnectRenderPort",
    surfaceId,
    sessionId,
  });
  if (response.type !== "ack" || response.event !== "disconnectRenderPort") {
    throw nativeSurfaceEngineClientFailed(
      NATIVE_SURFACE_ENGINE_CLIENT_ERROR_CODES.workerRuntimeError,
      `native surface engine rejected render pipeline disconnect: ${response.type}`,
      response,
    );
  }
}

export function resetNativeSurfaceEngineWorker(): void {
  nativeSurfaceEngineClient.reset();
}
