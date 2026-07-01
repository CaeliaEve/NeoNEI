import type { AccelerationRuntimePhase, AccelerationRuntimeState } from './acceleration-runtime.service';
import type { ErrorEnvelopeDetails } from '../utils/error-response';

export type RuntimeAdminReconcileLabel = 'OPS' | 'ADMIN';

export type RuntimeAdminControlError = Readonly<{
  statusCode: number;
  code: string;
  message: string;
  details?: ErrorEnvelopeDetails;
}>;

export type RuntimeAdminReconcileAccepted = Readonly<{
  status: 'accepted';
  phase: AccelerationRuntimePhase;
  message: 'Acceleration reconciliation scheduled.';
}>;

export type RuntimeAdminReconcileFailureTransition = Readonly<{
  phase: 'error';
  message: string;
  extras: Readonly<{
    stale: true;
    lastError: string;
  }>;
}>;

export function getAccelerationManagerUnavailableError(): RuntimeAdminControlError {
  return Object.freeze({
    statusCode: 503,
    code: 'ACCELERATION_MANAGER_NOT_READY',
    message: 'Acceleration manager is not ready',
  });
}

export function getAccelerationReconcileConflict(
  snapshot: AccelerationRuntimeState,
): RuntimeAdminControlError | null {
  if (snapshot.phase !== 'compiling' && snapshot.phase !== 'promoting' && !snapshot.blocking) {
    return null;
  }
  return Object.freeze({
    statusCode: 409,
    code: 'ACCELERATION_RECONCILE_IN_PROGRESS',
    message: 'Acceleration reconcile is already in progress',
    details: Object.freeze({
      phase: snapshot.phase,
      blocking: snapshot.blocking,
    }),
  });
}

export function getAccelerationReconcileAccepted(
  snapshot: AccelerationRuntimeState,
): RuntimeAdminReconcileAccepted {
  return Object.freeze({
    status: 'accepted',
    phase: snapshot.phase,
    message: 'Acceleration reconciliation scheduled.',
  });
}

export function getAccelerationReconcileFailureTransition(
  label: RuntimeAdminReconcileLabel,
  error: unknown,
): RuntimeAdminReconcileFailureTransition {
  const lastError = error instanceof Error ? error.message : String(error);
  return Object.freeze({
    phase: 'error',
    message: `${label === 'OPS' ? 'Ops' : 'Admin'} acceleration reconciliation failed.`,
    extras: Object.freeze({
      stale: true,
      lastError,
    }),
  });
}
