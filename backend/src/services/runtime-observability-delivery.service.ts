import {
  getRuntimeDiagnosticsSummary,
  type RuntimeDiagnosticsSummary,
} from './runtime-diagnostics-summary.service';
import { getRuntimeHealthSummary, type RuntimeHealthSummary } from './runtime-health-summary.service';
import {
  API_V1_RUNTIME_HEALTH_STATUS,
  API_V1_RUNTIME_HEALTH_VERSION,
  RUNTIME_OBSERVABILITY_CONTRACT_VERSION,
} from './runtime-observability-delivery-abi';

export type CurrentRuntimeHealthPayload = RuntimeHealthSummary & Readonly<{
  contractVersion: typeof RUNTIME_OBSERVABILITY_CONTRACT_VERSION;
}>;

export type ApiV1RuntimeHealthPayload = Readonly<{
  status: typeof API_V1_RUNTIME_HEALTH_STATUS;
  version: typeof API_V1_RUNTIME_HEALTH_VERSION;
  timestamp: string;
}>;

export function getCurrentRuntimeHealthDelivery(): CurrentRuntimeHealthPayload {
  const summary = getRuntimeHealthSummary();
  return Object.freeze({
    ...summary,
    contractVersion: RUNTIME_OBSERVABILITY_CONTRACT_VERSION,
  });
}

export function getCurrentRuntimeDiagnosticsDelivery(): RuntimeDiagnosticsSummary {
  return getRuntimeDiagnosticsSummary();
}

export function getApiV1RuntimeHealthDelivery(): ApiV1RuntimeHealthPayload {
  return Object.freeze({
    status: API_V1_RUNTIME_HEALTH_STATUS,
    version: API_V1_RUNTIME_HEALTH_VERSION,
    timestamp: new Date().toISOString(),
  });
}
