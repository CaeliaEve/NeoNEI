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
import { verifyElysiumCompilerBoundary } from '../compiler-client/elysium-compiler-client';
export {
  accelerationRuntime,
  createAccelerationRuntimeMiddleware,
  setAccelerationRuntimePhase,
  type AccelerationRuntimePhase,
  type AccelerationRuntimeState,
} from './acceleration-runtime-state.service';
import {
  setAccelerationRuntimePhase,
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
  });
  const compiler = new NeoNeiCompilerService(accelerationDbManager, ACCELERATION_SOURCE_ROOTS);
  const candidateDbPath = `${accelerationDbManager.getDbPath()}.next`;

  if (!compiler.isAccelerationStateFresh()) {
    setAccelerationRuntimePhase('stale', 'Acceleration snapshot is stale; compiling next snapshot in background.', {
      stale: true,
      lastError: null,
    });
    logger.info('[ACCELERATION_DB] stale; runtime will stay online while compiling next snapshot');
    if (fs.existsSync(candidateDbPath)) {
      fs.rmSync(candidateDbPath, { force: true });
    }

    setAccelerationRuntimePhase('compiling', 'Compiling next acceleration snapshot in background.', {
      stale: true,
    });
    const compileResult = await compileAccelerationSnapshotInChild(candidateDbPath);

    await activateCompiledAccelerationSnapshot({
      manager: accelerationDbManager,
      compiledDbPath: candidateDbPath,
      signature: compileResult.signature,
    });
    logger.info('[ACCELERATION_DB] promoted background snapshot', {
      itemsImported: compileResult.itemsImported,
      recipesImported: compileResult.recipesImported,
      signature: compileResult.signature,
    });
    setAccelerationRuntimePhase('ready', 'Acceleration runtime ready.', {
      stale: false,
      lastError: null,
    });
    return;
  }

  if (!options?.publishMaterializeOnStart) {
    logger.info(
      '[PUBLISH_PAYLOADS] startup materialization skipped; set NEONEI_PUBLISH_MATERIALIZE_ON_START=1 to refresh publish bundles on boot',
    );
    setAccelerationRuntimePhase('ready', 'Acceleration runtime ready.', {
      stale: false,
      lastError: null,
    });
    return;
  }

  setAccelerationRuntimePhase('materializing', 'Refreshing publish hot payloads.', {
    stale: false,
    lastError: null,
  });
  const publishPayloadsResult = await materializePublishPayloadsInChild();
  logger.info(
    publishPayloadsResult.materialized
      ? '[PUBLISH_PAYLOADS] materialized in background'
      : '[PUBLISH_PAYLOADS] already fresh',
  );
  setAccelerationRuntimePhase('ready', 'Acceleration runtime ready.', {
    stale: false,
    lastError: null,
  });
}
