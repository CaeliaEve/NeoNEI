import { setAccelerationRuntimePhase } from './acceleration-runtime-state.service';

export const ACCELERATION_RECONCILE_DECISIONS = Object.freeze([
  'compile-snapshot',
  'compile-external-runtime',
  'materialize-publish-payloads',
  'ready-noop',
] as const);

export type AccelerationReconcileDecision = (typeof ACCELERATION_RECONCILE_DECISIONS)[number];

export type AccelerationCompilePromotionSummary = {
  itemsImported?: number;
  recipesImported?: number;
  signature: string;
  runtimeId?: string | null;
  promotedFiles?: number;
  sourceIdentity?: string | null;
};

export function decideAccelerationReconcilePhase(input: {
  fresh: boolean;
  compilerAuthority?: 'internal-sqlite' | 'external-runtime';
  publishMaterializeOnStart?: boolean;
}): AccelerationReconcileDecision {
  if (input.compilerAuthority === 'external-runtime' && !input.fresh) return 'compile-external-runtime';
  if (!input.fresh) return 'compile-snapshot';
  if (input.publishMaterializeOnStart) return 'materialize-publish-payloads';
  return 'ready-noop';
}

export function announceAccelerationSnapshotStale(): void {
  setAccelerationRuntimePhase('stale', 'Acceleration snapshot is stale; compiling next snapshot in background.', {
    stale: true,
    lastError: null,
  });
}

export function announceAccelerationSnapshotCompile(): void {
  setAccelerationRuntimePhase('compiling', 'Compiling next acceleration snapshot in background.', {
    stale: true,
  });
}

export function announcePublishPayloadMaterialization(): void {
  setAccelerationRuntimePhase('materializing', 'Refreshing publish hot payloads.', {
    stale: false,
    lastError: null,
  });
}

export function announceAccelerationRuntimeReady(): void {
  setAccelerationRuntimePhase('ready', 'Acceleration runtime ready.', {
    stale: false,
    lastError: null,
  });
}

export function logAccelerationSnapshotPromotedPayload(summary: AccelerationCompilePromotionSummary): Record<string, unknown> {
  return {
    itemsImported: summary.itemsImported ?? null,
    recipesImported: summary.recipesImported ?? null,
    signature: summary.signature,
    runtimeId: summary.runtimeId ?? null,
    promotedFiles: summary.promotedFiles ?? null,
    sourceIdentity: summary.sourceIdentity ?? null,
  };
}
