import type { NativeRenderRequest, NativeRenderResponse } from "./NativeSurfaceRenderProtocol";

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

function getWorker(): Worker | null {
  if (typeof Worker === "undefined") return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL("../workers/nativeRender.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (event: MessageEvent<NativeRenderResponse>) => {
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

function getTransferables(message: NativeRenderRequest): Transferable[] {
  if (message.type === "initialize") return [message.canvas];
  if (message.type === "render") return [message.commandBuffer];
  return [];
}

export function getNativeRenderWorkerMetrics() {
  return lastMetrics;
}

export function postNativeRenderEvent(request: NativeRenderRequestWithoutId): Promise<NativeRenderResponse | null> {
  const activeWorker = getWorker();
  if (!activeWorker) return Promise.resolve(null);
  const id = nextRequestId++;
  const message = { ...request, id } as NativeRenderRequest;
  return new Promise<NativeRenderResponse>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    activeWorker.postMessage(message, getTransferables(message));
  }).catch(() => null);
}

export function resetNativeRenderWorker(): void {
  worker?.terminate();
  worker = null;
  rejectPending(new Error("Native render worker reset"));
  lastMetrics = null;
}
