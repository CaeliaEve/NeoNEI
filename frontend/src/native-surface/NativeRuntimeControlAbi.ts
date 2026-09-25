export const NATIVE_RUNTIME_CONTROL_SCHEMA = "neonei/native-runtime-control/current" as const;

export const NATIVE_RUNTIME_CONTROL_STATUS = Object.freeze({
  idle: "idle",
  loading: "loading",
  ready: "ready",
  error: "error",
} as const);

export type NativeRuntimeControlStatus =
  typeof NATIVE_RUNTIME_CONTROL_STATUS[keyof typeof NATIVE_RUNTIME_CONTROL_STATUS];

export type NativeRuntimeControlStatusDescriptor = Readonly<{
  status: NativeRuntimeControlStatus;
  terminal: boolean;
  ready: boolean;
  metricsReady: boolean;
}>;

export const NATIVE_RUNTIME_CONTROL_STATUS_DESCRIPTORS: readonly NativeRuntimeControlStatusDescriptor[] =
  Object.freeze([
    Object.freeze({
      status: NATIVE_RUNTIME_CONTROL_STATUS.idle,
      terminal: false,
      ready: false,
      metricsReady: false,
    }),
    Object.freeze({
      status: NATIVE_RUNTIME_CONTROL_STATUS.loading,
      terminal: false,
      ready: false,
      metricsReady: false,
    }),
    Object.freeze({
      status: NATIVE_RUNTIME_CONTROL_STATUS.ready,
      terminal: true,
      ready: true,
      metricsReady: true,
    }),
    Object.freeze({
      status: NATIVE_RUNTIME_CONTROL_STATUS.error,
      terminal: true,
      ready: false,
      metricsReady: false,
    }),
  ]);

export const NATIVE_RUNTIME_CONTROL_ERRORS = Object.freeze({
  emptyAcceptedPackSet: "Native runtime did not provide any usable packs.",
  rejectedPackSet: "Native runtime worker rejected runtime packs.",
} as const);

export const NATIVE_RUNTIME_CONTROL_METRIC_FIELDS = Object.freeze([
  "nativeRuntimeStatus",
  "nativeRuntimeRevision",
  "nativeRuntimeReady",
  "nativeRuntimePacks",
  "nativeRuntimeError",
] as const);

export const NATIVE_RUNTIME_CONTROL_MODULE = Object.freeze({
  id: "nativeRuntime.control",
  schema: NATIVE_RUNTIME_CONTROL_SCHEMA,
  statusCount: NATIVE_RUNTIME_CONTROL_STATUS_DESCRIPTORS.length,
  statuses: NATIVE_RUNTIME_CONTROL_STATUS_DESCRIPTORS,
  metricFields: NATIVE_RUNTIME_CONTROL_METRIC_FIELDS,
  transitionPolicy: "immutable-revisioned-state",
  failurePolicy: "fail-closed",
} as const);
