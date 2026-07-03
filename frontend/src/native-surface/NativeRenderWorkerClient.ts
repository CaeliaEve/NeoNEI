import type { NativeRenderRequest, NativeRenderResponse } from "./NativeSurfaceRenderProtocol";
import {
  getNativeRenderRequestTransferables,
  nativeRenderWorkerClientFailed,
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

type PendingRenderRequest = {
  resolve: (response: NativeRenderResponse) => void;
  reject: (error: unknown) => void;
};

let worker: Worker | null = null;
let nextRequestId = 1;
let lastMetrics: Extract<NativeRenderResponse, { metrics: unknown }>["metrics"] | null = null;
const pending = new Map<number, PendingRenderRequest>();

function rejectPending(error: unknown) {
  for (const request of pending.values()) {
    request.reject(error);
  }
  pending.clear();
}

function requireWorker(): Worker {
  if (typeof Worker === "undefined") {
    throw nativeRenderWorkerClientFailed("worker-unavailable", "Worker API is unavailable");
  }
  if (worker) return worker;
  try {
    worker = new Worker(new URL("../workers/nativeRender.worker.ts", import.meta.url), {
      type: "module",
    });
  } catch (error) {
    worker = null;
    throw nativeRenderWorkerClientFailed("worker-construction-failed", "unable to construct native render worker", error);
  }
  worker.onmessage = (event: MessageEvent<NativeRenderResponse>) => {
    const response = event.data;
    if (!response || typeof response.id !== "number") {
      rejectPending(nativeRenderWorkerClientFailed(
        "worker-malformed-response",
        "native render worker returned a response without a numeric request id",
      ));
      return;
    }
    if (response.metrics) {
      lastMetrics = response.metrics;
    }
    const request = pending.get(response.id);
    if (!request) return;
    pending.delete(response.id);
    if (response.type === "error") {
      request.reject(nativeRenderWorkerClientFailed(
        "worker-error-response",
        `${response.code}: ${response.message}`,
        response,
      ));
      return;
    }
    request.resolve(response);
  };
  worker.onerror = (error) => {
    const failure = nativeRenderWorkerClientFailed(
      "worker-runtime-error",
      error.message || "native render worker runtime error",
      error,
    );
    rejectPending(failure);
    worker?.terminate();
    worker = null;
  };
  return worker;
}

export function getNativeRenderWorkerMetrics() {
  return lastMetrics;
}

export function postNativeRenderEvent(request: NativeRenderRequestWithoutId): Promise<NativeRenderResponse> {
  const activeWorker = requireWorker();
  const id = nextRequestId++;
  const message = { ...request, id } as NativeRenderRequest;
  return new Promise<NativeRenderResponse>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    try {
      activeWorker.postMessage(message, getNativeRenderRequestTransferables(message));
    } catch (error) {
      pending.delete(id);
      reject(nativeRenderWorkerClientFailed("worker-post-failed", "unable to post native render worker request", error));
    }
  });
}

export function resetNativeRenderWorker(): void {
  worker?.terminate();
  worker = null;
  rejectPending(nativeRenderWorkerClientFailed("worker-reset", "native render worker reset"));
  lastMetrics = null;
}
