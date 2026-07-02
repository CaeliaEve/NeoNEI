import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const routeSource = readFileSync(resolve(root, 'src/routes/patterns.routes.ts'), 'utf8');
const registrySource = readFileSync(resolve(root, 'src/routes/pattern-control-endpoint-registry.ts'), 'utf8');
const handlersSource = readFileSync(resolve(root, 'src/routes/pattern-control-endpoint-handlers.ts'), 'utf8');
const serviceSource = readFileSync(resolve(root, 'src/services/pattern-control.service.ts'), 'utf8');

test('pattern control routes are mounted from an explicit endpoint registry', () => {
  assert.match(registrySource, /export const PATTERN_CONTROL_ENDPOINTS/);
  for (const endpointKey of [
    'list-groups',
    'get-group',
    'get-group-detail',
    'create-group',
    'update-group',
    'delete-group',
    'create-pattern',
    'delete-pattern',
    'update-pattern',
    'export-group',
  ]) {
    assert.match(registrySource, new RegExp(`key: '${endpointKey}'`));
    assert.match(handlersSource, new RegExp(`'${endpointKey}': async`));
  }

  assert.match(routeSource, /for \(const endpoint of PATTERN_CONTROL_ENDPOINTS\)/);
  assert.match(routeSource, /registerPatternControlEndpoint\(router, endpoint\)/);
  assert.doesNotMatch(routeSource, /new PatternsService/);
  assert.doesNotMatch(routeSource, /sendErrorEnvelope/);
  assert.doesNotMatch(routeSource, /normalizePatternOptions/);
  assert.doesNotMatch(routeSource, /recipeId and patternName are required/);
  assert.doesNotMatch(routeSource, /Pattern group not found/);
});

test('pattern control service owns payload normalization and domain errors', () => {
  assert.match(serviceSource, /export function normalizePatternOptions/);
  assert.match(serviceSource, /export function normalizeCreatePatternPayload/);
  assert.match(serviceSource, /class PatternControlService/);
  assert.match(serviceSource, /PATTERN_REQUIRED_FIELDS_MISSING/);
  assert.match(serviceSource, /PATTERN_GROUP_NOT_FOUND/);
  assert.match(serviceSource, /PATTERN_GROUP_NAME_REQUIRED/);
  assert.match(handlersSource, /createPatternControlService\(\)\.createPattern\(req\.body\)/);
  assert.match(handlersSource, /createPatternControlService\(\)\.exportGroup\(req\.params\.groupId\)/);
});
