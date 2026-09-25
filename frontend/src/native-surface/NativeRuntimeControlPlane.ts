import type { NativeSurfaceMetrics } from "./contracts";
import {
  NATIVE_RUNTIME_CONTROL_ERRORS,
  NATIVE_RUNTIME_CONTROL_STATUS,
  type NativeRuntimeControlStatus,
} from "./NativeRuntimeControlAbi.ts";

export type { NativeRuntimeControlStatus } from "./NativeRuntimeControlAbi.ts";

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
    status: NATIVE_RUNTIME_CONTROL_STATUS.idle,
    ready: false,
    packCount: 0,
    error: null,
  });
}

export function beginNativeRuntimeLoad(state: NativeRuntimeControlState): NativeRuntimeControlState {
  return freezeNativeRuntimeControlState({
    revision: nextNativeRuntimeRevision(state),
    status: NATIVE_RUNTIME_CONTROL_STATUS.loading,
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
    status: ready ? NATIVE_RUNTIME_CONTROL_STATUS.ready : NATIVE_RUNTIME_CONTROL_STATUS.error,
    ready,
    packCount: normalizedPackCount,
    error: ready
      ? null
      : accepted
        ? NATIVE_RUNTIME_CONTROL_ERRORS.emptyAcceptedPackSet
        : NATIVE_RUNTIME_CONTROL_ERRORS.rejectedPackSet,
  });
}

export function markNativeRuntimeError(
  state: NativeRuntimeControlState,
  error: unknown,
): NativeRuntimeControlState {
  return freezeNativeRuntimeControlState({
    revision: nextNativeRuntimeRevision(state),
    status: NATIVE_RUNTIME_CONTROL_STATUS.error,
    ready: false,
    packCount: 0,
    error: error instanceof Error ? error.message : String(error),
  });
}


export function toNativeRuntimeMetricsPatch(
  state: NativeRuntimeControlState,
): Pick<
  NativeSurfaceMetrics,
  | "nativeRuntimeStatus"
  | "nativeRuntimeRevision"
  | "nativeRuntimeReady"
  | "nativeRuntimePacks"
  | "nativeRuntimeError"
> {
  return {
    nativeRuntimeStatus: state.status,
    nativeRuntimeRevision: state.revision,
    nativeRuntimeReady: state.ready,
    nativeRuntimePacks: state.packCount,
    nativeRuntimeError: state.error,
  };
}
