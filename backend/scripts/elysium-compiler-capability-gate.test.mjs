import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const clientSource = readFileSync(resolve(root, 'src/compiler-client/elysium-compiler-client.ts'), 'utf8');
const gateSource = readFileSync(resolve(root, 'src/compiler-client/elysium-compiler-capability-gate.ts'), 'utf8');
const runtimeSource = readFileSync(resolve(root, 'src/services/acceleration-runtime.service.ts'), 'utf8');
const reporterSource = readFileSync(resolve(root, 'src/services/acceleration-runtime-compiler-boundary-reporter.service.ts'), 'utf8');

test('compiler client exposes a typed native UI capability gate', () => {
  assert.match(gateSource, /export const REQUIRED_NATIVE_UI_CAPABILITIES/);
  for (const capability of [
    'native_ui.surface',
    'native_ui.design_space_coordinates',
    'native_ui.background_asset',
  ]) {
    assert.match(gateSource, new RegExp(capability.replaceAll('.', '\\.')));
  }
  assert.match(gateSource, /export type ElysiumNativeUiAbi/);
  assert.match(gateSource, /export type ElysiumCompilerCapabilityContract/);
  assert.match(gateSource, /export function assertCompilerNativeUiCapabilityGate/);
  assert.match(gateSource, /missing required native UI capabilities/);
});

test('compiler handshake attaches validated capabilities before callers can use it', () => {
  assert.match(clientSource, /assertCompilerNativeUiCapabilityGate\(report as ElysiumCompilerHandshake\)/);
  assert.match(clientSource, /capabilities: ElysiumCompilerCapabilityContract/);
  assert.match(clientSource, /return \{ \.\.\.report, capabilities \}/);
  assert.match(clientSource, /nativeUiCapabilities: capabilities\.nativeUi\.requiredCapabilities/);
  assert.doesNotMatch(clientSource, /return report;/);
});

test('acceleration compiler boundary reporter consumes the typed native UI capability contract', () => {
  assert.match(reporterSource, /handshake\.capabilities\.nativeUi\.requiredCapabilities/);
  assert.match(reporterSource, /handshake\.capabilities\.nativeUi\.coordinateSpace/);
  assert.match(reporterSource, /handshake\.capabilities\.nativeUi\.runtimeTransform/);
  assert.match(runtimeSource, /verifyAccelerationCompilerBoundary\(\)/);
  assert.doesNotMatch(runtimeSource, /compilerHandshake\.capabilities\.nativeUi/);
  assert.doesNotMatch(runtimeSource, /abi\?\.exportAbi\?\.nativeUi/);
});
