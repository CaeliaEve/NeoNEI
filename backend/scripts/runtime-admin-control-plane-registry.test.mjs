import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const appSource = readFileSync(resolve(root, 'src/app.ts'), 'utf8');
const controlPlaneSource = readFileSync(
  resolve(root, 'src/routes/runtime-admin-control-plane.routes.ts'),
  'utf8',
);
const controlPlaneRegistrySource = readFileSync(
  resolve(root, 'src/routes/runtime-admin-control-plane-registry.ts'),
  'utf8',
);
const controlPlaneSubsystemsSource = readFileSync(
  resolve(root, 'src/routes/runtime-admin-control-plane-subsystems.ts'),
  'utf8',
);
const runtimeAdminSource = readFileSync(resolve(root, 'src/routes/runtime-admin.routes.ts'), 'utf8');
const runtimeAdminRegistrySource = readFileSync(resolve(root, 'src/routes/runtime-admin-endpoint-registry.ts'), 'utf8');
const runtimeAdminHandlersSource = readFileSync(resolve(root, 'src/routes/runtime-admin-endpoint-handlers.ts'), 'utf8');
const runtimeAdminControlSource = readFileSync(resolve(root, 'src/services/runtime-admin-control.service.ts'), 'utf8');
const runtimeAdminControlAbiSource = readFileSync(resolve(root, 'src/services/runtime-admin-control-abi.ts'), 'utf8');
const publishAdminSource = readFileSync(resolve(root, 'src/routes/publish-admin.routes.ts'), 'utf8');
const transportSource = readFileSync(resolve(root, 'src/routes/runtime-admin-transport.ts'), 'utf8');
const routeDescriptorRegistrySource = readFileSync(
  resolve(root, 'src/routes/route-descriptor-registry.ts'),
  'utf8',
);

