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
  <section v-if="error" class="state-panel error app-error" role="alert"><h1>界面无法继续显示</h1><p>{{ error }}</p><button type="button" @click="reload">重新加载</button></section>
  <div v-else class="app-frame">
    <RouterView v-slot="{ Component, route }">
      <Transition name="app-route-fade" mode="out-in">
        <component :is="Component" :key="route.path" />
      </Transition>
    </RouterView>
  </div>
</template>

<style>
.app-frame { position: relative; min-height: 100vh; isolation: isolate; }
.app-frame::before, .app-frame::after { content: ''; position: fixed; inset: -20%; pointer-events: none; z-index: -1; }
.app-frame::before {
  background:
    radial-gradient(95% 78% at 50% -12%, rgba(94, 167, 190, .13), transparent 64%),
    radial-gradient(58% 72% at 4% 30%, rgba(45, 79, 116, .16), transparent 72%),
    radial-gradient(64% 72% at 96% 84%, rgba(36, 70, 94, .15), transparent 74%),
    linear-gradient(182deg, #05080d 0%, #09111b 55%, #05070b 100%);
}
.app-frame::after {
  opacity: .23;
  background-image: radial-gradient(140% 110% at 50% 50%, transparent 57%, rgba(0,0,0,.58) 100%), repeating-linear-gradient(0deg, rgba(255,255,255,.012) 0 1px, transparent 1px 3px);
  mix-blend-mode: soft-light;
}
.app-frame > * { position: relative; z-index: 1; }
.app-route-fade-enter-active, .app-route-fade-leave-active { transition: opacity 180ms ease, transform 180ms ease, filter 180ms ease; }
.app-route-fade-enter-from, .app-route-fade-leave-to { opacity: 0; transform: translateY(6px); filter: blur(3px); }
.app-error { min-height: 100vh; display: grid; place-content: center; }
@media (prefers-reduced-motion: reduce) { .app-route-fade-enter-active, .app-route-fade-leave-active { transition: opacity 100ms linear; } .app-route-fade-enter-from, .app-route-fade-leave-to { transform: none; filter: none; } }
</style>
