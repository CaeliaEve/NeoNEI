<script setup lang="ts">
import { t, language } from "../i18n/index.ts";
import { computed, ref, watch } from 'vue';
import type { Recipe } from '@elysium/contracts';
import { Catalog, Records, required } from '../catalog/client.ts';
import ItemLink from './ItemLink.vue';
import Pager from './Pager.vue';
type Process = Extract<NonNullable<Recipe['process']>, { kind: 'railcraftBlast' }>;
const props = defineProps<{ process: Process; records: Records; catalog: Catalog; animate: boolean }>();
const emit = defineEmits<{ select: [id: string, direction: 'recipes' | 'uses'] }>();
const offset = ref(0), limit = 24;
const visible = computed(() => props.process.fuel.allowed.slice(offset.value, offset.value + limit));
watch(() => props.process, () => { offset.value = 0; });
</script>

<template>
  <section class="independent-fuel" :aria-label="t('高炉独立燃料供应')">
    <h4> {{ t("独立燃料供应") }} </h4>
    <p> {{ t("燃料由独立燃料槽供应，不计入每条配方的固定材料用量。主控制器每游戏刻减少 5 点燃烧预算，空闲或暂停时也会消耗已有预算。") }} </p>
    <p> {{ t("仅当原料为正量、存在有效配方、产物空间足够、机器未暂停且剩余预算不超过 10 时补燃。燃料必须通过下表的原生匹配，且当前燃烧值大于零；新值与剩余预算按原生整数规则累加。") }} </p>
    <p> {{ t("燃料堆多于一件时只减少一件；仅剩一件时才执行该物品的原生容器规则，可能涉及火石退化或生命网络资源。用量取决于空闲时间、补燃状态和运行条件，不能按配方次数固定换算。") }} </p>
    <p v-if="!process.fuel.allowed.length"> {{ t("原生燃料表已就绪，当前没有允许的燃料。") }} </p>
    <ul v-else class="allowed-fuels">
      <li v-for="(fuel,index) in visible" :key="offset+index">
        <ItemLink :target="{kind:'item',id:fuel.item}" :records="records" :catalog="catalog" :animate="animate" @select="(id,direction)=>emit('select',id,direction)" />
        <span>{{ !fuel.subtypes || fuel.metadata===-1 || fuel.metadata===32767 ? t("接受全部变体") : t("变体 {0}", fuel.metadata) }} {{ t("；NBT 按原生规则与模板比较。模板数量") }} {{ fuel.templateAmount }}。</span>
        <RouterLink :to="{name:'furnace-fuels',query:{catalog:catalog.manifest.id,query:required(records.items,fuel.item).registry}}"> {{ t("查看燃料样本") }} </RouterLink>
      </li>
    </ul>
    <Pager :total="process.fuel.allowed.length" :offset="offset" :limit="limit" :label="t('高炉允许燃料')" @change="offset=$event" />
    <details>
      <summary> {{ t("燃烧值与原生缓存") }} </summary>
      <p> {{ t("先检查最近一次燃料缓存。相同物品和变体下，本次燃料没有 NBT 时可复用旧缓存值；本次带 NBT 时要求原生标签比较通过。") }} </p>
      <p> {{ t("缓存未命中时，先处理脚手架、烈焰棒、熔岩容器与废料的原生特殊规则，再查询原生熔炉燃料。规则里的烈焰棒 1000 点和熔岩液量不表示它们一定通过本机的允许燃料表。原生查询遇到其捕获的异常时返回零。") }} </p>
      <p> {{ t("页面中的熔炉燃料时长是已有样本观测值，不能保证本机在所有状态下得到相同数值。") }} </p>
    </details>
  </section>
</template>

<style scoped>
.independent-fuel{margin:1rem 0;padding:1rem;border:1px solid var(--border,#334155);border-radius:.5rem}.independent-fuel p{line-height:1.6}.allowed-fuels{list-style:none;padding:0}.allowed-fuels li{display:flex;align-items:center;flex-wrap:wrap;gap:.5rem;margin:.6rem 0}.allowed-fuels span{flex:1;min-width:12em}
</style>
