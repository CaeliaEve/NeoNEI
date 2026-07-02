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
  setAccelerationRuntimePhase('initializing', 'Initializing databases...', {
    stale: false,
    lastCompiledSignature: null,
    lastError: null,
  });

  logger.info('Initializing database...');
  const dbManager = getDatabaseManager();
  await dbManager.init();
  logger.info('Database ready');

  const accelerationDbManager = getAccelerationDatabaseManager();
  logger.info('Initializing acceleration database...');
  await accelerationDbManager.init();
  logger.info('Acceleration database ready');

  registry.setRuntimeAccelerationDbManager(accelerationDbManager);
  setAccelerationRuntimePhase('ready', 'Acceleration database opened; background reconciliation pending.', {
    stale: false,
    lastError: null,
  });
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
  if (nativeRenderDiagnostics.status === 'ok') {
    logger.info('[NATIVE_RENDER] Angelica render index ready', nativeRenderSummary);
  } else {
    logger.warn('[NATIVE_RENDER] Angelica render index is not ready', nativeRenderSummary);
  }
}

export function logRuntimeServerReady(settings: RuntimeServerSettings): void {
  if (!fs.existsSync(IMAGES_PATH)) {
    logger.warn(`[WARN] IMAGES_PATH does not exist: ${IMAGES_PATH}`);
  }
  logger.info(`Server listening on ${settings.host}:${settings.port}`);
  logger.info(`Public URL: ${settings.publicBaseUrl}`);
  logger.info(`API endpoint: ${settings.publicBaseUrl}/api`);
  logger.info(`Current runtime API: ${settings.publicBaseUrl}/api/runtime/current`);
  logger.info(`Publish home bootstrap: ${settings.publicBaseUrl}/api/publish/home-bootstrap`);
  logger.info(`Images path: ${IMAGES_PATH}`);
  logger.info(`Public runtime only: ${settings.publicRuntimeOnly}`);
  logNativeRenderRuntimeStatus();
}

export function scheduleBackgroundAccelerationReconcile(
  accelerationDbManager: RuntimeAccelerationDbManager,
  settings: RuntimeServerSettings,
): void {
  setTimeout(() => {
    void reconcileAccelerationRuntime(accelerationDbManager, {
      publishMaterializeOnStart: settings.publishMaterializeOnStart,
    }).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      setAccelerationRuntimePhase('error', 'Acceleration reconciliation failed.', {
        stale: true,
        lastError: message,
      });
      logger.error('[ACCELERATION_DB] background reconciliation failed', error);
    });
  }, 150);
}

export function startRuntimeServer(input: RuntimeServerStartInput): void {
  const { app, serverSettings, accelerationDbManager } = input;
  app.listen(serverSettings.port, serverSettings.host, () => {
    logRuntimeServerReady(serverSettings);
    scheduleBackgroundAccelerationReconcile(accelerationDbManager, serverSettings);
    scheduleStartupAutowarm();
  });
}
