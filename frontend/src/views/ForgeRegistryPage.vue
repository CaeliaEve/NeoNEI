<script setup lang="ts">
import {t} from '../i18n/index.ts';
import {computed,ref,watch} from 'vue';
import {useRoute,useRouter} from 'vue-router';
import type {ForgePage,ForgeSearch} from '../catalog/forge-registry.ts';
import {Records} from '../catalog/client.ts';
import {useCatalog} from '../state/catalog.ts';
import {useRequest} from '../state/request.ts';
import {usePreferences} from '../state/preferences.ts';
import {itemLocation} from '../router/workspace.ts';
import ForgeRegistryStack from '../components/ForgeRegistryStack.vue';
import ItemLink from '../components/ItemLink.vue';
import Pager from '../components/Pager.vue';
const route=useRoute(),router=useRouter();
const {catalog,opening,error:openError,open}=useCatalog(computed(()=>typeof route.query.catalog==='string'?route.query.catalog:''));
const {preferences}=usePreferences();
const field=(key:string)=>typeof route.query[key]==='string'?route.query[key] as string:'';
const number=(key:string)=>/^(0|[1-9][0-9]*)$/.test(field(key))?Number(field(key)):0;
const search=computed<ForgeSearch>(()=>({registry:field('registry')==='fluidRegistry'?'fluidRegistry':'oreDictionary',query:field('query'),item:field('item'),offset:number('offset'),limit:4,memberOffset:number('memberOffset'),memberLimit:12,choiceOffset:number('choiceOffset'),choiceLimit:8}));
const query=ref(search.value.query);
const {value:page,error,loading,run,clear}=useRequest<ForgePage>();
const records=computed(()=>page.value?new Records(page.value.related):null);
const definition=computed(()=>page.value?.definitions.find(def=>def.data.registry===search.value.registry));
function load(){const session=catalog.value;if(session)void run(signal=>session.forgeRegistry(search.value,signal));}
watch([catalog,search],()=>{clear();query.value=search.value.query;load();},{immediate:true});
function update(patch:Record<string,string|number|undefined>){void router.push({name:'forge-registry',query:{...route.query,...patch}});}
function select(id:string,direction:'recipes'|'uses'){void router.push(itemLocation(id,route.query,direction==='uses'?'usedIn':'producedBy'));}
function choices(choiceOffset:number){update({choiceOffset});}
</script>
<template>
  <section v-if="opening" class="state-panel" role="status">{{t("正在读取注册资料…")}}</section>
  <section v-else-if="openError" class="state-panel error" role="alert">{{openError}} <button @click="open()">{{t("重试")}}</button></section>
  <main v-else-if="catalog" class="catalog-page panel forge-registry-page">
    <h1>{{t("Forge 注册资料")}}</h1>
    <p>{{t("原生注册关系的只读记录。登记数量与容器配对不代表一次加工的用量，也不表示物品能直接互相转换。")}}</p>
    <form @submit.prevent="update({query:query||undefined,offset:undefined,memberOffset:undefined,choiceOffset:undefined})">
      <label for="forge-registry-type">{{t("资料类型")}}</label><select id="forge-registry-type" :value="search.registry" @change="update({registry:($event.target as HTMLSelectElement).value,offset:undefined,memberOffset:undefined,choiceOffset:undefined,item:undefined})"><option value="oreDictionary">{{t("矿物词典登记")}}</option><option value="fluidRegistry">{{t("流体与容器登记")}}</option></select>
      <label for="forge-registry-query">{{t("名称或原生编号")}}</label><input id="forge-registry-query" v-model="query" type="search" maxlength="256" /><button>{{t("搜索")}}</button>
    </form>
    <p v-if="error" class="state-panel error" role="alert">{{error}} <button @click="load()">{{t("重试")}}</button></p>
    <p v-else-if="loading" class="state-panel" role="status">{{t("正在读取资料…")}}</p>
    <template v-else-if="page && records">
      <p v-if="!definition">{{t("本数据集没有此类注册资料。")}}</p>
      <p v-else-if="!definition.data.enabled">{{t("采集时该原生资料页已禁用。")}}</p>
      <p v-else-if="!definition.data.entries">{{t("原生注册表已就绪，内容为空。")}}</p>
      <template v-else>
        <p v-if="search.registry==='oreDictionary'">{{t("矿辞按物品与元数据匹配，通配值接受该物品的元数据变体；数量和 NBT 不参与矿辞成员判断。下方仍保留原始登记数量与 NBT。")}}</p>
        <p v-if="!page.total">{{t("没有匹配的登记项。")}}</p>
        <Pager :offset="search.offset" :limit="search.limit" :total="page.total" @change="offset=>update({offset,memberOffset:undefined,choiceOffset:undefined})" />
        <article v-for="row in page.rows" :key="row.id" class="registry-card" :data-reference="row.id">
          <template v-if="row.data.kind==='oreGroup'">
            <h2>{{row.data.name}}</h2><p>{{t("原生编号 {0} · {1} 条登记", row.data.nativeId, row.data.members.length)}}</p>
            <p v-if="!row.data.members.length">{{t("已注册的空矿辞组。")}}</p>
            <ForgeRegistryStack v-for="(stack,index) in row.data.members.slice(search.memberOffset,search.memberOffset+search.memberLimit)" :key="search.memberOffset+index" :stack="stack" :catalog="catalog" :records="records" :animate="preferences.animate" :offset="search.choiceOffset" :limit="search.choiceLimit" @select="select" @choices="choices" />
            <Pager :offset="search.memberOffset" :limit="search.memberLimit" :total="row.data.members.length" @change="memberOffset=>update({memberOffset,choiceOffset:undefined})" />
          </template>
          <template v-else>
            <h2>{{row.data.fluid.registry}}</h2><p>{{t("原生编号 {0}", row.data.fluid.nativeId)}}</p>
            <ItemLink :target="{kind:'fluid',id:row.data.fluid.id}" :catalog="catalog" :records="records" :animate="preferences.animate" @select="select" />
            <dl><dt>{{t("状态")}}</dt><dd>{{row.data.fluid.gaseous?t("气态"):t("液态")}}</dd><dt>{{t("可放置")}}</dt><dd>{{row.data.fluid.placeable?t("是"):t("否")}}</dd><dt>{{t("温度")}}</dt><dd>{{row.data.fluid.temperature}}</dd><dt>{{t("亮度")}}</dt><dd>{{row.data.fluid.luminosity}}</dd><dt>{{t("密度")}}</dt><dd>{{row.data.fluid.density}}</dd><dt>{{t("粘度")}}</dt><dd>{{row.data.fluid.viscosity}}</dd></dl>
            <p v-if="row.data.fluid.block">{{t("原生方块：")}}<code>{{row.data.fluid.block.registry}}</code><span v-if="!row.data.fluid.block.display">{{t("（未注册物品形态）")}}</span></p>
            <ItemLink v-if="row.data.fluid.block?.display" :target="{kind:'item',id:row.data.fluid.block.display}" :catalog="catalog" :records="records" :animate="preferences.animate" @select="select" />
            <h3>{{t("容器登记 · {0} 组", row.data.containers.length)}}</h3>
            <section v-for="(container,index) in row.data.containers.slice(search.memberOffset,search.memberOffset+search.memberLimit)" :key="search.memberOffset+index" class="registry-container">
              <p>{{t("登记流体量 {0} mB", container.fluid.amount)}}</p>
              <ItemLink :target="{kind:'fluid',id:container.fluid.id}" :catalog="catalog" :records="records" :animate="preferences.animate" @select="select" />
              <details v-if="container.fluid.nbt"><summary>{{t("流体登记 NBT")}}</summary><pre>{{JSON.stringify(container.fluid.nbt,null,2)}}</pre></details>
              <h4>{{t("空容器登记")}}</h4><ForgeRegistryStack :stack="container.empty" :catalog="catalog" :records="records" :animate="preferences.animate" :offset="search.choiceOffset" :limit="search.choiceLimit" @select="select" @choices="choices" />
              <h4>{{t("已填充容器登记")}}</h4><ForgeRegistryStack :stack="container.filled" :catalog="catalog" :records="records" :animate="preferences.animate" :offset="search.choiceOffset" :limit="search.choiceLimit" @select="select" @choices="choices" />
            </section>
            <Pager :offset="search.memberOffset" :limit="search.memberLimit" :total="row.data.containers.length" @change="memberOffset=>update({memberOffset,choiceOffset:undefined})" />
          </template>
        </article>
      </template>
    </template>
  </main>
</template>
<style scoped>
.forge-registry-page{padding:20px;min-width:0;overflow-wrap:anywhere}.forge-registry-page form{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.registry-card{border:1px solid var(--color-border,#334155);border-radius:8px;padding:16px;margin:16px 0;min-width:0}.registry-card dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 20px}.registry-card dd{margin:0}.registry-container{padding:12px;margin:12px 0;border:1px solid var(--color-border,#334155);border-radius:6px}.registry-card pre{white-space:pre-wrap;max-height:240px;overflow:auto}
</style>
