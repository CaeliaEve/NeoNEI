import { setAccelerationRuntimePhase } from './acceleration-runtime-state.service';

export type AccelerationReconcileDecision =
  | 'compile-snapshot'
  | 'materialize-publish-payloads'
  | 'ready-noop';

export type AccelerationCompilePromotionSummary = {
  itemsImported: number;
  recipesImported: number;
  signature: string;
};

export function decideAccelerationReconcilePhase(input: {
  fresh: boolean;
  publishMaterializeOnStart?: boolean;
}): AccelerationReconcileDecision {
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
    itemsImported: summary.itemsImported,
    recipesImported: summary.recipesImported,
    signature: summary.signature,
  };
}
