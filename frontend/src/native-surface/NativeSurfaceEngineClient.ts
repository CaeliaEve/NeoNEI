import type {
  NativeSurfaceEngineRequest,
  NativeSurfaceEngineResponse,
  NativeSurfaceEngineWorkerMetrics,
} from "./NativeSurfaceEngineProtocol";

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

function getWorker(): Worker | null {
  if (typeof Worker === "undefined") return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL("../workers/nativeSurfaceEngine.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (event: MessageEvent<NativeSurfaceEngineResponse>) => {
      const response = event.data;
      if (response?.metrics) {
        lastMetrics = response.metrics;
      }
      const request = pending.get(response.id);
      if (!request) return;
      pending.delete(response.id);
      request.resolve(response);
    };
    worker.onerror = (error) => {
      rejectPending(error);
      worker?.terminate();
      worker = null;
    };
    return worker;
  } catch {
    worker = null;
    return null;
  }
}

function getTransferables(message: NativeSurfaceEngineRequest): Transferable[] {
  if (message.type !== "runtimePacks") return [];
  return message.packs
    .map((pack) => pack.buffer)
    .filter((buffer): buffer is ArrayBuffer => buffer instanceof ArrayBuffer);
}

export function getNativeSurfaceEngineMetrics(): NativeSurfaceEngineWorkerMetrics | null {
  return lastMetrics;
}

export function postNativeSurfaceEngineEvent(
  request: NativeSurfaceEngineRequestWithoutId,
): Promise<NativeSurfaceEngineResponse | null> {
  const activeWorker = getWorker();
  if (!activeWorker) return Promise.resolve(null);
  const id = nextRequestId++;
  const message = { ...request, id } as NativeSurfaceEngineRequest;
  return new Promise<NativeSurfaceEngineResponse>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    activeWorker.postMessage(message, getTransferables(message));
  }).catch(() => null);
}

export function resetNativeSurfaceEngineWorker(): void {
  worker?.terminate();
  worker = null;
  rejectPending(new Error("Native surface engine worker reset"));
  lastMetrics = null;
}
