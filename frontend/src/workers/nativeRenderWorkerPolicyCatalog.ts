import type { NativeRenderBackendKind } from "../native-surface/NativeSurfaceRenderProtocol";
import type { NativeRendererBackend } from "../renderers/native/NativeRendererBackend";
import {
  NativeRendererProbeError,
  type NativeRendererProbeResult,
} from "../renderers/native/NativeRendererProbe";

export type NativeRenderWorkerRequestedBackend = "auto" | NativeRenderBackendKind;

export const NATIVE_RENDER_WORKER_RESOURCE_OPERATIONS = Object.freeze({
  loadTextures: "loadTextures",
  render: "render",
} as const);

export type NativeRenderWorkerResourceOperation =
  typeof NATIVE_RENDER_WORKER_RESOURCE_OPERATIONS[keyof typeof NATIVE_RENDER_WORKER_RESOURCE_OPERATIONS];

type NativeRenderWorkerResourceDescriptor = Readonly<{
  operation: NativeRenderWorkerResourceOperation;
  requiresRenderer: true;
  failureReason: string;
}>;

export type NativeRenderWorkerResourceState = Readonly<{
  nativeRenderer: NativeRendererBackend | null;
  requestedBackend: NativeRenderWorkerRequestedBackend | null;
  backend: NativeRenderBackendKind | null;
}>;

export const NATIVE_RENDER_WORKER_RESOURCE_DESCRIPTORS: readonly NativeRenderWorkerResourceDescriptor[] =
  Object.freeze([
    Object.freeze({
      operation: NATIVE_RENDER_WORKER_RESOURCE_OPERATIONS.loadTextures,
      requiresRenderer: true,
      failureReason: "native renderer is not initialized",
    }),
    Object.freeze({
      operation: NATIVE_RENDER_WORKER_RESOURCE_OPERATIONS.render,
      requiresRenderer: true,
      failureReason: "native renderer is not initialized",
    }),
  ]);

export const NATIVE_RENDER_WORKER_RESOURCE_CATALOG = Object.freeze({
  id: "nativeRender.worker.resources",
  owner: "native-render-worker",
  schema: "neonei/native-render-worker-resources/current",
  descriptorCount: NATIVE_RENDER_WORKER_RESOURCE_DESCRIPTORS.length,
  descriptors: NATIVE_RENDER_WORKER_RESOURCE_DESCRIPTORS,
  ownershipPolicy: "explicit-renderer-resource-requirement",
  failurePolicy: "fail-closed",
} as const);

export class NativeRenderWorkerResourceError extends Error {
  readonly operation: NativeRenderWorkerResourceOperation;
  readonly details: unknown;

  constructor(operation: NativeRenderWorkerResourceOperation, reason: string, details?: unknown) {
    super(`Native render worker ${operation} resource failure: ${reason}`);
    this.name = "NativeRenderWorkerResourceError";
    this.operation = operation;
    this.details = Object.freeze({
      policy: NATIVE_RENDER_WORKER_RESOURCE_CATALOG.id,
      ...(details && typeof details === "object" && !Array.isArray(details)
        ? details as Record<string, unknown>
        : { details: details ?? null }),
    });
  }
}

function resourceDescriptor(operation: NativeRenderWorkerResourceOperation): NativeRenderWorkerResourceDescriptor {
  const descriptor = NATIVE_RENDER_WORKER_RESOURCE_DESCRIPTORS.find((candidate) => candidate.operation === operation);
  if (!descriptor) {
    throw new Error(`Missing native render worker resource descriptor: ${operation}`);
  }
  return descriptor;
}

export function nativeRenderWorkerResourceFailed(
  operation: NativeRenderWorkerResourceOperation,
  reason: string,
  details?: unknown,
): NativeRenderWorkerResourceError {
  return new NativeRenderWorkerResourceError(operation, reason, details);
}

