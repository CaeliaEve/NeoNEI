import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { assertTable } from '@elysium/contracts';
import { Query } from '../../catalog/src/query.ts';

async function specimen(field = 'records') {
  const fixture = JSON.parse(await readFile(new URL('../../../elysium-compiler/contracts/fixtures/aspect-combinations-contract.json', import.meta.url), 'utf8'));
  const aspects = fixture.aspects.map(a => ({...a,name:'text_name',description:'text_description',color:4294967295,icon:null}));
  const definition = fixture[field][0];
  const tables = {aspects,references:fixture[field],
    categories:[{id:'category_fixture',source:definition.data.source,name:'text_category',reference:definition.domain,notes:[],machines:[],icon:null,order:0}],
    strings:['name','description','category'].map(key=>({id:'text_'+key,text:key,locale:'en_US'})),
    topics:aspects.map((a,order)=>({id:a.id,kind:'aspect',name:a.source.key,terms:a.source.key,order,image:null,icon:null}))};
  let scans=0;
  const catalog = {
    async record(kind,id){const row=tables[kind]?.find(r=>r.id===id);assert.ok(row);return row;},
    async records(kind,ids){return [...ids].map(id=>{const row=tables[kind]?.find(r=>r.id===id);assert.ok(row,kind+':'+id);return row;});},
    async *scan(kind){if(kind==='references')scans++;yield* tables[kind]??[];},
  };
  return {fixture,aspects,query:new Query(catalog),get scans(){return scans;}};
}

test('Java aspect knowledge references survive shared query and JSON transport without consuming recipes', async () => {
  const sample=await specimen();
  const {fixture,aspects,query}=sample;
  assertTable({ kind: 'references', records: fixture.records });
  const definition=fixture.records[0];
  for (const a of aspects) {
    const detail=await query.aspect(a.id);
    assert.deepEqual(JSON.parse(JSON.stringify(detail)),detail);
    assert.equal(detail.references.length,2);
    assert.equal(detail.references[0].data.consuming,false);
    assert.equal(detail.references[1].data.visible,a.discovered);
    assert.deepEqual(detail.references[1].data.components,a.components);
    assert.equal(detail.related.categories[0].reference,definition.domain);
  }
  assert.equal(sample.scans,1,'Knowledge index should be shared across aspect navigation');
  const air=aspects.find(a=>a.source.key==='aer');
  assert.deepEqual((await query.aspect(air.id)).combinations,[],'Unknown compound must not appear in native usage results');
  const compound=fixture.records.find(r=>r.data.kind==='aspectCombination'&&r.data.components.length===2);
  compound.data.visible=true;
  assert.deepEqual((await query.aspect(air.id)).combinations.map(t=>t.id),[compound.data.aspect]);
  air.discovered=false;
  fixture.records.find(r=>r.data.kind==='aspectCombination'&&r.data.aspect===air.id).data.visible=false;
  assert.deepEqual((await query.aspect(air.id)).combinations,[],'Unknown input must not expose native usage results');
});

test('configured aspect usage follows each domain visibility without rewriting discovery', async () => {
  const {fixture,aspects,query} = await specimen('configuredRecords');
  assertTable({kind:'references',records:fixture.configuredRecords});
  const air=aspects.find(a=>a.source.key==='aer');
  const compound=aspects.find(a=>a.source.key==='lux');
  air.discovered=false;
  assert.deepEqual((await query.aspect(air.id)).combinations.map(t=>t.id),[compound.id]);
  assert.equal((await query.aspect(compound.id)).aspect.discovered,false);
  air.discovered=null;
  assert.deepEqual((await query.aspect(air.id)).combinations.map(t=>t.id),[compound.id]);
  const native=await specimen();
  native.aspects.find(a=>a.source.key==='aer').discovered=false;
  native.fixture.records.find(r=>r.data.kind==='aspectCombination'&&r.data.aspect===air.id).data.visible=false;
  assert.deepEqual((await native.query.aspect(air.id)).combinations,[]);
});

test('typed aspect client accepts configured visibility and rejects policy contradictions', async () => {
  const {Catalog:Client}=await import('../src/catalog/client.ts');
  const {aspects,query}=await specimen('configuredRecords');
  const compound=aspects.find(a=>a.source.key==='lux');
  const client=Object.create(Client.prototype);
  let response=await query.aspect(compound.id);
  Object.assign(client,{controller:new AbortController(),local:{async get(){return structuredClone(response);}}});
  assert.equal((await client.aspect(compound.id)).aspect.discovered,false);
  response.aspect.discovered=null;
  assert.equal((await client.aspect(compound.id)).references[1].data.visible,true);
  response.references[1].data.visible=false;
  await assert.rejects(()=>client.aspect(compound.id),error=>error.code==='invalid_response');
  const native=await specimen();
  response=await native.query.aspect(compound.id);
  await client.aspect(compound.id);
  response.references[1].data.visible=true;
  await assert.rejects(()=>client.aspect(compound.id),error=>error.code==='invalid_response');
});
