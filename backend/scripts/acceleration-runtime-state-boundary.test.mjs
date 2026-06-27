import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const runtimeServicePath = resolve(root, 'src/services/acceleration-runtime.service.ts');
const runtimeStatePath = resolve(root, 'src/services/acceleration-runtime-state.service.ts');
const runtimeService = readFileSync(runtimeServicePath, 'utf8');
const runtimeState = readFileSync(runtimeStatePath, 'utf8');

test('acceleration runtime state lives in a dedicated kernel-state module', () => {
  assert.equal(existsSync(runtimeStatePath), true, 'acceleration-runtime-state.service.ts must exist');
  assert.match(runtimeState, /export type AccelerationRuntimePhase/);
  assert.match(runtimeState, /export type AccelerationRuntimeState/);
  assert.match(runtimeState, /export const accelerationRuntime/);
  assert.match(runtimeState, /export function setAccelerationRuntimePhase/);
  assert.match(runtimeState, /export function setAccelerationRuntimeBlocking/);
  assert.match(runtimeState, /export async function waitForAccelerationApiIdle/);
});

test('acceleration runtime service re-exports state but does not own middleware state logic', () => {
  assert.match(runtimeService, /from '\.\/acceleration-runtime-state\.service'/);
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
  assert.match(runtimeState, /export function setAccelerationRuntimeBlocking\(blocking: boolean\)/);
  assert.match(runtimeState, /export function createAccelerationRuntimeMiddleware\(\): RequestHandler/);
  assert.match(runtimeState, /accelerationRuntime\.activeApiRequests \+= 1/);
  assert.match(runtimeState, /accelerationRuntime\.activeApiRequests = Math\.max/);
  assert.match(runtimeState, /while \(accelerationRuntime\.activeApiRequests > 0/);
});
