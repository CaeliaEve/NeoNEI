<script setup lang="ts">
import type { Topic } from '@elysium/contracts';
import type { Catalog, Records } from '../catalog/client.ts';
import { plain } from '../catalog/format.ts';
import GameText from './GameText.vue';
import Icon from './Icon.vue';
withDefaults(defineProps<{ topic: Topic; catalog: Catalog; records: Records; animate: boolean; compact?: boolean; size?: number; note?: string }>(),
  { compact: false, size: 24, note: '' });
</script>

<template>
  <RouterLink class="topic-link" :class="{ compact }" :aria-label="plain(topic.name) + (note ? ' · ' + note : '')" :title="plain(topic.name) + (note ? ' · ' + note : '')"
    :to="{ name: topic.kind, params: { id: topic.id }, query: { catalog: catalog.manifest.id, ...(catalog.offline ? { offline: '1' } : {}) } }">
    <Icon v-if="topic.icon || topic.image" :atlas="catalog.atlas" :texture="records.picture(topic)" :width="size" :height="size" :animate="animate" :label="plain(topic.name)" />
    <GameText v-if="!compact" :text="topic.name" /><slot />
  </RouterLink>
</template>

<style scoped>.topic-link { display: inline-flex; align-items: center; gap: .4rem; }.topic-link.compact { position: relative; gap: 0; }</style>
