import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('aspect detail retains native composition and explicit undiscovered visibility', async ({ page, request }, testInfo) => {
  const fixture = JSON.parse(await readFile(new URL('../../../elysium-compiler/contracts/fixtures/aspect-combinations-contract.json', import.meta.url), 'utf8'));
  const manifest = await (await request.get('/api/catalog')).json();
  const topics = fixture.aspects.map((a,index)=>({id:a.id,kind:'aspect',name:a.source.key,terms:a.source.key,order:index,image:null,icon:null}));
  const definition=fixture.records[0];
  const strings=[{id:'text_aspect_name',locale:'en_US',text:'lux'},{id:'text_aspect_description',locale:'en_US',text:'Native compound definition'}];
  await page.route('**/api/catalog/*/aspects/*/sources?*',async route=>{
    const id=new URL(route.request().url()).pathname.split('/').at(-2);
    const raw=fixture.aspects.find(a=>a.id===id);
    await route.fulfill({json:{aspect:id,visible:raw.discovered,offset:0,limit:20,total:0,rows:[],definitions:[],
      gaps:{cacheMiss:0,invalidKey:0,noAspects:0},related:{items:[],fluids:[],categories:[],textures:[],strings:[],topics:[]}}});
  });
  await page.route('**/api/catalog/*/aspects/*',async route=>{
    const id=new URL(route.request().url()).pathname.split('/').at(-1);
    const raw=fixture.aspects.find(a=>a.id===id);
    await route.fulfill({json:{aspect:{...raw,name:strings[0].id,description:strings[1].id,color:4294967295,icon:null},
      components:topics.filter(t=>raw.components.includes(t.id)),combinations:[],
      references:[definition,fixture.records.find(r=>r.data.kind==='aspectCombination'&&r.data.aspect===id)],
      related:{items:[],fluids:[],categories:[],textures:[],strings,topics}}});
  });
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/aspect/'+fixture.aspects[0].id+'?catalog='+manifest.id);
  await expect(page.locator('.knowledge-state').first()).toContainText('尚未发现');
  await expect(page.locator('.knowledge-state').nth(1)).toContainText('游戏中隐藏');
  await expect(page.locator('.knowledge-state').nth(1)).toContainText('不表示材料消耗配方');
  await expect(page.getByRole('region',{name:'要素组成'}).locator('.topic-link')).toHaveCount(2);
  await page.screenshot({path:testInfo.outputPath('aspect-combinations.png'),fullPage:true});
  await page.getByRole('region',{name:'要素组成'}).getByRole('link',{name:'aer',exact:true}).click();
  await expect(page.locator('.knowledge-state').nth(1)).toContainText('当前知识可见');
  await expect(page.getByRole('heading',{name:'原始要素',exact:true})).toBeVisible();
  expect(errors).toEqual([]);
});

test('scanned source panel shows native quantities and unresolved scans, with item navigation', async ({page,request},testInfo)=>{
  const fixture=JSON.parse(await readFile(new URL('../../../elysium-compiler/contracts/fixtures/item-aspects-contract.json',import.meta.url),'utf8'));
  const manifest=await(await request.get('/api/catalog')).json();
  const aspect=fixture.aspects.find(a=>a.source.key==='aer'),definition=fixture.records[0];
  const strings=[{id:'text_aspect_name',locale:'en_US',text:'Aer'},{id:'text_aspect_description',locale:'en_US',text:'Native aspect'},
    {id:'text_item_name',locale:'en_US',text:'Scanned book'}];
  const items=fixture.items.map(item=>({...item,durability:0,stackLimit:64,tools:{},armor:false,tooltip:[],icon:null,order:null,name:'text_item_name'}));
  await page.route('**/api/catalog/*/aspects/'+aspect.id,route=>route.fulfill({json:{
    aspect:{...aspect,name:strings[0].id,description:strings[1].id,color:4294967295,icon:null},components:[],combinations:[],references:[],
    related:{items:[],fluids:[],categories:[],textures:[],strings,topics:[]}}}));
  await page.route('**/api/catalog/*/aspects/'+aspect.id+'/sources?*',route=>route.fulfill({json:{
    aspect:aspect.id,visible:true,offset:0,limit:20,total:2,
    rows:fixture.records.filter(r=>r.data.kind==='itemAspectObservation'&&r.data.status==='available'),definitions:[definition],
    gaps:{cacheMiss:1,invalidKey:1,noAspects:0},related:{items,fluids:[],categories:[],textures:[],strings,topics:[]}}}));
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/aspect/'+aspect.id+'?catalog='+manifest.id);
  const sources=page.getByRole('region',{name:'扫描物品来源'});
  await expect(sources).toContainText('要素量 12');
  await expect(sources).toContainText('1 项缓存缺失、1 项无效键');
  await expect(sources.locator('.item-link')).toHaveCount(2);
  await page.screenshot({path:testInfo.outputPath('item-aspects.png'),fullPage:true});
  await sources.locator('.item-link').first().click({button:'right'});
  await expect(page).toHaveURL(new RegExp('/recipe/'+items[0].id+'.*tab=usedIn'));
  expect(errors).toEqual([]);
});
