import {
  verifyElysiumCompilerBoundary,
  type ElysiumCompilerHandshake,
} from '../compiler-client/elysium-compiler-client';
import { logger } from '../utils/logger';

export type AccelerationCompilerBoundaryEvidence = {
  compiler: string;
  exportAbiVersion?: string;
  packAbiVersion?: string;
  runtimeAbiVersion?: string;
  nativeUiCapabilities: string[];
  nativeUiCoordinateSpace: string;
  nativeUiRuntimeTransform: string;
};

export function buildAccelerationCompilerBoundaryEvidence(
  handshake: ElysiumCompilerHandshake,
): AccelerationCompilerBoundaryEvidence {
  return {
    compiler: handshake.compiler,
    exportAbiVersion: handshake.metadata?.exportAbiVersion,
    packAbiVersion: handshake.metadata?.packAbiVersion,
    runtimeAbiVersion: handshake.metadata?.runtimeAbiVersion,
    nativeUiCapabilities: handshake.capabilities.nativeUi.requiredCapabilities,
    nativeUiCoordinateSpace: handshake.capabilities.nativeUi.coordinateSpace,
    nativeUiRuntimeTransform: handshake.capabilities.nativeUi.runtimeTransform,
  };
}

export function logAccelerationCompilerBoundaryEvidence(
  evidence: AccelerationCompilerBoundaryEvidence,
): void {
  logger.info('[ACCELERATION_DB] external compiler boundary verified', evidence);
}

export async function verifyAccelerationCompilerBoundary(): Promise<ElysiumCompilerHandshake> {
  const handshake = await verifyElysiumCompilerBoundary();
  logAccelerationCompilerBoundaryEvidence(buildAccelerationCompilerBoundaryEvidence(handshake));
  return handshake;
}
