const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { canonical, assertManifest } = require('@elysium/contracts');
const { quantityBounds } = require('@neonei/catalog');
const { createApp } = require('../src/app');

const fixture = path.resolve(__dirname, '../../fixtures/catalog');
const digest = value => createHash('sha256').update(value).digest('hex');
const json = async file => JSON.parse(await fs.readFile(file, 'utf8'));

async function copy(context) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'neonei-catalog-'));
  context.after(async () => {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    await fs.rm(root, { recursive: true, force: true });
  });
  await fs.cp(fixture, root, { recursive: true });
  return root;
}

async function serve(context, catalog = fixture) {
  const server = await new Promise((resolve, reject) => {
    const listener = createApp({ catalog }).listen(0, '127.0.0.1', () => resolve(listener));
    listener.once('error', reject);
  });
  context.after(() => new Promise((resolve, reject) => {
    server.closeAllConnections();
    server.close(error => error ? reject(error) : resolve());
  }));
  return `http://127.0.0.1:${server.address().port}`;
}

async function get(base, endpoint, status = 200) {
  const response = await fetch(base + endpoint);
  assert.equal(response.status, status, endpoint);
  return response;
}

test('compiled catalog supports NEI order, pinyin, pagination, groups and exact recipe data', async context => {
  const base = await serve(context);
  const manifest = await (await get(base, '/api/catalog')).json();
  const api = `/api/catalog/${manifest.id}`;
  const first = await (await get(base, api + '/items?limit=1')).json();
  const second = await (await get(base, api + '/items?limit=1&offset=2')).json();
  assert.equal(first.total, 37);
  assert.equal(first.rows[0].kind, 'item');
  assert.equal(second.rows[0].kind, 'fluid');
  assert.ok(first.textures[0].frames.length);
  assert.equal((await (await get(base, api + '/items?query=shitou')).json()).rows[0].id, first.rows[0].id);
  assert.equal((await (await get(base, api + '/items?kind=fluid&mod=minecraft')).json()).total, 0);
  const facets = await (await get(base, api + '/facets')).json();
  assert.deepEqual(facets.mods, [{ id: 'BiblioCraft', count: 1 }, { id: 'ProjRed|Core', count: 1 }, { id: 'fixture', count: 27 }, { id: 'minecraft', count: 5 }]);
  for (const [registry, mod, query] of [
    ['BiblioCraft:Armor Stand', 'BiblioCraft', 'Armor Stand'],
    ['ProjRed|Core:projectred.core.part', 'ProjRed|Core', 'projectred.core.part'],
    ['Liquid Crystal', '', 'Liquid Crystal'],
  ]) {
    const found = await (await get(base, api + '/items?' + new URLSearchParams({ mod, query }))).json();
    assert.equal(found.total, 1);
    assert.equal(found.rows[0].registry, registry);
    const kind = found.rows[0].kind === 'item' ? 'items' : 'fluids';
    const record = await (await get(base, api + '/records/' + kind + '/' + found.rows[0].id)).json();
    assert.equal(record.registry, registry);
  }
  assert.equal(facets.groups[0].id, first.rows[0].group);
  const uses = await (await get(base, api + '/recipes?direction=uses&item=' + first.rows[0].id)).json();
  const recipe = uses.rows[0];
  assert.equal(recipe.inputs[0].choices[0].amount, '9007199254740993');
  assert.deepEqual(recipe.inputs[0].choices.map(choice => [choice.amount, choice.consume.kind]),
    [['9007199254740993', 'consume'], ['7', 'consume'], ['1', 'keep']]);
  assert.equal(new Set(recipe.inputs[0].choices.map(choice => choice.id)).size, 1);
  assert.equal(recipe.outputs[1].amount, null);
  assert.deepEqual(quantityBounds(recipe, recipe.outputs[1]), [70n, 98n]);
  assert.deepEqual(quantityBounds(recipe, recipe.outputs[2]), [1n, 10n]);
  assert.deepEqual(quantityBounds(recipe, recipe.outputs[3]), [1n, 20n]);
  const zeroPotential = structuredClone(recipe);
  zeroPotential.outputs[1].quantity = { kind: 'potential', stat: 'forestry.yield', condition: 'canBearFruit=false', sample: '0', nominal: '0' };
  assert.deepEqual(quantityBounds(zeroPotential, zeroPotential.outputs[1]), [0n, 0n]);
  const large = structuredClone(recipe);
  large.inputs.find(input => input.kind === 'fluid').choices[0].amount = '9007199254740993';
  assert.deepEqual(quantityBounds(large, large.outputs[1]), [9007199254740963n, 9007199254740991n]);
  const cyclic = structuredClone(recipe); cyclic.outputs[3].quantity.after = [3];
  assert.throws(() => quantityBounds(cyclic, cyclic.outputs[3]), /循环/);
  const incomplete = structuredClone(recipe); incomplete.outputs[1].quantity.after = [2];
  assert.throws(() => quantityBounds(incomplete, incomplete.outputs[1]), /全部随机产出/);
  const exhausted = structuredClone(recipe); exhausted.inputs.find(input => input.kind === 'fluid').choices[0].amount = '2';
  assert.throws(() => quantityBounds(exhausted, exhausted.outputs[1]), /耗尽/);
  assert.equal(recipe.energy, '9223372036854775807');
  assert.deepEqual(recipe.outputs[0].chance, { numerator: '1', denominator: '3' });
  assert.ok(uses.related.items.length && uses.related.fluids.length && uses.related.views.length && uses.related.strings.length);
  const clip = uses.related.views.flatMap(view => view.elements).find(element => element.kind === 'clip');
  assert.ok(clip && uses.related.textures.some(texture => texture.id === clip.asset));
  assert.equal(uses.related.tracks.length, 1);
  assert.equal(uses.related.tracks[0].id, clip.track);
  assert.equal(uses.related.tracks[0].frames.reduce((sum, frame) => sum + frame.ticks, 0), 16);
  const water = await (await get(base, api + '/items?kind=fluid&query=water')).json();
  const producers = await (await get(base, api + '/recipes?item=' + water.rows[0].id)).json();
  assert.equal(producers.rows[0].id, recipe.id);
  const detail = await (await get(base, api + '/recipes/' + recipe.id)).json();
  assert.deepEqual(detail.recipe, recipe);
  const paper = await (await get(base, api + '/items?query=paper')).json();
  const magic = await (await get(base, api + '/recipes?item=' + paper.rows[0].id)).json();
  assert.equal(magic.total, 4);
  assert.ok(magic.related.topics.some(topic => topic.kind === 'aspect'));
  assert.ok(magic.related.topics.some(topic => topic.kind === 'research'));
  const arcane = magic.rows.find(row => row.source.key === 'arcane');
  assert.deepEqual(arcane.grid.cells, [0, null, null, null]);
  assert.equal(arcane.inputs[0].choices[1].rule.exclusive, true);
  assert.equal(arcane.magic.research[0].completed, null);
  for (const [query, key] of [['铭记纸', 'imprint'], ['继承法袍', 'inherit'], ['记忆法袍', 'copy'], ['筛选法袍', 'filter']]) {
    const item = (await (await get(base, api + '/items?query=' + encodeURIComponent(query))).json()).rows[0];
    const result = await (await get(base, api + '/recipes?item=' + item.id)).json();
    const recipe = result.rows.find(recipe => recipe.source.key === key);
    assert.ok(recipe, 'Derived result was omitted from reverse lookup');
    const change = recipe.outputs[0].change;
    assert.equal(change.samples[1].id, item.id);
    assert.ok(change.samples.every(sample => result.related.items.some(item => item.id === sample.id)));
    const record = result.related.items.find(record => record.id === item.id);
    if (key === 'imprint') { assert.equal(record.meta, 3); assert.equal(record.nbt.value.mark.value, '1'); }
    if (key === 'inherit') {
      assert.equal(record.nbt.value.display.value.Color.value, '9');
      assert.deepEqual(record.nbt.value.notes.value.map(tag => tag.value), ['base', 'source']);
      assert.equal(record.nbt.value.empty.element, 'end');
      assert.equal(record.nbt.value.conflict.value, 'keep');
    }
    if (key === 'copy') { assert.equal(record.meta, 7); assert.equal(record.nbt.value.display.value.Color.value, '8'); }
    if (key === 'filter') assert.equal(record.nbt.value.energy, undefined);
    else assert.equal(record.nbt.value.energy.value, '9007199254740993');
  }
  assert.equal((await (await get(base, api + '/recipes?item=' + first.rows[0].id)).json()).total, 0);
  const wand = (await (await get(base, api + '/items?query=' + encodeURIComponent('充能法杖'))).json()).rows[0];
  const replacements = await (await get(base, api + '/recipes?direction=uses&item=' + wand.id)).json();
  assert.equal(replacements.total, 4);
  const core = replacements.rows.find(recipe => recipe.source.key === 'wand_core');
  assert.equal(core.inputs.length, 8);
  assert.ok(core.inputs.every(input => input.choices.every(choice => choice.amount === '1' && choice.returns.length === 0)));
  assert.deepEqual(core.inputs[0].choices[0].rule, { kind: 'tags', meta: true, keys: ['cap', 'rod'], present: [], absent: ['sceptre'] });
  assert.equal(core.magic.payment.capacity, 400);
  assert.ok(Object.keys(core.magic.payment.charges).every(id => replacements.related.topics.some(topic => topic.id === id)));
  const coreResult = replacements.related.items.find(item => item.id === core.outputs[0].change.samples[1].id);
  assert.equal(coreResult.meta, 23);
  assert.equal(coreResult.nbt.value.fire.value, '-4');
  assert.equal(coreResult.nbt.value.air.value, '5');
  assert.equal(coreResult.nbt.value.owner.value, '9007199254740993');
  const cap = replacements.rows.find(recipe => recipe.source.key === 'wand_caps');
  assert.equal(cap.inputs.length, 3);
  assert.equal(cap.magic.payment.capacity, 800);
  assert.equal(replacements.related.items.find(item => item.id === cap.outputs[0].id).nbt.value.fire.value, '900', 'external power must not subtract or clamp the input charge');
  const creative = replacements.rows.find(recipe => recipe.source.key === 'wand_creative');
  assert.ok(creative.magic.creative && creative.magic.aspects.length === 0);
  const staff = (await (await get(base, api + '/items?query=' + encodeURIComponent('零值双用杖'))).json()).rows[0];
  const staffRecipes = await (await get(base, api + '/recipes?direction=uses&item=' + staff.id)).json();
  const staffRecipe = staffRecipes.rows[0];
  assert.deepEqual(staffRecipe.inputs[0].choices[0].rule.present, ['sceptre']);
  assert.equal(staffRecipe.magic.payment, null);
  const staffResult = staffRecipes.related.items.find(item => item.id === staffRecipe.outputs[0].id);
  assert.equal(staffResult.nbt.value.sceptre.value, '0');
  assert.equal(staffResult.nbt.value.AttributeModifiers.value.length, 1);
  assert.equal(staffResult.nbt.value.AttributeModifiers.value[0].value.Name.value, 'Weapon modifier');
  const materials = await (await get(base, api + '/topics?kind=material&query=hejin')).json();
  assert.equal(materials.total, 1);
  const material = await (await get(base, api + '/materials/' + materials.rows[0].id)).json();
  assert.equal(material.material.components[0].amount, '9007199254740993');
  assert.equal(material.components[0].id, material.material.components[0].material);
  assert.equal(material.material.parts[0].content.denominator, '9');
  assert.ok(material.related.items.length && material.related.fluids.length && material.related.textures.length);
  const circuits = await (await get(base, api + '/topics?kind=circuit&item=' + first.rows[0].id)).json();
  assert.equal(circuits.total, 1);
  const circuit = await (await get(base, api + '/circuits/' + circuits.rows[0].id)).json();
  assert.equal(circuit.circuit.steps[0].tier.voltage, '32');
  assert.equal((await (await get(base, api + '/topics?kind=circuit&item=' + second.rows[0].id)).json()).total, 0);
  const bees = await (await get(base, api + '/topics?kind=bee&item=' + first.rows[0].id)).json();
  assert.equal(bees.total, 2);
  const hybrid = bees.rows.find(row => row.terms.includes('zajiaofeng'));
  assert.ok(hybrid);
  const species = await (await get(base, api + '/species/' + hybrid.id)).json();
  assert.deepEqual(species.species.products[0].chance, { numerator: '3', denominator: '10' });
  assert.equal(species.species.genes[0].value, null);
  assert.equal(species.origins, 2);
  assert.equal(species.crosses, 1);
  assert.ok(species.related.items.length && species.related.strings.length && species.related.textures.length);
  const endpoint = api + '/species/' + hybrid.id + '/mutations';
  const parentPage = await (await get(base, endpoint + '?limit=1')).json();
  const nextParents = await (await get(base, endpoint + '?offset=1&limit=1')).json();
  assert.equal(parentPage.total, 2);
  assert.equal(parentPage.rows.length, 1);
  assert.notEqual(parentPage.rows[0].id, nextParents.rows[0].id);
  const paths = [...parentPage.rows, ...nextParents.rows];
  assert.ok(paths.some(row => row.chance.numerator === '3' && row.chance.denominator === '40'));
  assert.equal(paths[0].genes[0].allele, 'fixture.fast');
  assert.ok(parentPage.species.some(row => row.id === hybrid.id));
  assert.ok(parentPage.related.strings.some(row => row.text === 'Fixture warm biome condition'));
  const crossed = await (await get(base, endpoint + '?direction=crosses')).json();
  assert.equal(crossed.total, 1);
  const trees = await (await get(base, api + '/topics?kind=tree&query=shumu')).json();
  const tree = await (await get(base, api + '/species/' + trees.rows[0].id)).json();
  assert.equal(tree.species.products[0].chance, null);
  assert.equal(tree.species.fruitCompatible, false);
  assert.equal(tree.origins, 0);
  await get(base, endpoint + '?direction=unknown', 400);
  await get(base, endpoint + '?limit=0', 400);
  await get(base, api + '/topics?kind=unknown', 400);
  const structures = await (await get(base, api + '/topics?kind=structure&query=duofangkuai&item=' + first.rows[0].id)).json();
  assert.equal(structures.total, 1);
  const structurePath = api + '/structures/' + structures.rows[0].id;
  const structure = await (await get(base, structurePath)).json();
  assert.deepEqual(structure.structure.pieces[0].anchors, [[1, 1, 0]]);
  assert.ok(structure.related.items.length && structure.related.strings.length);
  const shapes = [];
  for (let offset = 0; offset < 3; offset++) {
    const page = await (await get(base, structurePath + '/shapes?piece=main&limit=1&offset=' + offset)).json();
    assert.equal(page.total, 3); assert.equal(page.rows.length, 1);
    assert.equal(page.rows[0].id, structure.structure.pieces[0].chunks[offset]);
    shapes.push(...page.rows[0].cells);
  }
  assert.equal(shapes.length, 26);
  assert.ok(shapes.some(cell => cell.index === 1 && cell.at.join() === '1,1,1'));
  assert.deepEqual(structure.structure.variants.map(variant => variant.probe), [{ count: 1, channels: {} }, { count: 4, channels: { coil: 2 } }]);
  for (const [index, variant] of structure.structure.variants.entries()) {
    const built = await (await get(base, api + '/builds/' + variant.build)).json();
    assert.deepEqual(built.build.probe, variant.probe);
    assert.equal(variant.problem, null);
    assert.equal(built.build.cells, index === 0 ? 26 : 34);
    assert.equal(built.build.rendered, true);
    assert.deepEqual(built.build.size, [3, 3, index === 0 ? 3 : 4]);
    assert.deepEqual(built.build.controller, [1, 1, 0]);
    assert.deepEqual(built.build.origin, [-1, 65, 0]);
    assert.equal(built.blocks.find(block => block.registry === 'fixture:controller').nbt.value.energy.value, '9007199254740993');
    assert.equal(built.blocks.find(block => block.registry === 'fixture:controller').meta, 65535);
    const builtShapes = await (await get(base, api + '/builds/' + built.build.id + '/shapes')).json();
    assert.equal(builtShapes.rows.flatMap(shape => shape.cells).length, built.build.cells);
    assert.ok(builtShapes.rows.flatMap(shape => shape.cells).some(cell => cell.index === 1 && cell.at.join() === '1,1,0'));
    const models = await (await get(base, api + '/builds/' + built.build.id + '/models?limit=1')).json();
    assert.equal(models.total, index === 0 ? 2 : 3); assert.equal(models.rows.length, 1);
    assert.equal(models.rows[0].id, built.build.palette[0].model);
    assert.equal(models.rows[0].faces.length, 6);
    assert.ok(models.rows[0].faces.every(face => models.textures.some(texture => texture.id === face.texture)));
    const panel = await (await get(base, api + '/builds/' + built.build.id + '/models?offset=1&limit=1')).json();
    assert.equal(panel.rows[0].id, built.build.palette[1].model);
    assert.ok(panel.rows[0].faces.some(face => face.pass === 'blend' && face.vertices[0].color === 0x4be8db80));
    if (index === 1) {
      const hidden = await (await get(base, api + '/builds/' + built.build.id + '/models?offset=2&limit=1')).json();
      assert.equal(hidden.rows[0].hidden, true); assert.equal(hidden.rows[0].faces.length, 0); assert.equal(hidden.textures.length, 0);
    }
  }
  await get(base, structurePath + '/shapes?piece=missing', 404);
  await get(base, structurePath + '/shapes?piece=main&limit=0', 400);
  await get(base, api + '/builds/' + structure.structure.variants[0].build + '/models?limit=0', 400);
  const itemAspects = await (await get(base, api + '/items/' + first.rows[0].id + '/aspects')).json();
  assert.equal(itemAspects.item.aspects[0].amount, '3');
  assert.equal(itemAspects.aspects[0].kind, 'aspect');
  const aspect = await (await get(base, api + '/aspects/' + itemAspects.aspects[0].id)).json();
  assert.equal(aspect.aspect.components.length, 2);
  assert.equal(aspect.aspect.discovered, false);
  assert.ok(aspect.related.textures.length);
  const studies = await (await get(base, api + '/topics?kind=research&query=lianjin')).json();
  assert.equal(studies.total, 1);
  const study = await (await get(base, api + '/research/' + studies.rows[0].id)).json();
  assert.equal(study.research.completed, false);
  assert.equal(study.research.parents[0].completed, null);
  assert.equal(study.research.hiddenParents[0].key, '@fixture_scanned');
  assert.equal(study.research.hiddenParents[0].id, null);
  const portal = study.research.itemTriggers.find(clue => clue.registry === 'minecraft:portal');
  assert.equal(portal.meta, 32767);
  assert.deepEqual(portal.matches, []);
  assert.equal(study.research.itemTriggers.find(clue => clue.registry === 'fixture:tagged').nbt.value.energy.value, '9223372036854775807');
  assert.ok(!study.related.items.some(item => item.registry === 'minecraft:portal'));
  assert.ok(study.references.some(row => row.kind === 'aspect'));
});

