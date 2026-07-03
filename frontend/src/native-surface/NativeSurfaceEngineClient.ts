import type {
  NativeSurfaceEngineRequest,
  NativeSurfaceEngineResponse,
  NativeSurfaceEngineWorkerMetrics,
} from "./NativeSurfaceEngineProtocol";
import {
  getNativeSurfaceEngineRequestTransferables,
  nativeSurfaceEngineClientFailed,
} from "./NativeSurfaceEngineClientPolicyCatalog";

export {
  NativeSurfaceEngineClientError,
  NATIVE_SURFACE_ENGINE_CLIENT_POLICY,
  type NativeSurfaceEngineClientErrorCode,
} from "./NativeSurfaceEngineClientPolicyCatalog";

type PendingRequest = {
  resolve: (response: NativeSurfaceEngineResponse) => void;
  reject: (error: unknown) => void;
};

type NativeSurfaceEngineRequestWithoutId = NativeSurfaceEngineRequest extends infer Request
  ? Request extends NativeSurfaceEngineRequest
    ? Omit<Request, "id">
    : never
  : never;

let worker: Worker | null = null;
let nextRequestId = 1;
let lastMetrics: NativeSurfaceEngineWorkerMetrics | null = null;
const pending = new Map<number, PendingRequest>();

function rejectPending(error: unknown) {
  for (const request of pending.values()) {
    request.reject(error);
  }
  pending.clear();
}

function requireWorker(): Worker {
  if (typeof Worker === "undefined") {
    throw nativeSurfaceEngineClientFailed("worker-unavailable", "Worker API is unavailable");
  }
  if (worker) return worker;
  try {
    worker = new Worker(new URL("../workers/nativeSurfaceEngine.worker.ts", import.meta.url), {
      type: "module",
    });
  } catch (error) {
    worker = null;
    throw nativeSurfaceEngineClientFailed("worker-construction-failed", "unable to construct native surface engine worker", error);
  }
  worker.onmessage = (event: MessageEvent<NativeSurfaceEngineResponse>) => {
    const response = event.data;
    if (!response || typeof response.id !== "number") {
      rejectPending(nativeSurfaceEngineClientFailed(
        "worker-malformed-response",
        "native surface engine worker returned a response without a numeric request id",
      ));
      return;
    }
    if (response.metrics) {
      lastMetrics = response.metrics;
    }
    const request = pending.get(response.id);
    if (!request) return;
    pending.delete(response.id);
    request.resolve(response);
  };
  worker.onerror = (error) => {
    const failure = nativeSurfaceEngineClientFailed(
      "worker-runtime-error",
      error.message || "native surface engine worker runtime error",
      error,
    );
    rejectPending(failure);
    worker?.terminate();
    worker = null;
  };
  return worker;
}

export function getNativeSurfaceEngineMetrics(): NativeSurfaceEngineWorkerMetrics | null {
  return lastMetrics;
}

export function postNativeSurfaceEngineEvent(
  request: NativeSurfaceEngineRequestWithoutId,
): Promise<NativeSurfaceEngineResponse> {
  const activeWorker = requireWorker();
  const id = nextRequestId++;
  const message = { ...request, id } as NativeSurfaceEngineRequest;
  return new Promise<NativeSurfaceEngineResponse>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    try {
      activeWorker.postMessage(message, getNativeSurfaceEngineRequestTransferables(message));
    } catch (error) {
      pending.delete(id);
      reject(nativeSurfaceEngineClientFailed("worker-post-failed", "unable to post native surface engine worker request", error));
    }
  });
}

export function resetNativeSurfaceEngineWorker(): void {
  worker?.terminate();
  worker = null;
  rejectPending(nativeSurfaceEngineClientFailed("worker-reset", "native surface engine worker reset"));
  lastMetrics = null;
}
