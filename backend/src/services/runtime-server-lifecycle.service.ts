import fs from 'fs';
import type { Express } from 'express';
import type { serverSettings as serverSettingsContract } from '../config/server-settings';
import { IMAGES_PATH } from '../config/runtime-paths';
import { getAccelerationDatabaseManager, getDatabaseManager } from '../models/database';
import { logger } from '../utils/logger';
import { getNativeRenderRuntimeDiagnostics } from './native-render-runtime-diagnostics.service';
import { scheduleStartupAutowarm } from './startup-autowarm.service';
import {
  reconcileAccelerationRuntime,
  setAccelerationRuntimePhase,
} from './acceleration-runtime.service';
import {
  getBackgroundReconcileFailureTransition,
  getMissingImagesPathWarning,
  getRuntimeLifecyclePhase,
  projectRuntimeBackgroundReconcileOptions,
  projectRuntimeServerReadyLogs,
  RUNTIME_BACKGROUND_RECONCILE_POLICY,
  RUNTIME_DATABASE_LOGS,
  RUNTIME_LIFECYCLE_FAILURE_POLICY,
  RUNTIME_NATIVE_RENDER_LOG_POLICY,
} from './runtime-server-lifecycle-abi';

export type RuntimeServerSettings = typeof serverSettingsContract;
export type RuntimeAccelerationDbManager = ReturnType<typeof getAccelerationDatabaseManager>;

export type RuntimeAccelerationManagerRegistry = Readonly<{
  getRuntimeAccelerationDbManager: () => RuntimeAccelerationDbManager | null;
  setRuntimeAccelerationDbManager: (manager: RuntimeAccelerationDbManager) => void;
}>;

export type RuntimeServerStartInput = Readonly<{
  app: Express;
  serverSettings: RuntimeServerSettings;
  accelerationDbManager: RuntimeAccelerationDbManager;
}>;

export function createRuntimeAccelerationManagerRegistry(): RuntimeAccelerationManagerRegistry {
  let runtimeAccelerationDbManager: RuntimeAccelerationDbManager | null = null;
  return Object.freeze({
    getRuntimeAccelerationDbManager: () => runtimeAccelerationDbManager,
    setRuntimeAccelerationDbManager: (manager: RuntimeAccelerationDbManager): void => {
      runtimeAccelerationDbManager = manager;
    },
  });
}

export async function initializeRuntimeDatabases(
  registry: RuntimeAccelerationManagerRegistry,
): Promise<RuntimeAccelerationDbManager> {
  const initializingPhase = getRuntimeLifecyclePhase('databaseInitializing');
  setAccelerationRuntimePhase(initializingPhase.phase, initializingPhase.message, initializingPhase.extras);

  logger.info(RUNTIME_DATABASE_LOGS.initializingDatabase);
  const dbManager = getDatabaseManager();
  await dbManager.init();
  logger.info(RUNTIME_DATABASE_LOGS.databaseReady);

  const accelerationDbManager = getAccelerationDatabaseManager();
  logger.info(RUNTIME_DATABASE_LOGS.initializingAccelerationDatabase);
  await accelerationDbManager.init();
  logger.info(RUNTIME_DATABASE_LOGS.accelerationDatabaseReady);

  registry.setRuntimeAccelerationDbManager(accelerationDbManager);
  const readyPhase = getRuntimeLifecyclePhase('databaseReady');
  setAccelerationRuntimePhase(readyPhase.phase, readyPhase.message, readyPhase.extras);
  return accelerationDbManager;
}

function logNativeRenderRuntimeStatus(): void {
  const nativeRenderDiagnostics = getNativeRenderRuntimeDiagnostics();
  const nativeRenderSummary = {
    status: nativeRenderDiagnostics.status,
    counts: nativeRenderDiagnostics.counts,
    validation: nativeRenderDiagnostics.validation,
    missing: nativeRenderDiagnostics.missing,
  };
  if (nativeRenderDiagnostics.status === RUNTIME_NATIVE_RENDER_LOG_POLICY.readyStatus) {
    logger.info(RUNTIME_NATIVE_RENDER_LOG_POLICY.readyMessage, nativeRenderSummary);
  } else {
    logger.warn(RUNTIME_NATIVE_RENDER_LOG_POLICY.notReadyMessage, nativeRenderSummary);
  }
}

export function logRuntimeServerReady(settings: RuntimeServerSettings): void {
  if (!fs.existsSync(IMAGES_PATH)) {
    logger.warn(getMissingImagesPathWarning(IMAGES_PATH));
  }
  for (const message of projectRuntimeServerReadyLogs(settings, IMAGES_PATH)) {
    logger.info(message);
  }
  logNativeRenderRuntimeStatus();
}

export function scheduleBackgroundAccelerationReconcile(
  accelerationDbManager: RuntimeAccelerationDbManager,
  settings: RuntimeServerSettings,
): void {
  setTimeout(() => {
    void reconcileAccelerationRuntime(
      accelerationDbManager,
      projectRuntimeBackgroundReconcileOptions(settings),
    ).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      const transition = getBackgroundReconcileFailureTransition(message);
      setAccelerationRuntimePhase(transition.phase, transition.message, transition.extras);
      logger.error(RUNTIME_LIFECYCLE_FAILURE_POLICY.logMessage, error);
    });
  }, RUNTIME_BACKGROUND_RECONCILE_POLICY.delayMs);
}

export function startRuntimeServer(input: RuntimeServerStartInput): void {
  const { app, serverSettings, accelerationDbManager } = input;
  app.listen(serverSettings.port, serverSettings.host, () => {
    logRuntimeServerReady(serverSettings);
    scheduleBackgroundAccelerationReconcile(accelerationDbManager, serverSettings);
    scheduleStartupAutowarm();
  });
}
