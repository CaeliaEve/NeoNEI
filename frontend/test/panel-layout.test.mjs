import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';

const result = await build({entryPoints:['src/state/panel-layout.ts'], bundle:true, platform:'node', format:'esm', write:false});
const {readPanelLayout, panelBounds, clampPanelSize, historyRowCount} = await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));

test('resize controls default off for existing layouts and only reopen after explicit opt-in', () => {
  assert.equal(readPanelLayout(null).resizeEnabled, false);
  const old = readPanelLayout('{"browserWidth":480,"historyHeight":220}');
  assert.equal(old.resizeEnabled, false);
  assert.equal(old.browserWidth, 480);
  assert.equal(old.historyHeight, 220);
  assert.equal(readPanelLayout('{"resizeEnabled":true}').resizeEnabled, true);
  const disabled = readPanelLayout('{"resizeEnabled":false,"browserWidth":480,"historyHeight":220}');
  assert.equal(disabled.resizeEnabled, false);
  assert.equal(disabled.browserWidth, 480);
  assert.equal(disabled.historyHeight, 220);
  assert.equal(readPanelLayout('{"resizeEnabled":"true"}').resizeEnabled, false);
});

test('saved panel geometry rejects corrupt values without losing the other preference', () => {
  assert.deepEqual(readPanelLayout('{"browserWidth":480,"historyHeight":220}'), {browserWidth:480, historyHeight:220, resizeEnabled:false});
  assert.deepEqual(readPanelLayout('{"browserWidth":-1,"historyHeight":220}'), {browserWidth:null, historyHeight:220, resizeEnabled:false});
  assert.deepEqual(readPanelLayout('{"browserWidth":"480","historyHeight":null}'), {browserWidth:null, historyHeight:null, resizeEnabled:false});
  assert.deepEqual(readPanelLayout('broken'), {browserWidth:null, historyHeight:null, resizeEnabled:false});
});

test('a preference survives a small window and leaves usable recipe and browser space', () => {
  const large = panelBounds(1440, 900, 50), small = panelBounds(375, 400, 50);
  const preferred = 700;
  assert.equal(clampPanelSize(preferred, large.browser), preferred);
  assert.ok(clampPanelSize(preferred, small.browser) <= 375 - 150);
  assert.ok(small.browser.min <= small.browser.max);
  assert.ok(clampPanelSize(1, small.browser) <= 375 * .44);
  assert.ok(small.history.max <= 400 - 180);
  assert.equal(clampPanelSize(preferred, large.browser), preferred);
});

test('growing history reveals full extra rows and respects the current pixel size', () => {
  assert.equal(historyRowCount(152, 50), 2);
  assert.equal(historyRowCount(260, 50), 4);
  assert.equal(historyRowCount(260, 56), 3);
  assert.equal(historyRowCount(96, 50), 1);
});