test('real HTTP cache headers follow immutable content and retired APIs do not exist', async context => {
  const base = await serve(context);
  const response = await get(base, '/api/catalog');
  const manifest = await response.json();
  assert.equal(response.headers.get('cache-control'), 'no-cache');
  const unchanged = await fetch(base + '/api/catalog', { headers: { 'if-none-match': 'W/' + response.headers.get('etag') } });
  assert.equal(unchanged.status, 304);
  assert.equal(await unchanged.text(), '');
  const file = manifest.files.find(file => file.kind === 'image');
  const image = await get(base, `/assets/${manifest.id}/${file.path}`);
  assert.match(image.headers.get('cache-control'), /immutable/);
  assert.equal(image.headers.get('content-type'), 'image/webp');
  assert.equal(digest(Buffer.from(await image.arrayBuffer())), file.sha256);
  assert.equal((await fetch(base + `/assets/${manifest.id}/${file.path}`, { headers: { 'if-none-match': '*' } })).status, 304);
  for (const endpoint of ['/api/v1/health', '/runtime/manifest', '/api/patterns']) await get(base, endpoint, 404);
  for (const suffix of ['/items?limit=0', '/items?offset=-1', '/items?query=a&query=b', '/items?kind=unknown', '/recipes']) {
    const bad = await get(base, `/api/catalog/${manifest.id}${suffix}`, 400);
    assert.equal((await bad.json()).error.code, 'invalid_query');
    assert.equal(bad.headers.get('cache-control'), 'no-store');
  }
  await get(base, `/assets/${manifest.id}/private.json`, 404);
});

