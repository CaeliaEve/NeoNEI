<script setup lang="ts">
import {t} from "../i18n/index.ts";
import type {ForgeStack} from '@neonei/catalog/source';
import type {Records,Catalog} from '../catalog/client.ts';
import ItemLink from './ItemLink.vue';
const props=defineProps<{stack:ForgeStack;records:Records;catalog:Catalog;offset:number;limit:number;animate:boolean}>();
const emit=defineEmits<{select:[id:string,direction:'recipes'|'uses'];choices:[offset:number]}>();
</script>
<template>
  <div class="registry-stack">
    <p><code>{{stack.registry}}</code> · {{stack.meta===32767?t("通配元数据"):t("元数据 {0}", stack.meta)}} {{t("· 登记数量")}} {{stack.amount}}</p>
    <div class="registry-icons"><ItemLink v-for="id in props.stack.displays.slice(offset,offset+limit)" :key="id" :target="{kind:'item',id}" :catalog="catalog" :records="records" :animate="animate" @select="(id,direction)=>emit('select',id,direction)" /></div>
    <nav v-if="stack.displays.length>limit" :aria-label="t('登记项显示变体')"><button :disabled="offset===0" @click="emit('choices',Math.max(0,offset-limit))">{{t("上一组变体")}}</button><span>{{Math.min(offset,stack.displays.length)}}–{{Math.min(offset+limit,stack.displays.length)}} / {{stack.displays.length}}</span><button :disabled="offset+limit>=stack.displays.length" @click="emit('choices',offset+limit)">{{t("下一组变体")}}</button></nav>
    <details v-if="stack.nbt"><summary>{{t("原始登记 NBT")}}</summary><pre>{{JSON.stringify(stack.nbt,null,2)}}</pre></details>
  </div>
</template>
<style scoped>
.registry-stack{min-width:0;overflow-wrap:anywhere}.registry-icons{display:flex;flex-wrap:wrap;gap:8px}.registry-stack pre{white-space:pre-wrap;max-height:240px;overflow:auto}.registry-stack nav{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.registry-icons :deep(.item-link){max-width:100%}
</style>
