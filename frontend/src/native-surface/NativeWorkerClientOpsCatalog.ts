export const NATIVE_WORKER_CLIENT_OPS_CATALOG_ABI = Object.freeze({
  schema: "neonei/native-worker-client-ops/current",
  owner: "native-surface",
  lifecyclePolicy: "descriptor-owned-worker-client-session",
  pendingPolicy: "request-id-map-rcu-snapshot",
  failurePolicy: "fail-closed",
} as const);

type NativeWorkerClientRequest = Readonly<{
  id: number;
}>;

type NativeWorkerClientResponse = Readonly<{
  id: number;
}>;

type PendingWorkerRequest<Response extends NativeWorkerClientResponse> = {
  resolve: (response: Response) => void;
  reject: (error: unknown) => void;
};

type NativeWorkerClientErrorFactory<ErrorCode extends string> = (
  code: ErrorCode,
  message: string,
  cause?: unknown,
) => Error;

type NativeWorkerClientFailure<ErrorCode extends string> = Readonly<{
  code: ErrorCode;
  message: string;
  cause?: unknown;
}>;

type NativeWorkerClientSessionDescriptor<
  Request extends NativeWorkerClientRequest,
  Response extends NativeWorkerClientResponse,
  Metrics,
  ErrorCode extends string,
> = Readonly<{
  boundary: string;
  workerUrl: () => URL;
  unavailableCode: ErrorCode;
  constructionFailedCode: ErrorCode;
  postFailedCode: ErrorCode;
  runtimeErrorCode: ErrorCode;
  resetCode: ErrorCode;
  malformedResponseCode: ErrorCode;
  unavailableMessage: string;
  constructionFailedMessage: string;
  postFailedMessage: string;
  runtimeErrorMessage: string;
  resetMessage: string;
  malformedResponseMessage: string;
  createError: NativeWorkerClientErrorFactory<ErrorCode>;
  transferables: (message: Request) => Transferable[];
  metrics: (response: Response) => Metrics | null;
  responseFailure?: (response: Response) => NativeWorkerClientFailure<ErrorCode> | null;
}>;

export type NativeWorkerClientSession<
  RequestWithoutId,
  Response extends NativeWorkerClientResponse,
  Metrics,
> = Readonly<{
  getMetrics: () => Metrics | null;
  post: (request: RequestWithoutId) => Promise<Response>;
  reset: () => void;
}>;

function requireDescriptor<
  Request extends NativeWorkerClientRequest,
  Response extends NativeWorkerClientResponse,
  Metrics,
  ErrorCode extends string,
>(
  descriptor: NativeWorkerClientSessionDescriptor<Request, Response, Metrics, ErrorCode>,
): NativeWorkerClientSessionDescriptor<Request, Response, Metrics, ErrorCode> {
  if (!descriptor.boundary) {
    throw new Error("native worker client session descriptor must declare boundary");
  }
  if (typeof descriptor.workerUrl !== "function") {
    throw new Error(`native worker client session must declare worker URL op: ${descriptor.boundary}`);
  }
  if (typeof descriptor.createError !== "function") {
    throw new Error(`native worker client session must declare error factory: ${descriptor.boundary}`);
  }
  if (typeof descriptor.transferables !== "function") {
    throw new Error(`native worker client session must declare transferables op: ${descriptor.boundary}`);
  }
  if (typeof descriptor.metrics !== "function") {
    throw new Error(`native worker client session must declare metrics op: ${descriptor.boundary}`);
  }
  return Object.freeze({ ...descriptor });
}

export function createNativeWorkerClientSession<
  Request extends NativeWorkerClientRequest,
  RequestWithoutId,
  Response extends NativeWorkerClientResponse,
  Metrics,
  ErrorCode extends string,
>(
  inputDescriptor: NativeWorkerClientSessionDescriptor<Request, Response, Metrics, ErrorCode>,
): NativeWorkerClientSession<RequestWithoutId, Response, Metrics> {
  const descriptor = requireDescriptor(inputDescriptor);
  let worker: Worker | null = null;
  let nextRequestId = 1;
  let lastMetrics: Metrics | null = null;
  const pending = new Map<number, PendingWorkerRequest<Response>>();

  const rejectPending = (error: unknown): void => {
    for (const request of pending.values()) {
      request.reject(error);
    }
    pending.clear();
  };

  const fail = (code: ErrorCode, message: string, cause?: unknown): Error => (
    descriptor.createError(code, message, cause)
  );

  const requireWorker = (): Worker => {
    if (typeof Worker === "undefined") {
      throw fail(descriptor.unavailableCode, descriptor.unavailableMessage);
    }
    if (worker) return worker;
    try {
      worker = new Worker(descriptor.workerUrl(), { type: "module" });
    } catch (error) {
      worker = null;
      throw fail(descriptor.constructionFailedCode, descriptor.constructionFailedMessage, error);
    }
    worker.onmessage = (event: MessageEvent<Response>) => {
      const response = event.data;
      if (!response || typeof response.id !== "number") {
        rejectPending(fail(descriptor.malformedResponseCode, descriptor.malformedResponseMessage));
        return;
      }
      const metrics = descriptor.metrics(response);
      if (metrics) {
        lastMetrics = metrics;
      }
      const request = pending.get(response.id);
      if (!request) return;
      pending.delete(response.id);

      const responseFailure = descriptor.responseFailure?.(response) ?? null;
      if (responseFailure) {
        request.reject(fail(responseFailure.code, responseFailure.message, responseFailure.cause));
        return;
      }
      request.resolve(response);
    };
    worker.onerror = (error) => {
      const failure = fail(
        descriptor.runtimeErrorCode,
        error.message || descriptor.runtimeErrorMessage,
        error,
      );
      rejectPending(failure);
      worker?.terminate();
      worker = null;
    };
    return worker;
  };

  return Object.freeze({
    getMetrics() {
      return lastMetrics;
    },
    post(request: RequestWithoutId): Promise<Response> {
      const activeWorker = requireWorker();
      const id = nextRequestId;
      nextRequestId += 1;
      const message = { ...request, id } as unknown as Request;
      return new Promise<Response>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        try {
          activeWorker.postMessage(message, descriptor.transferables(message));
        } catch (error) {
          pending.delete(id);
          reject(fail(descriptor.postFailedCode, descriptor.postFailedMessage, error));
        }
      });
    },
    reset() {
      worker?.terminate();
      worker = null;
      rejectPending(fail(descriptor.resetCode, descriptor.resetMessage));
      lastMetrics = null;
    },
  });
}
