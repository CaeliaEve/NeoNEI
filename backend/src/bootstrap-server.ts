import { requireAdminToken, serverSettings } from './config/server-settings';
import { createApp } from './app';
import { logger } from './utils/logger';
import {
  createRuntimeAccelerationManagerRegistry,
  initializeRuntimeDatabases,
  startRuntimeServer,
} from './services/runtime-server-lifecycle.service';

const runtimeAccelerationRegistry = createRuntimeAccelerationManagerRegistry();

export const app = createApp({
  serverSettings,
  requireAdminToken,
  getRuntimeAccelerationDbManager: runtimeAccelerationRegistry.getRuntimeAccelerationDbManager,
});

export async function startServer(): Promise<void> {
  try {
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
