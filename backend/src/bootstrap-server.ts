import fs from 'fs';
import { getAccelerationDatabaseManager, getDatabaseManager } from './models/database';
import { IMAGES_PATH } from './config/runtime-paths';
import { logger } from './utils/logger';
import { scheduleStartupAutowarm } from './services/startup-autowarm.service';
import { getNativeRenderRuntimeDiagnostics } from './services/native-render-runtime-diagnostics.service';
import { requireAdminToken, serverSettings } from './config/server-settings';
import { createApp } from './app';
import {
  reconcileAccelerationRuntime,
  setAccelerationRuntimePhase,
} from './services/acceleration-runtime.service';

let runtimeAccelerationDbManager: ReturnType<typeof getAccelerationDatabaseManager> | null = null;

export const app = createApp({
  serverSettings,
  requireAdminToken,
  getRuntimeAccelerationDbManager: () => runtimeAccelerationDbManager,
});

export async function startServer() {
  try {
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
    logger.info('Acceleration database ready');
    await accelerationDbManager.init();
    runtimeAccelerationDbManager = accelerationDbManager;
    setAccelerationRuntimePhase('ready', 'Acceleration database opened; background reconciliation pending.', {
      stale: false,
      lastError: null,
    });

    app.listen(serverSettings.port, serverSettings.host, () => {
      if (!fs.existsSync(IMAGES_PATH)) {
        logger.warn(`[WARN] IMAGES_PATH does not exist: ${IMAGES_PATH}`);
      }
      logger.info(`Server listening on ${serverSettings.host}:${serverSettings.port}`);
      logger.info(`Public URL: ${serverSettings.publicBaseUrl}`);
      logger.info(`API endpoint: ${serverSettings.publicBaseUrl}/api`);
      logger.info(`Items API: ${serverSettings.publicBaseUrl}/api/items`);
      logger.info(`Images path: ${IMAGES_PATH}`);
      logger.info(`Public runtime only: ${serverSettings.publicRuntimeOnly}`);
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

      setTimeout(() => {
        void reconcileAccelerationRuntime(accelerationDbManager, {
          publishMaterializeOnStart: serverSettings.publishMaterializeOnStart,
        }).catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          setAccelerationRuntimePhase('error', 'Acceleration reconciliation failed.', {
            stale: true,
            lastError: message,
          });
          logger.error('[ACCELERATION_DB] background reconciliation failed', error);
        });
      }, 150);

      scheduleStartupAutowarm();
    });
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}
