/** Acceleration runtime phase and reconcile policy ABI catalog. */

import type { AccelerationRuntimePhase, AccelerationRuntimeState } from './acceleration-runtime-state.service';

export type AccelerationReconcileDecision =
  | 'compile-snapshot'
  | 'compile-external-runtime'
  | 'materialize-publish-payloads'
  | 'ready-noop';

export type AccelerationReconcileDecisionKey =
  | 'compileSnapshot'
  | 'compileExternalRuntime'
  | 'materializePublishPayloads'
  | 'readyNoop';

const ACCELERATION_RECONCILE_DECISION_KEYS = Object.freeze([
  'compileSnapshot',
  'compileExternalRuntime',
  'materializePublishPayloads',
  'readyNoop',
] as const satisfies readonly AccelerationReconcileDecisionKey[]);

export type AccelerationReconcileDecisionDescriptor = Readonly<{
  key: AccelerationReconcileDecisionKey;
  decision: AccelerationReconcileDecision;
}>;

export const ACCELERATION_RECONCILE_DECISION_DESCRIPTORS = validateAndFreezeReconcileDecisionDescriptors([
  { key: 'compileSnapshot', decision: 'compile-snapshot' },
  { key: 'compileExternalRuntime', decision: 'compile-external-runtime' },
  { key: 'materializePublishPayloads', decision: 'materialize-publish-payloads' },
  { key: 'readyNoop', decision: 'ready-noop' },
]);

export const ACCELERATION_RECONCILE_DECISIONS = Object.freeze(
  ACCELERATION_RECONCILE_DECISION_DESCRIPTORS.map((descriptor) => descriptor.decision),
) as readonly AccelerationReconcileDecision[];

export const ACCELERATION_RECONCILE_DECISION = projectReconcileDecisionMap(
  ACCELERATION_RECONCILE_DECISION_DESCRIPTORS,
);

export type AccelerationPhaseAnnouncementKey =
  | 'snapshotStale'
  | 'snapshotCompile'
  | 'publishPayloadMaterialization'
  | 'runtimeReady';

const ACCELERATION_PHASE_ANNOUNCEMENT_KEYS = Object.freeze([
  'snapshotStale',
  'snapshotCompile',
  'publishPayloadMaterialization',
  'runtimeReady',
] as const satisfies readonly AccelerationPhaseAnnouncementKey[]);

export type AccelerationPhaseAnnouncementDescriptor = Readonly<{
  key: AccelerationPhaseAnnouncementKey;
  phase: AccelerationRuntimePhase;
  message: string;
  extras: Readonly<Partial<Pick<AccelerationRuntimeState, 'stale' | 'lastCompiledSignature' | 'lastError'>>>;
}>;

export const ACCELERATION_PHASE_ANNOUNCEMENT_DESCRIPTORS = validateAndFreezePhaseAnnouncementDescriptors([
  {
    key: 'snapshotStale',
    phase: 'stale',
    message: 'Acceleration snapshot is stale; compiling next snapshot in background.',
    extras: Object.freeze({ stale: true, lastError: null }),
  },
  {
    key: 'snapshotCompile',
    phase: 'compiling',
    message: 'Compiling next acceleration snapshot in background.',
    extras: Object.freeze({ stale: true }),
  },
  {
    key: 'publishPayloadMaterialization',
    phase: 'materializing',
    message: 'Refreshing publish hot payloads.',
    extras: Object.freeze({ stale: false, lastError: null }),
  },
  {
    key: 'runtimeReady',
    phase: 'ready',
    message: 'Acceleration runtime ready.',
    extras: Object.freeze({ stale: false, lastError: null }),
  },
]);

export const ACCELERATION_PHASE_ANNOUNCEMENTS = projectPhaseAnnouncementMap(
  ACCELERATION_PHASE_ANNOUNCEMENT_DESCRIPTORS,
);

