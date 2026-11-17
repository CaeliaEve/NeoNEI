import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';

const result = await build({entryPoints:['src/browser/page-buffer.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {createPageBuffer} = await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));

function harness() {
  const work = new Map(), released = [], failures = [];
  let visible = 'initial';
  const buffer = createPageBuffer((page,signal) => new Promise((resolve,reject) => {
    work.set(page,{signal,complete:()=>resolve({value:page,dispose:()=>released.push(page)}),reject});
  }), value => {visible=value;}, error => failures.push(error.message));
  return {buffer,work,released,failures,visible:()=>visible};
}

// Catch publishing a list before its static first frames are actually ready.
test('the complete visible page remains usable until the next page is prepared', async () => {
  const h=harness(), first=h.buffer.stage('page 1');
  assert.equal(h.visible(),'initial');
  h.work.get('page 1').complete(); await first;
  const second=h.buffer.stage('page 2');
  assert.equal(h.visible(),'page 1');
  assert.deepEqual(h.released,[]);
  h.work.get('page 2').complete(); await second;
  assert.equal(h.visible(),'page 2');
  assert.deepEqual(h.released,['page 1']);
  h.buffer.close();
  assert.deepEqual(h.released,['page 1','page 2']);
});

// Catch a late result replacing the latest wheel target or leaking its buffers.
test('fast navigation commits only the latest target and releases obsolete preparation', async () => {
  const h=harness(), old=h.buffer.stage('page 2'), latest=h.buffer.stage('page 20');
  assert.equal(h.work.get('page 2').signal.aborted,true);
  h.work.get('page 20').complete(); await latest;
  h.work.get('page 2').complete(); await old;
  assert.equal(h.visible(),'page 20');
  assert.deepEqual(h.released,['page 2']);
  h.buffer.close();
});

// Catch errors blanking the visible page and canceled work reporting false failures.
test('failure retains the visible page, and cancellation releases late buffers quietly', async () => {
  const h=harness(), first=h.buffer.stage('page 1');
  h.work.get('page 1').complete(); await first;
  const failure=h.buffer.stage('bad page');
  h.work.get('bad page').reject(new Error('texture unavailable')); await failure;
  assert.equal(h.visible(),'page 1');
  assert.deepEqual(h.released,[]);
  assert.deepEqual(h.failures,['texture unavailable']);
  const canceled=h.buffer.stage('canceled page'); h.buffer.cancel();
  h.work.get('canceled page').complete(); await canceled;
  assert.equal(h.visible(),'page 1');
  assert.deepEqual(h.released,['canceled page']);
  assert.deepEqual(h.failures,['texture unavailable']);
  h.buffer.close();
});
