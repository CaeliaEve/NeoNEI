<script setup lang="ts">
import {t} from "../i18n/index.ts";
import {computed} from 'vue';
import type {NativeDiagramComponent,NativeDiagramDisplay,NativeDiagramLabel,NativeDiagramTooltipElement} from '@elysium/contracts';
import type {Catalog,Records} from '../catalog/client.ts';
import ItemLink from './ItemLink.vue';
import GameText from './GameText.vue';
const props=defineProps<{component?:NativeDiagramComponent;display?:NativeDiagramDisplay;label?:NativeDiagramLabel;tooltip?:NativeDiagramTooltipElement[][];catalog:Catalog;records:Records;animate:boolean}>();
const emit=defineEmits<{select:[id:string,direction:'recipes'|'uses']}>();
const component=computed(()=>props.display?.component??(props.label?.kind==='component'?props.label.component:props.component));
const codes:Record<string,string>={BLACK:'0',DARK_BLUE:'1',DARK_GREEN:'2',DARK_AQUA:'3',DARK_RED:'4',DARK_PURPLE:'5',GOLD:'6',GRAY:'7',DARK_GRAY:'8',BLUE:'9',GREEN:'a',AQUA:'b',RED:'c',LIGHT_PURPLE:'d',YELLOW:'e',WHITE:'f',OBFUSCATED:'k',BOLD:'l',STRIKETHROUGH:'m',UNDERLINE:'n',ITALIC:'o',RESET:'r'};
const lines=computed(()=> (props.tooltip??props.display?.tooltip??[]).map(line=>{
  let format='';return line.map(element=>{if(element.kind==='formatting'){format=element.codes.map(code=>'§'+codes[code]).join('');return null;}return{element,text:element.kind==='text'?format+element.text:''};}).filter(value=>value!==null);
}));
</script>
<template>
  <span class="diagram-note">
    <GameText v-if="label?.kind==='text'" :text="label.text" />
    <template v-if="component">
      <ItemLink v-if="component.fact" :target="{kind:component.kind==='fluid'?'fluid':'item',id:component.fact,amount:display?.amount??null}" :records="records" :catalog="catalog" :animate="animate" @select="(id,direction)=>emit('select',id,direction)" />
      <span v-else-if="component.kind==='item'" class="diagram-template">{{t("{0} · 任意元数据", component.registry)}}</span>
    </template>
    <GameText v-if="display?.note" :text="display.note" />
    <small v-if="display && display.amount===null" class="diagram-unspecified">{{t("原生说明未指定数量")}}</small>
    <span v-for="(line,lineIndex) in lines" :key="lineIndex" class="diagram-note-line">
      <template v-for="(token,index) in line" :key="index">
        <GameText v-if="token.element.kind==='text'" :text="token.text" />
        <DiagramNote v-else-if="token.element.kind==='description'" :component="token.element.component" :records="records" :catalog="catalog" :animate="animate" @select="(id,direction)=>emit('select',id,direction)" />
        <DiagramNote v-else-if="token.element.kind==='display'" :display="token.element.display" :records="records" :catalog="catalog" :animate="animate" @select="(id,direction)=>emit('select',id,direction)" />
      </template>
    </span>
  </span>
</template>
<style scoped>
.diagram-note{display:inline-flex;flex-direction:column;gap:4px;min-width:0;max-width:100%;overflow-wrap:anywhere}.diagram-note-line{display:flex;flex-wrap:wrap;align-items:center;gap:6px;min-height:1em}.diagram-unspecified{color:var(--color-text-secondary,#a0afc6)}.diagram-template{font-family:monospace;overflow-wrap:anywhere}
.diagram-note :deep(.item-caption){display:flex;flex-direction:column;gap:4px;min-width:0;text-align:left}.diagram-note :deep(.item-caption small){white-space:nowrap}
</style>
