import {test,expect,chromium} from '@playwright/test';
import {createRequire} from 'node:module';
import {mkdtemp} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

test('Underground native semantics survive actual Compiler Catalog and stopped-backend offline reopen',async({},testInfo)=>{
  test.skip(process.env.NEONEI_TEST_NATIVE_REFERENCES!=='1','Requires actual Compiler native-reference fixture');
  test.setTimeout(45000);
  const {createApp}=createRequire(import.meta.url)(process.env.NEONEI_TEST_BACKEND!);
  const server=createApp({catalog:process.env.NEONEI_TEST_CATALOG!,web:process.env.NEONEI_TEST_WEB!}).listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>server.once('listening',resolve));
  const baseURL=`http://127.0.0.1:${server.address().port}`,directory=await mkdtemp(join(tmpdir(),'neonei-underground-'));
  const options={headless:true,baseURL,viewport:{width:1440,height:1000}};
  let context=await chromium.launchPersistentContext(directory,options);const errors:string[]=[],offlineApi:string[]=[];
  try{
    const manifest=await(await fetch(baseURL+'/api/catalog')).json();let page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    await page.goto('/underground-fluids?catalog='+manifest.id);
    await expect(page.getByRole('heading',{name:'地下流体',exact:true})).toBeVisible();
    await expect(page.locator('.underground-entry')).toHaveCount(6);
    await expect(page.locator('.underground-policy')).toContainText('未注册流体仍保留配置权重');
    await expect(page.locator('.underground-entry').first()).toContainText('1,000');
    await expect(page.locator('.underground-entry').first()).toContainText('16.66%');
    await expect(page.locator('.unresolved')).toHaveCount(1);
    await page.getByRole('searchbox',{name:'查找地下流体'}).fill('fixture_oil_5');await page.getByRole('button',{name:'搜索',exact:true}).click();
    await expect(page.locator('.underground-entry')).toHaveCount(1);await expect(page.locator('.unresolved')).toHaveCount(1);
    await page.getByRole('button',{name:'清空筛选',exact:true}).click();await expect(page.locator('.underground-entry')).toHaveCount(6);
    await page.getByRole('combobox',{name:'维度',exact:true}).selectOption('0');await expect(page).toHaveURL(/dimension=0/);
    await page.reload();await expect(page.locator('.underground-entry')).toHaveCount(6);
    await page.locator('.underground-entry details summary').first().click();
    await expect(page.locator('.underground-entry details code').first()).toContainText('nextInt(upper)');
    await expect(page.locator('.underground-entry details p').first()).toContainText('不是每次泵送固定得到的');
    await page.screenshot({path:testInfo.outputPath('underground-online.png'),fullPage:true});
    await page.locator('.underground-entry details summary').last().click();
    await page.locator('.workspace-content').evaluate(element=>{element.scrollTop=element.scrollHeight;});
    const formula=page.locator('.underground-entry details code').last();await expect(formula).toBeInViewport();
    expect(await formula.evaluate(element=>{const box=element.getBoundingClientRect();return element.contains(document.elementFromPoint(box.x+box.width/2,box.y+box.height/2));})).toBe(true);
    const target=page.url();
    await page.goto('/offline?catalog='+manifest.id);await page.getByRole('button',{name:'保存完整资料',exact:true}).click();
    await expect(page.locator('.offline-copy')).toHaveAttribute('data-state','ready',{timeout:20000});
    await context.close();server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close((error:Error|undefined)=>error?reject(error):resolve()));
    context=await chromium.launchPersistentContext(directory,{...options,offline:true});
    context.on('request',request=>{if(new URL(request.url()).pathname.startsWith('/api/'))offlineApi.push(request.url());});
    page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    const location=new URL(target);location.searchParams.set('offline','1');const response=await page.goto(location.toString());expect(response?.fromServiceWorker()).toBe(true);
    await expect(page.locator('.underground-entry')).toHaveCount(6);await expect(page.locator('.unresolved')).toHaveCount(1);
    await page.reload();await expect(page.locator('.underground-entry')).toHaveCount(6);
    await page.screenshot({path:testInfo.outputPath('underground-offline-reopened.png'),fullPage:true});
    expect(offlineApi).toEqual([]);expect(errors).toEqual([]);
  }finally{
    await context.close();if(server.listening){server.closeAllConnections();await new Promise<void>(resolve=>server.close(resolve));}
  }
});
