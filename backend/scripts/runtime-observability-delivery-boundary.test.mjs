import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const runtimeRouteSource = readFileSync(resolve(root, 'src/routes/runtime.routes.ts'), 'utf8');
const v1RouteSource = readFileSync(resolve(root, 'src/routes/v1.routes.ts'), 'utf8');
const runtimeHandlerSource = readFileSync(resolve(root, 'src/routes/runtime-public-endpoint-handlers.ts'), 'utf8');
const v1HandlerSource = readFileSync(resolve(root, 'src/routes/v1-endpoint-handlers.ts'), 'utf8');
const deliverySource = readFileSync(resolve(root, 'src/services/runtime-observability-delivery.service.ts'), 'utf8');

test('runtime observability payloads are delivery-service owned, not route-owned DTOs', () => {
  assert.match(deliverySource, /getRuntimeHealthSummary\(\)/);
  assert.match(deliverySource, /getRuntimeDiagnosticsSummary\(\)/);
  assert.match(deliverySource, /contractVersion: 'runtime-contracts\/current'/);
  assert.match(deliverySource, /export function getCurrentRuntimeHealthDelivery/);
  assert.match(deliverySource, /export function getCurrentRuntimeDiagnosticsDelivery/);
  assert.match(deliverySource, /export function getApiV1RuntimeHealthDelivery/);
  assert.match(deliverySource, /status: 'ok'/);
  assert.match(deliverySource, /version: 1/);
  assert.match(deliverySource, /new Date\(\)\.toISOString\(\)/);

  assert.match(runtimeHandlerSource, /getCurrentRuntimeHealthDelivery\(\)/);
  assert.match(runtimeHandlerSource, /getCurrentRuntimeDiagnosticsDelivery\(\)/);
  assert.match(v1HandlerSource, /getApiV1RuntimeHealthDelivery\(\)/);

  for (const source of [runtimeRouteSource, v1RouteSource, runtimeHandlerSource, v1HandlerSource]) {
    assert.doesNotMatch(source, /getRuntimeHealthSummary/);
    assert.doesNotMatch(source, /getRuntimeDiagnosticsSummary/);
    assert.doesNotMatch(source, /contractVersion: 'runtime-contracts\/current'/);
    assert.doesNotMatch(source, /new Date\(\)\.toISOString\(\)/);
    assert.doesNotMatch(source, /status: 'ok'/);
    assert.doesNotMatch(source, /version: 1/);
  }
});
