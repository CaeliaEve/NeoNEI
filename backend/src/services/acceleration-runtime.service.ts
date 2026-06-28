import { getAccelerationDatabaseManager } from '../models/database';
import {
  decideAccelerationReconcilePhase,
} from './acceleration-runtime-phase-machine.service';
import { verifyAccelerationCompilerBoundary } from './acceleration-runtime-compiler-boundary-reporter.service';
import { probeAccelerationCompilerState } from './acceleration-runtime-compiler-probe.service';
import { resolveAccelerationCompilerAuthority } from './acceleration-runtime-compiler-authority.service';
import { dispatchAccelerationReconcile } from './acceleration-runtime-reconcile-dispatcher.service';
export {
  accelerationRuntime,
  createAccelerationRuntimeMiddleware,
  setAccelerationRuntimePhase,
  type AccelerationRuntimePhase,
  type AccelerationRuntimeState,
} from './acceleration-runtime-state.service';

export async function reconcileAccelerationRuntime(
  accelerationDbManager: ReturnType<typeof getAccelerationDatabaseManager>,
  options?: { publishMaterializeOnStart?: boolean },
): Promise<void> {
  await verifyAccelerationCompilerBoundary();
  const compilerAuthority = resolveAccelerationCompilerAuthority();
  const compilerProbe = compilerAuthority === 'internal-sqlite'
    ? probeAccelerationCompilerState({ manager: accelerationDbManager })
    : { fresh: false };

  const reconcileDecision = decideAccelerationReconcilePhase({
    fresh: compilerProbe.fresh,
    compilerAuthority,
    publishMaterializeOnStart: options?.publishMaterializeOnStart,
  });

  return dispatchAccelerationReconcile({
    decision: reconcileDecision,
    manager: accelerationDbManager,
  });
}
