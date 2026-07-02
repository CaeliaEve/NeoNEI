import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const runtimeRouteSource = readFileSync(resolve(root, 'src/routes/runtime.routes.ts'), 'utf8');
const v1RouteSource = readFileSync(resolve(root, 'src/routes/v1.routes.ts'), 'utf8');
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

  assert.match(runtimeRouteSource, /getCurrentRuntimeHealthDelivery\(\)/);
  assert.match(runtimeRouteSource, /getCurrentRuntimeDiagnosticsDelivery\(\)/);
  assert.match(v1RouteSource, /getApiV1RuntimeHealthDelivery\(\)/);

  for (const routeSource of [runtimeRouteSource, v1RouteSource]) {
    assert.doesNotMatch(routeSource, /getRuntimeHealthSummary/);
    assert.doesNotMatch(routeSource, /getRuntimeDiagnosticsSummary/);
    assert.doesNotMatch(routeSource, /contractVersion: 'runtime-contracts\/current'/);
    assert.doesNotMatch(routeSource, /new Date\(\)\.toISOString\(\)/);
    assert.doesNotMatch(routeSource, /status: 'ok'/);
    assert.doesNotMatch(routeSource, /version: 1/);
  }
});
