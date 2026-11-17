import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import test from 'node:test';
import { build } from 'esbuild';
import { encode } from '@msgpack/msgpack';
import { canonical, collections, formats } from '@elysium/contracts';
import { hash } from '../../catalog/src/store.ts';
import { Local } from '../src/offline/client.ts';

const worker = await build({
  entryPoints: [fileURLToPath(new URL('../src/offline/worker.ts', import.meta.url))],
  bundle: true, write: false, format: 'iife', platform: 'browser',
  external: ['@elysium/*', '@msgpack/msgpack'],
  plugins: [{
    name: 'external-storage',
    setup(build) {
      build.onResolve({ filter: /^\.\/store\.ts$/ }, args => args.importer.endsWith('/offline/worker.ts')
        || args.importer.endsWith('\\offline\\worker.ts') ? { path: 'shelf', namespace: 'external-storage' } : undefined);
      build.onLoad({ filter: /.*/, namespace: 'external-storage' }, () => ({
        contents: 'export const Shelf = {open: async () => globalThis.shelf};',
      }));
    },
  }],
});

function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

async function fixture() {
  const bytes = encode({ kind: 'strings', records: [{ id: 'text_fixture', locale: 'en_US', text: 'Still usable' }] });
  const files = collections.map(kind => ({
    kind, path: `tables/${kind}/part-000000.msgpack`, encoding: 'msgpack',
    bytes: kind === 'strings' ? bytes.length : 1, sha256: 'c'.repeat(64),
    rows: kind === 'strings' ? 1 : 0,
    first: kind === 'strings' ? 'text_fixture' : null, last: kind === 'strings' ? 'text_fixture' : null,
  })).sort((a, b) => a.path.localeCompare(b.path));
  files.find(file => file.kind === 'strings').sha256 = await hash(bytes);
  const content = {
    format: 'elysium.catalog', revision: formats.catalog.revision, compiler: 'fixture',
    source: 'a'.repeat(64), environment: 'b'.repeat(64), scope: 'selection', locale: 'en_US',
    counts: Object.fromEntries(collections.map(kind => [kind, kind === 'strings' ? 1 : 0])), files,
  };
  return { bytes, manifest: { ...content, id: await hash(canonical(content)) } };
}

async function paired(context) {
  const { bytes, manifest } = await fixture();
  const loading = deferred(), started = deferred();
  const listing = deferred(), listStarted = deferred();
  const savedRow = {
    id: manifest.id, revision: manifest.revision, locale: 'en_US', source: '/api', state: 'ready',
    added: 1, saved: 2, files: manifest.files.length, bytes: manifest.files.reduce((sum, file) => sum + file.bytes, 0),
    totalFiles: manifest.files.length, totalBytes: manifest.files.reduce((sum, file) => sum + file.bytes, 0),
    items: 0, recipes: 0, scope: 'selection',
  };
  const shelf = {
    async list() { listStarted.resolve(); await listing.promise; return [savedRow]; },
    async saved() { return { id: manifest.id, revision: manifest.revision, state: 'ready' }; },
    async manifest() { return manifest; },
    async file() { started.resolve(); await loading.promise; return bytes; },
  };
  let transport;
  class PairedWorker extends EventTarget {
    calls = [];
    replies = [];
    held = [];
    hold = false;
    constructor() {
      super();
      transport = this;
      const listeners = [];
      this.scope = {
        location: { origin: 'http://localhost' }, navigator: {},
        addEventListener(type, handler) { if (type === 'message') listeners.push(handler); },
        postMessage: reply => {
          this.replies.push(reply);
          if (this.hold) this.held.push(reply);
          else this.reply(reply);
        },
      };
      this.deliver = call => queueMicrotask(() => listeners.forEach(handler => handler({ data: call })));
      runInNewContext(worker.outputFiles[0].text, {
        self: this.scope, shelf, crypto: webcrypto, URL, URLSearchParams,
        AbortController, DOMException, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer,
        console, setTimeout, clearTimeout, require: createRequire(new URL('../../catalog/package.json', import.meta.url)),
      });
    }
    reply(reply) { queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', { data: reply }))); }
    postMessage(call) { this.calls.push(call); this.deliver(call); }
    terminate() { this.deliver = () => {}; }
  }
  const original = new Map(['window', 'Worker'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { isSecureContext: true, indexedDB: {}, Worker: PairedWorker } });
  Object.defineProperty(globalThis, 'Worker', { configurable: true, value: PairedWorker });
  let local;
  context.after(() => {
    loading.resolve(); listing.resolve(); local?.close();
    for (const [key, value] of original) {
      if (value) Object.defineProperty(globalThis, key, value);
      else delete globalThis[key];
    }
  });
  local = await Local.open(manifest.id);
  return { local, loading, started, transport, listing, listStarted, savedRow };
}

async function within(promise) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('same Local did not complete its next request')), 200); }),
    ]);
  } finally { clearTimeout(timer); }
}

const turn = () => new Promise(resolve => setImmediate(resolve));
function trackedController() {
  const controller = new AbortController(), listeners = new Set();
  const add = controller.signal.addEventListener.bind(controller.signal);
  const remove = controller.signal.removeEventListener.bind(controller.signal);
  controller.signal.addEventListener = (type, listener, options) => {
    if (type === 'abort') listeners.add(listener);
    add(type, listener, options);
  };
  controller.signal.removeEventListener = (type, listener, options) => {
    if (type === 'abort') listeners.delete(listener);
    remove(type, listener, options);
  };
  return { controller, listeners };
}

