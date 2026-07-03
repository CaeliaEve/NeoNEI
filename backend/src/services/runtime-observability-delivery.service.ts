import {
  getRuntimeDiagnosticsSummary,
  type RuntimeDiagnosticsSummary,
} from './runtime-diagnostics-summary.service';
import { getRuntimeHealthSummary } from './runtime-health-summary.service';
import {
  buildApiV1RuntimeHealthPayload,
  buildCurrentRuntimeHealthPayload,
  type ApiV1RuntimeHealthPayload,
  type CurrentRuntimeHealthPayload,
} from './runtime-observability-delivery-abi';

export type { ApiV1RuntimeHealthPayload, CurrentRuntimeHealthPayload };

export function getCurrentRuntimeHealthDelivery(): CurrentRuntimeHealthPayload {
  return buildCurrentRuntimeHealthPayload(getRuntimeHealthSummary());
}

export function getCurrentRuntimeDiagnosticsDelivery(): RuntimeDiagnosticsSummary {
  return getRuntimeDiagnosticsSummary();
}

export function getApiV1RuntimeHealthDelivery(): ApiV1RuntimeHealthPayload {
  return buildApiV1RuntimeHealthPayload();
}