export type AccelerationCompilePromotionSummary = {
  itemsImported?: number;
  recipesImported?: number;
  signature: string;
  runtimeId?: string | null;
  promotedFiles?: number;
  sourceIdentity?: string | null;
};

export type AccelerationPromotionLogFieldKey = keyof Required<AccelerationCompilePromotionSummary>;
const ACCELERATION_PROMOTION_LOG_FIELD_KEYS = Object.freeze([
  'itemsImported',
  'recipesImported',
  'signature',
  'runtimeId',
  'promotedFiles',
  'sourceIdentity',
] as const satisfies readonly AccelerationPromotionLogFieldKey[]);

export type AccelerationPromotionLogFieldDescriptor = Readonly<{
  key: AccelerationPromotionLogFieldKey;
  read: (summary: AccelerationCompilePromotionSummary) => unknown;
}>;

export const ACCELERATION_PROMOTION_LOG_FIELD_DESCRIPTORS = validateAndFreezePromotionLogFields([
  { key: 'itemsImported', read: (summary) => summary.itemsImported ?? null },
  { key: 'recipesImported', read: (summary) => summary.recipesImported ?? null },
  { key: 'signature', read: (summary) => summary.signature },
  { key: 'runtimeId', read: (summary) => summary.runtimeId ?? null },
  { key: 'promotedFiles', read: (summary) => summary.promotedFiles ?? null },
  { key: 'sourceIdentity', read: (summary) => summary.sourceIdentity ?? null },
]);

export type AccelerationWorkerLogKey =
  | 'accelerationSnapshotStale'
  | 'accelerationSnapshotPromoted'
  | 'externalRuntimeStale'
  | 'externalRuntimePromoted'
  | 'publishMaterializationSkipped'
  | 'publishMaterialized'
  | 'publishAlreadyFresh';

const ACCELERATION_WORKER_LOG_KEYS = Object.freeze([
  'accelerationSnapshotStale',
  'accelerationSnapshotPromoted',
  'externalRuntimeStale',
  'externalRuntimePromoted',
  'publishMaterializationSkipped',
  'publishMaterialized',
  'publishAlreadyFresh',
] as const satisfies readonly AccelerationWorkerLogKey[]);

export type AccelerationWorkerLogDescriptor = Readonly<{
  key: AccelerationWorkerLogKey;
  message: string;
}>;

export const ACCELERATION_WORKER_LOG_DESCRIPTORS = validateAndFreezeWorkerLogs([
  {
    key: 'accelerationSnapshotStale',
    message: '[ACCELERATION_DB] stale; runtime will stay online while compiling next snapshot',
  },
  {
    key: 'accelerationSnapshotPromoted',
    message: '[ACCELERATION_DB] promoted background snapshot',
  },
  {
    key: 'externalRuntimeStale',
    message: '[EXTERNAL_RUNTIME] stale; compiling next external runtime artifact with elysium-compiler',
  },
  {
    key: 'externalRuntimePromoted',
    message: '[EXTERNAL_RUNTIME] promoted external runtime artifact',
  },
  {
    key: 'publishMaterializationSkipped',
    message: '[PUBLISH_PAYLOADS] startup materialization skipped; set NEONEI_PUBLISH_MATERIALIZE_ON_START=1 to refresh publish bundles on boot',
  },
  {
    key: 'publishMaterialized',
    message: '[PUBLISH_PAYLOADS] materialized in background',
  },
  {
    key: 'publishAlreadyFresh',
    message: '[PUBLISH_PAYLOADS] already fresh',
  },
]);

export const ACCELERATION_WORKER_LOGS = projectWorkerLogMap(ACCELERATION_WORKER_LOG_DESCRIPTORS);

export function projectAccelerationPromotionLogPayload(
  summary: AccelerationCompilePromotionSummary,
): Record<string, unknown> {
  return Object.freeze(
    ACCELERATION_PROMOTION_LOG_FIELD_DESCRIPTORS.reduce(
      (payload, descriptor) => {
        payload[descriptor.key] = descriptor.read(summary);
        return payload;
      },
      {} as Record<string, unknown>,
    ),
  );
}

