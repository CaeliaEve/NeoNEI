import assert from 'node:assert/strict';
import test from 'node:test';
import {setLanguage,language,requireLanguage} from '../src/i18n/index.ts';
import {lumbermillNote} from '../../catalog/src/lumbermill.ts';
import {calculateMaterials} from './helpers/materials.mjs';
import {readFile} from 'node:fs/promises';
import {SnapshotSession} from '../src/state/snapshot-session.ts';
import {ticks} from '../src/catalog/format.ts';
import {errorMessage} from '../src/i18n/errors.ts';

test('authored failures follow the selected language while native details stay verbatim',()=>{
 try{
  setLanguage('en-US');
  assert.equal(errorMessage(new Error('无法创建图标画布')),'Could not create the icon canvas');
  assert.equal(errorMessage(new Error('下载失败：HTTP 503')),'Download failed: HTTP 503');
  assert.equal(errorMessage(new Error('数据集缺少引用：item_竹子')),'Dataset reference is missing: item_竹子');
  assert.equal(errorMessage(new Error('原生物品自定义说明')),'原生物品自定义说明');
  assert.equal(errorMessage(null),'Loading failed');
  setLanguage('zh-CN');
  assert.equal(errorMessage(new Error('无法创建图标画布')),'无法创建图标画布');
 }finally{setLanguage('zh-CN');}
});

test('English recipe helpers and material explanations follow one selected language',async()=>{
 const fixture=JSON.parse(await readFile(new URL('../../../elysium-compiler/contracts/fixtures/binnie-lumbermill-semantic-contract.json',import.meta.url),'utf8'));
 try{
  setLanguage('en-US');
  const bill=calculateMaterials(fixture.recipe,'2');
  assert.equal(bill.uncertain.some(row=>/\p{Script=Han}/u.test(row.note)),false);
  assert.match(bill.uncertain[1].note,/10 mB/);
  assert.equal(requireLanguage('en_US','en-US'),'en-US');
  assert.throws(()=>requireLanguage('zh_CN','en-US'),/different language/);
  assert.equal(language.value,'en-US');
  assert.equal(ticks('-1'),'Invalid native duration (-1 tick)');
  assert.equal(/\p{Script=Han}/u.test(lumbermillNote(fixture.recipe.process,language.value)),false);
 }finally{setLanguage('zh-CN');}
 assert.equal(ticks('-1'),'原生耗时异常（-1 tick）');
});

test('an unresolved current snapshot is not reused for a different language',async()=>{
 const requests=[];
 const session=new SnapshotSession(async(id,offline,signal,locale)=>{
  requests.push(locale);return {manifest:{id:locale},offline,closed:false,close(){this.closed=true;}};
 });
 try{const english=await session.open('',false,undefined,'en-US');const chinese=await session.open('',false,undefined,'zh-CN');
  assert.equal(english.closed,true);assert.equal(chinese.manifest.id,'zh-CN');assert.deepEqual(requests,['en-US','zh-CN']);
 }finally{session.close();}
});
