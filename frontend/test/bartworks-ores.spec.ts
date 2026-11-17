import {test,expect,chromium} from '@playwright/test';
import {createRequire} from 'node:module';
import {mkdtemp} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

test('Bartworks native mineral rules survive navigation and stopped-backend offline reopen',async({},testInfo)=>{
  test.skip(process.env.NEONEI_TEST_NATIVE_REFERENCES!=='1','Requires actual Compiler native-reference fixture');
  test.setTimeout(45000);
  const {createApp}=createRequire(import.meta.url)(process.env.NEONEI_TEST_BACKEND!);
  const server=createApp({catalog:process.env.NEONEI_TEST_CATALOG!,web:process.env.NEONEI_TEST_WEB!}).listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>server.once('listening',resolve));
  const baseURL=`http://127.0.0.1:${server.address().port}`,directory=await mkdtemp(join(tmpdir(),'neonei-bartworks-'));
  const options={headless:true,baseURL,viewport:{width:1440,height:1000}};
  let context=await chromium.launchPersistentContext(directory,options);const errors:string[]=[],offlineApi:string[]=[];
  try{
    const manifest=await(await fetch(baseURL+'/api/catalog')).json();let page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    await page.goto('/bartworks-ores?catalog='+manifest.id);
    await expect(page.getByRole('heading',{name:'Bartworks 矿物资料',exact:true})).toBeVisible();await expect(page.locator('.bw-entry')).toHaveCount(2);
    await expect(page.locator('.bw-policy')).toContainText('不是投入材料或必得产物');
    const disabled=page.locator('.bw-entry').filter({has:page.getByRole('heading',{name:'ore.fixture.disabled',exact:true})});await expect(disabled).toContainText('已禁用');
    await expect(page.locator('.bw-role')).toHaveCount(8);
    await page.locator('.bw-generator summary').first().click();await expect(page.locator('.bw-generator').first()).toContainText('minecraft:stone');
    await page.screenshot({path:testInfo.outputPath('bartworks-layers.png'),fullPage:true});
    await page.getByRole('combobox',{name:'资料类型',exact:true}).selectOption('materials');await expect(page.locator('.bw-entry')).toHaveCount(1);
    await expect(page.getByRole('heading',{name:'Bismutite',exact:true})).toBeVisible();await expect(page.locator('.bw-samples .item-link')).toHaveCount(2);
    await expect(page.locator('.bw-entry')).toContainText('小矿石 禁用');
    await page.getByText('按原生元数据查询的关联矿层',{exact:true}).click();await expect(page.locator('.bw-native-members li')).toHaveCount(4);
    await page.locator('.bw-native-members').getByRole('button',{name:'ore.fixture.disabled',exact:true}).first().click();await expect(page.locator('.bw-entry')).toHaveCount(1);await expect(page).toHaveURL(/query=ore.fixture.disabled/);
    await page.reload();await expect(page.locator('.bw-entry')).toHaveCount(1);
    await page.getByRole('searchbox',{name:'查找 Bartworks 矿物'}).fill('no-native-entry');await page.getByRole('button',{name:'搜索',exact:true}).click();
    await expect(page.getByText('没有符合筛选条件的 Bartworks 资料。',{exact:true})).toBeVisible();await page.getByRole('button',{name:'清空筛选',exact:true}).click();await expect(page.locator('.bw-entry')).toHaveCount(2);
    await page.getByRole('combobox',{name:'维度',exact:true}).selectOption('planet.Ross128b');await page.reload();await expect(page.locator('.bw-entry')).toHaveCount(2);
    await page.getByRole('combobox',{name:'资料类型',exact:true}).selectOption('materials');await expect(page.locator('.bw-entry')).toHaveCount(1);
    await page.getByText('按原生元数据查询的关联矿层',{exact:true}).click();
    await page.locator('.workspace-content').evaluate(element=>{element.scrollTop=element.scrollHeight;});
    const explanation=page.getByText('原生查询只使用 short 元数据，不区分 GT/Bartworks 所有者；重复成员与注册顺序原样保留，不能理解为多次必得。',{exact:true});await expect(explanation).toBeInViewport();
    expect(await explanation.evaluate(element=>{const rect=element.getBoundingClientRect();return element.contains(document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2));})).toBe(true);
    await page.screenshot({path:testInfo.outputPath('bartworks-materials.png'),fullPage:true});const target=page.url();
    await page.goto('/offline?catalog='+manifest.id);await page.getByRole('button',{name:'保存完整资料',exact:true}).click();await expect(page.locator('.offline-copy')).toHaveAttribute('data-state','ready',{timeout:20000});
    await context.close();server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close((error:Error|undefined)=>error?reject(error):resolve()));
    context=await chromium.launchPersistentContext(directory,{...options,offline:true});context.on('request',request=>{if(new URL(request.url()).pathname.startsWith('/api/'))offlineApi.push(request.url());});
    page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));const location=new URL(target);location.searchParams.set('offline','1');
    const response=await page.goto(location.toString());expect(response?.fromServiceWorker()).toBe(true);await expect(page.locator('.bw-entry')).toHaveCount(1);await expect(page.locator('.bw-samples .item-link')).toHaveCount(2);
    await page.reload();await expect(page.locator('.bw-entry')).toHaveCount(1);await page.getByText('按原生元数据查询的关联矿层',{exact:true}).click();await expect(page.locator('.bw-native-members li')).toHaveCount(4);
    await page.screenshot({path:testInfo.outputPath('bartworks-offline-reopened.png'),fullPage:true});expect(offlineApi).toEqual([]);expect(errors).toEqual([]);
  }finally{await context.close();if(server.listening){server.closeAllConnections();await new Promise<void>(resolve=>server.close(resolve));}}
});
