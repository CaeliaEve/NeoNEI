import type { NativeRendererBackend } from "./NativeRendererBackend.ts";

export type NativeRendererProbeStatus = "supported" | "unsupported" | "failed";
export type NativeRendererBackendName = NativeRendererBackend["backend"];

export interface NativeRendererProbeResult {
  readonly backend: NativeRendererBackendName;
  readonly status: NativeRendererProbeStatus;
  readonly renderer: NativeRendererBackend | null;
  readonly reason: string | null;
}

export const NATIVE_RENDERER_PROBE_POLICY = Object.freeze({
  id: "nativeRenderer.probe",
  statuses: ["supported", "unsupported", "failed"] as const,
  defaultBrowserCanvasBackend: "webgl2",
  requestedBackendPolicy: "exact-probe-no-fallback",
  failurePolicy: "fail-closed",
} as const);

export class NativeRendererProbeError extends Error {
  readonly result: NativeRendererProbeResult;

  constructor(result: NativeRendererProbeResult) {
    super(`Native renderer ${result.backend} probe ${result.status}: ${result.reason ?? "unknown failure"}`);
    this.name = "NativeRendererProbeError";
    this.result = Object.freeze({ ...result });
  }
}

function freezeProbeResult(result: NativeRendererProbeResult): NativeRendererProbeResult {
  return Object.freeze(result);
}

export function nativeRendererProbeSupported(
  renderer: NativeRendererBackend,
): NativeRendererProbeResult {
  return freezeProbeResult({
    backend: renderer.backend,
    status: "supported",
    renderer,
    reason: null,
  });
}

export function nativeRendererProbeUnsupported(
  backend: NativeRendererBackendName,
  reason: string,
): NativeRendererProbeResult {
  return freezeProbeResult({
    backend,
    status: "unsupported",
    renderer: null,
    reason,
  });
}

export function nativeRendererProbeFailed(
  backend: NativeRendererBackendName,
  reason: string,
): NativeRendererProbeResult {
  return freezeProbeResult({
    backend,
    status: "failed",
    renderer: null,
    reason,
  });
}

export function assertNativeRendererProbeSupported(
  result: NativeRendererProbeResult,
): NativeRendererBackend {
  if (result.status !== "supported" || !result.renderer) {
    throw new NativeRendererProbeError(result);
  }
  return result.renderer;
}
