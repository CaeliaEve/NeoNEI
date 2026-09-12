import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.argv.length !== 3) throw new Error('Usage: node scripts/check-release.mjs <release-directory>');
const root = fileURLToPath(new URL('../', import.meta.url));
const directory = path.resolve(process.argv[2]);
const files = JSON.parse(await readFile(path.join(directory, 'files.json'), 'utf8'));
assert.ok(Array.isArray(files) && files.length > 0, 'Missing release file inventory');
for (const file of files) {
  assert.ok(typeof file.path === 'string' && !path.isAbsolute(file.path) && !file.path.includes('\\')
    && file.path.split('/').every(part => part && part !== '.' && part !== '..'), 'Invalid release path');
  const bytes = await readFile(path.join(directory, file.path));
  assert.equal(bytes.length, file.bytes, file.path);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.path);
}
const require = createRequire(path.join(directory, 'backend/package.json'));
const { createApp } = require(path.join(directory, 'backend/dist/app.js'));
const app = createApp({ catalog: path.join(root, 'fixtures/catalog'), web: path.join(directory, 'frontend/dist') });
const server = await new Promise((resolve, reject) => {
  const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  listener.once('error', reject);
});
const base = `http://127.0.0.1:${server.address().port}`;
async function get(endpoint) {
  const response = await fetch(base + endpoint, { signal: AbortSignal.timeout(10000) });
  assert.equal(response.status, 200, endpoint);
  return response;
}
try {
  const manifest = await (await get('/api/catalog')).json();
  const api = `/api/catalog/${manifest.id}`;
  const stone = await (await get(api + '/items?query=shitou')).json();
  const recipes = await (await get(api + '/recipes?direction=uses&item=' + stone.rows[0].id)).json();
  const clips = recipes.related.views.flatMap(view => view.elements).filter(element => element.kind === 'clip');
  assert.equal(clips.length, 2);
  assert.equal(recipes.related.tracks.length, 1);
  assert.ok(clips.every(clip => clip.track === recipes.related.tracks[0].id));
  assert.equal(recipes.related.tracks[0].frames.reduce((sum, frame) => sum + frame.ticks, 0), 16);
  const changedItem = (await (await get(api + '/items?query=' + encodeURIComponent('铭记纸'))).json()).rows[0];
  const changed = await (await get(api + '/recipes?item=' + changedItem.id)).json();
  assert.equal(changed.rows[0].outputs[0].change.samples[1].id, changedItem.id);
  const changedRecord = changed.related.items.find(item => item.id === changedItem.id);
  assert.equal(changedRecord.nbt.value.energy.value, '9007199254740993');
  assert.equal(changedRecord.nbt.value.mark.value, '1');
  const wand = (await (await get(api + '/items?query=' + encodeURIComponent('焦点法杖'))).json()).rows[0];
  const replacements = await (await get(api + '/recipes?direction=uses&item=' + wand.id)).json();
  const core = replacements.rows.find(recipe => recipe.source.key === 'wand_core');
  assert.equal(core.inputs.length, 8);
  assert.equal(core.magic.payment.capacity, 400);
  assert.ok(Object.keys(core.magic.payment.charges).every(id => replacements.related.topics.some(topic => topic.id === id)));
  const product = replacements.related.items.find(item => item.id === core.outputs[0].change.samples[1].id);
  assert.equal(product.nbt.value.air.value, '5');
  assert.equal(product.nbt.value.fire.value, '-4');
  const topics = await (await get(api + '/topics?kind=material&query=hejin')).json();
  assert.equal(topics.total, 1);
  const detail = await (await get(api + '/materials/' + topics.rows[0].id)).json();
  assert.equal(detail.material.components[0].amount, '9007199254740993');
  const html = await (await get('/material/' + topics.rows[0].id)).text();
  const script = html.match(/src="(\/web\/[^"\s]+\.js)"/)?.[1];
  assert.ok(script, 'Packaged page has no entry module');
  await get(script);
  assert.equal(await (await get('/offline')).text(), html);
  const worker = await get('/sw.js');
  assert.match(worker.headers.get('content-type'), /javascript/);
  const shell = Buffer.from(await worker.arrayBuffer());
  const declared = files.find(file => file.path === 'frontend/dist/sw.js');
  assert.ok(declared, 'Release has no offline application worker');
  assert.equal(createHash('sha256').update(shell).digest('hex'), declared.sha256);
  for (const file of files.filter(file => file.path.startsWith('frontend/dist/web/') && file.path.endsWith('.js'))) {
    const bytes = Buffer.from(await (await get(file.path.slice('frontend/dist'.length))).arrayBuffer());
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
  }
  const species = await (await get(api + '/topics?kind=bee&query=zajiaofeng')).json();
  const bee = await (await get(api + '/species/' + species.rows[0].id)).json();
  assert.equal(bee.origins, 2);
  const mutations = await (await get(api + '/species/' + species.rows[0].id + '/mutations?limit=1')).json();
  assert.equal(mutations.rows.length, 1);
  assert.equal(mutations.total, 2);
  const speciesHtml = await (await get('/bee/' + species.rows[0].id)).text();
  assert.ok(speciesHtml.includes(script), 'Species deep link does not serve the same application');
  const structures = await (await get(api + '/topics?kind=structure&query=duofangkuai')).json();
  assert.equal(structures.total, 1);
  const structure = await (await get(api + '/structures/' + structures.rows[0].id)).json();
  assert.equal(structure.structure.pieces[0].cells, 26);
  assert.equal(structure.structure.variants.length, 2);
  for (const [index, variant] of structure.structure.variants.entries()) {
    const built = await (await get(api + '/builds/' + variant.build)).json();
    assert.deepEqual(built.build.probe, variant.probe);
    assert.equal(built.build.cells, index === 0 ? 26 : 34);
    assert.equal(built.build.rendered, true);
    assert.equal(built.blocks.find(block => block.registry === 'fixture:controller').nbt.value.energy.value, '9007199254740993');
    const builtShapes = await (await get(api + '/builds/' + built.build.id + '/shapes')).json();
    assert.equal(builtShapes.rows.flatMap(shape => shape.cells).length, built.build.cells);
    const models = await (await get(api + '/builds/' + built.build.id + '/models')).json();
    assert.equal(models.total, index === 0 ? 2 : 3);
    assert.deepEqual(models.rows.map(model => model.id), built.build.palette.map(entry => entry.model));
    assert.ok(models.rows.some(model => model.faces.some(face => face.pass === 'blend')));
  }
  const shapes = await (await get(api + '/structures/' + structures.rows[0].id + '/shapes?piece=main')).json();
  assert.equal(shapes.rows.flatMap(shape => shape.cells).length, 26);
  const structureHtml = await (await get('/structure/' + structures.rows[0].id)).text();
  assert.ok(structureHtml.includes(script), 'Structure deep link does not serve the same application');
  const studies = await (await get(api + '/topics?kind=research&query=lianjin')).json();
  assert.equal(studies.total, 1);
  const research = await (await get(api + '/research/' + studies.rows[0].id)).json();
  assert.equal(research.research.parents[0].completed, null);
  assert.equal(research.research.completed, false);
  const aspects = await (await get(api + '/topics?kind=aspect&query=guang')).json();
  const aspect = await (await get(api + '/aspects/' + aspects.rows[0].id)).json();
  assert.equal(aspect.aspect.components.length, 2);
  const researchHtml = await (await get('/research/' + studies.rows[0].id)).text();
  assert.ok(researchHtml.includes(script), 'Research deep link does not serve the same application');
  const asset = manifest.files.find(file => file.kind === 'image');
  assert.ok(asset, 'Fixture has no texture page');
  const pixels = Buffer.from(await (await get(`/assets/${manifest.id}/${asset.path}`)).arrayBuffer());
  assert.equal(createHash('sha256').update(pixels).digest('hex'), asset.sha256);
  assert.equal((await fetch(base + '/recipe-by-id/removed')).status, 404);
  console.log(JSON.stringify({ path: directory, catalog: manifest.id, files: files.length, status: 'verified' }));
} finally {
  server.closeAllConnections();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
