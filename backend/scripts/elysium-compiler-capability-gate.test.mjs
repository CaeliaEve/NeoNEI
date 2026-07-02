import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const clientSource = readFileSync(resolve(root, 'src/compiler-client/elysium-compiler-client.ts'), 'utf8');
const catalogSource = readFileSync(resolve(root, 'src/compiler-client/elysium-compiler-capability-abi.ts'), 'utf8');
const gateSource = readFileSync(resolve(root, 'src/compiler-client/elysium-compiler-capability-gate.ts'), 'utf8');
const scriptCatalogSource = readFileSync(resolve(root, '../scripts/elysium-compiler-capability-abi.mjs'), 'utf8');
const ensureSource = readFileSync(resolve(root, '../scripts/ensure-elysium-compiler.mjs'), 'utf8');
const runtimeSource = readFileSync(resolve(root, 'src/services/acceleration-runtime.service.ts'), 'utf8');
const reporterSource = readFileSync(resolve(root, 'src/services/acceleration-runtime-compiler-boundary-reporter.service.ts'), 'utf8');

test('compiler client exposes a typed native UI capability catalog and gate', () => {
  assert.match(catalogSource, /export const NATIVE_UI_REQUIRED_CAPABILITIES/);
  assert.match(catalogSource, /export const NATIVE_UI_REQUIRED_FILES/);
  assert.match(catalogSource, /export const NATIVE_UI_COORDINATE_SPACE = 'nei_pixels'/);
  assert.match(catalogSource, /export const NATIVE_UI_RUNTIME_TRANSFORM = 'uniform-scale-to-fit-only'/);
  assert.match(catalogSource, /export type ElysiumCompilerScope = typeof ELYSIUM_COMPILER_COMPILE_SCOPES\[number\]/);
  assert.match(catalogSource, /export const ELYSIUM_COMPILER_CAPABILITY_ABI/);
  assert.match(gateSource, /from '.\/elysium-compiler-capability-abi'/);
  for (const capability of [
    'native_ui.surface',
    'native_ui.design_space_coordinates',
    'native_ui.background_asset',
  ]) {
    assert.match(catalogSource, new RegExp(capability.replaceAll('.', '\\.')));
  }
  assert.match(gateSource, /export type ElysiumNativeUiAbi/);
  assert.match(gateSource, /export type ElysiumCompilerCapabilityContract/);
  assert.match(gateSource, /export function assertCompilerNativeUiCapabilityGate/);
  assert.match(gateSource, /'native UI capabilities'/);
  assert.match(gateSource, /'native UI files'/);
  assert.match(gateSource, /abi\.exportAbi\.nativeUi\.coordinateSpace/);
  assert.doesNotMatch(gateSource, /Object\.freeze\(\s*\[/);
});

test('compiler client requires the external compiler command surface', () => {
  assert.match(catalogSource, /export const REQUIRED_COMPILER_COMMANDS/);
  assert.match(scriptCatalogSource, /export const REQUIRED_COMPILER_COMMAND_INVOCATIONS/);
  assert.match(scriptCatalogSource, /export const ELYSIUM_COMPILER_CAPABILITY_ABI/);
  for (const command of ['schemas', 'validate', 'compile']) {
    assert.match(catalogSource, new RegExp(`'${command}'`));
    assert.match(scriptCatalogSource, new RegExp(`${command}.*--help|--help.*${command}`, 's'));
  }
  assert.match(ensureSource, /function verifyCommandSurface/);
  assert.match(ensureSource, /REQUIRED_COMPILER_COMMAND_INVOCATIONS/);
  assert.match(ensureSource, /validateElysiumCompilerCapabilityAbi\(catalog\.abi\)/);
  assert.match(ensureSource, /commands: selectedCommands/);
  assert.match(gateSource, /'compiler commands'/);
  assert.match(gateSource, /commands: string\[\]/);
});

test('compiler handshake attaches validated capabilities before callers can use it', () => {
  assert.match(clientSource, /assertCompilerNativeUiCapabilityGate\(report as ElysiumCompilerHandshake\)/);
  assert.match(clientSource, /capabilities: ElysiumCompilerCapabilityContract/);
  assert.match(clientSource, /return \{ \.\.\.report, capabilities \}/);
  assert.match(clientSource, /commands: capabilities\.commands/);
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
