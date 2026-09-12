<script setup lang="ts">
import { computed } from 'vue';
import type { Reference } from '@elysium/contracts';
import { Catalog, Records } from '../catalog/client.ts';
import { amount, plain } from '../catalog/format.ts';
import Icon from './Icon.vue';
import GameText from './GameText.vue';
const props = withDefaults(defineProps<{ target: Reference & { amount?: string }; records: Records; catalog: Catalog;
  width?: number; height?: number; animate?: boolean; compact?: boolean; note?: string }>(),
  { width: 28, height: 28, animate: true, compact: false, note: '' });
const emit = defineEmits<{ select: [id: string, direction: 'recipes' | 'uses'] }>();
const record = computed(() => props.records.substance(props.target.kind, props.target.id));
const name = computed(() => props.records.text(record.value.name));
const title = computed(() => [plain(name.value), props.target.amount ? amount(props.target.amount) + (props.target.kind === 'fluid' ? ' mB' : '') : '',
  record.value.registry, props.note, ...('tooltip' in record.value ? record.value.tooltip.map(id => plain(props.records.text(id))) : [])].filter(Boolean).join('\n'));
</script>

<template>
  <button type="button" class="item-link" :class="{ compact }" :title="title" :aria-label="title"
    @click="emit('select', target.id, 'recipes')" @contextmenu.prevent="emit('select', target.id, 'uses')"
    @keydown.r.prevent="emit('select', target.id, 'recipes')" @keydown.u.prevent="emit('select', target.id, 'uses')">
    <Icon :atlas="catalog.atlas" :texture="records.texture(target.kind, target.id)" :width="width" :height="height" :animate="animate" :label="plain(name)" />
    <span v-if="compact && target.amount && target.amount !== '1'" class="quantity">{{ target.amount }}</span>
    <span v-if="!compact" class="item-caption"><GameText :text="name" /><small v-if="target.amount">{{ amount(target.amount) }}{{ target.kind === 'fluid' ? ' mB' : '' }}</small></span>
  </button>
</template>