// Removing the worker's cancellation terminal reply must strand the next public request.
test('the same Local completes a ninth query after eight running queries are cancelled', async context => {
  const { local, loading, started, transport } = await paired(context);
  const controllers = Array.from({ length: 8 }, () => new AbortController());
  const cancelled = controllers.map(controller => local.get('/records/strings/text_fixture', controller.signal));
  const settlements = Promise.allSettled(cancelled);
  await started.promise;
  controllers.forEach(controller => controller.abort());
  const results = await settlements;
  assert.equal(results.length, 8);
  assert.ok(results.every(result => result.status === 'rejected' && result.reason.name === 'AbortError'));
  const next = local.get('/records/strings/text_fixture');
  await turn();
  assert.equal(transport.calls.filter(call => call.operation?.kind === 'query').length, 8,
    'cancelled work must retain capacity until the underlying read finishes');
  loading.resolve();
  assert.deepEqual(await within(next), { id: 'text_fixture', locale: 'en_US', text: 'Still usable' });

  // Replay only genuine worker replies, never manufacture cancellation acknowledgements.
  const terminal = transport.replies.find(reply => 'cancelled' in reply);
  assert.ok(terminal, 'the real worker did not acknowledge cancelled work');
  transport.hold = true;
  const burst = Array.from({ length: 9 }, () => local.get('/records/strings/text_fixture'));
  await turn();
  const dispatched = transport.calls.length;
  transport.reply(terminal); transport.reply(terminal);
  await turn();
  assert.equal(transport.calls.length, dispatched, 'duplicate terminal replies freed another request slot');
  assert.equal(transport.held.length, 8);
  transport.hold = false;
  transport.held.splice(0).forEach(reply => transport.reply(reply));
  const completed = await within(Promise.all(burst));
  assert.equal(completed.length, 9);
  assert.ok(completed.every(value => value.text === 'Still usable'));
});

// Aborting a caller must not abort the Catalog table promise shared with a live caller.
test('cancelling one query leaves a shared catalog read available to another caller', async context => {
  const { local, loading, started } = await paired(context);
  const controller = new AbortController();
  const cancelled = local.get('/records/strings/text_fixture', controller.signal);
  const rejected = assert.rejects(cancelled, { name: 'AbortError' });
  const survivor = local.get('/records/strings/text_fixture');
  await started.promise;
  controller.abort(); await rejected;
  loading.resolve();
  assert.deepEqual(await within(survivor), { id: 'text_fixture', locale: 'en_US', text: 'Still usable' });
});

// The rejection path must settle cancellation when storage fails.
test('cancelled queries release capacity even when their underlying read rejects', async context => {
  const { local, loading, started } = await paired(context);
  const controllers = Array.from({ length: 8 }, () => new AbortController());
  const results = Promise.allSettled(controllers.map(controller => local.get('/records/strings/text_fixture', controller.signal)));
  await started.promise;
  controllers.forEach(controller => controller.abort());
  await results;
  const next = assert.rejects(local.get('/missing-route'), error => error.code === 'not_found');
  loading.reject(new DOMException('storage read aborted', 'AbortError'));
  await within(next);
});

// Removing only the fulfillment-side cancellation send must lose this terminal.
test('a cancelled list sends one terminal after storage succeeds and a live list still returns data', async context => {
  const { local, loading, transport, listing, listStarted, savedRow } = await paired(context);
  const cancelledId = 10000, liveId = 10001;
  transport.postMessage({ id: cancelledId, operation: { kind: 'list' } });
  await listStarted.promise;
  transport.postMessage({ cancel: cancelledId });
  await turn();
  assert.equal(transport.replies.filter(reply => reply.id === cancelledId).length, 0,
    'cancellation must wait for the underlying list operation to finish');
  listing.resolve();
  await turn();
  const cancelled = transport.replies.filter(reply => reply.id === cancelledId);
  assert.equal(cancelled.length, 1, 'a successful underlying list must still send its cancellation terminal');
  assert.equal(cancelled[0].cancelled, true);
  assert.deepEqual(Object.keys(cancelled[0]).sort(), ['cancelled', 'id']);

  transport.postMessage({ id: liveId, operation: { kind: 'list' } });
  await turn();
  const live = transport.replies.filter(reply => reply.id === liveId);
  assert.equal(live.length, 1);
  assert.deepEqual(live[0].value, [savedRow]);
  assert.equal(transport.replies.filter(reply => reply.id === cancelledId).length, 1);
  loading.resolve();
  assert.deepEqual(await within(local.get('/records/strings/text_fixture')),
    { id: 'text_fixture', locale: 'en_US', text: 'Still usable' });
});

// Queued cancellation must remove its listener/queue entry; running cancellation must detach immediately.
test('cancellation detaches abort listeners and never dispatches a cancelled queued query', async context => {
  const { local, loading, started, transport } = await paired(context);
  const running = Array.from({ length: 8 }, trackedController);
  const queries = running.map(({ controller }) => local.get('/records/strings/text_fixture', controller.signal));
  const queued = trackedController();
  queries.push(local.get('/records/strings/text_cancelled_queue', queued.controller.signal));
  const results = Promise.allSettled(queries);
  await started.promise;
  queued.controller.abort();
  running[0].controller.abort();
  assert.equal(queued.listeners.size, 0);
  assert.equal(running[0].listeners.size, 0);
  loading.resolve();
  const settled = await within(results);
  assert.equal(settled.filter(result => result.status === 'fulfilled').length, 7);
  assert.equal(settled.filter(result => result.status === 'rejected').length, 2);
  assert.ok(running.every(({ listeners }) => listeners.size === 0));
  assert.ok(!transport.calls.some(call => call.operation?.endpoint === '/records/strings/text_cancelled_queue'));
});
