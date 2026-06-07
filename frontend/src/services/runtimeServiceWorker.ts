export type RuntimeServiceWorkerStatus = {
  supported: boolean;
  registered: boolean;
  controllerReady: boolean;
  cacheName?: string;
  runtimeId?: string | null;
  entryCount?: number;
  approxBytes?: number;
  manifestHash?: string | null;
  manifestUpdatedAt?: string | null;
  error?: string;
};

const SW_URL = "/neonei-sw.js";
const SW_SCOPE = "/";
const MESSAGE_TIMEOUT_MS = 2000;

function shouldRegisterRuntimeServiceWorker(): boolean {
  if (typeof window === "undefined") return false;
  if (!("serviceWorker" in navigator)) return false;
  if (import.meta.env.PROD) return true;
  try {
    return window.localStorage.getItem("neonei:enable-runtime-sw") === "1";
  } catch {
    return false;
  }
}

function postServiceWorkerMessage<T>(type: string): Promise<T | null> {
  if (typeof navigator === "undefined" || !navigator.serviceWorker?.controller) {
    return Promise.resolve(null);
  }
  return new Promise<T | null>((resolve) => {
    let settled = false;
    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      navigator.serviceWorker.removeEventListener("message", onMessage);
      resolve(null);
    }, MESSAGE_TIMEOUT_MS);

    const onMessage = (event: MessageEvent) => {
      const expectedType = `${type}_RESULT`;
      if (event.data?.type !== expectedType) return;
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      navigator.serviceWorker.removeEventListener("message", onMessage);
      resolve((event.data?.payload ?? null) as T | null);
    };

    navigator.serviceWorker.addEventListener("message", onMessage);
    navigator.serviceWorker.controller.postMessage({ type });
  });
}

export async function registerRuntimeServiceWorker(): Promise<RuntimeServiceWorkerStatus> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return { supported: false, registered: false, controllerReady: false };
  }
  if (!shouldRegisterRuntimeServiceWorker()) {
    return {
      supported: true,
      registered: false,
      controllerReady: Boolean(navigator.serviceWorker.controller),
    };
  }

  try {
    await navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE });
    await navigator.serviceWorker.ready;
    return {
      supported: true,
      registered: true,
      controllerReady: Boolean(navigator.serviceWorker.controller),
    };
  } catch (error) {
    return {
      supported: true,
      registered: false,
      controllerReady: Boolean(navigator.serviceWorker.controller),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function getRuntimeServiceWorkerStatus(): Promise<RuntimeServiceWorkerStatus> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return { supported: false, registered: false, controllerReady: false };
  }
  const registrations = await navigator.serviceWorker.getRegistrations().catch(() => []);
  const payload = await postServiceWorkerMessage<Omit<RuntimeServiceWorkerStatus, "supported" | "registered" | "controllerReady">>(
    "NEONEI_RUNTIME_CACHE_STATUS",
  );
  return {
    supported: true,
    registered: registrations.some((registration) => registration.active?.scriptURL.endsWith(SW_URL)),
    controllerReady: Boolean(navigator.serviceWorker.controller),
    ...(payload ?? {}),
  };
}

export async function clearRuntimeServiceWorkerCache(): Promise<RuntimeServiceWorkerStatus> {
  await postServiceWorkerMessage("NEONEI_RUNTIME_CACHE_CLEAR");
  return getRuntimeServiceWorkerStatus();
}
