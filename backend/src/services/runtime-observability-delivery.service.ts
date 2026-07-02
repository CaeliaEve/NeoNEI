import {
  getRuntimeDiagnosticsSummary,
  type RuntimeDiagnosticsSummary,
} from './runtime-diagnostics-summary.service';
import { getRuntimeHealthSummary, type RuntimeHealthSummary } from './runtime-health-summary.service';

export type CurrentRuntimeHealthPayload = RuntimeHealthSummary & Readonly<{
  contractVersion: 'runtime-contracts/current';
}>;

export type ApiV1RuntimeHealthPayload = Readonly<{
  status: 'ok';
  version: 1;
  timestamp: string;
}>;

export function getCurrentRuntimeHealthDelivery(): CurrentRuntimeHealthPayload {
  const summary = getRuntimeHealthSummary();
  return Object.freeze({
    ...summary,
    contractVersion: 'runtime-contracts/current',
  });
}

export function getCurrentRuntimeDiagnosticsDelivery(): RuntimeDiagnosticsSummary {
  return getRuntimeDiagnosticsSummary();
}

export function getApiV1RuntimeHealthDelivery(): ApiV1RuntimeHealthPayload {
  return Object.freeze({
    status: 'ok',
    version: 1,
    timestamp: new Date().toISOString(),
  });
}
