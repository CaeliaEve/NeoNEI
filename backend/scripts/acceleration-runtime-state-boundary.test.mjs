import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const runtimeServicePath = resolve(root, 'src/services/acceleration-runtime.service.ts');
const runtimeStatePath = resolve(root, 'src/services/acceleration-runtime-state.service.ts');
const runtimeAdminRoutesPath = resolve(root, 'src/routes/runtime-admin.routes.ts');
const appPath = resolve(root, 'src/app.ts');
const runtimeService = readFileSync(runtimeServicePath, 'utf8');
const runtimeState = readFileSync(runtimeStatePath, 'utf8');
const runtimeAdminRoutes = readFileSync(runtimeAdminRoutesPath, 'utf8');
const appSource = readFileSync(appPath, 'utf8');

test('acceleration runtime state lives in a dedicated kernel-state module', () => {
  assert.equal(existsSync(runtimeStatePath), true, 'acceleration-runtime-state.service.ts must exist');
  assert.match(runtimeState, /export type AccelerationRuntimePhase/);
  assert.match(runtimeState, /export type AccelerationRuntimeState/);
  assert.match(runtimeState, /export function getAccelerationRuntimeSnapshot/);
  assert.match(runtimeState, /export function setAccelerationRuntimePhase/);
  assert.match(runtimeState, /export function setAccelerationRuntimeBlocking/);
  assert.match(runtimeState, /export async function waitForAccelerationApiIdle/);
  assert.doesNotMatch(runtimeState, /export const accelerationRuntime/);
});

test('acceleration runtime service re-exports snapshot access but does not own middleware state logic', () => {
  assert.match(runtimeService, /from '\.\/acceleration-runtime-state\.service'/);
  assert.match(runtimeService, /getAccelerationRuntimeSnapshot/);
  assert.doesNotMatch(runtimeService, /\baccelerationRuntime,/);
  assert.doesNotMatch(runtimeService, /import type \{ Request, RequestHandler \} from 'express'/);
  assert.doesNotMatch(runtimeService, /sendErrorEnvelope/);
  assert.doesNotMatch(runtimeService, /activeApiRequests \+= 1/);
  assert.doesNotMatch(runtimeService, /activeApiRequests = Math\.max/);
  assert.doesNotMatch(runtimeService, /setAccelerationRuntimeBlocking\(true\)/);
  assert.doesNotMatch(runtimeService, /setAccelerationRuntimeBlocking\(false\)/);
  assert.doesNotMatch(runtimeService, /waitForAccelerationApiIdle\(\)/);
  assert.doesNotMatch(runtimeService, /function isTrackedAccelerationApiRequest/);
  assert.doesNotMatch(runtimeService, /export function createAccelerationRuntimeMiddleware\(\): RequestHandler/);
});

test('acceleration runtime middleware and idle gate stay with state ownership', () => {
  assert.match(runtimeState, /import type \{ Request, RequestHandler \} from 'express'/);
  assert.match(runtimeState, /sendErrorEnvelope/);
  assert.match(runtimeState, /function isTrackedAccelerationApiRequest/);
  assert.match(runtimeState, /let accelerationRuntimeSnapshot: AccelerationRuntimeState/);
  assert.match(runtimeState, /Object\.freeze\(\{/);
  assert.match(runtimeState, /function publishAccelerationRuntimeSnapshot/);
  assert.match(runtimeState, /export function setAccelerationRuntimeBlocking\(blocking: boolean\)/);
  assert.match(runtimeState, /export function createAccelerationRuntimeMiddleware\(\): RequestHandler/);
  assert.match(runtimeState, /publishAccelerationRuntimeSnapshot\(\{ activeApiRequests: snapshot\.activeApiRequests \+ 1 \}\)/);
  assert.match(runtimeState, /activeApiRequests: Math\.max\(0, getAccelerationRuntimeSnapshot\(\)\.activeApiRequests - 1\)/);
  assert.match(runtimeState, /while \(getAccelerationRuntimeSnapshot\(\)\.activeApiRequests > 0/);
  assert.doesNotMatch(runtimeState, /accelerationRuntime\.(phase|message|stale|lastCompiledSignature|lastError|blocking|activeApiRequests)\s*=/);
  assert.doesNotMatch(runtimeState, /activeApiRequests \+= 1/);
});

test('runtime admin routes consume acceleration snapshots explicitly', () => {
  assert.match(runtimeAdminRoutes, /getAccelerationRuntimeSnapshot: \(\) => AccelerationRuntimeState/);
  assert.match(runtimeAdminRoutes, /function serializeAccelerationRuntime/);
  assert.match(runtimeAdminRoutes, /const accelerationSnapshot = getAccelerationRuntimeSnapshot\(\)/);
  assert.match(runtimeAdminRoutes, /serializeAccelerationRuntime\(getAccelerationRuntimeSnapshot\(\)\)/);
  assert.doesNotMatch(runtimeAdminRoutes, /\baccelerationRuntime\b/);
  assert.match(appSource, /getAccelerationRuntimeSnapshot/);
  assert.match(appSource, /getAccelerationRuntimeSnapshot,/);
  assert.doesNotMatch(appSource, /\baccelerationRuntime,/);
  assert.doesNotMatch(appSource, /accelerationRuntime:/);
});
