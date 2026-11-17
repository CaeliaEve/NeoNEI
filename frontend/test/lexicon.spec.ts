import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

test('lexicon uses native text, knowledge and quick info with search, reload and item navigation',async({page,request},testInfo)=>{
  const fixture=JSON.parse(await readFile(new URL('../../../elysium-compiler/contracts/fixtures/botania-lexicon-contract.json',import.meta.url),'utf8'));
  const manifest=await(await request.get('/api/catalog')).json();
  const strings=[{id:'text_lexicon_item',locale:'en_US',text:'Native Book'}];
  const items=fixture.items.map(item=>({...item,durability:0,stackLimit:64,tools:{},armor:false,tooltip:[],icon:null,order:null,aspects:null,name:strings[0].id}));
  await page.route('**/api/catalog/*/lexicon?*',async route=>{
    const url=new URL(route.request().url()),query=url.searchParams.get('query')??'';
    const entries=fixture.records.filter(row=>row.data.kind==='lexiconEntry');
    const rows=query.includes('missing')?[]:entries;
    await route.fulfill({json:{offset:0,limit:20,total:rows.length,rows,definitions:[fixture.records[0]],
      related:{items,strings,categories:[],fluids:[],textures:[],topics:[]}}});
  });
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/lexicon?catalog='+manifest.id);
  await expect(page.getByRole('heading',{name:'植物魔法辞典',exact:true})).toBeVisible();
  await expect(page.locator('.lexicon-entry')).toContainText('Native botania.entry.fixture');
  await expect(page.locator('.lexicon-knowledge')).toContainText('基础知识自动解锁');
  await expect(page.locator('.lexicon-items')).toContainText('Native line');
  await expect(page.locator('.lexicon-items')).toContainText('Second line');
  await expect(page.locator('.lexicon-items .game-text').last().locator('span').first()).toHaveCSS('color','rgb(85, 255, 85)');
  await page.screenshot({path:testInfo.outputPath('lexicon.png'),fullPage:true});
  await page.getByRole('searchbox',{name:'查找条目'}).fill('missing');
  await page.getByRole('button',{name:'搜索',exact:true}).click();
  await expect(page.locator('.lexicon-page')).toContainText('没有符合筛选条件');
  await page.getByRole('searchbox',{name:'查找条目'}).fill('Native line');
  await page.getByRole('button',{name:'搜索',exact:true}).click();
  await expect(page.locator('.lexicon-entry')).toHaveCount(1);
  await page.reload();await expect(page.locator('.lexicon-entry')).toHaveCount(1);
  await page.locator('.lexicon-item .item-link').click({button:'right'});
  await expect(page).toHaveURL(new RegExp('/recipe/'+items[0].id+'.*tab=usedIn'));
  expect(errors).toEqual([]);
});
