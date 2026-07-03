import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const reportRegistrySource = readFileSync(resolve(root, 'src/services/current-runtime-report-registry.service.ts'), 'utf8');
const reportRegistryAbiSource = readFileSync(resolve(root, 'src/services/current-runtime-report-registry-abi.ts'), 'utf8');
const settingsSource = readFileSync(resolve(root, 'src/services/current-runtime-settings.service.ts'), 'utf8');
const settingsAbiSource = readFileSync(resolve(root, 'src/services/current-runtime-settings-abi.ts'), 'utf8');
const snapshotSource = readFileSync(resolve(root, 'src/services/current-runtime-snapshot.service.ts'), 'utf8');
const snapshotAbiSource = readFileSync(resolve(root, 'src/services/current-runtime-snapshot-abi.ts'), 'utf8');
const apiAbiSource = readFileSync(resolve(root, 'src/services/current-runtime-api-abi.ts'), 'utf8');
const readSource = readFileSync(resolve(root, 'src/services/current-runtime-read.service.ts'), 'utf8');
const readCatalogSource = readFileSync(resolve(root, 'src/services/current-runtime-read-catalog.ts'), 'utf8');
const endpointHandlerSource = readFileSync(resolve(root, 'src/routes/current-runtime-endpoint-handlers.ts'), 'utf8');
const endpointHandlerAbiSource = readFileSync(resolve(root, 'src/routes/current-runtime-endpoint-handler-abi.ts'), 'utf8');