export function requireNativeRenderWorkerResource(
  operation: NativeRenderWorkerResourceOperation,
  state: NativeRenderWorkerResourceState,
): NativeRendererBackend {
  const descriptor = resourceDescriptor(operation);
  if (!state.nativeRenderer) {
    throw nativeRenderWorkerResourceFailed(operation, descriptor.failureReason, {
      requestedBackend: state.requestedBackend,
      backend: state.backend,
    });
  }
  return state.nativeRenderer;
}

type NativeRenderWorkerProbeDescriptor = Readonly<{
  requested: NativeRenderWorkerRequestedBackend;
  candidates: readonly NativeRenderBackendKind[];
  failureBackend: NativeRenderBackendKind;
  policy: "exact" | "browser-default";
}>;

type NativeRenderWorkerProbeDescriptorMap = {
  readonly [Key in NativeRenderWorkerRequestedBackend]: NativeRenderWorkerProbeDescriptor;
};

export const NATIVE_RENDER_WORKER_PROBE_DESCRIPTOR_MAP: NativeRenderWorkerProbeDescriptorMap =
  Object.freeze({
    auto: Object.freeze({
      requested: "auto",
      candidates: Object.freeze(["webgl2"] as const),
      failureBackend: "webgl2",
      policy: "browser-default",
    }),
    webgpu: Object.freeze({
      requested: "webgpu",
      candidates: Object.freeze(["webgpu"] as const),
      failureBackend: "webgpu",
      policy: "exact",
    }),
    webgl2: Object.freeze({
      requested: "webgl2",
      candidates: Object.freeze(["webgl2"] as const),
      failureBackend: "webgl2",
      policy: "exact",
    }),
  });

export const NATIVE_RENDER_WORKER_PROBE_CATALOG = Object.freeze({
  id: "nativeRender.worker.probe",
  owner: "native-render-worker",
  schema: "neonei/native-render-worker-probe/current",
  descriptorCount: Object.keys(NATIVE_RENDER_WORKER_PROBE_DESCRIPTOR_MAP).length,
  descriptors: NATIVE_RENDER_WORKER_PROBE_DESCRIPTOR_MAP,
  requestedBackendPolicy: "descriptor-owned-probe-plan",
  fallbackPolicy: "no-runtime-backend-fallback",
  failurePolicy: "fail-closed",
} as const);

export type NativeRenderWorkerBackendProbeRegistry = Readonly<{
  [Backend in NativeRenderBackendKind]: (
    activeCanvas: OffscreenCanvas,
  ) => NativeRendererProbeResult | Promise<NativeRendererProbeResult>;
}>;

function probeDescriptor(requested: NativeRenderWorkerRequestedBackend): NativeRenderWorkerProbeDescriptor {
  const descriptor = NATIVE_RENDER_WORKER_PROBE_DESCRIPTOR_MAP[requested];
  if (!descriptor) {
    throw new NativeRendererProbeError({
      backend: "webgl2",
      status: "failed",
      renderer: null,
      reason: `native renderer probe descriptor is missing: ${requested}`,
    });
  }
  return descriptor;
}

export function nativeRenderWorkerProbePlan(
  requested: NativeRenderWorkerRequestedBackend,
): readonly NativeRenderBackendKind[] {
  return probeDescriptor(requested).candidates;
}

export async function probeRequestedNativeRenderWorker(
  requested: NativeRenderWorkerRequestedBackend,
  activeCanvas: OffscreenCanvas,
  probes: NativeRenderWorkerBackendProbeRegistry,
): Promise<NativeRendererProbeResult> {
  const descriptor = probeDescriptor(requested);
  const failures: NativeRendererProbeResult[] = [];
  for (const candidate of descriptor.candidates) {
    const probe = probes[candidate];
    const result = probe
      ? await probe(activeCanvas)
      : {
        backend: candidate,
        status: "failed" as const,
        renderer: null,
        reason: `native renderer probe is missing: ${candidate}`,
      };
    if (result.status === "supported") return result;
    failures.push(result);
  }
  throw new NativeRendererProbeError(failures[0] ?? {
    backend: descriptor.failureBackend,
    status: "failed",
    renderer: null,
    reason: "native renderer probe plan was empty",
  });
}
