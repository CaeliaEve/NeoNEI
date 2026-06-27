import { getAccelerationDatabaseManager } from '../models/database';
import { promoteCompiledAccelerationDatabase } from './acceleration-db-pipeline.service';
import {
  setAccelerationRuntimeBlocking,
  setAccelerationRuntimePhase,
  waitForAccelerationApiIdle,
} from './acceleration-runtime-state.service';

export type AccelerationSnapshotActivationInput = {
  manager: ReturnType<typeof getAccelerationDatabaseManager>;
  compiledDbPath: string;
  signature: string;
};

/**
 * Activates a freshly compiled acceleration snapshot under a bounded blocking window.
 *
 * <p>The reconciler decides when a snapshot is needed; this activator owns the RCU-style critical
 * section: announce promotion, block new tracked API requests, wait for active readers to drain,
 * promote the compiled DB, unblock, and publish the refreshed runtime state.</p>
 */
export async function activateCompiledAccelerationSnapshot(
  input: AccelerationSnapshotActivationInput,
): Promise<void> {
  setAccelerationRuntimePhase('promoting', 'Promoting freshly compiled acceleration snapshot.', {
    stale: true,
    lastCompiledSignature: input.signature,
  });
  setAccelerationRuntimeBlocking(true);
  try {
    await waitForAccelerationApiIdle();
    await promoteCompiledAccelerationDatabase({
      manager: input.manager,
      compiledDbPath: input.compiledDbPath,
    });
  } finally {
    setAccelerationRuntimeBlocking(false);
  }

  setAccelerationRuntimePhase('ready', 'Acceleration snapshot refreshed.', {
    stale: false,
    lastCompiledSignature: input.signature,
    lastError: null,
  });
}
