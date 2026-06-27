import { IMAGES_PATH, NESQL_CANONICAL_DIR, SPLIT_ITEMS_DIR, SPLIT_RECIPES_DIR } from '../config/runtime-paths';
import { getAccelerationDatabaseManager } from '../models/database';
import { NeoNeiCompilerService, type CompilerSourceRoots } from './neonei-compiler.service';
import {
  decideAccelerationReconcilePhase,
} from './acceleration-runtime-phase-machine.service';
import { verifyAccelerationCompilerBoundary } from './acceleration-runtime-compiler-boundary-reporter.service';
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

export const ACCELERATION_SOURCE_ROOTS: CompilerSourceRoots = {
  itemsDir: SPLIT_ITEMS_DIR,
  recipesDir: SPLIT_RECIPES_DIR,
  canonicalDir: NESQL_CANONICAL_DIR,
  imageRoot: IMAGES_PATH,
};

export async function reconcileAccelerationRuntime(
  accelerationDbManager: ReturnType<typeof getAccelerationDatabaseManager>,
  options?: { publishMaterializeOnStart?: boolean },
): Promise<void> {
  await verifyAccelerationCompilerBoundary();
  const compiler = new NeoNeiCompilerService(accelerationDbManager, ACCELERATION_SOURCE_ROOTS);

  const reconcileDecision = decideAccelerationReconcilePhase({
    fresh: compiler.isAccelerationStateFresh(),
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
