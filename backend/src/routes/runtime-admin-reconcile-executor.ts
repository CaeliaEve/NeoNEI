import type { Request, Response } from 'express';
import type { AccelerationRuntimePhase, AccelerationRuntimeState } from '../services/acceleration-runtime.service';
import {
  getAccelerationManagerUnavailableError,
  getAccelerationReconcileAccepted,
  getAccelerationReconcileConflict,
  getAccelerationReconcileFailureTransition,
  type RuntimeAdminReconcileLabel,
} from '../services/runtime-admin-reconcile-control.service';
import { logger } from '../utils/logger';
import { sendRuntimeAdminAccepted, sendRuntimeAdminControlError } from './runtime-admin-transport';

export type RuntimeAdminReconcileRuntime<TManager> = Readonly<{
  getAccelerationRuntimeSnapshot: () => AccelerationRuntimeState;
  getRuntimeAccelerationDbManager: () => TManager | null;
  reconcileAccelerationRuntime: (manager: TManager) => Promise<void>;
  setAccelerationRuntimePhase: (
    phase: AccelerationRuntimePhase,
    message: string,
    extras?: Partial<Pick<AccelerationRuntimeState, 'stale' | 'lastCompiledSignature' | 'lastError'>>,
  ) => void;
}>;

export function sendRuntimeAdminReconcile<TManager>(
  req: Request,
  res: Response,
  label: RuntimeAdminReconcileLabel,
  runtime: RuntimeAdminReconcileRuntime<TManager>,
): void {
  const manager = runtime.getRuntimeAccelerationDbManager();
  if (!manager) {
    sendRuntimeAdminControlError(req, res, getAccelerationManagerUnavailableError());
    return;
  }

  const snapshot = runtime.getAccelerationRuntimeSnapshot();
  const conflict = getAccelerationReconcileConflict(snapshot);
  if (conflict) {
    sendRuntimeAdminControlError(req, res, conflict);
    return;
  }

  logger.info(`[${label}] acceleration reconcile requested`, { ip: req.ip });
  void runtime.reconcileAccelerationRuntime(manager).catch((error) => {
    const transition = getAccelerationReconcileFailureTransition(label, error);
    runtime.setAccelerationRuntimePhase(transition.phase, transition.message, transition.extras);
    logger.error(`[${label}] acceleration reconcile failed`, error);
  });

  sendRuntimeAdminAccepted(res, getAccelerationReconcileAccepted(runtime.getAccelerationRuntimeSnapshot()));
}
