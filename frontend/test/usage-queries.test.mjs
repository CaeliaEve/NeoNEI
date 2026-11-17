import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Api} from '../../catalog/src/api.ts';

const fixture=JSON.parse(await readFile(new URL('../../../elysium-compiler/contracts/fixtures/native-usage-query-contract.json',import.meta.url),'utf8'));
const options={backend:'aeItemCell',query:'',item:'',observation:'',document:'',offset:0,limit:4,entryOffset:0,entryLimit:8,documentOffset:0,documentLimit:1};
function specimen(locale='en_US'){
  const domains=fixture.domains.filter(rows=>rows[0].data.locale===locale);
  const strings=[{id:'text_usage',locale,text:'Native usage item'}];
  const tables={references:domains.flat(),items:fixture.items.map(item=>({tags:[],durability:0,stackLimit:64,tools:{},armor:false,tooltip:[],icon:null,order:null,aspects:null,name:strings[0].id,...item})),
    fluids:fixture.fluids.map(fluid=>({icon:null,name:strings[0].id,density:1000,gaseous:false,luminosity:0,temperature:300,viscosity:1000,...fluid})),strings,
    categories:domains.map((rows,i)=>({id:'category_usage_'+i,source:rows[0].data.source,name:strings[0].id,machines:[],order:i,icon:null,program:null,reference:rows[0].domain}))};
  const catalog={async *scan(kind){yield*(tables[kind]??[]);},async records(kind,ids){const wanted=new Set(ids);return(tables[kind]??[]).filter(row=>wanted.has(row.id));}};
  const api=new Api(catalog);
  return async endpoint=>{const url=new URL(endpoint,'https://usage.test');return api.read(url.pathname.slice(1).split('/'),url.searchParams);};
}
test('native cell queries retain long counts, empty cells and hydrate visible contents',async()=>{
  const read=specimen();
  const raw=await read('/usage-queries?backend=aeItemCell');
  assert.equal(raw.total,3);
  const {readUsageQueries}=await import('../src/catalog/usage-queries.ts');
  const page=await readUsageQueries(read,options);
  assert.equal(page.rows[0].data.result.entries[0].amount,'3000000123');
  assert.equal(page.rows[0].data.result.totalBytes,'16000000000');
  assert.equal(page.rows[1].data.result.entries.length,0);
  assert.equal(page.rows[2].data.result.kind,'cellFault');
  assert.equal(page.rows[2].data.result.fault,'missingCellInventory');
  assert.equal(page.entries[2].total,0);
  assert.equal(page.definitions[0].data.scope,'catalogObservations');
  const next=await readUsageQueries(read,{...options,entryOffset:1});
  assert.equal(next.entries[0].entries.length,0);
  assert.ok(!next.related.items.some(item=>item.id===page.rows[0].data.result.entries[0].id));
  const fluid=await readUsageQueries(read,{...options,backend:'aeFluidCell'});
  assert.equal(fluid.related.fluids.length,1);
  assert.equal(fluid.entries[0].entries[0].amount,'3000000123');
  assert.deepEqual(await readUsageQueries(async endpoint=>JSON.parse(JSON.stringify(await read(endpoint))),options),page);
  for(const patch of ['count','items','search']){
    const bad=structuredClone(page);if(patch==='count')bad.entries[0].entries[0].amount='3';if(patch==='items')bad.related.items=[];
    await assert.rejects(readUsageQueries(async()=>bad,patch==='search'?{...options,item:fixture.items.at(-1).id}:options),error=>error.code==='invalid_response');
  }
});
test('native manual and callback documents keep language, links, PNG bytes and readonly metadata',async()=>{
  const {readUsageQueries}=await import('../src/catalog/usage-queries.ts');
  const page=await readUsageQueries(specimen('zh_CN'),{...options,backend:'ocManual'});
  assert.equal(page.documents[0].data.content.requestedLocale,'zh_CN');
  assert.ok(page.directory.length>1);
  const withImage=fixture.domains[2].find(row=>row.data.kind==='usageDocument'&&row.data.content.images.some(image=>image.kind==='png'));
  const document=await readUsageQueries(specimen('zh_CN'),{...options,backend:'ocManual',document:withImage.data.key});
  assert.equal(document.resources[0].data.base64,fixture.domains[2].find(row=>row.data.kind==='usageResource').data.base64);
  const callbacks=await readUsageQueries(specimen(),{...options,backend:'ocCallbacks'});
  assert.ok(callbacks.documents[0].data.content.methods.some(method=>method.name==='makeReadonly'));
  assert.equal(callbacks.documents[0].data.content.analysis,'nativeStaticAnnotations');
  const bad=structuredClone(document);bad.resources[0].data.base64+='A';
  await assert.rejects(readUsageQueries(async()=>bad,{...options,backend:'ocManual',document:withImage.data.key}),error=>error.code==='invalid_response');
  await assert.rejects(specimen()('/usage-queries?backend=arbitrary'),error=>error.code==='invalid_query');
});
