import fs from 'fs';
import { getAccelerationDatabaseManager } from '../models/database';
import { logger } from '../utils/logger';
import {
  compileExternalRuntimeArtifactInChild,
  compileAccelerationSnapshotInChild,
  materializePublishPayloadsInChild,
  type BackgroundPublishSummary,
} from './acceleration-runtime-job-runner.service';
import { activateCompiledAccelerationSnapshot } from './acceleration-runtime-snapshot-activator.service';
import {
  announceAccelerationRuntimeReady,
  announceAccelerationSnapshotCompile,
  announceAccelerationSnapshotStale,
  announcePublishPayloadMaterialization,
  logAccelerationSnapshotPromotedPayload,
} from './acceleration-runtime-phase-machine.service';

export type AccelerationRuntimeManager = ReturnType<typeof getAccelerationDatabaseManager>;

export type AccelerationSnapshotRefreshInput = {
  manager: AccelerationRuntimeManager;
};

export function getAccelerationCandidateDbPath(manager: AccelerationRuntimeManager): string {
  return `${manager.getDbPath()}.next`;
}

export function removeExistingAccelerationCandidateSnapshot(candidateDbPath: string): void {
  if (fs.existsSync(candidateDbPath)) {
    fs.rmSync(candidateDbPath, { force: true });
  }
}

export function publishPayloadMaterializationLogMessage(result: BackgroundPublishSummary): string {
  return result.materialized
    ? '[PUBLISH_PAYLOADS] materialized in background'
    : '[PUBLISH_PAYLOADS] already fresh';
}

export async function refreshAccelerationSnapshot(input: AccelerationSnapshotRefreshInput): Promise<void> {
  const candidateDbPath = getAccelerationCandidateDbPath(input.manager);
  announceAccelerationSnapshotStale();
  logger.info('[ACCELERATION_DB] stale; runtime will stay online while compiling next snapshot');
  removeExistingAccelerationCandidateSnapshot(candidateDbPath);

  announceAccelerationSnapshotCompile();
  const compileResult = await compileAccelerationSnapshotInChild(candidateDbPath);

  await activateCompiledAccelerationSnapshot({
    manager: input.manager,
    compiledDbPath: candidateDbPath,
    signature: compileResult.signature,
  });
  logger.info('[ACCELERATION_DB] promoted background snapshot', logAccelerationSnapshotPromotedPayload(compileResult));
  announceAccelerationRuntimeReady();
}

export async function refreshExternalRuntimeArtifact(): Promise<void> {
  announceAccelerationSnapshotStale();
  logger.info('[EXTERNAL_RUNTIME] stale; compiling next external runtime artifact with elysium-compiler');

  announceAccelerationSnapshotCompile();
  const compileResult = await compileExternalRuntimeArtifactInChild();

  logger.info('[EXTERNAL_RUNTIME] promoted external runtime artifact', logAccelerationSnapshotPromotedPayload(compileResult));
  announceAccelerationRuntimeReady();
}

export function skipPublishPayloadMaterializationOnStartup(): void {
  logger.info(
    '[PUBLISH_PAYLOADS] startup materialization skipped; set NEONEI_PUBLISH_MATERIALIZE_ON_START=1 to refresh publish bundles on boot',
  );
  announceAccelerationRuntimeReady();
}

export async function refreshPublishPayloadMaterialization(): Promise<void> {
  announcePublishPayloadMaterialization();
  const publishPayloadsResult = await materializePublishPayloadsInChild();
  logger.info(publishPayloadMaterializationLogMessage(publishPayloadsResult));
  announceAccelerationRuntimeReady();
}
