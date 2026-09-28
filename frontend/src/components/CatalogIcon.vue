<script setup lang="ts">
import { shallowRef, watch } from 'vue';
import type { Texture } from '@elysium/contracts';
import type { Catalog } from '../catalog/client';
import { session } from '../services/api/elysiumFacade';
import Icon from './Icon.vue';
const props = withDefaults(defineProps<{ id: string; size?: number; label?: string; animate?: boolean }>(), { size: 42, label: '', animate: true });
const current = shallowRef<{ catalog: Catalog; texture: Texture | null } | null>(null);
const error = shallowRef('');
watch(() => props.id, async (id, _old, cleanup) => {
  const controller = new AbortController(); cleanup(() => controller.abort()); current.value = null; error.value = '';
  try {
    const catalog = await session();
    const entry = await catalog.record('browse', id, controller.signal);
    const texture = entry.icon ? await catalog.record('textures', entry.icon, controller.signal) : null;
    if (!controller.signal.aborted) current.value = { catalog, texture };
  } catch (cause) { if (!controller.signal.aborted) error.value = cause instanceof Error ? cause.message : String(cause); }
}, { immediate: true });
</script>
<template>
  <Icon v-if="current" :atlas="current.catalog.atlas" :texture="current.texture" :width="size" :height="size" :label="label" :animate="animate" />
  <span v-else :title="error" :style="{ width: size + 'px', height: size + 'px' }" aria-label="纹理未就绪">◇</span>
</template>
