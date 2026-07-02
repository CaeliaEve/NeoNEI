import {
  ACCELERATION_RECONCILE_DECISIONS,
  type AccelerationReconcileDecision,
} from './acceleration-runtime-phase-machine.service';
import type { AccelerationRuntimeManager } from './acceleration-runtime-reconcile-worker.service';
import {
  refreshExternalRuntimeArtifact,
  refreshAccelerationSnapshot,
  refreshPublishPayloadMaterialization,
  skipPublishPayloadMaterializationOnStartup,
} from './acceleration-runtime-reconcile-worker.service';

export type AccelerationReconcileDispatchInput = {
  decision: AccelerationReconcileDecision;
  manager: AccelerationRuntimeManager;
};

export type AccelerationReconcileHandler = (input: AccelerationReconcileDispatchInput) => Promise<void> | void;

export type AccelerationReconcileHandlerDescriptor = Readonly<{
  decision: AccelerationReconcileDecision;
  handler: AccelerationReconcileHandler;
}>;

function reconcileHandlerDescriptor(
  decision: AccelerationReconcileDecision,
  handler: AccelerationReconcileHandler,
): AccelerationReconcileHandlerDescriptor {
  return Object.freeze({ decision, handler });
}

function validateAndFreezeAccelerationReconcileHandlers(
  descriptors: readonly AccelerationReconcileHandlerDescriptor[],
): Readonly<Record<AccelerationReconcileDecision, AccelerationReconcileHandler>> {
  const expectedDecisions = new Set(ACCELERATION_RECONCILE_DECISIONS);
  const handlers: Partial<Record<AccelerationReconcileDecision, AccelerationReconcileHandler>> = {};

  for (const descriptor of descriptors) {
    if (!descriptor) {
      throw new Error('Acceleration reconcile handler descriptor must not be null');
    }
    if (!expectedDecisions.has(descriptor.decision)) {
      throw new Error(`Unknown acceleration reconcile handler decision: ${descriptor.decision}`);
    }
    if (Object.prototype.hasOwnProperty.call(handlers, descriptor.decision)) {
      throw new Error(`Duplicate acceleration reconcile handler decision: ${descriptor.decision}`);
    }
    if (typeof descriptor.handler !== 'function') {
      throw new Error(`Acceleration reconcile handler must be a function: ${descriptor.decision}`);
    }
    handlers[descriptor.decision] = descriptor.handler;
  }

  for (const decision of ACCELERATION_RECONCILE_DECISIONS) {
    if (!handlers[decision]) {
      throw new Error(`Missing acceleration reconcile handler decision: ${decision}`);
    }
  }

  return Object.freeze({ ...handlers }) as Readonly<Record<AccelerationReconcileDecision, AccelerationReconcileHandler>>;
}

export const ACCELERATION_RECONCILE_HANDLER_DESCRIPTORS = Object.freeze([
  reconcileHandlerDescriptor('compile-snapshot', ({ manager }) => refreshAccelerationSnapshot({ manager })),
  reconcileHandlerDescriptor('compile-external-runtime', () => refreshExternalRuntimeArtifact()),
  reconcileHandlerDescriptor('materialize-publish-payloads', () => refreshPublishPayloadMaterialization()),
  reconcileHandlerDescriptor('ready-noop', () => skipPublishPayloadMaterializationOnStartup()),
] as const satisfies readonly AccelerationReconcileHandlerDescriptor[]);

export const ACCELERATION_RECONCILE_HANDLERS: Readonly<Record<AccelerationReconcileDecision, AccelerationReconcileHandler>> =
  validateAndFreezeAccelerationReconcileHandlers(ACCELERATION_RECONCILE_HANDLER_DESCRIPTORS);

export function dispatchAccelerationReconcile(input: AccelerationReconcileDispatchInput): Promise<void> | void {
  return ACCELERATION_RECONCILE_HANDLERS[input.decision](input);
}
