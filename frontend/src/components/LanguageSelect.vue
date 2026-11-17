<script setup lang="ts">
import {ref} from 'vue';
import {useRoute} from 'vue-router';
import {checkManifest} from '@neonei/catalog/source';
import {request} from '../catalog/transport.ts';
import {saved} from '../offline/client.ts';
import {gameLanguage,language,t,uiLanguage} from '../i18n/index.ts';
const route=useRoute(),busy=ref(false),error=ref('');
async function change(event:Event):Promise<void>{
 const select=event.target as HTMLSelectElement,target=uiLanguage(select.value);
 if(!target||target===language.value)return;
 select.value=language.value;busy.value=true;error.value='';
 try{
  let id:string;
  const offline=route.query.offline==='1'||!navigator.onLine;
  if(offline){
   const copy=(await saved()).find(copy=>copy.state==='ready'&&copy.locale===gameLanguage(target));
   if(!copy)throw new Error(t('尚未发布或保存该语言的数据。'));id=copy.id;
  }else{
   const manifest=await checkManifest(await request('/api/catalog?locale='+gameLanguage(target)));
   if(manifest.locale!==gameLanguage(target))throw new Error(t('这份数据与所选语言不同，请切换到对应语言的数据。'));
   id=manifest.id;
  }
  // A fresh workspace drops language-specific filters, pending work and old captions together.
  const url=new URL('/',window.location.href);url.searchParams.set('catalog',id);url.searchParams.set('lang',target);
  if(offline)url.searchParams.set('offline','1');window.location.assign(url.href);
 }catch{error.value=t('尚未发布或保存该语言的数据。');busy.value=false;}
}
</script>
<template>
 <label class="workspace-language">{{t('语言')}}
  <select :value="language" :disabled="busy" :aria-label="t('语言')" @change="change">
   <option value="zh-CN">{{language==='en-US'?'Chinese':'简体中文'}}</option>
   <option value="en-US">{{language==='en-US'?'English':'英语'}}</option>
  </select>
 </label>
 <span v-if="error" role="alert" class="language-error">{{error}}</span>
</template>
<style scoped>
.workspace-language{display:flex;align-items:center;gap:6px;font-size:12px}.workspace-language select{color:inherit;background:#101722;border:1px solid #34485b;border-radius:3px;padding:3px}.language-error{font-size:12px;color:#fda4af}
</style>
