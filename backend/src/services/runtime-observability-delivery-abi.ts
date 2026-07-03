/** Stable observability delivery contract catalog for runtime health endpoints. */

import type { RuntimeHealthSummary } from './runtime-health-summary.service';

type RuntimeObservabilityDeliveryDescriptor = Readonly<{
  contractVersion: 'runtime-contracts/current';
  apiV1HealthStatus: 'ok';
  apiV1HealthVersion: 1;
  timestampFormat: 'iso-8601';
}>;

export type CurrentRuntimeHealthPayload = RuntimeHealthSummary & Readonly<{
  contractVersion: typeof RUNTIME_OBSERVABILITY_CONTRACT_VERSION;
}>;

export type ApiV1RuntimeHealthPayload = Readonly<{
  status: typeof API_V1_RUNTIME_HEALTH_STATUS;
  version: typeof API_V1_RUNTIME_HEALTH_VERSION;
  timestamp: string;
}>;

export const RUNTIME_OBSERVABILITY_DELIVERY_DESCRIPTOR =
  validateRuntimeObservabilityDeliveryDescriptor({
    contractVersion: 'runtime-contracts/current',
    apiV1HealthStatus: 'ok',
    apiV1HealthVersion: 1,
    timestampFormat: 'iso-8601',
  });

export const RUNTIME_OBSERVABILITY_CONTRACT_VERSION =
  RUNTIME_OBSERVABILITY_DELIVERY_DESCRIPTOR.contractVersion;

export const API_V1_RUNTIME_HEALTH_STATUS =
  RUNTIME_OBSERVABILITY_DELIVERY_DESCRIPTOR.apiV1HealthStatus;

export const API_V1_RUNTIME_HEALTH_VERSION =
  RUNTIME_OBSERVABILITY_DELIVERY_DESCRIPTOR.apiV1HealthVersion;

export function buildCurrentRuntimeHealthPayload(
  summary: RuntimeHealthSummary,
): CurrentRuntimeHealthPayload {
  return Object.freeze({
    ...summary,
    contractVersion: RUNTIME_OBSERVABILITY_CONTRACT_VERSION,
  });
}

export function buildApiV1RuntimeHealthPayload(
  timestamp: string = new Date().toISOString(),
): ApiV1RuntimeHealthPayload {
  if (!timestamp.trim()) {
    throw new Error('runtime observability health timestamp must be non-empty');
  }
  return Object.freeze({
    status: API_V1_RUNTIME_HEALTH_STATUS,
    version: API_V1_RUNTIME_HEALTH_VERSION,
    timestamp,
  });
}

function validateRuntimeObservabilityDeliveryDescriptor(
  descriptor: RuntimeObservabilityDeliveryDescriptor,
): RuntimeObservabilityDeliveryDescriptor {
  if (!descriptor.contractVersion.trim()) {
    throw new Error('runtime observability contract version must be non-empty');
  }
  if (descriptor.apiV1HealthStatus !== 'ok') {
    throw new Error(`Unsupported API v1 runtime health status: ${descriptor.apiV1HealthStatus}`);
  }
  if (!Number.isInteger(descriptor.apiV1HealthVersion) || descriptor.apiV1HealthVersion < 1) {
    throw new Error('API v1 runtime health version must be a positive integer');
  }
  if (descriptor.timestampFormat !== 'iso-8601') {
    throw new Error(`Unsupported API v1 runtime health timestamp format: ${descriptor.timestampFormat}`);
  }
  return Object.freeze({ ...descriptor });
}