function validateAndFreezeReconcileDecisionDescriptors(
  descriptors: readonly AccelerationReconcileDecisionDescriptor[],
): readonly AccelerationReconcileDecisionDescriptor[] {
  const expected = new Set<AccelerationReconcileDecisionKey>(ACCELERATION_RECONCILE_DECISION_KEYS);
  const seenKeys = new Set<string>();
  const seenDecisions = new Set<string>();

  for (const descriptor of descriptors) {
    if (!descriptor) {
      throw new Error('acceleration reconcile decision descriptor must not be null');
    }
    if (!expected.has(descriptor.key)) {
      throw new Error(`Unknown acceleration reconcile decision descriptor: ${descriptor.key}`);
    }
    if (!seenKeys.add(descriptor.key)) {
      throw new Error(`Duplicate acceleration reconcile decision descriptor: ${descriptor.key}`);
    }
    if (!descriptor.decision.trim()) {
      throw new Error(`acceleration reconcile decision must be non-empty: ${descriptor.key}`);
    }
    if (!seenDecisions.add(descriptor.decision)) {
      throw new Error(`Duplicate acceleration reconcile decision value: ${descriptor.decision}`);
    }
  }

  for (const key of ACCELERATION_RECONCILE_DECISION_KEYS) {
    if (!seenKeys.has(key)) {
      throw new Error(`Missing acceleration reconcile decision descriptor: ${key}`);
    }
  }

  return Object.freeze(descriptors.map((descriptor) => Object.freeze({ ...descriptor })));
}

function validateAndFreezePhaseAnnouncementDescriptors(
  descriptors: readonly AccelerationPhaseAnnouncementDescriptor[],
): readonly AccelerationPhaseAnnouncementDescriptor[] {
  const expected = new Set<AccelerationPhaseAnnouncementKey>(ACCELERATION_PHASE_ANNOUNCEMENT_KEYS);
  const seenKeys = new Set<string>();
  const seenPhaseMessages = new Set<string>();

  for (const descriptor of descriptors) {
    if (!descriptor) {
      throw new Error('acceleration phase announcement descriptor must not be null');
    }
    if (!expected.has(descriptor.key)) {
      throw new Error(`Unknown acceleration phase announcement descriptor: ${descriptor.key}`);
    }
    if (!seenKeys.add(descriptor.key)) {
      throw new Error(`Duplicate acceleration phase announcement descriptor: ${descriptor.key}`);
    }
    if (!descriptor.phase.trim()) {
      throw new Error(`acceleration phase announcement phase must be non-empty: ${descriptor.key}`);
    }
    if (!descriptor.message.trim()) {
      throw new Error(`acceleration phase announcement message must be non-empty: ${descriptor.key}`);
    }
    const phaseMessage = `${descriptor.phase} ${descriptor.message}`;
    if (!seenPhaseMessages.add(phaseMessage)) {
      throw new Error(`Duplicate acceleration phase announcement phase/message: ${phaseMessage}`);
    }
  }

  for (const key of ACCELERATION_PHASE_ANNOUNCEMENT_KEYS) {
    if (!seenKeys.has(key)) {
      throw new Error(`Missing acceleration phase announcement descriptor: ${key}`);
    }
  }

  return Object.freeze(
    descriptors.map((descriptor) => Object.freeze({
      ...descriptor,
      extras: Object.freeze({ ...descriptor.extras }),
    })),
  );
}

