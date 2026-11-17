import assert from 'node:assert/strict';
import test from 'node:test';
import { SnapshotSession } from '../src/state/snapshot-session.ts';

function fixture(id, offline = false) {
  return { manifest: { id }, offline, closed: 0, close() { this.closed++; } };
}

test('concurrent consumers and the resolved current alias share one snapshot', async () => {
  let calls = 0;
  const catalog = fixture('one');
  const owner = new SnapshotSession(async () => { calls++; return catalog; });
  const controller = new AbortController();
  const first = owner.open('', false, controller.signal);
  const second = owner.open('', false);
  controller.abort();
  await assert.rejects(first, { name: 'AbortError' });
  assert.equal(await second, catalog);
  assert.equal(await owner.open('one', false), catalog);
  assert.equal(calls, 1);
  assert.equal(catalog.closed, 0);
  owner.close();
  assert.equal(catalog.closed, 1);
});

test('switching snapshots closes late results without overwriting the active one', async () => {
  let resolveOld;
  const old = fixture('old'), current = fixture('new');
  const owner = new SnapshotSession(id => id === 'old'
    ? new Promise(resolve => { resolveOld = resolve; }) : Promise.resolve(current));
  const stale = owner.open('old', false);
  const rejection = assert.rejects(stale, { name: 'AbortError' });
  assert.equal(await owner.open('new', false), current);
  resolveOld(old);
  await rejection;
  assert.equal(old.closed, 1);
  assert.equal(await owner.open('new', false), current);
});

test('failed opens can retry and offline source changes have a distinct identity', async () => {
  let calls = 0;
  const online = fixture('one'), offline = fixture('one', true);
  const owner = new SnapshotSession(async (_id, local) => {
    if (++calls === 1) throw new Error('unavailable');
    return local ? offline : online;
  });
  await assert.rejects(owner.open('one', false), /unavailable/);
  assert.equal(await owner.open('one', false), online);
  assert.equal(await owner.open('one', true), offline);
  assert.equal(online.closed, 1);
  owner.close();
  assert.equal(offline.closed, 1);
});

test('automatic offline fallback binds to the saved manifest without opening twice', async () => {
  let calls = 0;
  const local = fixture('saved', true);
  const owner = new SnapshotSession(async () => { calls++; return local; });
  assert.equal(await owner.open('', false), local);
  assert.equal(await owner.open('saved', true), local);
  assert.equal(calls, 1);
});

test('multiple offline-removal observers invalidate once and share the reopening request', async () => {
  let calls = 0;
  const owner = new SnapshotSession(async () => { calls++; return fixture('saved', true); });
  await owner.open('saved', true);
  owner.invalidate('saved');
  const first = owner.open('saved', true);
  owner.invalidate('saved');
  const second = owner.open('saved', true);
  assert.equal(await first, await second);
  assert.equal(calls, 2);
});
