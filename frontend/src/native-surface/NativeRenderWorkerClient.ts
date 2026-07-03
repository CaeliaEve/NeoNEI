import type { NativeRenderRequest, NativeRenderResponse } from "./NativeSurfaceRenderProtocol";
import { createNativeWorkerClientSession } from "./NativeWorkerClientOpsCatalog.ts";
import {
  getNativeRenderRequestTransferables,
  NATIVE_RENDER_WORKER_CLIENT_ERROR_CODES,
  NATIVE_RENDER_WORKER_CLIENT_POLICY,
  nativeRenderWorkerClientFailed,
  type NativeRenderWorkerClientErrorCode,
} from "./NativeRenderWorkerClientPolicyCatalog";

export {
  NativeRenderWorkerClientError,
  NATIVE_RENDER_WORKER_CLIENT_POLICY,
  type NativeRenderWorkerClientErrorCode,
} from "./NativeRenderWorkerClientPolicyCatalog";

export type NativeRenderRequestWithoutId = NativeRenderRequest extends infer Request
  ? Request extends NativeRenderRequest
    ? Omit<Request, "id">
    : never
  : never;

type NativeRenderWorkerMetrics = Extract<NativeRenderResponse, { metrics: unknown }>["metrics"];

const nativeRenderWorkerClient = createNativeWorkerClientSession<
  NativeRenderRequest,
  NativeRenderRequestWithoutId,
  NativeRenderResponse,
  NativeRenderWorkerMetrics,
  NativeRenderWorkerClientErrorCode
>({
  boundary: NATIVE_RENDER_WORKER_CLIENT_POLICY.boundary,
  workerUrl: () => new URL("../workers/nativeRender.worker.ts", import.meta.url),
  unavailableCode: NATIVE_RENDER_WORKER_CLIENT_ERROR_CODES.workerUnavailable,
  constructionFailedCode: NATIVE_RENDER_WORKER_CLIENT_ERROR_CODES.workerConstructionFailed,
  postFailedCode: NATIVE_RENDER_WORKER_CLIENT_ERROR_CODES.workerPostFailed,
  runtimeErrorCode: NATIVE_RENDER_WORKER_CLIENT_ERROR_CODES.workerRuntimeError,
  resetCode: NATIVE_RENDER_WORKER_CLIENT_ERROR_CODES.workerReset,
  malformedResponseCode: NATIVE_RENDER_WORKER_CLIENT_ERROR_CODES.workerMalformedResponse,
  unavailableMessage: "Worker API is unavailable",
  constructionFailedMessage: "unable to construct native render worker",
  postFailedMessage: "unable to post native render worker request",
  runtimeErrorMessage: "native render worker runtime error",
  resetMessage: "native render worker reset",
  malformedResponseMessage: "native render worker returned a response without a numeric request id",
  createError: nativeRenderWorkerClientFailed,
  transferables: getNativeRenderRequestTransferables,
  metrics: (response) => response.metrics ?? null,
  responseFailure: (response) => response.type === "error"
    ? {
      code: NATIVE_RENDER_WORKER_CLIENT_ERROR_CODES.workerErrorResponse,
      message: `${response.code}: ${response.message}`,
      cause: response,
    }
    : null,
});

export function getNativeRenderWorkerMetrics(): NativeRenderWorkerMetrics | null {
  return nativeRenderWorkerClient.getMetrics();
}

export function postNativeRenderEvent(request: NativeRenderRequestWithoutId): Promise<NativeRenderResponse> {
  return nativeRenderWorkerClient.post(request);
}

export function resetNativeRenderWorker(): void {
  nativeRenderWorkerClient.reset();
}
