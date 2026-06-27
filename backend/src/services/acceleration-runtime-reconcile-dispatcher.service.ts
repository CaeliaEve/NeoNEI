import type { AccelerationReconcileDecision } from './acceleration-runtime-phase-machine.service';
import type { AccelerationRuntimeManager } from './acceleration-runtime-reconcile-worker.service';
import {
  refreshAccelerationSnapshot,
  refreshPublishPayloadMaterialization,
  skipPublishPayloadMaterializationOnStartup,
} from './acceleration-runtime-reconcile-worker.service';

export type AccelerationReconcileDispatchInput = {
  decision: AccelerationReconcileDecision;
  manager: AccelerationRuntimeManager;
};

export type AccelerationReconcileHandler = (input: AccelerationReconcileDispatchInput) => Promise<void> | void;

export const ACCELERATION_RECONCILE_HANDLERS: Readonly<Record<AccelerationReconcileDecision, AccelerationReconcileHandler>> = {
  'compile-snapshot': ({ manager }) => refreshAccelerationSnapshot({ manager }),
  'materialize-publish-payloads': () => refreshPublishPayloadMaterialization(),
  'ready-noop': () => skipPublishPayloadMaterializationOnStartup(),
};

export function dispatchAccelerationReconcile(input: AccelerationReconcileDispatchInput): Promise<void> | void {
  return ACCELERATION_RECONCILE_HANDLERS[input.decision](input);
}
