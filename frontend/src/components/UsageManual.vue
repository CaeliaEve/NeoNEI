<script setup lang="ts">
import {computed} from 'vue';
import type {UsageDocument,UsageResource} from '@neonei/catalog/source';
import type {Catalog,Records} from '../catalog/client.ts';
import {t} from '../i18n/index.ts';
import GameText from './GameText.vue';
import ItemLink from './ItemLink.vue';
const props=defineProps<{document:UsageDocument;resources:UsageResource[];catalog:Catalog;records:Records;animate:boolean}>();
const emit=defineEmits<{navigate:[path:string,anchor:string];select:[id:string,direction:'recipes'|'uses']}>();
const manual=computed(()=>props.document.data.content.kind==='manual'?props.document.data.content:null);
const images=computed(()=>new Map(props.resources.map(row=>[row.data.key,row.data])));
const lines=computed(()=>manual.value?.lines.map(raw=>{
  const heading=/^(#{1,6})\s+(.*)$/.exec(raw),text=heading?heading[2]:raw;
  const parts:Array<{kind:'text';text:string}|{kind:'link';index:number}|{kind:'image';index:number}>=[];let cursor=0;
  for(const match of text.matchAll(/(!?)\[([^\]]*)\]\(([^)]+)\)/g)){
    const start=match.index!,href=match[3].trim().replace(/\s+".*"$/,'');if(start>cursor)parts.push({kind:'text',text:text.slice(cursor,start)});
    const values=match[1]?manual.value!.images:manual.value!.links,index=values.findIndex(value=>value.href===href&&value.label===match[2]);
    if(index<0)parts.push({kind:'text',text:match[0]});else parts.push({kind:match[1]?'image':'link',index});cursor=start+match[0].length;
  }
  if(cursor<text.length)parts.push({kind:'text',text:text.slice(cursor)});
  return{heading:!!heading,anchor:heading?text.trim().toLowerCase().replace(/\s+/g,'-'):'',parts};
})??[]);
</script>
<template>
  <section v-if="manual" class="usage-manual">
    <p v-if="manual.fallbackAttempted" class="native-fallback">{{t('此页缺少所选语言，显示原生英文回退。')}}</p>
    <p v-if="manual.status==='missing'">{{t('原生手册中没有此页。')}}</p>
    <component :is="line.heading?'h3':'p'" v-for="(line,index) in lines" :id="line.anchor||undefined" :key="index" class="manual-line">
      <template v-for="(part,partIndex) in line.parts" :key="partIndex">
        <GameText v-if="part.kind==='text'" :text="part.text" />
        <template v-else-if="part.kind==='link'">
          <a v-if="manual.links[part.index].kind==='external'" :href="manual.links[part.index].href" target="_blank" rel="noopener noreferrer">{{manual.links[part.index].label}}</a>
          <button v-else class="manual-link" @click="emit('navigate',manual.links[part.index].target,manual.links[part.index].anchor)">{{manual.links[part.index].label}}</button>
        </template>
        <template v-else>
          <template v-for="image in [manual.images[part.index]]" :key="part.index">
            <img v-if="image.kind==='png' && images.has(image.resource)" :src="'data:image/png;base64,'+images.get(image.resource)!.base64" :alt="image.label" :width="images.get(image.resource)!.width" :height="images.get(image.resource)!.height" loading="lazy" class="manual-image" />
            <span v-else-if="image.kind==='items'" class="manual-items"><ItemLink v-for="(item,i) in image.items" :key="i" :target="{kind:'item',id:item}" :records="records" :catalog="catalog" :animate="animate" @select="(id,direction)=>emit('select',id,direction)" /></span>
            <span v-else-if="image.kind==='missing'" class="manual-missing" :title="image.nativeWarning">{{t('原生图片缺失：{0}',image.label||image.href)}}</span>
          </template>
        </template>
      </template>
    </component>
  </section>
</template>
<style scoped>
.manual-line{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.7;min-height:1em}.manual-image{max-width:100%;height:auto;image-rendering:pixelated;vertical-align:middle}.manual-items{display:inline-flex;flex-wrap:wrap;gap:8px}.manual-link{color:var(--color-primary,#60a5fa);text-decoration:underline;background:none;border:0;padding:0;font:inherit;cursor:pointer}.manual-missing,.native-fallback{color:var(--color-text-secondary,#a0afc6)}
</style>
