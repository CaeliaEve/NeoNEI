<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, watch } from 'vue';
import type { Element, Input, Output, Recipe } from '@elysium/contracts';
import { Catalog, Records, required } from '../catalog/client.ts';
import { amount, chance, color, ticks } from '../catalog/format.ts';
import { Playback } from '../catalog/clock.ts';
import GameText from './GameText.vue';
import Icon from './Icon.vue';
import ItemLink from './ItemLink.vue';
import Slot from './Slot.vue';
import Value from './Value.vue';
import TopicLink from './TopicLink.vue';

const props = defineProps<{ recipe: Recipe; records: Records; catalog: Catalog; animate: boolean; scale: number; focus?: string; direction?: 'recipes' | 'uses' }>();
const emit = defineEmits<{ select: [id: string, direction: 'recipes' | 'uses']; open: [id: string] }>();
const playback = new Playback();
watch(() => props.animate, value => { playback.playing = value; }, { immediate: true });
onBeforeUnmount(() => playback.close());
const choices = reactive<Record<string, number>>({});
watch([() => props.recipe.id, () => props.catalog.manifest.id, () => props.focus, () => props.direction], () => {
  for (const key of Object.keys(choices)) delete choices[key];
  if (!props.focus) return;
  if (props.direction === 'uses') {
    for (const input of props.recipe.inputs) {
      const index = input.choices.findIndex(choice => choice.id === props.focus);
      if (index >= 0) choices['input' + input.kind + input.slot] = index;
    }
  } else {
    for (const output of props.recipe.outputs) {
      const index = output.change?.samples.findIndex(sample => sample.id === props.focus) ?? -1;
      if (index >= 0 && output.change) { choices['inputitem' + output.change.input] = index; break; }
    }
  }
}, { immediate: true });
const category = computed(() => required(props.records.categories, props.recipe.category));
const view = computed(() => {
  const id = props.recipe.view ?? category.value.view;
  return id ? required(props.records.views, id) : null;
});
const elements = computed(() => [...(view.value?.elements ?? [])].sort((left, right) => left.z - right.z));
const magicName = computed(() => props.recipe.magic?.kind === 'arcane' ? '奥术合成' : props.recipe.magic?.kind === 'crucible' ? '坩埚炼金' : '注魔');
const products = computed(() => props.recipe.outputs.map(output => {
  if (!output.change) return output;
  const index = choices['inputitem' + output.change.input] ?? 0;
  const sample = output.change.samples[index];
  if (!sample) throw new Error('所选输入缺少对应的产物示例');
  return { ...output, ...sample };
}));
function input(slot: number): Input {
  const value = props.recipe.inputs.find(row => row.kind === 'item' && row.slot === slot);
  if (!value) throw new Error('合成网格引用了不存在的输入');
  return value;
}
function cost(index: number) {
  const value = props.recipe.magic?.aspects[index];
  if (!value) throw new Error('配方视图引用了不存在的要素成本');
  return value;
}
function position(element: Element): Record<string, string | number> {
  const style: Record<string, string | number> = { left: element.x * props.scale + 'px', top: element.y * props.scale + 'px', zIndex: element.z };
  if ('width' in element) { style.width = element.width * props.scale + 'px'; style.height = element.height * props.scale + 'px'; }
  if (element.kind === 'rectangle') style.background = color(element.color);
  if (element.kind === 'text') {
    style.color = color(element.color); style.fontSize = 9 * props.scale + 'px';
    style.transform = element.align === 'center' ? 'translateX(-50%)' : element.align === 'right' ? 'translateX(-100%)' : '';
  }
  return style;
}
function stack(element: Extract<Element, { kind: 'slot' }>): Input | Output {
  const result = (element.direction === 'input' ? props.recipe.inputs : products.value)
    .find(row => row.slot === element.slot && row.kind === element.substance);
  if (!result) throw new Error('配方视图引用了不存在的槽位');
  return result;
}
function consumption(input: Input): string {
  const choice = chosen(input);
  return choice.consume.kind === 'keep' ? '不消耗' : choice.consume.kind === 'damage' ? '耐久 −' + choice.consume.points : '';
}
function chosen(input: Input) {
  const choice = input.choices[choices['input' + input.kind + input.slot] ?? 0];
  if (!choice) throw new Error('配方输入缺少所选候选');
  return choice;
}
</script>

