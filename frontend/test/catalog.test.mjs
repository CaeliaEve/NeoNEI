import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { effectScope } from 'vue';
import test from 'node:test';
import { Atlas, frameAt, stepAt } from '../src/catalog/atlas.ts';
import { amount, chance, ticks } from '../src/catalog/format.ts';
import { Playback } from '../src/catalog/clock.ts';
import { useRequest } from '../src/state/request.ts';

test('texture timelines respect frame durations and interpolation while quantities stay exact', () => {
  const texture = { frames: [{ ticks: 2 }, { ticks: 1 }, { ticks: 3 }], interpolate: true };
  assert.deepEqual(frameAt(texture, 75), { index: 0, next: 1, blend: 0.75 });
  assert.deepEqual(frameAt(texture, 100), { index: 1, next: 2, blend: 0 });
  assert.deepEqual(frameAt(texture, 300), { index: 0, next: 1, blend: 0 });
  assert.equal(frameAt({ ...texture, interpolate: false }, 75).blend, 0);
  const clip = [{ ticks: 10 }, { ticks: 30 }, { ticks: 160 }];
  assert.equal(stepAt(clip, 499).index, 0);
  assert.equal(stepAt(clip, 500).index, 1);
  assert.equal(stepAt(clip, 10000).index, 0);
  assert.equal(stepAt(clip, -1).index, 0);
  assert.throws(() => stepAt([], 0), /时间线/);
  assert.throws(() => stepAt(clip, Number.NaN), /时间线/);
  let frame, subscriptions = 0, stopped = 0;
  const playback = new Playback(listener => { frame = listener; subscriptions++; return () => { stopped++; }; });
  let first, second;
  const releaseFirst = playback.subscribe(time => { first = time; });
  frame(100); frame(150);
  const releaseSecond = playback.subscribe(time => { second = time; });
  assert.equal(first, 50); assert.equal(second, 50); assert.equal(subscriptions, 1);
  playback.playing = false; assert.equal(stopped, 1);
  playback.playing = true; frame(1000); frame(1050);
  assert.equal(first, 100); assert.equal(second, 100);
  releaseFirst(); releaseSecond(); assert.equal(stopped, 2);
  playback.close(); assert.equal(stopped, 2);
  assert.equal(amount('9007199254740993'), '9,007,199,254,740,993');
  assert.equal(ticks('21'), '1.05 s');
  assert.equal(chance({ numerator: '1', denominator: '3' }), '1/3 · ≈33.33%');
  assert.equal(chance({ numerator: '0', denominator: '1' }), '0%');
});

test('request replacement and component disposal prevent late results from changing the page', async () => {
  const scope = effectScope(), request = scope.run(useRequest);
  let resolveFirst, resolveLast;
  const first = request.run(() => new Promise(resolve => { resolveFirst = resolve; }));
  await request.run(async () => 'current');
  resolveFirst('stale');
  await first;
  assert.equal(request.value.value, 'current');
  const last = request.run(() => new Promise(resolve => { resolveLast = resolve; }));
  scope.stop();
  resolveLast('after disposal');
  await last;
  assert.equal(request.value.value, 'current');
  assert.equal(request.loading.value, false);
});

test('decoded atlas pages are shared, pinned while in use, bounded and closed with the session', async context => {
  const buffers = Array.from({ length: 4 }, (_, index) => Buffer.from([index]));
  const files = buffers.map(bytes => {
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    return { path: 'textures/' + sha256 + '.webp', kind: 'image', bytes: bytes.length, sha256 };
  });
  let calls = 0, closed = 0;
  context.mock.method(globalThis, 'fetch', async url => {
    calls++;
    return new Response(buffers[files.findIndex(file => String(url).endsWith(file.path))]);
  });
  const original = Object.getOwnPropertyDescriptor(globalThis, 'createImageBitmap');
  Object.defineProperty(globalThis, 'createImageBitmap', { configurable: true, value: async () => {
    let disposed = false;
    return { width: 4096, height: 4096, close() { assert.equal(disposed, false); disposed = true; closed++; } };
  } });
  context.after(() => {
    if (original) Object.defineProperty(globalThis, 'createImageBitmap', original);
    else delete globalThis.createImageBitmap;
  });
  const atlas = new Atlas({ files }, 'http://localhost/assets/catalog', new AbortController().signal);
  const [first, duplicate] = await Promise.all([atlas.acquire(files[0].path), atlas.acquire(files[0].path)]);
  assert.equal(first.image, duplicate.image);
  assert.equal(calls, 1);
  const second = await atlas.acquire(files[1].path);
  const loading = await Promise.allSettled([atlas.acquire(files[2].path), atlas.acquire(files[3].path)]);
  const loaded = loading.filter(result => result.status === 'fulfilled');
  const failed = loading.findIndex(result => result.status === 'rejected');
  assert.equal(loaded.length, 1);
  assert.notEqual(failed, -1);
  assert.match(loading[failed].reason.message, /内存预算/);
  const third = loaded[0].value;
  assert.equal(closed, 1);
  first.release(); first.release(); duplicate.release();
  const fourth = await atlas.acquire(files[failed + 2].path);
  assert.equal(closed, 2);
  atlas.close();
  assert.equal(closed, 5);
  second.release(); third.release(); fourth.release();
  await assert.rejects(atlas.acquire(files[0].path), { name: 'AbortError' });
});