test('runtime admin control plane is mounted from one explicit registry', () => {
  assert.match(controlPlaneRegistrySource, /export const RUNTIME_ADMIN_CONTROL_PLANES/);
  assert.match(controlPlaneRegistrySource, /export const RUNTIME_ADMIN_CONTROL_PLANE_SUBSYSTEMS/);
  assert.match(controlPlaneRegistrySource, /RUNTIME_ADMIN_CONTROL_PLANE_NAMES/);
  assert.match(controlPlaneRegistrySource, /RUNTIME_ADMIN_CONTROL_PLANE_SUBSYSTEM_KEYS/);
  assert.match(controlPlaneRegistrySource, /validateAndFreezeControlPlanes/);
  assert.match(controlPlaneRegistrySource, /validateAndFreezeControlPlaneSubsystems/);
  assert.match(controlPlaneRegistrySource, /Duplicate runtime admin control plane descriptor/);
  assert.match(controlPlaneRegistrySource, /Missing runtime admin control plane descriptor/);
  assert.match(controlPlaneRegistrySource, /Duplicate runtime admin control plane subsystem descriptor/);
  assert.match(controlPlaneRegistrySource, /Missing runtime admin control plane subsystem descriptor/);
  assert.match(controlPlaneRegistrySource, /prefix:\s*'\/ops'/);
  assert.match(controlPlaneRegistrySource, /prefix:\s*'\/api\/admin'/);
  assert.match(controlPlaneRegistrySource, /reconcileLabel:\s*'OPS'/);
  assert.match(controlPlaneRegistrySource, /reconcileLabel:\s*'ADMIN'/);
  assert.match(controlPlaneRegistrySource, /key: 'runtime-control', mountPath: null/);
  assert.match(controlPlaneRegistrySource, /key: 'publish', mountPath: '\/publish'/);
  assert.match(controlPlaneRegistrySource, /key: 'patterns', mountPath: '\/patterns'/);
  assert.match(controlPlaneRegistrySource, /key: 'render-contract', mountPath: '\/render-contract'/);
  assert.match(controlPlaneSource, /createRuntimeAdminTokenMiddleware\(requireAdminToken\)/);
  assert.match(controlPlaneSource, /for \(const plane of RUNTIME_ADMIN_CONTROL_PLANES\)/);
  assert.match(controlPlaneSource, /for \(const subsystem of RUNTIME_ADMIN_CONTROL_PLANE_SUBSYSTEMS\)/);
  assert.match(controlPlaneSource, /app\.use\(\s*plane\.prefix/);
  assert.match(controlPlaneSource, /mountRuntimeAdminControlPlaneSubsystem\(router, plane, subsystem, options\)/);
  assert.match(controlPlaneSubsystemsSource, /createRuntimeAdminControlRouter\(plane\.reconcileLabel, options\)/);
  assert.match(controlPlaneSubsystemsSource, /createPublishAdminRouter\(\)/);
  assert.match(controlPlaneSubsystemsSource, /patternsRoutes/);
  assert.match(controlPlaneSubsystemsSource, /renderContractRoutes/);

  for (const routeLocalSubsystem of [
    /router\.use\('\/publish'/,
    /router\.use\('\/patterns'/,
    /router\.use\('\/render-contract'/,
    /createPublishAdminRouter/,
    /patternsRoutes/,
    /renderContractRoutes/,
  ]) {
    assert.doesNotMatch(controlPlaneSource, routeLocalSubsystem);
  }

  assert.match(appSource, /registerRuntimeAdminControlPlaneRoutes\(/);
  assert.doesNotMatch(appSource, /patternsRoutes/);
  assert.doesNotMatch(appSource, /renderContractRoutes/);
  assert.doesNotMatch(appSource, /registerPublishAdminRoutes/);
  assert.doesNotMatch(appSource, /createRuntimeAdminTokenMiddleware/);
  assert.doesNotMatch(appSource, /app\.use\('\/ops\/(?:patterns|publish|render-contract)'/);
  assert.doesNotMatch(appSource, /app\.use\('\/api\/admin\/(?:patterns|publish|render-contract)'/);
});

test('admin token enforcement is middleware-owned, not repeated per route', () => {
  assert.match(transportSource, /export function createRuntimeAdminTokenMiddleware/);
  assert.doesNotMatch(transportSource, /export function withRuntimeAdminToken/);
  assert.doesNotMatch(runtimeAdminSource, /withRuntimeAdminToken/);
  assert.doesNotMatch(publishAdminSource, /withRuntimeAdminToken/);
  assert.doesNotMatch(publishAdminSource, /RuntimeAdminTokenGuard/);
  assert.match(publishAdminSource, /export function createPublishAdminRouter\(\): Router/);
  assert.match(runtimeAdminSource, /export function createRuntimeAdminControlRouter/);
  assert.match(runtimeAdminSource, /export function registerRuntimeAdminIndexRoutes/);
  assert.doesNotMatch(runtimeAdminSource, /export function registerRuntimeAdminRoutes/);
});

test('runtime admin public API and OpenAPI documents are ABI-catalog owned', () => {
  assert.match(runtimeAdminControlSource, /from '\.\/runtime-admin-control-abi'/);
  for (const symbol of [
    'RUNTIME_ADMIN_PUBLIC_API_METADATA',
    'RUNTIME_ADMIN_PUBLIC_ENDPOINT_DESCRIPTORS',
    'RUNTIME_ADMIN_PUBLIC_ENDPOINTS',
    'RUNTIME_OPENAPI_PATH_DESCRIPTORS',
    'RUNTIME_OPENAPI_PATHS',
  ]) {
    assert.match(runtimeAdminControlAbiSource, new RegExp(`export const ${symbol}`));
  }
  assert.match(runtimeAdminControlAbiSource, /validateAndFreezePublicEndpointDescriptors/);
  assert.match(runtimeAdminControlAbiSource, /validateAndFreezeOpenApiPathDescriptors/);
  assert.match(runtimeAdminControlAbiSource, /projectPublicEndpointMap/);
  assert.match(runtimeAdminControlAbiSource, /projectOpenApiPaths/);
  assert.match(runtimeAdminControlAbiSource, /Duplicate runtime admin public endpoint descriptor/);
  assert.match(runtimeAdminControlAbiSource, /Missing runtime admin public endpoint descriptor/);
  assert.match(runtimeAdminControlAbiSource, /Duplicate runtime OpenAPI route signature/);
  assert.match(runtimeAdminControlAbiSource, /Missing runtime OpenAPI path descriptor/);
  assert.match(runtimeAdminControlSource, /RUNTIME_ADMIN_PUBLIC_ENDPOINTS/);
  assert.match(runtimeAdminControlSource, /RUNTIME_OPENAPI_PATHS/);
  assert.match(runtimeAdminControlSource, /RUNTIME_ADMIN_PUBLIC_API_METADATA/);
  assert.match(runtimeAdminControlAbiSource, /path: '\/api\/runtime\/current\/manifest'/);
  assert.match(runtimeAdminControlAbiSource, /path: '\/ops\/patterns', method: 'get'/);
  assert.match(runtimeAdminControlAbiSource, /path: '\/ops\/patterns', method: 'post'/);
  assert.match(runtimeAdminControlAbiSource, /path: '\/api\/admin\/render-contract', method: 'get'/);
  assert.match(runtimeAdminControlAbiSource, /path: '\/api\/admin\/render-contract', method: 'post'/);
  assert.match(runtimeAdminControlAbiSource, /'NeoNEI Public Runtime API'/);

  for (const catalogOwnedLiteral of [
    /'\/api\/health'/,
    /'\/api\/runtime\/current'/,
    /'\/api\/recipes\/current\/item\/:itemId'/,
    /'\/ops\/publish\/releases'/,
    /'\/runtime\/diagnostics'/,
    /'\/api\/admin\/runtime'/,
    /'Token-protected render contract queries'/,
    /'Publish home bootstrap payload'/,
    /'NeoNEI Public Runtime API'/,
  ]) {
    assert.match(runtimeAdminControlAbiSource, catalogOwnedLiteral);
    assert.doesNotMatch(runtimeAdminControlSource, catalogOwnedLiteral);
  }
});

test('runtime admin index and control endpoints are table-driven', () => {
  assert.match(runtimeAdminRegistrySource, /export const RUNTIME_ADMIN_INDEX_ENDPOINTS/);
  assert.match(runtimeAdminRegistrySource, /export const RUNTIME_ADMIN_CONTROL_ENDPOINTS/);
  assert.match(runtimeAdminRegistrySource, /RUNTIME_ADMIN_INDEX_ENDPOINT_KEYS/);
  assert.match(runtimeAdminRegistrySource, /RUNTIME_ADMIN_CONTROL_ENDPOINT_KEYS/);
  assert.match(runtimeAdminRegistrySource, /validateAndFreezeRouteDescriptors/);
  assert.match(runtimeAdminRegistrySource, /label: 'runtime admin index endpoint'/);
  assert.match(runtimeAdminRegistrySource, /label: 'runtime admin control endpoint'/);
  assert.match(routeDescriptorRegistrySource, /Duplicate \$\{options\.label\} route descriptor/);
  assert.match(routeDescriptorRegistrySource, /Missing \$\{options\.label\} route descriptor/);
  assert.match(routeDescriptorRegistrySource, /\$\{options\.label\} route path must be absolute/);
  assert.match(routeDescriptorRegistrySource, /export function validateAndFreezeRouteHandlers/);
  assert.match(routeDescriptorRegistrySource, /Unknown \$\{options\.label\} route handler/);
  assert.match(routeDescriptorRegistrySource, /Missing \$\{options\.label\} route handler/);
  assert.match(runtimeAdminRegistrySource, /path: '\/api\/health'/);
  assert.match(runtimeAdminRegistrySource, /path: '\/api'/);
  assert.match(runtimeAdminRegistrySource, /path: '\/api\/openapi\.json'/);
  assert.match(runtimeAdminRegistrySource, /path: '\/runtime'/);
  assert.match(runtimeAdminRegistrySource, /path: '\/acceleration\/reconcile'/);
  assert.match(runtimeAdminSource, /for \(const endpoint of RUNTIME_ADMIN_INDEX_ENDPOINTS\)/);
  assert.match(runtimeAdminSource, /for \(const endpoint of RUNTIME_ADMIN_CONTROL_ENDPOINTS\)/);
  assert.match(runtimeAdminHandlersSource, /validateAndFreezeRouteHandlers/);
  assert.match(runtimeAdminHandlersSource, /descriptors: RUNTIME_ADMIN_INDEX_ENDPOINTS/);
  assert.match(runtimeAdminHandlersSource, /descriptors: RUNTIME_ADMIN_CONTROL_ENDPOINTS/);
  assert.match(runtimeAdminHandlersSource, /label: 'runtime admin index endpoint'/);
  assert.match(runtimeAdminHandlersSource, /label: 'runtime admin control endpoint'/);
  assert.match(runtimeAdminHandlersSource, /getRuntimeAdminDiagnostics/);
  assert.match(runtimeAdminHandlersSource, /sendRuntimeAdminReconcile/);

  for (const routeLocalPolicy of [
    /getRuntimeAdminHealth/,
    /getRuntimeAdminDiagnostics/,
    /getRuntimeOpenApiDocument/,
    /sendRuntimeAdminReconcile/,
    /sendRuntimeAdminJson/,
    /sendRuntimeAdminOpenApi/,
  ]) {
    assert.doesNotMatch(runtimeAdminSource, routeLocalPolicy);
  }
});
