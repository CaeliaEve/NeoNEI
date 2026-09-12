<script setup lang="ts">
import type { PropertyValue } from '@elysium/contracts';
import { Catalog, Records } from '../catalog/client.ts';
import { amount, units } from '../catalog/format.ts';
import ItemLink from './ItemLink.vue';
import GameText from './GameText.vue';
defineProps<{ value: PropertyValue; records: Records; catalog: Catalog; animate: boolean }>();
const emit = defineEmits<{ select: [id: string, direction: 'recipes' | 'uses'] }>();
</script>

<template>
  <span v-if="value.kind === 'integer'">{{ amount(value.value) }}</span>
  <span v-else-if="value.kind === 'decimal'">{{ value.value }}</span>
  <span v-else-if="value.kind === 'quantity'">{{ amount(value.amount) }} {{ units[value.unit] }}</span>
  <GameText v-else-if="value.kind === 'text'" :text="records.text(value.text)" />
  <span v-else-if="value.kind === 'flag'">{{ value.value ? '是' : '否' }}</span>
  <ItemLink v-else-if="value.kind === 'reference'" :target="value.target" :catalog="catalog" :records="records" :animate="animate"
    @select="(id, direction) => emit('select', id, direction)" />
  <span v-else-if="value.kind === 'symbol'" :title="value.namespace">{{ value.value }}</span>
  <ul v-else-if="value.kind === 'list'" class="property-list"><li v-for="(entry, index) in value.values" :key="index">
    <Value :value="entry" :records="records" :catalog="catalog" :animate="animate" @select="(id, direction) => emit('select', id, direction)" />
  </li></ul>
  <dl v-else-if="value.kind === 'map'" class="property-map"><template v-for="(entry, key) in value.values" :key="key">
    <dt>{{ key }}</dt><dd><Value :value="entry" :records="records" :catalog="catalog" :animate="animate" @select="(id, direction) => emit('select', id, direction)" /></dd>
  </template></dl>
</template>
