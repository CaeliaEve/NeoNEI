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
import { ACCELERATION_WORKER_LOGS } from './acceleration-runtime-phase-abi';
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
    ? ACCELERATION_WORKER_LOGS.publishMaterialized
    : ACCELERATION_WORKER_LOGS.publishAlreadyFresh;
}

export async function refreshAccelerationSnapshot(input: AccelerationSnapshotRefreshInput): Promise<void> {
  const candidateDbPath = getAccelerationCandidateDbPath(input.manager);
  announceAccelerationSnapshotStale();
  logger.info(ACCELERATION_WORKER_LOGS.accelerationSnapshotStale);
  removeExistingAccelerationCandidateSnapshot(candidateDbPath);

  announceAccelerationSnapshotCompile();
  const compileResult = await compileAccelerationSnapshotInChild(candidateDbPath);

  await activateCompiledAccelerationSnapshot({
    manager: input.manager,
    compiledDbPath: candidateDbPath,
    signature: compileResult.signature,
  });
  logger.info(ACCELERATION_WORKER_LOGS.accelerationSnapshotPromoted, logAccelerationSnapshotPromotedPayload(compileResult));
  announceAccelerationRuntimeReady();
}

export async function refreshExternalRuntimeArtifact(): Promise<void> {
  announceAccelerationSnapshotStale();
  logger.info(ACCELERATION_WORKER_LOGS.externalRuntimeStale);

  announceAccelerationSnapshotCompile();
  const compileResult = await compileExternalRuntimeArtifactInChild();

  logger.info(ACCELERATION_WORKER_LOGS.externalRuntimePromoted, logAccelerationSnapshotPromotedPayload(compileResult));
  announceAccelerationRuntimeReady();
}

export function skipPublishPayloadMaterializationOnStartup(): void {
  logger.info(ACCELERATION_WORKER_LOGS.publishMaterializationSkipped);
  announceAccelerationRuntimeReady();
}

export async function refreshPublishPayloadMaterialization(): Promise<void> {
  announcePublishPayloadMaterialization();
  const publishPayloadsResult = await materializePublishPayloadsInChild();
  logger.info(publishPayloadMaterializationLogMessage(publishPayloadsResult));
  announceAccelerationRuntimeReady();
}
