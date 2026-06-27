import type { NativeSurfaceMetrics } from "./contracts";

export type NativeRuntimeControlStatus = "idle" | "loading" | "ready" | "error";

export interface NativeRuntimeControlState {
  status: NativeRuntimeControlStatus;
  ready: boolean;
  packCount: number;
  error: string | null;
}

export function createNativeRuntimeControlState(): NativeRuntimeControlState {
  return {
    status: "idle",
    ready: false,
    packCount: 0,
    error: null,
  };
}

export function beginNativeRuntimeLoad(state: NativeRuntimeControlState): NativeRuntimeControlState {
  state.status = "loading";
  state.ready = false;
  state.packCount = 0;
  state.error = null;
  return state;
}

export function markNativeRuntimeReady(
  state: NativeRuntimeControlState,
  accepted: boolean,
  packCount: number,
): NativeRuntimeControlState {
  const normalizedPackCount = Math.max(0, Math.floor(Number(packCount) || 0));
  state.ready = Boolean(accepted) && normalizedPackCount > 0;
  state.packCount = normalizedPackCount;
  state.error = null;
  state.status = state.ready ? "ready" : "error";
  if (!state.ready) {
    state.error = accepted
      ? "Native runtime did not provide any usable packs."
      : "Native runtime worker rejected runtime packs.";
  }
  return state;
}

export function markNativeRuntimeError(
  state: NativeRuntimeControlState,
  error: unknown,
): NativeRuntimeControlState {
  state.status = "error";
  state.ready = false;
  state.packCount = 0;
  state.error = error instanceof Error ? error.message : String(error);
  return state;
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
