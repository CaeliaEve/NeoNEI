<script setup lang="ts">
import {watch} from 'vue';
import {useRoute} from 'vue-router';
import {language,setLanguage,uiLanguage} from './i18n/index.ts';
const route=useRoute();
watch(()=>route.query.lang,value=>{const selected=uiLanguage(value);if(selected)setLanguage(selected);},{immediate:true});
document.documentElement.lang=language.value;
</script>
<template><div class="app-frame"><RouterView :key="language" /></div></template>
<style>
.app-frame { min-height: 100vh; background: linear-gradient(182deg, #050608, #090b10 56%, #050608); }
</style>