test('publishing a new pointer leaves existing snapshot URLs pinned to the original data', async context => {
  const root = await copy(context);
  const base = await serve(context, root);
  const before = await get(base, '/api/catalog');
  const original = await before.json();
  const { id, ...content } = original;
  content.source = digest('another source snapshot');
  const next = { id: digest(canonical(content)), ...content };
  const target = path.join(root, 'catalogs', next.id);
  await fs.cp(path.join(root, 'catalogs', id), target, { recursive: true });
  await fs.writeFile(path.join(target, 'manifest.json'), JSON.stringify(next));
  await fs.writeFile(path.join(root, 'current.json'), JSON.stringify({ format: 'elysium.catalog-pointer', revision: original.revision, id: next.id }));
  const current = await fetch(base + '/api/catalog', { headers: { 'if-none-match': before.headers.get('etag') } });
  assert.equal(current.status, 200);
  assert.equal((await current.json()).id, next.id);
  assert.equal((await (await get(base, '/api/catalog/' + id)).json()).source, original.source);
  assert.equal((await (await get(base, '/api/catalog/' + next.id)).json()).source, next.source);
});

test('invalid pointers, damaged tables and missing declared files fail explicitly', async context => {
  const root = await copy(context);
  const pointer = await json(path.join(root, 'current.json'));
  const manifest = await json(path.join(root, 'catalogs', pointer.id, 'manifest.json'));
  assert.throws(() => assertManifest({ ...manifest, revision: 1 }), 'retired catalog revisions must fail shared schema validation');
  await fs.writeFile(path.join(root, 'current.json'), '{');
  const broken = await serve(context, root);
  assert.equal((await (await get(broken, '/api/catalog', 422)).json()).error.code, 'invalid_catalog');
  assert.equal((await (await get(broken, '/api/health', 503)).json()).status, 'unavailable');
  await fs.writeFile(path.join(root, 'current.json'), JSON.stringify({ ...pointer, revision: 1 }));
  await get(broken, '/api/catalog', 422);
  await fs.writeFile(path.join(root, 'current.json'), JSON.stringify(pointer));
  const table = manifest.files.find(file => file.kind === 'browse');
  const tablePath = path.join(root, 'catalogs', pointer.id, table.path);
  const contents = await fs.readFile(tablePath);
  contents[contents.length - 1] ^= 1;
  await fs.writeFile(tablePath, contents);
  const damaged = await serve(context, root);
  assert.equal((await (await get(damaged, `/api/catalog/${pointer.id}/items`, 422)).json()).error.code, 'invalid_catalog');
  contents[contents.length - 1] ^= 1;
  await fs.writeFile(tablePath, contents);
  const repaired = await (await get(damaged, `/api/catalog/${pointer.id}/items`)).json();
  assert.equal(repaired.total, 37, 'a failed memoized read must be retryable after repair');
  const recipes = manifest.files.find(file => file.kind === 'recipes');
  const recipePath = path.join(root, 'catalogs', pointer.id, recipes.path);
  const recipeBytes = await fs.readFile(recipePath);
  recipeBytes[0] ^= 1;
  await fs.writeFile(recipePath, recipeBytes);
  const search = `/api/catalog/${pointer.id}/recipes?direction=uses&item=${repaired.rows[0].id}`;
  const filtered = await (await get(damaged, search + '&query=not-a-fixture-name')).json();
  assert.equal(filtered.total, 0, 'filtering must not load an off-page recipe payload');
  assert.equal(filtered.categories[0].count, 1);
  const materialFile = manifest.files.find(file => file.kind === 'materials');
  const materialPath = path.join(root, 'catalogs', pointer.id, materialFile.path);
  const materialBytes = await fs.readFile(materialPath);
  materialBytes[0] ^= 1;
  await fs.writeFile(materialPath, materialBytes);
  const topics = await (await get(damaged, `/api/catalog/${pointer.id}/topics?kind=material&query=hejin`)).json();
  assert.equal(topics.total, 1, 'topic listings must not decode full material records');
  await get(damaged, `/api/catalog/${pointer.id}/materials/${topics.rows[0].id}`, 422);
  for (const kind of ['species', 'mutations']) {
    const file = manifest.files.find(file => file.kind === kind);
    const filePath = path.join(root, 'catalogs', pointer.id, file.path);
    const bytes = await fs.readFile(filePath);
    bytes[0] ^= 1;
    await fs.writeFile(filePath, bytes);
  }
  const bees = await (await get(damaged, `/api/catalog/${pointer.id}/topics?kind=bee&query=zajiaofeng`)).json();
  assert.equal(bees.total, 1, 'species lists must only load their compact index');
  const species = `/api/catalog/${pointer.id}/species/${bees.rows[0].id}`;
  const offPage = await (await get(damaged, species + '/mutations?offset=100')).json();
  assert.equal(offPage.total, 2, 'lineage counts must not load off-page mutations');
  assert.deepEqual(offPage.rows, []);
  await get(damaged, species, 422);
  await get(damaged, species + '/mutations', 422);
  const geometry = manifest.files.find(file => file.kind === 'shapes');
  await fs.writeFile(path.join(root, 'catalogs', pointer.id, geometry.path), 'damaged geometry');
  const structures = await (await get(damaged, `/api/catalog/${pointer.id}/topics?kind=structure`)).json();
  const structurePath = `/api/catalog/${pointer.id}/structures/${structures.rows[0].id}`;
  await get(damaged, structurePath);
  const empty = await (await get(damaged, structurePath + '/shapes?piece=main&offset=100')).json();
  assert.equal(empty.total, 3); assert.deepEqual(empty.rows, []);
  await get(damaged, structurePath + '/shapes?piece=main', 422);
  for (const kind of ['aspects', 'research']) {
    const file = manifest.files.find(file => file.kind === kind);
    await fs.writeFile(path.join(root, 'catalogs', pointer.id, file.path), 'damaged magic record');
  }
  const studies = await (await get(damaged, `/api/catalog/${pointer.id}/topics?kind=research&query=lianjin`)).json();
  assert.equal(studies.total, 1, 'research lists must not decode unrelated full records');
  await get(damaged, `/api/catalog/${pointer.id}/research/${studies.rows[0].id}`, 422);
  await get(damaged, search, 422);
  await fs.unlink(tablePath);
  const missing = await serve(context, root);
  assert.equal((await (await get(missing, `/api/catalog/${pointer.id}/items`, 422)).json()).error.code, 'invalid_catalog');
  const absent = await serve(context, path.join(root, 'not-published'));
  assert.equal((await (await get(absent, '/api/catalog', 503)).json()).error.code, 'catalog_missing');
});
