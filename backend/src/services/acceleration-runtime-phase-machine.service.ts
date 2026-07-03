import { setAccelerationRuntimePhase } from './acceleration-runtime-state.service';
import {
  ACCELERATION_PHASE_ANNOUNCEMENTS,
  ACCELERATION_RECONCILE_DECISION,
  ACCELERATION_RECONCILE_DECISIONS,
  projectAccelerationPromotionLogPayload,
  type AccelerationCompilePromotionSummary,
  type AccelerationPhaseAnnouncementKey,
  type AccelerationReconcileDecision,
} from './acceleration-runtime-phase-abi';

export {
  ACCELERATION_RECONCILE_DECISION,
  ACCELERATION_RECONCILE_DECISIONS,
  type AccelerationCompilePromotionSummary,
  type AccelerationReconcileDecision,
};

export function decideAccelerationReconcilePhase(input: {
  fresh: boolean;
  compilerAuthority?: 'internal-sqlite' | 'external-runtime';
  publishMaterializeOnStart?: boolean;
}): AccelerationReconcileDecision {
  if (input.compilerAuthority === 'external-runtime' && !input.fresh) {
    return ACCELERATION_RECONCILE_DECISION.compileExternalRuntime;
  }
  if (!input.fresh) {
    return ACCELERATION_RECONCILE_DECISION.compileSnapshot;
  }
  if (input.publishMaterializeOnStart) {
    return ACCELERATION_RECONCILE_DECISION.materializePublishPayloads;
  }
  return ACCELERATION_RECONCILE_DECISION.readyNoop;
}

export function announceAccelerationSnapshotStale(): void {
  announceAccelerationPhase('snapshotStale');
}

export function announceAccelerationSnapshotCompile(): void {
  announceAccelerationPhase('snapshotCompile');
}

export function announcePublishPayloadMaterialization(): void {
  announceAccelerationPhase('publishPayloadMaterialization');
}

export function announceAccelerationRuntimeReady(): void {
  announceAccelerationPhase('runtimeReady');
}

export function logAccelerationSnapshotPromotedPayload(summary: AccelerationCompilePromotionSummary): Record<string, unknown> {
  return projectAccelerationPromotionLogPayload(summary);
}

function announceAccelerationPhase(key: AccelerationPhaseAnnouncementKey): void {
  const announcement = ACCELERATION_PHASE_ANNOUNCEMENTS[key];
  setAccelerationRuntimePhase(announcement.phase, announcement.message, announcement.extras);
}
