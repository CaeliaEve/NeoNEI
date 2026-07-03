import type { NativeRenderBackendKind } from "../native-surface/NativeSurfaceRenderProtocol";
import type { NativeRendererBackend } from "../renderers/native/NativeRendererBackend.ts";
import {
  NativeRendererProbeError,
  type NativeRendererProbeResult,
} from "../renderers/native/NativeRendererProbe.ts";
import { WebGl2NativeRenderer } from "../renderers/native/WebGl2NativeRenderer.ts";
import { WebGpuNativeRenderer } from "../renderers/native/WebGpuNativeRenderer.ts";

export type NativeRenderWorkerRequestedBackend = "auto" | NativeRenderBackendKind;

export type NativeRenderWorkerBackendProbeRegistry = Readonly<{
  [Backend in NativeRenderBackendKind]: (
    activeCanvas: OffscreenCanvas,
  ) => NativeRendererProbeResult | Promise<NativeRendererProbeResult>;
}>;

export const NATIVE_RENDER_WORKER_POLICY_CATALOG_ABI = Object.freeze({
  schema: "neonei/native-render-worker-policy-catalog/current",
  owner: "native-render-worker",
  backendRegistryPolicy: "descriptor-owned-backend-probes",
  requestedBackendPolicy: "descriptor-owned-probe-plan",
  resourcePolicy: "explicit-renderer-resource-requirement",
  failurePolicy: "fail-closed",
} as const);

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

function defineResourceDescriptor<const Descriptor extends NativeRenderWorkerResourceDescriptor>(
  descriptor: Descriptor,
): Descriptor {
  return Object.freeze({ ...descriptor }) as Descriptor;
}

function validateResourceDescriptors<const Descriptors extends readonly NativeRenderWorkerResourceDescriptor[]>(
  descriptors: Descriptors,
): Descriptors {
  if (descriptors.length === 0) {
    throw new Error("native render worker resource descriptor catalog must not be empty");
  }
  const operations = new Set<string>();
  for (const descriptor of descriptors) {
    if (!descriptor.operation) {
      throw new Error("native render worker resource descriptor must declare operation");
    }
    if (!descriptor.requiresRenderer) {
      throw new Error(`native render worker resource must require renderer: ${descriptor.operation}`);
    }
    if (!descriptor.failureReason) {
      throw new Error(`native render worker resource failure reason is missing: ${descriptor.operation}`);
    }
    if (operations.has(descriptor.operation)) {
      throw new Error(`duplicate native render worker resource operation: ${descriptor.operation}`);
    }
    operations.add(descriptor.operation);
  }
  return Object.freeze([...descriptors]) as unknown as Descriptors;
}

export const NATIVE_RENDER_WORKER_RESOURCE_DESCRIPTORS = validateResourceDescriptors([
  defineResourceDescriptor({
    operation: NATIVE_RENDER_WORKER_RESOURCE_OPERATIONS.loadTextures,
    requiresRenderer: true,
    failureReason: "native renderer is not initialized",
  }),
  defineResourceDescriptor({
    operation: NATIVE_RENDER_WORKER_RESOURCE_OPERATIONS.render,
    requiresRenderer: true,
    failureReason: "native renderer is not initialized",
  }),
] as const);