function validateAndFreezePromotionLogFields(
  descriptors: readonly AccelerationPromotionLogFieldDescriptor[],
): readonly AccelerationPromotionLogFieldDescriptor[] {
  const expected = new Set<AccelerationPromotionLogFieldKey>(ACCELERATION_PROMOTION_LOG_FIELD_KEYS);
  const seenKeys = new Set<string>();

  for (const descriptor of descriptors) {
    if (!descriptor) {
      throw new Error('acceleration promotion log field descriptor must not be null');
    }
    if (!expected.has(descriptor.key)) {
      throw new Error(`Unknown acceleration promotion log field descriptor: ${descriptor.key}`);
    }
    if (!seenKeys.add(descriptor.key)) {
      throw new Error(`Duplicate acceleration promotion log field descriptor: ${descriptor.key}`);
    }
    if (typeof descriptor.read !== 'function') {
      throw new Error(`acceleration promotion log field reader must be a function: ${descriptor.key}`);
    }
  }

  for (const key of ACCELERATION_PROMOTION_LOG_FIELD_KEYS) {
    if (!seenKeys.has(key)) {
      throw new Error(`Missing acceleration promotion log field descriptor: ${key}`);
    }
  }

  return Object.freeze(descriptors.map((descriptor) => Object.freeze({ ...descriptor })));
}

function validateAndFreezeWorkerLogs(
  descriptors: readonly AccelerationWorkerLogDescriptor[],
): readonly AccelerationWorkerLogDescriptor[] {
  const expected = new Set<AccelerationWorkerLogKey>(ACCELERATION_WORKER_LOG_KEYS);
  const seenKeys = new Set<string>();
  const seenMessages = new Set<string>();

  for (const descriptor of descriptors) {
    if (!descriptor) {
      throw new Error('acceleration worker log descriptor must not be null');
    }
    if (!expected.has(descriptor.key)) {
      throw new Error(`Unknown acceleration worker log descriptor: ${descriptor.key}`);
    }
    if (!seenKeys.add(descriptor.key)) {
      throw new Error(`Duplicate acceleration worker log descriptor: ${descriptor.key}`);
    }
    if (!descriptor.message.trim()) {
      throw new Error(`acceleration worker log message must be non-empty: ${descriptor.key}`);
    }
    if (!seenMessages.add(descriptor.message)) {
      throw new Error(`Duplicate acceleration worker log message: ${descriptor.message}`);
    }
  }

  for (const key of ACCELERATION_WORKER_LOG_KEYS) {
    if (!seenKeys.has(key)) {
      throw new Error(`Missing acceleration worker log descriptor: ${key}`);
    }
  }

  return Object.freeze(descriptors.map((descriptor) => Object.freeze({ ...descriptor })));
}

function projectReconcileDecisionMap(
  descriptors: readonly AccelerationReconcileDecisionDescriptor[],
): Readonly<Record<AccelerationReconcileDecisionKey, AccelerationReconcileDecision>> {
  return Object.freeze(
    descriptors.reduce(
      (map, descriptor) => {
        map[descriptor.key] = descriptor.decision;
        return map;
      },
      {} as Record<AccelerationReconcileDecisionKey, AccelerationReconcileDecision>,
    ),
  );
}

function projectPhaseAnnouncementMap(
  descriptors: readonly AccelerationPhaseAnnouncementDescriptor[],
): Readonly<Record<AccelerationPhaseAnnouncementKey, AccelerationPhaseAnnouncementDescriptor>> {
  return Object.freeze(
    descriptors.reduce(
      (map, descriptor) => {
        map[descriptor.key] = descriptor;
        return map;
      },
      {} as Record<AccelerationPhaseAnnouncementKey, AccelerationPhaseAnnouncementDescriptor>,
    ),
  );
}

function projectWorkerLogMap(
  descriptors: readonly AccelerationWorkerLogDescriptor[],
): Readonly<Record<AccelerationWorkerLogKey, string>> {
  return Object.freeze(
    descriptors.reduce(
      (map, descriptor) => {
        map[descriptor.key] = descriptor.message;
        return map;
      },
      {} as Record<AccelerationWorkerLogKey, string>,
    ),
  );
}
