import { getAccelerationDatabaseManager } from '../models/database';
import {
  decideAccelerationReconcilePhase,
} from './acceleration-runtime-phase-machine.service';
import { verifyAccelerationCompilerBoundary } from './acceleration-runtime-compiler-boundary-reporter.service';
import { probeAccelerationCompilerState } from './acceleration-runtime-compiler-probe.service';
import {
  refreshAccelerationSnapshot,
  refreshPublishPayloadMaterialization,
  skipPublishPayloadMaterializationOnStartup,
} from './acceleration-runtime-reconcile-worker.service';
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
  const compilerProbe = probeAccelerationCompilerState({ manager: accelerationDbManager });

  const reconcileDecision = decideAccelerationReconcilePhase({
    fresh: compilerProbe.fresh,
    publishMaterializeOnStart: options?.publishMaterializeOnStart,
  });

  if (reconcileDecision === 'compile-snapshot') {
    return refreshAccelerationSnapshot({ manager: accelerationDbManager });
  }

  if (reconcileDecision === 'ready-noop') {
    return skipPublishPayloadMaterializationOnStartup();
  }

  return refreshPublishPayloadMaterialization();
}
