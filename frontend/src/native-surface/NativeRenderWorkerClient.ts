import type { NativeSurfaceId } from "./contracts";
import type { NativeRenderRequest, NativeRenderResponse } from "./NativeSurfaceRenderProtocol";
import { createNativeWorkerClientSession } from "./NativeWorkerClientOpsCatalog.ts";
import {
  getNativeRenderRequestTransferables,
  NATIVE_RENDER_WORKER_CLIENT_ERROR_CODES,
  NATIVE_RENDER_WORKER_CLIENT_POLICY,
  nativeRenderWorkerClientFailed,
  type NativeRenderWorkerClientErrorCode,
} from "./NativeRenderWorkerClientPolicyCatalog.ts";

export {
  NativeRenderWorkerClientError,
  NATIVE_RENDER_WORKER_CLIENT_POLICY,
  type NativeRenderWorkerClientErrorCode,
} from "./NativeRenderWorkerClientPolicyCatalog.ts";

export type NativeRenderRequestWithoutId = NativeRenderRequest extends infer Request
  ? Request extends NativeRenderRequest
    ? Omit<Request, "id">
    : never
  : never;

type NativeRenderWorkerMetrics = Extract<NativeRenderResponse, { metrics: unknown }>["metrics"];

export type NativeRenderWorkerClient = Readonly<{
  surfaceId: NativeSurfaceId;
  getMetrics: () => NativeRenderWorkerMetrics | null;
  post: (request: NativeRenderRequestWithoutId) => Promise<NativeRenderResponse>;
  connectEnginePort: (sessionId: string, port: MessagePort) => Promise<void>;
  disconnectEnginePort: (sessionId: string) => Promise<void>;
  reset: () => void;
  destroy: () => void;
}>;

const renderClients = new Map<NativeSurfaceId, NativeRenderWorkerClient>();

function createSession() {
  return createNativeWorkerClientSession<
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
}

export function createNativeRenderWorkerClient(surfaceId: NativeSurfaceId): NativeRenderWorkerClient {
  if (renderClients.has(surfaceId)) {
    throw new Error(`Native render worker client already exists for surface: ${surfaceId}`);
  }
  const session = createSession();
  const client: NativeRenderWorkerClient = Object.freeze({
    surfaceId,
    getMetrics: () => session.getMetrics(),
    post: (request) => session.post(request),
    async connectEnginePort(sessionId, port) {
      const response = await session.post({ type: "connectEnginePort", sessionId, port });
      if (response.type !== "pipelineConnected" || response.sessionId !== sessionId) {
        throw nativeRenderWorkerClientFailed(
          NATIVE_RENDER_WORKER_CLIENT_ERROR_CODES.workerErrorResponse,
          `native render worker rejected engine pipeline connection: ${response.type}`,
          response,
        );
      }
    },
    async disconnectEnginePort(sessionId) {
      const response = await session.post({ type: "disconnectEnginePort", sessionId });
      if (response.type !== "pipelineDisconnected" || response.sessionId !== sessionId) {
        throw nativeRenderWorkerClientFailed(
          NATIVE_RENDER_WORKER_CLIENT_ERROR_CODES.workerErrorResponse,
          `native render worker rejected engine pipeline disconnect: ${response.type}`,
          response,
        );
      }
    },
    reset: () => session.reset(),
    destroy() {
      session.reset();
      renderClients.delete(surfaceId);
    },
  });
  renderClients.set(surfaceId, client);
  return client;
}

export function getNativeRenderWorkerMetrics(): Readonly<Record<string, NativeRenderWorkerMetrics | null>> {
  return Object.freeze(Object.fromEntries(
    Array.from(renderClients, ([surfaceId, client]) => [surfaceId, client.getMetrics()]),
  ));
}