<template>
  <article class="recipe-card" :data-recipe="recipe.id">
    <header><h3><GameText :text="records.text(category.name)" /></h3><button type="button" class="quiet" @click="emit('open', recipe.id)" aria-label="单独打开此配方">↗</button></header>
    <div v-if="view" class="view-scroll">
      <div class="recipe-view" :style="{ width: view.width * scale + 'px', height: view.height * scale + 'px' }">
        <template v-for="(element, index) in elements" :key="index">
          <div v-if="element.kind === 'sprite' || element.kind === 'clip'" class="view-element view-art" :style="position(element)">
            <Icon :atlas="catalog.atlas" :texture="required(records.textures, element.asset)" :width="element.width * scale"
              :height="element.height * scale" :animate="animate" :motion="element.kind === 'clip' ? required(records.tracks, element.track).frames : undefined"
              :playback="element.kind === 'clip' ? playback : undefined"
              :label="element.kind === 'clip' ? '配方进度动画' : '配方背景'" />
          </div>
          <div v-else-if="element.kind === 'slot'" class="view-element" :style="position(element)">
            <Slot :stack="stack(element)" :records="records" :catalog="catalog" :size="element.width * scale" :height="element.height * scale"
              v-model:choice="choices[element.direction + element.substance + element.slot]" :animate="animate" @select="(id, direction) => emit('select', id, direction)" />
          </div>
          <div v-else-if="element.kind === 'cost'" class="view-element" :style="position(element)">
            <TopicLink :topic="required(records.topics, cost(element.index).aspect)" :catalog="catalog" :records="records" :animate="animate"
              compact :size="element.width * scale" :note="amount(cost(element.index).amount) + (recipe.magic?.kind === 'arcane' ? ' Vis' : ' 源质')">
              <span class="quantity">{{ amount(cost(element.index).amount) }}</span>
            </TopicLink>
          </div>
          <GameText v-else-if="element.kind === 'text'" class="view-element view-text" :style="position(element)" :text="records.text(element.text)" />
          <div v-else-if="element.kind === 'rectangle'" class="view-element" :style="position(element)" />
          <button v-else-if="element.kind === 'tooltip'" type="button" class="view-element hotspot" :style="position(element)"
            :title="element.lines.map(id => records.text(id)).join('\n')" :aria-label="element.lines.map(id => records.text(id)).join('\n')" />
        </template>
      </div>
    </div>
    <div v-else class="recipe-flow">
      <div v-if="recipe.grid" class="crafting-grid" :style="{ gridTemplateColumns: 'repeat(' + recipe.grid.width + ', 42px)' }" aria-label="合成网格">
        <div v-for="(slot, cell) in recipe.grid.cells" :key="cell" class="crafting-cell">
          <Slot v-if="slot != null" :stack="input(slot)" :records="records" :catalog="catalog" :animate="animate" v-model:choice="choices['inputitem' + slot]"
            @select="(id, direction) => emit('select', id, direction)" />
        </div>
      </div>
      <div v-else><Slot v-for="input in recipe.inputs" :key="input.kind + input.slot" :stack="input" :records="records" :catalog="catalog" :animate="animate" v-model:choice="choices['input' + input.kind + input.slot]"
        @select="(id, direction) => emit('select', id, direction)" /></div><span aria-label="产出">→</span>
      <div><Slot v-for="output in products" :key="output.kind + output.slot" :stack="output" :records="records" :catalog="catalog" :animate="animate"
        @select="(id, direction) => emit('select', id, direction)" /></div>
    </div>
    <div class="recipe-stats">
      <span v-if="recipe.duration != null" :title="recipe.duration + ' tick'">{{ ticks(recipe.duration) }}</span>
      <span v-if="recipe.energy != null">{{ amount(recipe.energy) }} EU/t</span>
      <span v-if="recipe.grid">{{ recipe.grid.width }} × {{ recipe.grid.height }} 网格{{ recipe.grid.mirror ? ' · 可镜像' : '' }}</span>
    </div>
    <section v-if="recipe.magic" class="recipe-magic" aria-label="魔法用量与研究">
      <h4>{{ magicName }}</h4>
      <p class="magic-cost-note">{{ recipe.magic.kind === 'arcane' ? '基础 Vis 用量，装备减免另计。' : '每次配方消耗的源质。' }}</p>
      <p v-if="recipe.magic.creative">{{ recipe.magic.aspects.length ? '创造模式免 Vis 消耗。' : '此组合缺少可用于生存模式的 Vis 成本，仅在创造模式免消耗配置下可用。' }}</p>
      <div class="magic-costs"><span v-for="value in recipe.magic.aspects" :key="value.aspect">
        <TopicLink :topic="required(records.topics, value.aspect)" :catalog="catalog" :records="records" :animate="animate" /> × {{ amount(value.amount) }}
      </span></div>
      <section v-if="recipe.magic.kind === 'arcane'" class="magic-payment" aria-label="供能方式">
        <p>工作台供能槽中的法杖支付 Vis。</p>
        <template v-if="recipe.magic.payment">
          <p>供能槽空置时，也可由待替换法杖自行供能。需要足够的原有充能，按原法杖部件和玩家装备折扣先支付 Vis。
            {{ recipe.magic.payment.preserve ? '付款后保留剩余充能，每种要素最多 ' + recipe.magic.payment.capacity / 100 + ' Vis。' : '完成替换后清空充能。' }}</p>
          <p>下方产物示例按额外法杖供能显示，自行供能后的实际余量由游戏计算。</p>
        </template>
      </section>
      <p v-if="recipe.magic.instability != null">基础不稳定性：{{ recipe.magic.instability }}</p>
      <div v-if="recipe.magic.central != null" class="magic-central"><span>中心材料</span>
        <ItemLink :target="{ kind: 'item', ...chosen(input(recipe.magic.central)) }" :catalog="catalog" :records="records" :animate="animate"
          @select="(id, direction) => emit('select', id, direction)" /></div>
      <div v-if="recipe.magic.research.length" class="magic-requirements" aria-label="配方研究条件">
        <h4>研究条件</h4><div v-for="study in recipe.magic.research" :key="study.key">
          <TopicLink v-if="study.id" :topic="required(records.topics, study.id)" :catalog="catalog" :records="records" :animate="animate" />
          <code v-else>{{ study.key }}</code><span>{{ study.completed == null ? '快照状态未知' : study.completed ? '快照中已完成' : '快照中尚未完成' }}</span>
        </div>
      </div>
    </section>
    <section v-for="output in products.filter(output => output.change)" :key="output.slot" class="recipe-changes" aria-label="产物数据变换">
      <h4>产物随所选输入变化</h4>
      <template v-if="output.change?.action.kind === 'patch'">
        <p>保留输入物品及其其他数据。<template v-if="Object.keys(output.change.action.set).length">替换标签：<code>{{ Object.keys(output.change.action.set).join('、') }}</code>。</template>
          <template v-if="Object.keys(output.change.action.limits).length">超出新上限的数值会被裁剪。</template></p>
        <details><summary>数据修改规则</summary><pre>{{ JSON.stringify(output.change.action, null, 2) }}</pre></details>
      </template>
      <template v-else-if="output.change?.action.kind === 'merge'">
        <p>中心物品含非空 NBT 时继承其数据{{ output.change.action.tools ? '，输入和产物均为护甲或工具时生效' : '' }}。产物已有普通字段优先保留，复合标签合并，同类型列表按顺序追加。</p>
        <p v-if="output.change.action.keys">仅继承根标签：{{ output.change.action.keys.join('、') }}</p>
        <p v-if="!required(records.items, output.change.action.base.id).nbt">继承发生且原始产物没有 NBT 时，还会沿用中心物品的 metadata 和数量。</p>
      </template>
      <details><summary>当前结果 NBT</summary><pre>{{ JSON.stringify(required(records.items, output.id).nbt, null, 2) }}</pre></details>
    </section>
    <details class="recipe-details" :open="!view">
      <summary>用量与条件</summary>
      <div class="ingredients"><section><h4>输入</h4>
        <div v-for="input in recipe.inputs" :key="input.kind + input.slot" class="ingredient">
          <ItemLink :target="{ kind: input.kind, ...chosen(input) }" :records="records" :catalog="catalog" :animate="animate"
            @select="(id, direction) => emit('select', id, direction)" />
          <small>{{ consumption(input) }}<template v-if="input.choices.length > 1"> · {{ input.choices.length }} 个候选</template></small>
          <template v-for="returned in chosen(input).returns" :key="returned.kind + returned.id"><small>归还</small>
            <ItemLink :target="returned" :records="records" :catalog="catalog" :animate="animate" @select="(id, direction) => emit('select', id, direction)" />
          </template>
        </div>
      </section><section><h4>产出</h4>
        <div v-for="output in products" :key="output.kind + output.slot" class="ingredient">
          <ItemLink :target="output" :records="records" :catalog="catalog" :animate="animate" @select="(id, direction) => emit('select', id, direction)" />
          <small>{{ chance(output.chance) }}{{ output.role === 'return' ? ' · 归还' : '' }}</small>
        </div>
      </section></div>
      <dl class="properties"><template v-for="(property, key) in recipe.properties" :key="key">
        <dt><GameText :text="records.text(property.name)" /></dt>
        <dd><Value :value="property.value" :records="records" :catalog="catalog" :animate="animate" @select="(id, direction) => emit('select', id, direction)" /></dd>
      </template></dl>
    </details>
  </article>
</template>
