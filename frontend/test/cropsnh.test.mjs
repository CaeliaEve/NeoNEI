import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import { assertTable, canonical } from '@elysium/contracts';
import { Api } from '../../catalog/src/api.ts';

// Small semantic specimen, not an exact-instance native capture.
test('CropsNH shared route keeps memberships nonconsuming and hydrates only the requested page', async () => {
  const hash = value => createHash('sha256').update(canonical(value)).digest('hex');
  const base = JSON.parse(gunzipSync(await readFile(new URL(
    '../../../elysium-compiler/contracts/fixtures/source-semantic-40/records/items/part-000000.jsonl.gz',
    import.meta.url))).toString().split('\n')[0]);
  const items = ['wheat', 'carrot'].map((crop, index) => ({
    ...base, id: 'item_' + String(index + 1).repeat(64), registry: 'cropsnh:genericSeed',
    meta: 0, nbt: {type:'compound',value:{crop:{type:'string',value:'cropsnh:' + crop}}},
    name:'text_' + 'a'.repeat(64), icon:null, tooltip:[],
  }));
  const keys = items.map((item, index) => ({crop:'cropsnh:' + ['wheat','carrot'][index],numericId:index + 1,seed:item.id}));
  const origin = {owner:'cropsnh',handler:'com.gtnewhorizon.cropsnh.compatibility.NEI.NEICropsNHMutationPoolHandler',key:'pools'};
  const data = [
    {kind:'cropsNhDefinition',source:origin,nativeVersion:'2.0.140',semantics:'cropsnhRegistriesV1',section:'mutationPools',entries:2,consuming:false},
    {kind:'cropsNhMutationPool',pool:'food',members:keys},
    {kind:'cropsNhMutationPool',pool:'grains',members:[keys[0]]},
  ];
  const domain = 'reference_' + hash({kind:'cropsnh',records:data});
  const references = data.map((data, order) => {
    const row = {domain,order,data}; return {...row,id:'refrow_' + hash(row)};
  });
  const tables = {references,items,categories:[{
    id:'category_' + 'b'.repeat(64),source:origin,name:items[0].name,reference:domain,
    program:null,notes:[],icon:null,machines:[],order:0,
  }],strings:[{id:items[0].name,locale:'en_US',text:'Seed'}],textures:[]};
  let scans = 0;
  const requested = [];
  const catalog = {
    async record(kind,id) { const row = tables[kind]?.find(row => row.id === id); assert.ok(row,kind + ':' + id); return row; },
    async records(kind,ids) { requested.push([kind,[...ids]]); return Promise.all([...ids].map(id => this.record(kind,id))); },
    async *scan(kind) { if (kind === 'references') scans++; yield* tables[kind] ?? []; },
  };
  const api = new Api(catalog);
  assert.equal(scans,0,'Constructing the main API must not preload agriculture data');
  const options = {section:'mutationPools',crop:'cropsnh:carrot',query:'',offset:0,limit:1};
  const page = await api.read(['cropsnh'],new URLSearchParams({...options,offset:'0',limit:'1'}));
  assert.equal(page.total,1);
  assert.equal(page.rows[0].data.pool,'food');
  assert.equal(page.definitions[0].data.consuming,false);
  assert.deepEqual(page.related.items.map(item => item.id),items.map(item => item.id));
  assert.deepEqual(requested.find(([kind]) => kind === 'items')[1],items.map(item => item.id));
  assertTable({kind:'references',records:[...page.definitions,...page.rows]});
  for(const kind of ['items','categories','strings','textures'])
    assertTable({kind,records:page.related[kind]});
  assert.deepEqual(JSON.parse(JSON.stringify(page)),page);

  const {Catalog:Client} = await import('../src/catalog/client.ts');
  const client = Object.create(Client.prototype);
  let response = page;
  Object.assign(client,{controller:new AbortController(),local:{async get(){return structuredClone(response);}}});
  assert.equal((await client.cropsNh(options)).rows[0].data.pool,'food');
  response = structuredClone(page); response.definitions[0].data.consuming = true;
  await assert.rejects(() => client.cropsNh(options),error => error.code === 'invalid_response');
  await assert.rejects(() => api.read(['cropsnh'],new URLSearchParams('section=recipes')),error => error.code === 'invalid_query');
});
