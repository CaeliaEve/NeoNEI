import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
require('ts-node/register');

const root = resolve(import.meta.dirname, '..');
const {
  ACCELERATION_RECONCILE_DECISION,
  decideAccelerationReconcilePhase,
} = require(resolve(root, 'src/services/acceleration-runtime-phase-machine.service.ts'));

test('external runtime authority can only compile Elysium artifacts or remain ready', () => {
  assert.equal(
    decideAccelerationReconcilePhase({
      compilerAuthority: 'external-runtime',
      fresh: false,
      publishMaterializeOnStart: true,
    }),
    ACCELERATION_RECONCILE_DECISION.compileExternalRuntime,
  );
  assert.equal(
    decideAccelerationReconcilePhase({
      compilerAuthority: 'external-runtime',
      fresh: true,
      publishMaterializeOnStart: true,
    }),
    ACCELERATION_RECONCILE_DECISION.readyNoop,
  );
});

test('internal SQLite materialization remains an explicit non-production authority path', () => {
  assert.equal(
    decideAccelerationReconcilePhase({
      compilerAuthority: 'internal-sqlite',
      fresh: true,
      publishMaterializeOnStart: true,
    }),
    ACCELERATION_RECONCILE_DECISION.materializePublishPayloads,
  );
  assert.equal(
    decideAccelerationReconcilePhase({
      compilerAuthority: 'internal-sqlite',
      fresh: false,
    }),
    ACCELERATION_RECONCILE_DECISION.compileSnapshot,
  );
});