test('current runtime report registry exposes debugfs reports through an ABI catalog', () => {
  assert.match(reportRegistrySource, /from '\.\/current-runtime-report-registry-abi'/);
  for (const symbol of [
    'CURRENT_RUNTIME_REPORT_REGISTRY_SCHEMA',
    'CURRENT_RUNTIME_REPORT_REGISTRY_SCHEMA_REVISION',
    'CURRENT_RUNTIME_REPORT_REGISTRY_MODULE',
    'CURRENT_RUNTIME_REPORT_DESCRIPTORS',
    'CURRENT_RUNTIME_REPORTS_BY_SLUG',
    'CURRENT_RUNTIME_REPORT_JSON_SUFFIX_PATTERN',
    'CURRENT_RUNTIME_REPORT_SLUG_PATTERN',
    'CURRENT_RUNTIME_REPORT_ERRORS',
  ]) {
    assert.match(reportRegistryAbiSource, new RegExp(`export const ${symbol}`));
  }
  assert.match(reportRegistryAbiSource, /NATIVE_UI_RUNTIME_PROOF_REPORTS/);
  assert.match(reportRegistryAbiSource, /'neonei\/debugfs\/current-runtime-report-registry'/);
  assert.match(reportRegistryAbiSource, /plane: CURRENT_RUNTIME_REPORT_PLANE/);
  assert.match(reportRegistryAbiSource, /contentType: CURRENT_RUNTIME_REPORT_CONTENT_TYPE/);
  assert.match(reportRegistryAbiSource, /cachePolicy: CURRENT_RUNTIME_REPORT_CACHE_POLICY/);
  assert.match(reportRegistrySource, /CURRENT_RUNTIME_REPORTS_BY_SLUG/);
  assert.match(reportRegistrySource, /report: descriptor/);
  assert.match(reportRegistrySource, /cachePolicy: descriptor\.cachePolicy/);
  assert.match(reportRegistrySource, /contentType: descriptor\.contentType/);
  assert.doesNotMatch(reportRegistryAbiSource, /export const CURRENT_RUNTIME_REPORTS =/);
  assert.doesNotMatch(reportRegistrySource, /CURRENT_RUNTIME_REPORTS\[/);

  for (const ownedLiteral of [
    /'compile-report'/,
    /'rust\/integrity\.json'/,
    /'semantic-validation-report'/,
    /'rust\/semantic-validation-report\.json'/,
    /'debugfs'/,
    /'application\/json'/,
    /'no-store'/,
    /'Runtime report is not allowed'/,
    /'Runtime report not found'/,
    /'reportName is required'/,
    /'reportName must be a simple report slug'/,
    /\/\^\[a-z0-9-\]\+\$\/i/,
    /\/\\\.json\$\/i/,
  ]) {
    assert.match(reportRegistryAbiSource, ownedLiteral);
    assert.doesNotMatch(reportRegistrySource, ownedLiteral);
  }
});

test('current runtime settings controlfs response uses a settings ABI catalog', () => {
  assert.match(settingsSource, /from '\.\/current-runtime-settings-abi'/);
  assert.match(settingsAbiSource, /CURRENT_RUNTIME_SETTINGS_STATIC/);
  assert.match(settingsAbiSource, /CURRENT_RUNTIME_SETTINGS_ENV/);
  assert.match(settingsAbiSource, /CURRENT_RUNTIME_ENABLED_FLAG_DESCRIPTORS/);
  assert.match(settingsAbiSource, /CURRENT_RUNTIME_ENABLED_FLAG_VALUES/);
  assert.match(settingsAbiSource, /CURRENT_RUNTIME_SETTINGS_ENV_DESCRIPTORS/);
  assert.match(settingsAbiSource, /CURRENT_RUNTIME_SETTINGS_RUNTIME_DESCRIPTORS/);
  assert.match(settingsAbiSource, /CURRENT_RUNTIME_SETTINGS_STATIC_DESCRIPTORS/);
  assert.match(settingsAbiSource, /export type CurrentRuntimeSettingsEnvironment/);
  assert.match(settingsAbiSource, /export type CurrentRuntimeSettings/);
  assert.match(settingsAbiSource, /export function isCurrentRuntimeSettingsEnabledFlag/);
  assert.match(settingsAbiSource, /export function resolveCurrentRuntimeSettings/);
  assert.match(settingsAbiSource, /validateAndFreezeRuntimeSettingsDescriptors/);
  assert.match(settingsAbiSource, /Missing \$\{label\} descriptor/);
  assert.match(settingsAbiSource, /Duplicate \$\{label\} descriptor/);

  for (const ownedLiteral of [
    /'NEONEI_DEBUG_PANELS'/,
    /'webgpu-first'/,
    /'\/api\/runtime\/current'/,
    /'\/api\/runtime\/current\/manifest'/,
    /'\/api\/runtime\/current\/asset\/'/,
    /'1'/,
    /'true'/,
  ]) {
    assert.match(settingsAbiSource, ownedLiteral);
    assert.doesNotMatch(settingsSource, ownedLiteral);
  }
  assert.match(settingsSource, /resolveCurrentRuntimeSettings\(env\)/);
  assert.doesNotMatch(settingsSource, /CURRENT_RUNTIME_SETTINGS_STATIC/);
  assert.doesNotMatch(settingsSource, /CURRENT_RUNTIME_ENABLED_FLAG_VALUES/);
  assert.doesNotMatch(settingsSource, /function isEnabledFlag/);
  assert.doesNotMatch(settingsSource, /\.trim\(\)\.toLowerCase\(\)/);
});

test('current runtime read and endpoint handlers are descriptor ops-table owned', () => {
  assert.match(readSource, /from '\.\/current-runtime-read-catalog'/);
  assert.match(readCatalogSource, /CURRENT_RUNTIME_READ_OPERATION_DESCRIPTORS/);
  assert.match(readCatalogSource, /CURRENT_RUNTIME_READ_OPERATIONS/);
  assert.match(readCatalogSource, /validateAndFreezeCurrentRuntimeReadOperationDescriptors/);
  assert.match(readCatalogSource, /Missing current runtime read operation descriptor/);
  assert.match(readCatalogSource, /Duplicate current runtime read operation descriptor/);
  for (const readKey of [
    'overview',
    'recipeProducedBy',
    'recipeUsedIn',
    'recipePage',
    'diagnosticsHealth',
    'diagnosticsSummary',
    'nativeSurfaceMetrics',
    'settings',
    'gtDiagramsOverview',
    'forestryGeneticsOverview',
    'multiblockBlueprint',
  ]) {
    assert.match(readCatalogSource, new RegExp(`key: '${readKey}'`));
  }

  assert.match(endpointHandlerSource, /from '\.\/current-runtime-endpoint-handler-abi'/);
  assert.match(endpointHandlerAbiSource, /CURRENT_RUNTIME_ENDPOINT_HANDLER_DESCRIPTORS/);
  assert.match(endpointHandlerAbiSource, /CURRENT_RUNTIME_ENDPOINT_HANDLER_BY_KEY/);
  assert.match(endpointHandlerAbiSource, /validateAndFreezeCurrentRuntimeEndpointHandlerDescriptors/);
  assert.match(endpointHandlerAbiSource, /Missing current runtime endpoint handler descriptor/);
  assert.match(endpointHandlerAbiSource, /Duplicate current runtime endpoint handler descriptor/);
  assert.match(endpointHandlerSource, /createCurrentRuntimeEndpointHandler\(descriptor\)/);
  assert.match(endpointHandlerSource, /validateAndFreezeRouteHandlers/);
  assert.doesNotMatch(endpointHandlerSource, /getCurrentRuntimeRecipePagePayload/);
  assert.doesNotMatch(endpointHandlerSource, /current-runtime-recipe-api\.service/);
  assert.doesNotMatch(endpointHandlerSource, /current-runtime-settings\.service/);
  assert.match(endpointHandlerAbiSource, /key: 'current'[\s\S]*kind: 'context-json'[\s\S]*read: 'overview'/);
  assert.match(endpointHandlerAbiSource, /key: 'pinnedManifest'[\s\S]*runtimeIdParam: 'runtimeId'[\s\S]*immutable: true/);
  assert.match(endpointHandlerAbiSource, /key: 'recipePage'[\s\S]*kind: 'param-async-json'[\s\S]*read: 'recipePage'/);
  assert.match(endpointHandlerAbiSource, /key: 'runtimeDataMultiblockBlueprint'[\s\S]*kind: 'param-sync-json'[\s\S]*read: 'multiblockBlueprint'/);
});

test('current runtime snapshot manifest fields and default identities are ABI-catalog owned', () => {
  assert.match(snapshotSource, /from '\.\/current-runtime-snapshot-abi'/);
  assert.match(snapshotAbiSource, /CURRENT_RUNTIME_SNAPSHOT_DEFAULTS/);
  assert.match(snapshotAbiSource, /CURRENT_RUNTIME_MANIFEST_FIELDS/);
  assert.match(snapshotAbiSource, /CURRENT_RUNTIME_SNAPSHOT_DEFAULT_DESCRIPTORS/);
  assert.match(snapshotAbiSource, /CURRENT_RUNTIME_MANIFEST_FIELD_DESCRIPTORS/);
  assert.match(snapshotAbiSource, /validateAndFreezeStringDescriptors/);
  assert.match(snapshotAbiSource, /Missing \$\{label\} descriptor/);
  assert.match(snapshotAbiSource, /Duplicate \$\{label\} descriptor/);
  assert.match(snapshotAbiSource, /stringDescriptor\('missingRuntimeId', 'runtime-missing'\)/);
  assert.match(snapshotAbiSource, /stringDescriptor\('unknownSchemaRevision', 'runtime\.unknown'\)/);
  assert.match(apiAbiSource, /CURRENT_RUNTIME_SNAPSHOT_DEFAULTS/);

  for (const ownedLiteral of [
    /'runtime-missing'/,
    /'runtime\.unknown'/,
    /stringDescriptor\('schemaRevision', 'schemaRevision'\)/,
    /stringDescriptor\('runtimeId', 'runtimeId'\)/,
    /stringDescriptor\('capabilities', 'capabilities'\)/,
  ]) {
    assert.match(snapshotAbiSource, ownedLiteral);
    assert.doesNotMatch(snapshotSource, ownedLiteral);
  }
});
