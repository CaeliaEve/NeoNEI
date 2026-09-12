<script setup lang="ts">
import { onErrorCaptured, ref } from 'vue';
const error = ref('');
onErrorCaptured(failure => {
  console.error(failure);
  error.value = failure instanceof Error ? failure.message : '界面遇到了错误';
  return false;
});
function reload(): void { window.location.reload(); }
</script>

<template>
  <section v-if="error" class="state-panel error" role="alert"><h1>界面无法继续显示</h1><p>{{ error }}</p><button type="button" @click="reload">重新加载</button></section>
  <RouterView v-else />
</template>
