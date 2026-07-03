import type { NativeSurfaceMetrics } from "./contracts";
import {
  NATIVE_SURFACE_FAULT_DOMAINS,
  NATIVE_SURFACE_FAULT_STATUS,
  type NativeSurfaceFaultDomain,
  type NativeSurfaceFaultStatus,
} from "./NativeSurfaceFaultControlAbi.ts";

export type { NativeSurfaceFaultDomain, NativeSurfaceFaultStatus } from "./NativeSurfaceFaultControlAbi.ts";

export interface NativeSurfaceFaultControlState {
  readonly revision: number;
  readonly status: NativeSurfaceFaultStatus;
  readonly faulted: boolean;
  readonly domain: NativeSurfaceFaultDomain | null;
  readonly phase: string | null;
  readonly message: string | null;
  readonly count: number;
}

export type NativeSurfaceFaultInput = Readonly<{
  domain: NativeSurfaceFaultDomain;
  phase: string;
  error: unknown;
}>;

function freezeNativeSurfaceFaultControlState(
  state: NativeSurfaceFaultControlState,
): NativeSurfaceFaultControlState {
  return Object.freeze(state);
}

function nextNativeSurfaceFaultRevision(state: NativeSurfaceFaultControlState): number {
  return state.revision + 1;
}

function normalizeFaultPhase(phase: string): string {
  const normalized = `${phase ?? ""}`.trim();
  return normalized || "unknown";
}

function normalizeFaultMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  const message = `${error ?? ""}`.trim();
  return message || "unknown native surface fault";
}

export function createNativeSurfaceFaultControlState(): NativeSurfaceFaultControlState {
  return freezeNativeSurfaceFaultControlState({
    revision: 0,
    status: NATIVE_SURFACE_FAULT_STATUS.ok,
    faulted: false,
    domain: null,
    phase: null,
    message: null,
    count: 0,
  });
}

export function clearNativeSurfaceFaultControlState(
  state: NativeSurfaceFaultControlState,
): NativeSurfaceFaultControlState {
  return freezeNativeSurfaceFaultControlState({
    revision: nextNativeSurfaceFaultRevision(state),
    status: NATIVE_SURFACE_FAULT_STATUS.ok,
    faulted: false,
    domain: null,
    phase: null,
    message: null,
    count: state.count,
  });
}

export function markNativeSurfaceFault(
  state: NativeSurfaceFaultControlState,
  fault: NativeSurfaceFaultInput,
): NativeSurfaceFaultControlState {
  const domain = NATIVE_SURFACE_FAULT_DOMAINS[fault.domain] ?? fault.domain;
  return freezeNativeSurfaceFaultControlState({
    revision: nextNativeSurfaceFaultRevision(state),
    status: NATIVE_SURFACE_FAULT_STATUS.faulted,
    faulted: true,
    domain,
    phase: normalizeFaultPhase(fault.phase),
    message: normalizeFaultMessage(fault.error),
    count: state.count + 1,
  });
}

export function toNativeSurfaceFaultMetricsPatch(
  state: NativeSurfaceFaultControlState,
): Pick<
  NativeSurfaceMetrics,
  | "nativeSurfaceFaulted"
  | "nativeSurfaceFaultDomain"
  | "nativeSurfaceFaultPhase"
  | "nativeSurfaceFaultMessage"
  | "nativeSurfaceFaultCount"
> {
  return {
    nativeSurfaceFaulted: state.faulted,
    nativeSurfaceFaultDomain: state.domain,
    nativeSurfaceFaultPhase: state.phase,
    nativeSurfaceFaultMessage: state.message,
    nativeSurfaceFaultCount: state.count,
  };
}
