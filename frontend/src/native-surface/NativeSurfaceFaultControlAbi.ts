export const NATIVE_SURFACE_FAULT_CONTROL_SCHEMA = "neonei/native-surface-fault-control/current" as const;

export const NATIVE_SURFACE_FAULT_STATUS = Object.freeze({
  ok: "ok",
  faulted: "faulted",
} as const);

export type NativeSurfaceFaultStatus =
  typeof NATIVE_SURFACE_FAULT_STATUS[keyof typeof NATIVE_SURFACE_FAULT_STATUS];

export const NATIVE_SURFACE_FAULT_DOMAINS = Object.freeze({
  render: "render",
  engine: "engine",
  runtime: "runtime",
  protocol: "protocol",
} as const);

export type NativeSurfaceFaultDomain =
  typeof NATIVE_SURFACE_FAULT_DOMAINS[keyof typeof NATIVE_SURFACE_FAULT_DOMAINS];

export type NativeSurfaceFaultStatusDescriptor = Readonly<{
  status: NativeSurfaceFaultStatus;
  terminal: boolean;
  metricsFaulted: boolean;
}>;

export const NATIVE_SURFACE_FAULT_STATUS_DESCRIPTORS: readonly NativeSurfaceFaultStatusDescriptor[] =
  Object.freeze([
    Object.freeze({
      status: NATIVE_SURFACE_FAULT_STATUS.ok,
      terminal: false,
      metricsFaulted: false,
    }),
    Object.freeze({
      status: NATIVE_SURFACE_FAULT_STATUS.faulted,
      terminal: true,
      metricsFaulted: true,
    }),
  ]);

export const NATIVE_SURFACE_FAULT_METRIC_FIELDS = Object.freeze([
  "nativeSurfaceFaulted",
  "nativeSurfaceFaultDomain",
  "nativeSurfaceFaultPhase",
  "nativeSurfaceFaultMessage",
  "nativeSurfaceFaultCount",
] as const);

export const NATIVE_SURFACE_FAULT_CONTROL_MODULE = Object.freeze({
  id: "nativeSurface.faultControl",
  schema: NATIVE_SURFACE_FAULT_CONTROL_SCHEMA,
  statusCount: NATIVE_SURFACE_FAULT_STATUS_DESCRIPTORS.length,
  statuses: NATIVE_SURFACE_FAULT_STATUS_DESCRIPTORS,
  domains: NATIVE_SURFACE_FAULT_DOMAINS,
  metricFields: NATIVE_SURFACE_FAULT_METRIC_FIELDS,
  transitionPolicy: "immutable-revisioned-state",
  failurePolicy: "fail-closed-observable",
} as const);
