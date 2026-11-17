import {test,expect,chromium} from '@playwright/test';
import {createRequire} from 'node:module';
import {mkdtemp} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

test('BBAB native graph survives actual Catalog, navigation and stopped-backend offline reopen',async({},testInfo)=>{
  test.skip(process.env.NEONEI_TEST_NATIVE_REFERENCES!=='1','Requires actual Compiler native-reference fixture');
  test.setTimeout(45000);
  const {createApp}=createRequire(import.meta.url)(process.env.NEONEI_TEST_BACKEND!);
  const server=createApp({catalog:process.env.NEONEI_TEST_CATALOG!,web:process.env.NEONEI_TEST_WEB!}).listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>server.once('listening',resolve));
  const baseURL=`http://127.0.0.1:${server.address().port}`,directory=await mkdtemp(join(tmpdir(),'neonei-bee-tree-'));
  const options={headless:true,baseURL,viewport:{width:1440,height:1000}};
  let context=await chromium.launchPersistentContext(directory,options);const errors:string[]=[],offlineApi:string[]=[];
  try {
    const manifest=await(await fetch(baseURL+'/api/catalog')).json();let page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    await page.goto('/bee-tree?catalog='+manifest.id);
    await expect(page.getByRole('heading',{name:'蜜蜂育种树',exact:true})).toBeVisible();
    await expect(page.locator('.bee-tree-route')).toHaveCount(2);
    const contrast=await page.locator('.bee-tree-route p').first().evaluate(element=>{
      const linear=(v:number)=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;};
      const luminance=(text:string)=>{const c=text.match(/[\d.]+/g)!.slice(0,3).map(Number).map(linear);return .2126*c[0]!+.7152*c[1]!+.0722*c[2]!;};
      let owner:Element|null=element,background='rgb(0, 0, 0)';
      while(owner){const value=getComputedStyle(owner).backgroundColor;if(value!=='rgba(0, 0, 0, 0)'&&value!=='transparent'){background=value;break;}owner=owner.parentElement;}
      const text=luminance(getComputedStyle(element).color),surface=luminance(background);
      return (Math.max(text,surface)+.05)/(Math.min(text,surface)+.05);
    });
    expect(contrast).toBeGreaterThanOrEqual(4.5);
    await expect(page.locator('.bee-tree-route').first()).toContainText('7.5%');
    await expect(page.locator('.bee-tree-route').first()).toContainText('Native biome condition');
    await page.getByRole('searchbox',{name:'查找蜜蜂路线'}).fill('missing');await page.getByRole('button',{name:'搜索',exact:true}).click();
    await expect(page.locator('.bee-tree-route')).toHaveCount(0);
    await page.getByRole('button',{name:'全部路线',exact:true}).click();await expect(page.locator('.bee-tree-route')).toHaveCount(2);
    await page.locator('.bee-tree-route').first().getByRole('button',{name:'Native fixture.bee.c',exact:true}).click();
    await expect(page.locator('.bee-lineage-node')).toHaveCount(3);
    await expect(page.locator('.bee-lineage')).toContainText('7.5%');
    await page.reload();await expect(page.locator('.bee-lineage-node')).toHaveCount(3);
    await page.screenshot({path:testInfo.outputPath('bee-tree-online.png'),fullPage:true});
    await page.locator('.bee-tree-route details summary').last().click();
    await page.locator('.workspace-content').evaluate(element=>{element.scrollTop=element.scrollHeight;});
    const genome=page.locator('.bee-tree-route details li').last();
    await expect(genome).toBeInViewport();
    expect(await genome.evaluate(element=>{const box=element.getBoundingClientRect();return element.contains(document.elementFromPoint(box.x+box.width/2,box.y+box.height/2));})).toBe(true);
    await page.screenshot({path:testInfo.outputPath('bee-tree-genome-readable.png'),fullPage:true});
    const recipeLink=page.url();
    await page.locator('.bee-tree-route .item-link').first().click({button:'right'});await expect(page).toHaveURL(/\/recipe\/item_.*tab=usedIn/);
    await page.goto('/offline?catalog='+manifest.id);await page.getByRole('button',{name:'保存完整资料',exact:true}).click();
    await expect(page.locator('.offline-copy')).toHaveAttribute('data-state','ready',{timeout:20000});
    await context.close();server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close((error:Error|undefined)=>error?reject(error):resolve()));
    context=await chromium.launchPersistentContext(directory,{...options,offline:true});
    context.on('request',request=>{if(new URL(request.url()).pathname.startsWith('/api/')) offlineApi.push(request.url());});
    page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    const target=new URL(recipeLink);target.searchParams.set('offline','1');
    const response=await page.goto(target.toString());expect(response?.fromServiceWorker()).toBe(true);
    await expect(page.locator('.bee-lineage-node')).toHaveCount(3);await expect(page.locator('.bee-tree-route')).toHaveCount(2);
    await expect(page.locator('.bee-lineage')).toContainText('Native temperature condition');
    await page.reload();await expect(page.locator('.bee-lineage-node')).toHaveCount(3);
    await page.screenshot({path:testInfo.outputPath('bee-tree-offline-reopened.png'),fullPage:true});
    expect(offlineApi).toEqual([]);expect(errors).toEqual([]);
  } finally {
    await context.close();if(server.listening){server.closeAllConnections();await new Promise<void>(resolve=>server.close(resolve));}
  }
});
