import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';

const result = await build({entryPoints:['src/browser/page-transition.ts'], bundle:true, platform:'node', format:'esm', write:false});
const {createPageTransition} = await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));

function harness() {
  let time = 0, reduced = false;
  const animations = [];
  const grid = {animate(frames, options) {
    let finish, reject;
    const animation = {frames, options, canceled:false,
      finished:new Promise((resolve, fail) => { finish=resolve; reject=fail; }),
      cancel(){this.canceled=true; reject(new Error('canceled'));}, finish(){finish();}};
    animations.push(animation);
    return animation;
  }};
  const transition = createPageTransition({now:()=>time, reducedMotion:()=>reduced});
  return {grid, animations, transition, time:(value)=>{time=value;}, reduced:(value)=>{reduced=value;}};
}

test('fade only a newly presented page; initial load, filters, and same-page updates remain immediate', () => {
  const h = harness();
  h.transition.present(h.grid, 1, 'all');
  h.time(300); h.transition.present(h.grid, 2, 'all');
  assert.equal(h.animations.length, 1);
  assert.ok(h.animations[0].options.duration <= 150);
  assert.ok(h.animations[0].frames[0].opacity > 0);
  assert.equal(h.animations[0].frames.at(-1).opacity, 1);
  assert.ok(h.animations[0].frames.every(frame=>Object.keys(frame).every(key=>key==='opacity')));
  h.time(600); h.transition.present(h.grid, 2, 'all');
  h.time(900); h.transition.present(h.grid, 1, 'iron');
  assert.equal(h.animations.length, 1);
});

test('rapid paging cancels old fades instead of queuing animations, then recovers for isolated clicks', () => {
  const h = harness();
  h.transition.present(h.grid, 1, 'all');
  h.time(300); h.transition.present(h.grid, 2, 'all');
  for(let page=3; page<=12; page++) {
    h.time(300+(page-2)*20); h.transition.present(h.grid, page, 'all');
  }
  assert.equal(h.animations.length, 1);
  assert.equal(h.animations[0].canceled, true);
  h.time(800); h.transition.present(h.grid, 13, 'all');
  assert.equal(h.animations.length, 2);
  h.transition.cancel();
  assert.equal(h.animations[1].canceled, true);
  // A cold target may finish long after the burst; it must still skip a decorative fade.
  h.time(1800); h.transition.present(h.grid, 20, 'all', true);
  assert.equal(h.animations.length, 2);
});

test('reduced motion skips fades, and a completed fade no longer owns an animation', async () => {
  const h = harness();
  h.transition.present(h.grid, 1, 'all');
  h.reduced(true); h.time(300); h.transition.present(h.grid, 2, 'all');
  assert.equal(h.animations.length, 0);
  h.reduced(false); h.time(600); h.transition.present(h.grid, 3, 'all');
  h.animations[0].finish(); await Promise.resolve();
  h.transition.cancel();
  assert.equal(h.animations[0].canceled, false);
});
