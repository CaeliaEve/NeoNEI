import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import test from 'node:test';
import {Api} from '../../catalog/src/api.ts';
import {Catalog} from '../../catalog/src/store.ts';
import {RecipeSelectionQuery,readRecipeSelectionResult} from '../../catalog/src/recipe-evaluation.ts';

const root=process.env.NEONEI_TEST_CATALOG??resolve('fixtures/semantic-40');
async function open(){
  const pointer=JSON.parse(await readFile(join(root,'current.json'),'utf8'));
  const manifest=JSON.parse(await readFile(join(root,'catalogs',pointer.id,'manifest.json'),'utf8'));
  const catalog=await Catalog.open(manifest,file=>readFile(join(root,'catalogs',manifest.id,file.path)));
  const api=new Api(catalog),page=await api.read(['items'],new URLSearchParams({query:'shitou'}));
  const result=await api.read(['recipes'],new URLSearchParams({item:page.rows[0].id,direction:'uses'}));
  const recipe=result.rows.find(recipe=>recipe.source.handler==='fixture:machine')??result.rows[0];
  assert.ok(recipe,'real catalog fixture must provide a stone recipe');
  return {catalog,recipe};
}

test('bounded selection action returns owned recorded facts through the same local Api',async()=>{
  const {catalog,recipe}=await open(),api=new Api(catalog);
  const request={catalog:catalog.manifest.id,recipe:recipe.id};
  const outcome=await api.read(['recipes',recipe.id,'selection'],new URLSearchParams({selection:JSON.stringify(request)}))
    .catch(error=>({error:error.code}));
  assert.equal(outcome.catalog,catalog.manifest.id,'existing Api has no bounded selection action');
  assert.equal(outcome.recipe,recipe.id);assert.equal(outcome.scope,'recorded-facts');
  assert.deepEqual(readRecipeSelectionResult(outcome,catalog.manifest.id,recipe.id),outcome);
  const direct=await new RecipeSelectionQuery(catalog).evaluate(request);
  assert.deepEqual(direct,outcome);
  assert.ok(Object.isFrozen(direct.state.choices));assert.ok(Object.isFrozen(direct.products[0].output));
  assert.throws(()=>readRecipeSelectionResult(outcome,'b'.repeat(64),recipe.id),/selection/i);
  assert.throws(()=>readRecipeSelectionResult({...outcome,products:[{...outcome.products[0],guaranteed:true}]},
    catalog.manifest.id,recipe.id),/product/i);
  const before=JSON.stringify(request);
  await api.read(['recipes',recipe.id,'selection'],new URLSearchParams({selection:JSON.stringify(request)}));
  assert.equal(JSON.stringify(request),before);
});

test('selection rejects wrong snapshots, corrupt references and recipe-relative malformed parameters',async()=>{
  const {catalog,recipe}=await open(),query=new RecipeSelectionQuery(catalog);
  const request={catalog:catalog.manifest.id,recipe:recipe.id};
  await assert.rejects(()=>query.evaluate({...request,catalog:'b'.repeat(64)}),/snapshot/i);
  await assert.rejects(()=>query.evaluate({...request,choices:[]}),/choices/i);
  await assert.rejects(()=>query.evaluate({...request,choices:recipe.inputs.map(()=>999999)}),/candidate/i);
  await assert.rejects(()=>query.evaluate({...request,mirrored:true}),/mirror/i);
  await assert.rejects(()=>query.evaluate({...request,order:[9999]}),/order/i);
  await assert.rejects(()=>query.evaluate({...request,context:{kind:'enderioEnchanter',count:'1',bookPresent:true}}),/family/i);
  const malformed=structuredClone(recipe);malformed.outputs[0].id='item_missing_reference';
  const damaged=new RecipeSelectionQuery({
    manifest:catalog.manifest,
    record:async(kind,id)=>kind==='recipes'?malformed:catalog.record(kind,id),
    records:(kind,ids)=>catalog.records(kind,ids),
  });
  await assert.rejects(()=>damaged.evaluate(request),/missing|not found|record/i);
  const controller=new AbortController();controller.abort();
  await assert.rejects(()=>query.evaluate(request,controller.signal),{name:'AbortError'});
});

test('selection action rejects duplicate, oversized, unknown and path-mismatched payloads',async()=>{
  const {catalog,recipe}=await open(),api=new Api(catalog),path=['recipes',recipe.id,'selection'];
  const request=JSON.stringify({catalog:catalog.manifest.id,recipe:recipe.id});
  const cases=[
    new URLSearchParams({selection:'{'}),
    new URLSearchParams({selection:'x'.repeat(4097)}),
    new URLSearchParams([['selection',request],['selection',request]]),
    new URLSearchParams({selection:request,unused:'1'}),
    new URLSearchParams({selection:JSON.stringify({catalog:catalog.manifest.id,recipe:'recipe-other'})}),
  ];
  for(const parameters of cases)await assert.rejects(()=>api.read(path,parameters),error=>error.code==='invalid_query');
});

test('typed client selection uses the shared local path, rejects stale responses and retains both abort signals',async()=>{
  const {Catalog:Client}=await import('../src/catalog/client.ts');
  assert.equal(typeof Client.prototype.evaluateSelection,'function','typed client selection method is missing');
  const {catalog,recipe}=await open(),api=new Api(catalog);
  const client=Object.create(Client.prototype);
  const controller=new AbortController();
  let stale=false;
  Object.assign(client,{manifest:catalog.manifest,controller,
    interaction:{ready:Promise.resolve(true),read(){throw new Error('selection must not use the recipe-detail worker shortcut');}},
    local:{async get(endpoint,signal){
      signal.throwIfAborted();
      const url=new URL(endpoint,'http://local'),result=await api.read(url.pathname.split('/').filter(Boolean),url.searchParams);
      signal.throwIfAborted();
      return stale?{...result,catalog:'b'.repeat(64)}:result;
    }},
  });
  const request={catalog:catalog.manifest.id,recipe:recipe.id};
  const result=await client.evaluateSelection(request);
  assert.equal(result.catalog,catalog.manifest.id);
  assert.equal(result.products[0].guaranteed,false);
  stale=true;
  await assert.rejects(()=>client.evaluateSelection(request),error=>error.code==='invalid_response');
  stale=false;
  const caller=new AbortController();caller.abort();
  await assert.rejects(()=>client.evaluateSelection(request,caller.signal),{name:'AbortError'});
  controller.abort();
  await assert.rejects(()=>client.evaluateSelection(request),{name:'AbortError'});
});