export const NATIVE_RENDER_WORKER_RESOURCE_CATALOG = Object.freeze({
  id: "nativeRender.worker.resources",
  owner: NATIVE_RENDER_WORKER_POLICY_CATALOG_ABI.owner,
  schema: "neonei/native-render-worker-resources/current",
  descriptorCount: NATIVE_RENDER_WORKER_RESOURCE_DESCRIPTORS.length,
  descriptors: NATIVE_RENDER_WORKER_RESOURCE_DESCRIPTORS,
  ownershipPolicy: NATIVE_RENDER_WORKER_POLICY_CATALOG_ABI.resourcePolicy,
  failurePolicy: NATIVE_RENDER_WORKER_POLICY_CATALOG_ABI.failurePolicy,
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

type NativeRenderWorkerBackendDescriptor = Readonly<{
  backend: NativeRenderBackendKind;
  probe: NativeRenderWorkerBackendProbeRegistry[NativeRenderBackendKind];
}>;

function defineBackendDescriptor<const Descriptor extends NativeRenderWorkerBackendDescriptor>(
  descriptor: Descriptor,
): Descriptor {
  return Object.freeze({ ...descriptor }) as Descriptor;
}

function validateBackendDescriptors<const Descriptors extends readonly NativeRenderWorkerBackendDescriptor[]>(
  descriptors: Descriptors,
): Descriptors {
  if (descriptors.length === 0) {
    throw new Error("native render worker backend descriptor catalog must not be empty");
  }
  const backends = new Set<string>();
  for (const descriptor of descriptors) {
    if (!descriptor.backend) {
      throw new Error("native render worker backend descriptor must declare backend");
    }
    if (typeof descriptor.probe !== "function") {
      throw new Error(`native render worker backend probe must be a function: ${descriptor.backend}`);
    }
    if (backends.has(descriptor.backend)) {
      throw new Error(`duplicate native render worker backend descriptor: ${descriptor.backend}`);
    }
    backends.add(descriptor.backend);
  }
  return Object.freeze([...descriptors]) as unknown as Descriptors;
}

export const NATIVE_RENDER_WORKER_BACKEND_DESCRIPTOR_LIST = validateBackendDescriptors([
  defineBackendDescriptor({
    backend: "webgpu",
    probe: (activeCanvas) => WebGpuNativeRenderer.probe(activeCanvas),
  }),
  defineBackendDescriptor({
    backend: "webgl2",
    probe: (activeCanvas) => WebGl2NativeRenderer.probe(activeCanvas),
  }),
] as const);

export const NATIVE_RENDER_WORKER_BACKEND_PROBE_REGISTRY: NativeRenderWorkerBackendProbeRegistry =
  Object.freeze(Object.fromEntries(
    NATIVE_RENDER_WORKER_BACKEND_DESCRIPTOR_LIST.map((descriptor) => [descriptor.backend, descriptor.probe]),
  ) as NativeRenderWorkerBackendProbeRegistry);

type NativeRenderWorkerProbeDescriptor = Readonly<{
  requested: NativeRenderWorkerRequestedBackend;
  candidates: readonly NativeRenderBackendKind[];
  failureBackend: NativeRenderBackendKind;
  policy: "exact" | "browser-default";
}>;

type NativeRenderWorkerProbeDescriptorMap = {
  readonly [Key in NativeRenderWorkerRequestedBackend]: NativeRenderWorkerProbeDescriptor;
};

function validateProbeDescriptorMap<const DescriptorMap extends NativeRenderWorkerProbeDescriptorMap>(
  descriptors: DescriptorMap,
): DescriptorMap {
  const availableBackends = new Set(NATIVE_RENDER_WORKER_BACKEND_DESCRIPTOR_LIST.map((descriptor) => descriptor.backend));
  for (const requested of ["auto", "webgpu", "webgl2"] as const) {
    const descriptor = descriptors[requested];
    if (!descriptor) {
      throw new Error(`native render worker probe descriptor is missing: ${requested}`);
    }
    if (descriptor.requested !== requested) {
      throw new Error(`native render worker probe descriptor key mismatch: ${requested}`);
    }
    if (descriptor.candidates.length === 0) {
      throw new Error(`native render worker probe descriptor has no candidates: ${requested}`);
    }
    if (!availableBackends.has(descriptor.failureBackend)) {
      throw new Error(`native render worker probe failure backend is not registered: ${requested}`);
    }
    for (const candidate of descriptor.candidates) {
      if (!availableBackends.has(candidate)) {
        throw new Error(`native render worker probe candidate is not registered: ${requested}:${candidate}`);
      }
    }
  }
  return Object.freeze({ ...descriptors }) as DescriptorMap;
}

export const NATIVE_RENDER_WORKER_PROBE_DESCRIPTOR_MAP: NativeRenderWorkerProbeDescriptorMap =
  validateProbeDescriptorMap({
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
  owner: NATIVE_RENDER_WORKER_POLICY_CATALOG_ABI.owner,
  schema: "neonei/native-render-worker-probe/current",
  descriptorCount: Object.keys(NATIVE_RENDER_WORKER_PROBE_DESCRIPTOR_MAP).length,
  descriptors: NATIVE_RENDER_WORKER_PROBE_DESCRIPTOR_MAP,
  backendDescriptors: NATIVE_RENDER_WORKER_BACKEND_DESCRIPTOR_LIST,
  requestedBackendPolicy: NATIVE_RENDER_WORKER_POLICY_CATALOG_ABI.requestedBackendPolicy,
  backendRegistryPolicy: NATIVE_RENDER_WORKER_POLICY_CATALOG_ABI.backendRegistryPolicy,
  fallbackPolicy: "no-runtime-backend-fallback",
  failurePolicy: NATIVE_RENDER_WORKER_POLICY_CATALOG_ABI.failurePolicy,
} as const);

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
  probes: NativeRenderWorkerBackendProbeRegistry = NATIVE_RENDER_WORKER_BACKEND_PROBE_REGISTRY,
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
