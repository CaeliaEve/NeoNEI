import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const workflow = readFileSync(resolve('.github/workflows/ci.yml'), 'utf8');

test('CI covers current runtime API and production bootstrap boundaries', () => {
  for (const command of [
    'npm run test:current-api-contract',
    'node --test scripts/server-bootstrap-boundary-regression.test.mjs',
  ]) {
    assert.equal(workflow.includes(command), true, `missing backend CI command: ${command}`);
  }
});

test('CI covers native runtime worker, renderer, history, and service worker contracts', () => {
  for (const command of [
    'npm run test:wasm-engine',
    'npm run test:native-runtime-current-api',
    'npm run test:native-surface-batching',
    'npm run test:native-render-frame-metrics',
    'npm run test:native-history-surface',
    'npm run test:runtime-service-worker',
  ]) {
    assert.equal(workflow.includes(command), true, `missing frontend CI command: ${command}`);
  }
});

test('CI still builds both apps and keeps canonical retirement checked', () => {
  for (const command of [
    'npm run build',
    'node scripts/check-canonical-retired.mjs',
    'node scripts/create-release-bundle.mjs release/neonei-web',
  ]) {
    assert.equal(workflow.includes(command), true, `missing release CI command: ${command}`);
  }
});
