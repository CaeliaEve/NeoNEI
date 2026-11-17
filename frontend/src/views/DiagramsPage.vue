<script setup lang="ts">
import {t} from '../i18n/index.ts';
import {computed,ref,watch} from 'vue';
import {useRoute,useRouter} from 'vue-router';
import type {DiagramPage,DiagramSearch} from '../catalog/diagrams.ts';
import {Records} from '../catalog/client.ts';
import {useCatalog} from '../state/catalog.ts';
import {useRequest} from '../state/request.ts';
import {usePreferences} from '../state/preferences.ts';
import {itemLocation} from '../router/workspace.ts';
import DiagramNote from '../components/DiagramNote.vue';
import GameText from '../components/GameText.vue';
import Pager from '../components/Pager.vue';
const route=useRoute(),router=useRouter();
const {catalog,opening,error:openError,open}=useCatalog(computed(()=>typeof route.query.catalog==='string'?route.query.catalog:''));
const {preferences}=usePreferences();
const field=(key:string)=>typeof route.query[key]==='string'?route.query[key] as string:'';
const number=(key:string)=>/^(0|[1-9][0-9]*)$/.test(field(key))?Number(field(key)):0;
const search=computed<DiagramSearch>(()=>({group:field('group'),query:field('query'),item:field('item'),direction:field('direction')==='crafting'?'crafting':field('direction')==='usage'?'usage':'',diagram:field('diagram'),action:field('action'),selection:field('selection')==='native'?'native':'all',shift:field('shift')==='true',ctrl:field('ctrl')==='true',offset:number('offset'),limit:1,cellOffset:number('cellOffset'),cellLimit:field('focusCell')==='true'?1:12,choiceOffset:number('choiceOffset'),choiceLimit:8,annotationOffset:number('annotationOffset'),annotationLimit:12}));
const query=ref(search.value.query);
const {value:page,error,loading,run,clear}=useRequest<DiagramPage>();
const records=computed(()=>page.value?new Records(page.value.related):null);
const titles:Record<string,string>={'raw-ore':'矿石','true-raw-ore':'原矿','raw-ore-macerate':'矿石粉碎','true-raw-ore-macerate':'原矿粉碎','crushed-ore-macerate':'粉碎矿石再次粉碎','crushed-ore-wash':'洗矿','crushed-ore-bath-mercury':'汞化学浸洗','crushed-ore-bath-sodium-persulfate':'过硫酸钠化学浸洗','purified-ore-macerate':'洁净矿石粉碎','purified-ore-sift':'筛矿','impure-dust-centrifuge':'含杂粉离心','purified-dust-centrifuge':'洁净粉离心','purified-dust-electromagnetic-separate':'电磁分离','ore-thermal-centrifuge':'热离心','ore-thermal-centrifuge-crushed':'粉碎矿石热离心','ore-thermal-centrifuge-purified':'洁净矿石热离心','ore-thermal-centrifuge-macerate':'热离心后粉碎','ore-thermal-centrifuge-macerate-extra':'分支热离心后粉碎','additional-recipe-outputs':'其他产物','circuit-lines':'电路系列','individual-circuits':'独立电路','circuit-parts':'电路部件','circuit-line-circuits':'前级、当前与后级电路','tier-circuits':'同等级电路','recipe-fluid-inputs':'配方流体','recipe-output':'配方产物','same-colour-lenses':'同色透镜','related-materials':'相关材料','tools':'工具','tool-parts':'工具部件','turbine-blade':'涡轮叶片','turbines':'涡轮','scanners':'扫描器','electric-scanners':'电动扫描器'};
function title(key:string){return t(titles[key]??(key.startsWith('recipe-item-inputs-')?'配方材料组':key.startsWith('recipe-input-')?'加工材料':key.startsWith('recipe-output-')?'加工产物':'物品组'));}
function load(){const session=catalog.value;if(session)void run(signal=>session.diagrams(search.value,signal));}
watch([catalog,search],()=>{clear();query.value=search.value.query;load();},{immediate:true});
function update(patch:Record<string,string|number|undefined>){void router.push({name:'diagrams',query:{...route.query,...patch}});}
function group(value:string){update({group:value,action:undefined,offset:undefined,diagram:undefined,cellOffset:undefined,choiceOffset:undefined,annotationOffset:undefined,focusCell:undefined});}
function action(value:string){update({action:value,offset:undefined,diagram:undefined,item:undefined,direction:undefined,cellOffset:undefined,choiceOffset:undefined,annotationOffset:undefined,focusCell:undefined});}
function scene(offset:number){update({offset,cellOffset:undefined,choiceOffset:undefined,annotationOffset:undefined,focusCell:undefined});}
function select(id:string,direction:'recipes'|'uses'){void router.push(itemLocation(id,route.query,direction==='uses'?'usedIn':'producedBy'));}
function candidates(cell:number,offset:number){update({cellOffset:cell,choiceOffset:offset,focusCell:'true'});}
const selected=computed(()=>page.value?.definitions.find(def=>!search.value.group||def.data.group===search.value.group));
</script>
<template>
  <section v-if="opening" class="state-panel" role="status">{{t("正在读取关系资料…")}}</section>
  <section v-else-if="openError" class="state-panel error" role="alert">{{openError}} <button @click="open()">{{t("重试")}}</button></section>
  <main v-else-if="catalog" class="catalog-page panel diagrams-page">
    <h1>{{t("GT 关系与资料")}}</h1>
    <p>{{t("查看电路、透镜、材料和矿物加工的原生关联。候选是替代选择；未注明的数量不会作为消耗量。")}}</p>
    <form class="diagram-filters" @submit.prevent="update({query:query||undefined,offset:undefined})">
      <label for="diagram-group">{{t("资料类型")}}</label><select id="diagram-group" :value="selected?.data.group??''" @change="group(($event.target as HTMLSelectElement).value)"><option v-for="definition in page?.definitions" :key="definition.id" :value="definition.data.group">{{definition.data.name}}</option></select>
      <label for="diagram-query">{{t("查找说明")}}</label><input id="diagram-query" v-model="query" maxlength="256" type="search" /><button>{{t("搜索")}}</button>
      <button type="button" @click="update({query:undefined,item:undefined,direction:undefined,diagram:undefined,offset:undefined,cellOffset:undefined,choiceOffset:undefined,annotationOffset:undefined,focusCell:undefined})">{{t("清空筛选")}}</button>
      <label for="diagram-selection">{{t("资料范围")}}</label><select id="diagram-selection" :value="search.selection" @change="update({selection:($event.target as HTMLSelectElement).value,offset:undefined})"><option value="all">{{t("完整资料")}}</option><option value="native">{{t("按游戏显示规则筛选")}}</option></select>
      <template v-if="search.selection==='native' && search.item && !search.action">
        <label><input type="checkbox" :checked="search.shift" @change="update({shift:($event.target as HTMLInputElement).checked?'true':undefined,offset:undefined})" />{{t("按住 Shift 时的结果")}}</label>
        <label><input type="checkbox" :checked="search.ctrl" @change="update({ctrl:($event.target as HTMLInputElement).checked?'true':undefined,offset:undefined})" />{{t("按住 Ctrl 时的结果")}}</label>
      </template>
    </form>
    <p v-if="error" class="state-panel error" role="alert">{{error}} <button @click="load()">{{t("重试")}}</button></p>
    <p v-else-if="loading" class="state-panel" role="status">{{t("正在读取资料…")}}</p>
    <template v-else-if="page && records">
      <p v-if="!page.definitions.length" class="state-panel">{{t("本数据集没有已采集的关系资料。")}}</p>
      <p v-else-if="!page.total" class="state-panel">{{search.selection==='native'?t("按游戏显示规则，没有匹配的资料图。可切换到完整资料查看。"):t("没有匹配的资料图。")}}</p>
      <Pager :offset="search.offset" :limit="search.limit" :total="page.total" @change="scene" />
      <article v-for="diagram in page.diagrams" :key="diagram.id" class="diagram-record" :data-diagram="diagram.id">
        <h2><GameText :text="selected?.data.name??''" /> · {{diagram.data.diagram+1}}</h2>
        <RouterLink :to="{name:'diagrams',query:{...route.query,group:diagram.data.group,diagram:diagram.id,offset:undefined}}">{{t("此图固定链接")}}</RouterLink>
        <p v-if="selected?.data.matcher==='nativeMaterial'">{{t("物品关联来自本次原生列表、流体注册表和图中物品的匹配结果。")}}</p>
        <ul v-if="diagram.data.content.relations.length" class="diagram-relations"><li v-for="(relation,index) in diagram.data.content.relations" :key="index">{{title(relation.from)}} → {{title(relation.to)}}</li></ul>
        <div class="diagram-cells">
          <section v-for="cell in page.cells.filter(cell=>cell.diagram===diagram.id)" :key="cell.cell" class="diagram-cell" :data-cell="cell.cell">
            <h3>{{title(cell.group)}} · {{cell.index+1}}</h3>
            <div class="diagram-cell-notes"><DiagramNote :tooltip="diagram.data.content.cells[cell.cell]!.tooltip" :catalog="catalog" :records="records" :animate="preferences.animate" @select="select" /></div>
            <p v-if="cell.total===0" class="diagram-empty">{{t("原生逻辑空位")}}</p>
            <template v-else>
              <small class="diagram-count">{{t("{0} 个替代候选", cell.total)}}</small>
              <div class="diagram-choices"><DiagramNote v-for="(display,index) in cell.alternatives" :key="index" :display="display" :catalog="catalog" :records="records" :animate="preferences.animate" @select="select" /></div>
              <button v-if="cell.offset>0" @click="candidates(cell.cell,Math.max(0,cell.offset-cell.limit))">{{t("上一组候选")}}</button>
              <button v-if="cell.offset+cell.limit<cell.total" @click="candidates(cell.cell,cell.offset+cell.limit)">{{t("下一组候选")}}</button>
            </template>
          </section>
        </div>
        <button v-if="search.cellLimit===1" @click="update({focusCell:undefined,choiceOffset:undefined,cellOffset:undefined})">{{t("返回全部槽位")}}</button>
        <Pager :offset="search.cellOffset" :limit="search.cellLimit" :total="diagram.data.content.cells.length" @change="offset=>update({cellOffset:offset,choiceOffset:undefined,focusCell:undefined})" />
        <section class="diagram-annotations">
          <h3>{{t("原生说明与条件")}}</h3>
          <div v-for="(entry,index) in page.annotations.filter(entry=>entry.diagram===diagram.id)" :key="index" class="diagram-annotation">
            <DiagramNote v-if="entry.kind==='label'" :label="entry.label" :catalog="catalog" :records="records" :animate="preferences.animate" @select="select" />
            <template v-else>
              <DiagramNote :label="entry.annotation.label" :tooltip="entry.annotation.tooltip" :catalog="catalog" :records="records" :animate="preferences.animate" @select="select" />
              <button v-if="entry.annotation.action" @click="action(entry.annotation.action.group)">{{t("查看此组资料")}}</button>
            </template>
          </div>
          <Pager :offset="search.annotationOffset" :limit="search.annotationLimit" :total="diagram.data.content.labels.length+diagram.data.content.annotations.length" @change="offset=>update({annotationOffset:offset})" />
        </section>
      </article>
    </template>
  </main>
</template>
<style scoped>
.diagram-cell-notes{line-height:1.5}.diagram-count{display:block;margin-top:6px}
.diagrams-page{min-width:0;padding:20px;padding-bottom:48px;overflow-wrap:anywhere}.diagram-filters{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:18px}.diagram-record{padding:16px;margin:12px 0;border:1px solid var(--color-border,#334155);border-radius:8px}.diagram-cells{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr));gap:12px;margin:16px 0}.diagram-cell{border:1px solid var(--color-border,#334155);border-radius:6px;padding:12px;min-width:0}.diagram-cell h3{font-size:1rem;margin:0 0 8px}.diagram-choices{display:flex;flex-direction:column;gap:12px;margin:10px 0}.diagram-empty{color:var(--color-text-secondary,#a0afc6);min-height:28px}.diagram-relations{display:flex;gap:12px;flex-wrap:wrap;padding-left:20px}.diagram-annotations{display:flex;flex-direction:column;gap:12px}.diagram-annotation{padding:8px 0;display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap}
</style>
