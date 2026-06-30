import type { NativeSurfaceMetrics } from "./contracts";

export type NativeRuntimeControlStatus = "idle" | "loading" | "ready" | "error";

export interface NativeRuntimeControlState {
  readonly revision: number;
  readonly status: NativeRuntimeControlStatus;
  readonly ready: boolean;
  readonly packCount: number;
  readonly error: string | null;
}

function freezeNativeRuntimeControlState(state: NativeRuntimeControlState): NativeRuntimeControlState {
  return Object.freeze(state);
}

function nextNativeRuntimeRevision(state: NativeRuntimeControlState): number {
  return state.revision + 1;
}

export function createNativeRuntimeControlState(): NativeRuntimeControlState {
  return freezeNativeRuntimeControlState({
    revision: 0,
    status: "idle",
    ready: false,
    packCount: 0,
    error: null,
  });
}

export function beginNativeRuntimeLoad(state: NativeRuntimeControlState): NativeRuntimeControlState {
  return freezeNativeRuntimeControlState({
    revision: nextNativeRuntimeRevision(state),
    status: "loading",
    ready: false,
    packCount: 0,
    error: null,
  });
}

export function markNativeRuntimeReady(
  state: NativeRuntimeControlState,
  accepted: boolean,
  packCount: number,
): NativeRuntimeControlState {
  const normalizedPackCount = Math.max(0, Math.floor(Number(packCount) || 0));
  const ready = Boolean(accepted) && normalizedPackCount > 0;
  return freezeNativeRuntimeControlState({
    revision: nextNativeRuntimeRevision(state),
    status: ready ? "ready" : "error",
    ready,
    packCount: normalizedPackCount,
    error: ready
      ? null
      : accepted
        ? "Native runtime did not provide any usable packs."
        : "Native runtime worker rejected runtime packs.",
  });
}

export function markNativeRuntimeError(
  state: NativeRuntimeControlState,
  error: unknown,
): NativeRuntimeControlState {
  return freezeNativeRuntimeControlState({
    revision: nextNativeRuntimeRevision(state),
    status: "error",
    ready: false,
    packCount: 0,
    error: error instanceof Error ? error.message : String(error),
  });
}

export function shouldSendCompatEntriesToWorker(state: NativeRuntimeControlState): boolean {
  return !state.ready || state.packCount <= 0;
}

export function toNativeRuntimeMetricsPatch(
  state: NativeRuntimeControlState,
): Pick<NativeSurfaceMetrics, "nativeRuntimeReady" | "nativeRuntimePacks" | "nativeRuntimeError"> {
  return {
    nativeRuntimeReady: state.ready,
    nativeRuntimePacks: state.packCount,
    nativeRuntimeError: state.error,
  };
}
