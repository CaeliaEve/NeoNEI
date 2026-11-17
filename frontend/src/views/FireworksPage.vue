<script setup lang="ts">
import {computed,ref,shallowRef,watch} from 'vue';
import {useRoute,useRouter} from 'vue-router';
import {canonical,type Item} from '@elysium/contracts';
import {evaluateFirework,evaluateFireworkExample} from '@neonei/catalog/source';
import type {FireworkPage,FireworkSearch} from '../catalog/fireworks.ts';
import {Records} from '../catalog/client.ts';
import {plain} from '../catalog/format.ts';
import {useCatalog} from '../state/catalog.ts';
import {useRequest} from '../state/request.ts';
import {usePreferences} from '../state/preferences.ts';
import {itemLocation} from '../router/workspace.ts';
import ItemLink from '../components/ItemLink.vue';
import Pager from '../components/Pager.vue';
import {t} from '../i18n/index.ts';
const route=useRoute(),router=useRouter();
const {catalog,opening,error:openError,open}=useCatalog(computed(()=>typeof route.query.catalog==='string'?route.query.catalog:''));
const {preferences}=usePreferences();
const search=computed<FireworkSearch>(()=>({offset:typeof route.query.offset==='string'&&/^(0|[1-9][0-9]*)$/.test(route.query.offset)?Number(route.query.offset):0,limit:12}));
const {value:page,error,loading,run,clear}=useRequest<FireworkPage>();
const records=computed(()=>page.value?new Records(page.value.related):null);
const cells=ref<(string|null)[]>(Array(9).fill(null));
const selectedExample=shallowRef<FireworkPage['examples'][number]['data']|null>(null);
const outcome=computed(()=>{
  if(!page.value?.definition||!records.value)return null;
  return selectedExample.value?.failure?evaluateFireworkExample(page.value.definition.data,selectedExample.value,records.value.items):evaluateFirework(page.value.definition.data,cells.value,records.value.items);
});
const sampledOutput=computed(()=>{
  const output=outcome.value;if(output?.status!=='output'||!records.value)return null;
  return page.value?.related.items.find(item=>item.registry===output.registry&&item.meta===output.meta&&canonical(item.nbt)===canonical(output.nbt))??null;
});
const nbt=computed(()=>outcome.value?.status==='output'?JSON.stringify(outcome.value.nbt,null,2):'');
function load(){const session=catalog.value;if(session)void run(signal=>session.fireworks(search.value,signal));}
watch([catalog,search],()=>{clear();cells.value=Array(9).fill(null);load();},{immediate:true});
watch(page,()=>preset('star'));
function select(id:string,direction:'recipes'|'uses'){void router.push(itemLocation(id,route.query,direction==='uses'?'usedIn':'producedBy'));}
function preset(kind:'star'|'fade'|'rocket'){
  selectedExample.value=null;
  const def=page.value?.definition?.data;if(!def)return;
  const next:(string|null)[]=Array(9).fill(null);
  if(kind==='star'){next[0]=def.gunpowder;next[1]=def.dyes[0]!.item;}
  if(kind==='rocket'){next[0]=def.gunpowder;next[1]=def.paper;}
  if(kind==='fade'){next[0]=page.value?.related.items.find(item=>item.registry==='minecraft:firework_charge'&&item.nbt?.type==='compound'&&item.nbt.value.Explosion?.type==='compound')?.id??def.star;next[1]=def.dyes[0]!.item;}
  cells.value=next;
}
function sample(row:FireworkPage['examples'][number]){cells.value=row.data.inputs.slice();selectedExample.value=row.data;}
function edit(index:number,value:string){selectedExample.value=null;cells.value[index]=value||null;}
function reset(){selectedExample.value=null;cells.value=Array(9).fill(null);}
function name(item:Item){return `${plain(records.value!.text(item.name))} · ${item.registry}:${item.meta}${item.nbt?' · NBT':''}`;}
function update(offset:number){void router.push({name:'fireworks',query:{...route.query,offset}});}
</script>
<template>
  <section v-if="opening" class="state-panel" role="status">{{t('正在读取烟花规则…')}}</section>
  <section v-else-if="openError" class="state-panel error" role="alert">{{openError}} <button @click="open()">{{t('重试')}}</button></section>
  <main v-else-if="catalog" class="catalog-page panel fireworks-page">
    <h1>{{t('烟花与烟花之星')}}</h1>
    <p v-if="loading" role="status">{{t('正在读取原生规则与材料…')}}</p>
    <p v-else-if="error" role="alert" class="inline-error">{{error}} <button @click="load">{{t('重试')}}</button></p>
    <p v-else-if="page&&!page.definition">{{t('当前数据集未包含烟花规则。')}}</p>
    <template v-else-if="page?.definition&&records">
      <p>{{t('烟花使用可变材料和物品状态。下方按当前材料计算实际输出；每个已占用格消耗 1 个物品，单格中的堆叠数量不会增加该材料的格数。')}}</p>
      <section class="firework-rules" :aria-label="t('烟花合成规则')">
        <h2>{{t('三类原生规则')}}</h2>
        <ul><li>{{t('烟花之星：1 格火药、至少 1 格染料；形状材料最多 1 格。钻石产生拖尾，荧石粉产生闪烁，二者可同时使用；重复效果材料仍消耗对应格的物品。')}}</li>
          <li>{{t('褪色：1 格已有 NBT 的烟花之星加染料。保留原有状态，只替换已有爆炸信息里的褪色颜色；没有爆炸信息时保持原样，错误类型会导致原生回调报错。')}}</li>
          <li>{{t('烟花火箭：1 格纸和 1～3 格火药，可在剩余格放烟花之星。')}}
            {{t('每次生成 {0} 个烟花火箭。',page.definition.data.outputAmount)}}
            {{page.definition.data.flightPolicy==='alwaysWithPowder'?t('飞行级数由火药格数决定，不需要加入烟花之星。'):t('只在存在烟花之星格时写入飞行级数。')}}
            {{t('未携带有效爆炸信息的星不会添加爆炸效果。')}}</li></ul>
        <p>{{t('染料颜色和爆炸信息按网格从左到右、从上到下的顺序记录，重复颜色保留。形状位置不影响类型；可用格数总共 9 格。')}}</p>
      </section>
      <section class="firework-builder" :aria-label="t('烟花材料选择')">
        <h2>{{t('选择材料')}}</h2>
        <div class="firework-presets"><button type="button" @click="preset('star')">{{t('烟花之星')}}</button><button type="button" @click="preset('fade')">{{t('褪色')}}</button><button type="button" @click="preset('rocket')">{{t('烟花火箭')}}</button><button type="button" @click="reset">{{t('清空材料')}}</button></div>
        <div class="firework-grid">
          <div v-for="(_,index) in cells" :key="index" class="firework-cell">
            <label :for="`firework-cell-${index}`">{{t('材料格 {0}',index+1)}}</label>
            <select :id="`firework-cell-${index}`" :value="cells[index]??''" @change="edit(index,($event.target as HTMLSelectElement).value)">
              <option value="">{{t('空位')}}</option><option v-for="item in page.related.items" :key="item.id" :value="item.id">{{name(item)}}</option>
            </select>
            <ItemLink v-if="cells[index]" :target="{kind:'item',id:cells[index]!}" :records="records" :catalog="catalog" :compact="true" :animate="preferences.animate" @select="select" />
          </div>
        </div>
        <section v-if="selectedExample?.failure" class="firework-raw-state"><p>{{t('这个样本保留导致原生回调报错的物品状态，以下为原始 NBT；该状态不生成物品图标。')}}</p><pre class="firework-nbt">{{JSON.stringify(selectedExample.failure.inputs,null,2)}}</pre></section>
        <section class="firework-output" aria-live="polite">
          <h2>{{t('按当前材料计算的输出')}}</h2>
          <p v-if="outcome?.status==='unmatched'" data-outcome="unmatched">{{t('当前材料不匹配原生烟花规则。')}}</p>
          <p v-else-if="outcome?.status==='malformedExplosion'" data-outcome="malformedExplosion">{{t('输入烟花之星的 Explosion 字段类型错误，原生回调会报错。')}}</p>
          <template v-else-if="outcome?.status==='output'">
            <p data-outcome="output">{{outcome.registry}} : {{outcome.meta}} × {{outcome.amount}}</p>
            <ItemLink v-if="sampledOutput" :target="{kind:'item',id:sampledOutput.id,amount:outcome.amount}" :records="records" :catalog="catalog" :animate="preferences.animate" @select="select" />
            <p v-else>{{t('此组合的输出状态已计算；数据集中没有该状态对应的原生外观样本。')}}</p>
            <details><summary>{{t('输出状态（NBT）')}}</summary><pre class="firework-nbt">{{nbt}}</pre></details>
          </template>
        </section>
      </section>
      <section class="firework-examples" :aria-label="t('原生回调样本')">
        <h2>{{t('原生回调样本')}}</h2>
        <p>{{t('这些样本用于查看实际状态变化，不把它们当作所有颜色、效果和材料组合的完整枚举。')}}</p>
        <div class="firework-example-buttons"><button v-for="row in page.examples" :key="row.id" type="button" :data-example="row.data.label" @click="sample(row)">{{t('样本 {0}',row.order)}} · {{t(row.data.failure?'原生状态错误':row.data.output?'匹配成功':'不匹配')}}</button></div>
        <Pager :total="page.total" :offset="page.offset" :limit="page.limit" :busy="loading" :label="t('烟花样本')" @change="update" />
      </section>
    </template>
  </main>
</template>
<style scoped>
.fireworks-page{margin:1rem;max-width:1100px;width:auto;min-height:0;padding:1.2rem}.fireworks-page p,.firework-rules li{line-height:1.65;overflow-wrap:anywhere}.fireworks-page h2{font-size:1.1rem;margin:1rem 0 .6rem}.firework-rules,.firework-builder,.firework-examples{padding:1rem;margin-top:1rem;border:1px solid var(--border,#334155);border-radius:.6rem}.firework-presets,.firework-example-buttons{display:flex;gap:.5rem;flex-wrap:wrap}.firework-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.5rem;margin-top:1rem}.firework-cell{padding:.5rem;border:1px solid var(--border,#334155);border-radius:.3rem;min-width:0;display:flex;flex-wrap:wrap;gap:.4rem;align-items:center}.firework-cell label{width:100%}.firework-cell select{min-width:0;width:100%}.firework-nbt{white-space:pre-wrap;overflow-wrap:anywhere;max-height:25rem;overflow:auto}.firework-output{margin-top:1rem;padding-top:.5rem;border-top:1px solid var(--border,#334155)}
</style>
