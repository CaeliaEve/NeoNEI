const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const test=require('node:test');
const {Catalog,Api}=require('@neonei/catalog');
const {createApp}=require('../src/app');

test('bounded recipe selection has HTTP/local parity on one immutable Catalog',async context=>{
  const root=process.env.NEONEI_TEST_CATALOG??path.resolve(__dirname,'../../fixtures/semantic-40');
  const server=createApp({catalog:root}).listen(0,'127.0.0.1');
  await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
  context.after(()=>new Promise((resolve,reject)=>{
    server.closeAllConnections();server.close(error=>error?reject(error):resolve());
  }));
  const base=`http://127.0.0.1:${server.address().port}/api/catalog`;
  const manifest=await(await fetch(base)).json();
  const catalog=await Catalog.open(manifest,file=>fs.readFile(path.join(root,'catalogs',manifest.id,file.path)));
  const local=new Api(catalog);
  const page=await local.read(['items'],new URLSearchParams({query:'shitou'}));
  const recipes=await local.read(['recipes'],new URLSearchParams({item:page.rows[0].id,direction:'uses'}));
  const recipe=recipes.rows.find(recipe=>recipe.source.handler==='fixture:machine')??recipes.rows[0];
  assert.ok(recipe);
  const request={catalog:manifest.id,recipe:recipe.id},parameters=new URLSearchParams({selection:JSON.stringify(request)});
  const endpoint=`${base}/${manifest.id}/recipes/${recipe.id}/selection`;
  const response=await fetch(endpoint+'?'+parameters);
  assert.equal(response.status,200);
  const online=await response.json();
  assert.deepEqual(online,await local.read(['recipes',recipe.id,'selection'],parameters));
  assert.equal(online.products[0].guaranteed,false);
  assert.equal((await fetch(endpoint+'?'+parameters+'&selection={}')).status,400);
  const wrong=new URLSearchParams({selection:JSON.stringify({...request,catalog:'b'.repeat(64)})});
  assert.equal((await fetch(endpoint+'?'+wrong)).status,400);
});
