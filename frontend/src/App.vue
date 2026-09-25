<script setup lang="ts">
// Main App.vue - Router entry point
</script>

<template>
  <div class="app-frame">
    <router-view v-slot="{ Component, route }">
      <Transition name="app-route-fade" mode="out-in">
        <component :is="Component" :key="route.path" />
      </Transition>
    </router-view>
  </div>
</template>

<style>
.app-frame {
  position: relative;
  min-height: 100vh;
  isolation: isolate;
}

.app-frame::before,
.app-frame::after {
  content: "";
  position: fixed;
  inset: -20%;
  pointer-events: none;
  z-index: -1;
}

.app-frame::before {
  background:
    radial-gradient(120% 90% at 50% -10%, rgba(255, 255, 255, 0.055), transparent 62%),
    radial-gradient(62% 74% at 12% 18%, rgba(92, 109, 138, 0.14), transparent 72%),
    radial-gradient(58% 66% at 86% 84%, rgba(67, 82, 112, 0.12), transparent 74%),
    linear-gradient(182deg, #050608 0%, #090b10 56%, #050608 100%);
  animation: app-bg-drift 78s ease-in-out infinite alternate;
}

.app-frame::after {
  opacity: 0.22;
  background-image:
    radial-gradient(140% 110% at 50% 50%, transparent 58%, rgba(0, 0, 0, 0.44) 100%),
    repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.012) 0 1px, transparent 1px 3px);
  background-size: 100% 100%, 100% 100%;
  mix-blend-mode: soft-light;
  animation: app-film-shift 120s linear infinite;
}

.app-frame > * {
  position: relative;
  z-index: 1;
}

.app-route-fade-enter-active,
.app-route-fade-leave-active {
  transition: opacity 240ms ease, transform 240ms ease, filter 240ms ease;
}

.app-route-fade-enter-from,
.app-route-fade-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.995);
  filter: blur(4px);
}

@media (prefers-reduced-motion: reduce) {
  .app-route-fade-enter-active,
  .app-route-fade-leave-active {
    transition: opacity 120ms linear;
  }

  .app-route-fade-enter-from,
  .app-route-fade-leave-to {
    transform: none;
    filter: none;
  }
}

@keyframes app-bg-drift {
  0% {
    transform: translate3d(-0.35%, -0.25%, 0) scale(1);
    filter: saturate(94%);
  }
  100% {
    transform: translate3d(0.45%, 0.55%, 0) scale(1.012);
    filter: saturate(102%);
  }
}

@keyframes app-film-shift {
  from {
    transform: translate3d(0, 0, 0);
  }
  to {
    transform: translate3d(0, -1.2%, 0);
  }
}
</style>
