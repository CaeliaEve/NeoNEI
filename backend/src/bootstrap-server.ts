import { requireAdminToken, serverSettings } from './config/server-settings';
import { createApp } from './app';
import { logger } from './utils/logger';
import {
  createRuntimeAccelerationManagerRegistry,
  initializeRuntimeDatabases,
  startRuntimeServer,
} from './services/runtime-server-lifecycle.service';
import {
  recoverExternalRuntimeArtifactPromotion,
  verifyCurrentExternalRuntimeGenerationSeal,
} from './services/external-runtime-generation.service';

const runtimeAccelerationRegistry = createRuntimeAccelerationManagerRegistry();

export const app = createApp({
  serverSettings,
  requireAdminToken,
  getRuntimeAccelerationDbManager: runtimeAccelerationRegistry.getRuntimeAccelerationDbManager,
});

export async function startServer(): Promise<void> {
  try {
    const promotionRecovery = recoverExternalRuntimeArtifactPromotion();
    logger.info('External runtime promotion recovery complete', promotionRecovery);
    const currentGenerationSeal = verifyCurrentExternalRuntimeGenerationSeal();
    logger.info('External runtime generation seal verification complete', {
      generationId: currentGenerationSeal?.generationId ?? null,
      fileCount: currentGenerationSeal?.fileCount ?? 0,
      totalBytes: currentGenerationSeal?.totalBytes ?? 0,
    });
    const accelerationDbManager = await initializeRuntimeDatabases(runtimeAccelerationRegistry);
    startRuntimeServer({
      app,
      serverSettings,
      accelerationDbManager,
    });
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}
