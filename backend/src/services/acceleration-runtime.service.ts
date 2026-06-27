import fs from 'fs';
import { IMAGES_PATH, NESQL_CANONICAL_DIR, SPLIT_ITEMS_DIR, SPLIT_RECIPES_DIR } from '../config/runtime-paths';
import { getAccelerationDatabaseManager } from '../models/database';
import { NeoNeiCompilerService, type CompilerSourceRoots } from './neonei-compiler.service';
import { logger } from '../utils/logger';
import {
  compileAccelerationSnapshotInChild,
  materializePublishPayloadsInChild,
} from './acceleration-runtime-job-runner.service';
import { activateCompiledAccelerationSnapshot } from './acceleration-runtime-snapshot-activator.service';
import {
  announceAccelerationRuntimeReady,
  announceAccelerationSnapshotCompile,
  announceAccelerationSnapshotStale,
  announcePublishPayloadMaterialization,
  decideAccelerationReconcilePhase,
  logAccelerationSnapshotPromotedPayload,
} from './acceleration-runtime-phase-machine.service';
import { verifyElysiumCompilerBoundary } from '../compiler-client/elysium-compiler-client';
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
  const compilerHandshake = await verifyElysiumCompilerBoundary();
  logger.info('[ACCELERATION_DB] external compiler boundary verified', {
    compiler: compilerHandshake.compiler,
    exportAbiVersion: compilerHandshake.metadata?.exportAbiVersion,
    packAbiVersion: compilerHandshake.metadata?.packAbiVersion,
    runtimeAbiVersion: compilerHandshake.metadata?.runtimeAbiVersion,
    nativeUiCapabilities: compilerHandshake.capabilities.nativeUi.requiredCapabilities,
    nativeUiCoordinateSpace: compilerHandshake.capabilities.nativeUi.coordinateSpace,
    nativeUiRuntimeTransform: compilerHandshake.capabilities.nativeUi.runtimeTransform,
  });
  const compiler = new NeoNeiCompilerService(accelerationDbManager, ACCELERATION_SOURCE_ROOTS);
  const candidateDbPath = `${accelerationDbManager.getDbPath()}.next`;

  const reconcileDecision = decideAccelerationReconcilePhase({
    fresh: compiler.isAccelerationStateFresh(),
    publishMaterializeOnStart: options?.publishMaterializeOnStart,
  });

  if (reconcileDecision === 'compile-snapshot') {
    announceAccelerationSnapshotStale();
    logger.info('[ACCELERATION_DB] stale; runtime will stay online while compiling next snapshot');
    if (fs.existsSync(candidateDbPath)) {
      fs.rmSync(candidateDbPath, { force: true });
    }

    announceAccelerationSnapshotCompile();
    const compileResult = await compileAccelerationSnapshotInChild(candidateDbPath);

    await activateCompiledAccelerationSnapshot({
      manager: accelerationDbManager,
      compiledDbPath: candidateDbPath,
      signature: compileResult.signature,
    });
    logger.info('[ACCELERATION_DB] promoted background snapshot', logAccelerationSnapshotPromotedPayload(compileResult));
    announceAccelerationRuntimeReady();
    return;
  }

  if (reconcileDecision === 'ready-noop') {
    logger.info(
      '[PUBLISH_PAYLOADS] startup materialization skipped; set NEONEI_PUBLISH_MATERIALIZE_ON_START=1 to refresh publish bundles on boot',
    );
    announceAccelerationRuntimeReady();
    return;
  }

  announcePublishPayloadMaterialization();
  const publishPayloadsResult = await materializePublishPayloadsInChild();
  logger.info(
    publishPayloadsResult.materialized
      ? '[PUBLISH_PAYLOADS] materialized in background'
      : '[PUBLISH_PAYLOADS] already fresh',
  );
  announceAccelerationRuntimeReady();
}
