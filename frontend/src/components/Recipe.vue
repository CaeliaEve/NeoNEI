<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, watch } from 'vue';
import type { Element, Input, Output, Recipe } from '@elysium/contracts';
import { quantityBounds } from '@neonei/catalog/source';
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
const visibleSlots = computed(() => new Set(elements.value.filter(element => element.kind === 'slot')
  .map(element => element.direction + '/' + element.substance + '/' + element.slot)));
const extraInputs = computed(() => props.recipe.inputs.filter(input => !visibleSlots.value.has('input/' + input.kind + '/' + input.slot)));
const extraOutputs = computed(() => products.value.filter(output => !visibleSlots.value.has('output/' + output.kind + '/' + output.slot)));
function quantityLabel(stack: Input | Output): string {
  if ('choices' in stack) {
    const choice = chosen(stack);
    if (props.recipe.process?.kind === 'vat' && stack.kind === 'fluid' && choice.consume.kind === 'keep') return '0';
    if (choice.consume.kind === 'pedestals') return amount(choice.amount) + '座*';
    if (choice.consume.kind === 'upto') return '≤' + amount(choice.amount);
    if (choice.consume.kind === 'reserve') return '可选';
  }
  if ('choices' in stack || !stack.quantity) return '';
  if (stack.quantity.kind === 'grinding') return amount(stack.quantity.nominal) + '×次数';
  const [low, high] = quantityBounds(props.recipe, stack);
  return amount(low.toString()) + (low === high ? '' : '–' + amount(high.toString()));
}
function quantityNote(stack: Input | Output): string {
  if ('choices' in stack || !stack.quantity) return '';
  const q = stack.quantity;
  if (q.kind === 'soul') return '两个产出共享完成条件；材料也为灵魂瓶时，以最后一个瓶中的灵魂决定是否产出。满足时尝试放入 '+amount(q.nominal)+' 件，输出空间可能减少实际取得量。';
  if (q.kind === 'grinding') return '本项阈值 ' + q.threshold + '；全部产物共享任务抽取。命中后每次完成尝试放入 ' + amount(q.nominal) + ' 件，研磨珠可能让同组结果重复产出，实际数量受珠子状态与输出空间影响。';
  if (q.kind === 'sharedRoll') return '全部产物共享一次抽取；本项阈值 ' + q.threshold + '，命中时尝试放入 ' + amount(q.nominal) + ' 件。阈值为零仍有 1/16,777,216 的命中机会；输出槽状态可能减少实际取得数量。';
  if (q.kind === 'harmony') return (q.outcome === 'success'
    ? '共享成功次数 × 产量系数 × 原生基数 ' + q.nominal + '；稳定场与流体过量影响产量。'
    : '失败次数 × 本次成功率 × 原生基数 ' + q.nominal + '；与正常产出共享同次结果，不乘产量系数。')
    + '所示为保守范围；' + (props.recipe.process?.kind === 'harmony' && props.recipe.process.mode === 'parallel' ? '星界阵列决定并行数。' : '单次模式含历史保底状态。');
  if (q.kind === 'draw') return '关联随机产出，与前序产物共享输入流体量。';
  if (q.kind === 'remainder') return '回收余量：输入总量减去本次已抽取的产物。';
  if (q.kind === 'branch') {
    const parameters = q.parameters ? '；参数：' + Object.entries(q.parameters).map(([key, value]) => `${key}=${value}`).join('，') : '';
    return `互斥工况分支【${q.group} / ${q.branch}】${q.condition ? '（' + q.condition + '）' : ''}${parameters}`;
  }
  if (q.kind === 'potential') {
    const parameters = q.parameters ? '；参数：' + Object.entries(q.parameters).map(([key, value]) => `${key}=${value}`).join('，') : '';
    return `潜在产量【${q.stat}】${q.condition ? '（' + q.condition + '）' : ''}${parameters}`;
  }
  return '';
}
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
  if (choice.consume.kind === 'reserve') return '可选研磨珠库存；装载新研磨珠时消耗一件，不是每条配方消耗一件';
  if (choice.consume.kind === 'wear') return '完工时尝试损耗工具；附魔与工具状态决定实际耐久变化';
  if (choice.consume.kind === 'allocated') return '按原生顺序分配需求；不是固定槽位扣除量';
  if (props.recipe.process?.kind === 'vat' && input.kind === 'fluid' && choice.consume.kind === 'keep') return '需有对应流体对象，可为零量；不消耗流体';
  if (choice.consume.kind === 'upto') return '至少一件即可；启动时最多消耗 ' + amount(choice.amount) + ' 件';
  if (choice.consume.kind === 'pedestals') return '样本座数；各座一件，实际数量随输入屏障变化';
  return choice.consume.kind === 'keep' ? '不消耗' : choice.consume.kind === 'buffer' ? '启动时耗尽内部存量；显示最低门槛' : choice.consume.kind === 'stack' ? '整叠处理；显示数量为示例' : choice.consume.kind === 'damage' ? '耐久 −' + choice.consume.points : '';
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
          <div v-else-if="element.kind === 'slot'" class="view-element" :style="position(element)"
            :data-direction="element.direction" :data-substance="element.substance" :data-slot="element.slot">
            <Slot :stack="stack(element)" :records="records" :catalog="catalog" :size="element.width * scale" :height="element.height * scale"
              :amount-label="quantityLabel(stack(element))" :quantity-note="quantityNote(stack(element))"
              v-model:choice="choices[element.direction + element.substance + element.slot]" :animate="animate" @select="(id, direction) => emit('select', id, direction)" />
          </div>
          <div v-else-if="element.kind === 'cost'" class="view-element" :style="position(element)">
            <TopicLink :topic="required(records.topics, cost(element.index).aspect)" :catalog="catalog" :records="records" :animate="animate"
              compact :size="element.width * scale" :note="(recipe.process?.kind === 'runic' ? '样本费用 ' : '') + amount(cost(element.index).amount) + (recipe.magic?.kind === 'arcane' ? ' Vis' : ' 源质')">
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
        :amount-label="quantityLabel(input)"
        @select="(id, direction) => emit('select', id, direction)" /></div><span aria-label="产出">→</span>
      <div><Slot v-for="output in products" :key="output.kind + output.slot" :stack="output" :records="records" :catalog="catalog" :animate="animate"
        :amount-label="quantityLabel(output)" :quantity-note="quantityNote(output)"
        @select="(id, direction) => emit('select', id, direction)" /></div>
    </div>
    <section v-if="view && (extraInputs.length || extraOutputs.length)" class="recipe-extra" aria-label="补充输入与产出">
      <div v-if="extraInputs.length"><h4>其他输入</h4><div class="extra-slots">
        <Slot v-for="input in extraInputs" :key="input.kind + input.slot" :stack="input" :records="records" :catalog="catalog" :animate="animate"
          :amount-label="quantityLabel(input)"
          v-model:choice="choices['input' + input.kind + input.slot]" @select="(id, direction) => emit('select', id, direction)" />
      </div></div>
      <div v-if="extraOutputs.length"><h4>其他产出</h4><div class="extra-slots">
        <Slot v-for="output in extraOutputs" :key="output.kind + output.slot" :stack="output" :records="records" :catalog="catalog" :animate="animate"
          :amount-label="quantityLabel(output)" :quantity-note="quantityNote(output)" @select="(id, direction) => emit('select', id, direction)" />
      </div></div>
    </section>
    <div class="recipe-stats">
      <span v-if="recipe.duration != null" :title="recipe.duration + ' tick'">{{ ticks(recipe.duration) }}</span>
      <span v-if="recipe.energy != null">{{ amount(recipe.energy) }} EU/t</span>
      <span v-if="recipe.grid">{{ recipe.grid.width }} × {{ recipe.grid.height }} 网格{{ recipe.grid.mirror ? ' · 可镜像' : '' }}</span>
    </div>
    <section v-if="recipe.magic" class="recipe-magic" aria-label="魔法用量与研究">
      <h4>{{ magicName }}</h4>
      <p class="magic-cost-note">{{ recipe.process?.kind === 'runic'
        ? '展示样本屏障值 ' + recipe.process.charge + '；实际费用随输入装备与其内部升级变化。材料需分放在不同基座，不能合并为一个堆叠。'
        : recipe.magic.kind === 'arcane' ? '基础 Vis 用量，装备减免另计。' : '每次配方消耗的源质。' }}</p>
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
      <p v-if="recipe.magic.instability != null">{{ recipe.process?.kind === 'runic' ? '样本不稳定性：' : '基础不稳定性：' }}{{ recipe.magic.instability }}</p>
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
      <template v-if="output.change?.action.kind === 'analyze'">
        <p>基因扫描处理整个输入堆叠，产物数量与输入相同；显示数量是单个样本。</p>
        <p>未分析个体经林业原生接口分析并重新写出基因数据，额外的命名等标签不保留。已分析个体原样返回。</p>
        <p>两种状态都要求槽内至少有 100 mB 蜂蜜；仅未分析时消耗。耗时和能耗为对应分支的基础值。</p>
      </template>
      <template v-else-if="output.change?.action.kind === 'runic'">
        <p>保留装备与其他 NBT。将 RS.HARDEN 按原生有符号 byte 读取并加一（127 后回绕至 −128）。</p>
        <p>屏障值由装备原生接口和现有强化共同决定；材料基座数为 1 + max(0, 屏障值)，不稳定性为 5 + 屏障值 / 2（向零取整）。</p>
        <p>源质基数为 32 × 2^屏障值，按原生 int 转换；能量用全额，护甲与魔法各用一半。所列为样本费用，祭坛运行风险另计。</p>
      </template>
      <template v-else-if="output.change?.action.kind === 'mapScaling'">
        <p>需要缩放等级低于 4 的已填充地图，周围放置 8 张纸。</p>
        <p>显示的是待完成地图样本；合成后由世界分配新地图 ID，缩放等级增加一级并保留中心与维度，不复制旧探索像素。</p>
        <p>保留命名等物品数据。缺失地图数据时，服务端可能先初始化地图；此页面无法判定当前存档中的地图状态。</p>
      </template>
      <template v-else-if="output.change?.action.kind === 'patch'">
        <p>保留输入物品及其其他数据。<template v-if="Object.keys(output.change.action.set).length">替换标签：<code>{{ Object.keys(output.change.action.set).join('、') }}</code>。</template>
          <template v-if="Object.keys(output.change.action.limits).length">超出新上限的数值会被裁剪。</template></p>
        <details><summary>数据修改规则</summary><pre>{{ JSON.stringify(output.change.action, null, 2) }}</pre></details>
      </template>
      <template v-else-if="output.change?.action.kind === 'merge'">
        <p>中心物品含非空 NBT 时继承其数据{{ output.change.action.tools ? '，输入和产物均为护甲或工具时生效' : '' }}。产物已有普通字段优先保留，复合标签合并，同类型列表按顺序追加。</p>
        <p v-if="output.change.action.keys">仅继承根标签：{{ output.change.action.keys.join('、') }}</p>
        <p v-if="!required(records.items, output.change.action.base.id).nbt">继承发生且原始产物没有 NBT 时，还会沿用中心物品的 metadata 和数量。</p>
      </template>
      <template v-else-if="output.change?.action.kind === 'filter'">
        <p>保留过滤纸产物自身数据，从第 {{ output.change.action.config + 1 }} 个输入读取过滤配置<template v-if="output.change.action.metadata != null">，再从第 {{ output.change.action.metadata + 1 }} 个输入读取过滤纸变体</template><template v-else>，保留产物原有变体</template>。</p>
        <details><summary>过滤纸变换规则</summary><pre>{{ JSON.stringify(output.change.action, null, 2) }}</pre></details>
      </template>
      <template v-else-if="output.change?.action.kind === 'append'">
        <p>保留输入物品的全部数据，向列表 <code>{{ output.change.action.path }}</code> 追加元素。原生未增强法杖或已有增强法杖均安全继承。</p>
        <details><summary>追加数据规则</summary><pre>{{ JSON.stringify(output.change.action, null, 2) }}</pre></details>
      </template>
      <details><summary>当前结果 NBT</summary><pre>{{ JSON.stringify(required(records.items, output.id).nbt, null, 2) }}</pre></details>
    </section>
    <details class="recipe-details" :open="!view">
      <summary>用量与条件</summary>
      <template v-if="recipe.process?.kind === 'buildcraftRefinery'">
        <p>每次尝试的能量为 {{ recipe.process.energy }} RF；重试间隔参数为 {{ recipe.process.delay }} 游戏刻。原生图上的 RF/t 标注不代表实际逐刻扣能；供能不足和输出空间会影响完成时间。</p>
        <p>两个输入罐和一个输出罐，当前默认每罐 {{ recipe.process.capacity }} mB。更新选择时按原生注册顺序寻找首条预检查通过的配方；各份需求独立检查原始存量，重复流体不会在预检查中累计扣除。</p>
        <p>尝试加工时先扣能，再按需求顺序从前到后排液。后续需求不足时，可能出现部分流体已扣除而没有产物；已扣能量也不退还。下列数量为逐项要求，产物只在实际加工成功时生成。</p>
        <details><summary>进液许可与前序配方</summary>
          <p>进液还受各罐当前筛选和已有流体限制；删除配方后，原生注册的进液许可仍可能保留。</p>
          <p v-for="(tank, index) in recipe.process.filling" :key="index">输入罐 {{ index + 1 }}：
            <ItemLink v-for="id in tank" :key="id" :target="{ kind: 'fluid', id }" :catalog="catalog" :records="records" :animate="animate" @select="(id, direction) => emit('select', id, direction)" />
          </p>
          <p v-for="(prior, index) in recipe.process.earlier" :key="index">前序配方 {{ index + 1 }}：
            <span v-for="(fluid, slot) in prior" :key="slot"><ItemLink :target="{ kind: 'fluid', id: fluid.id }" :catalog="catalog" :records="records" :animate="animate" @select="(id, direction) => emit('select', id, direction)" /> {{ amount(fluid.amount) }} mB </span>
          </p>
        </details>
      </template>
      <template v-if="recipe.process?.kind === 'buildcraftAssembly'">
        <p>所选装配计划需要激光能量 {{ recipe.process.energy }} RF；满足材料和储能条件后加工。完成时从当前储能扣除这项能量并保留余额，不低于零；实际耗时取决于供能和计划调度。</p>
        <p>十二个库存槽。先处理固定材料，再按原生顺序处理候选组；每份需求从前到后取料，不同候选可以混合凑足同一份需求。后续需求使用剩余库存，不回溯重分配，因此摆放顺序可能影响能否加工。</p>
        <p>各组数量是合计需求，不是每个候选都要投入。多余材料保留，不返还容器；原生配方图最多显示十二份需求，完整用量以下方清单为准。</p>
      </template>
      <template v-if="recipe.process?.kind === 'rolling'">
        <p>有序和无序配方共用注册顺序，只执行第一条匹配配方。有序配方可在 3×3 网格中平移，是否可镜像以网格规则为准；无序配方按格子顺序逐个匹配尚未使用的材料需求。</p>
        <p>每次从每个有物品的格子消耗一件，不返还容器。默认每格需超过一件，保留最后一份；点击使用最后一份可执行一次，完成后恢复保留。邻接库存补料和同类材料均衡可能改变格中数量。</p>
        <p>需要推进 100 次，再等待完成与输出空间检查。{{ recipe.process.powered ? '每次推进消耗 50 RF，正常完整加工共 5,000 RF；储能上限 5,000 RF，单次接收上限 1,000 RF。' : '当前配置关闭机器耗能，不消耗 RF。' }}暂停、供能不足与输出阻塞会延长耗时；完成时重新按当前网格选择配方。</p>
        <details v-if="recipe.process.earlier.length"><summary>前序轧制配方条件</summary><pre>{{ JSON.stringify(recipe.process.earlier, null, 2) }}</pre></details>
      </template>
      <template v-if="recipe.process?.kind === 'soul'">
        <p>基础能量 {{ recipe.process.energy }} RF；启动需要 {{ recipe.process.experience }} XP（界面标注 {{ recipe.process.levels }} 级），经验容量 {{ recipe.process.capacity }} XP。{{ recipe.process.drains ? '任务成功启动后扣除原始经验值。' : '当前未注册经验流体：仍检查经验门槛，但原生机器不扣除经验。' }}</p>
        <p>第一槽检查灵魂标识，第二槽检查材料；正常库存每槽限一件，启动各消耗一件，不返还材料容器。按注册顺序选择首条匹配，两槽放入限制还取决于已有物品。</p>
        <p v-if="recipe.process.spawner">灵魂类型只受黑名单限制，未列出的生物也可能匹配。完成时生成变体为零的新刷怪笼，仅写入该灵魂的生物类型；不继承输入瓶或旧刷怪笼的其他数据。</p>
        <p v-else>完成时依次检查两项投入物，最后一个带灵魂的瓶决定结果；若其类型不受本配方支持，空瓶和产物均不产出。输出空间与运行中更改输出槽可能减少实际取得量。</p>
        <details v-if="recipe.process.earlier.length"><summary>前序灵魂配方匹配条件</summary><pre>{{ JSON.stringify(recipe.process.earlier, null, 2) }}</pre></details>
      </template>
      <template v-if="recipe.process?.kind === 'sag'">
        <p>基础能量 {{ recipe.process.energy }} RF。材料放第一槽，按原生注册顺序选择首条匹配；研磨珠库存槽可留空。材料扣除位置：{{ recipe.process.slot < 0 ? '依次从两槽取料' : '第 ' + (recipe.process.slot + 1) + ' 槽' }}，实际扣除受存量限制，不返还容器。</p>
        <p>任务开始时，当前生效的研磨珠决定概率与能耗倍率。库存中的珠子尚未生效；旧珠耗尽后从库存装载一件。材料或库存物品命中矿辞排除规则，或材料命中配置排除规则时，本次任务不使用珠子加成。</p>
        <p>所有产物共享一次随机抽取；输出空间预检使用原始抽取值。{{ recipe.process.bonus ? '完成时按当时生效珠子的产量倍率，使用另一次共享抽取重复同组产出，不会逐项重新抽奖。' : '本配方不重复产出；任务开始时的概率与能耗倍率仍然有效。' }}过程中更换珠子、珠子耗尽和输出槽变化会影响最终结果。存档中的在用珠子参数可以不同于当前注册表。</p>
        <details v-if="recipe.process.balls.length"><summary>研磨珠参数（依次匹配）</summary>
          <p v-for="(ball, index) in recipe.process.balls" :key="index">
            {{ index + 1 }}.
            <ItemLink v-for="c in ball.choices" :key="c.id + JSON.stringify(c.rule)" :target="{ kind: 'item', id: c.id }" :catalog="catalog" :records="records" :animate="animate" @select="(id, direction) => emit('select', id, direction)" />
            产量 ×{{ ball.grinding }}，概率 ×{{ ball.chance }}，能耗 ×{{ ball.power }}，耐用能量 {{ ball.duration }} RF。
          </p>
        </details>
        <details v-if="recipe.process.earlier.length || recipe.process.blocked.length || recipe.process.oreBlocked.length"><summary>原生匹配与加成排除条件</summary><pre>{{ JSON.stringify({ earlier: recipe.process.earlier, configured: recipe.process.blocked, firstOre: recipe.process.oreBlocked }, null, 2) }}</pre></details>
      </template>
      <template v-if="recipe.process?.kind === 'alloy' || recipe.process?.kind === 'splice'">
        <p><template v-if="recipe.process.kind === 'alloy'">合金模式或全部模式；</template>基础能量 {{ recipe.process.energy }} RF，实际速度由供能决定。</p>
        <p>配方按注册顺序匹配。机器从左到右读取物品槽，将整叠数量分配给首个仍缺料的匹配需求；同一叠不会拆给多个需求，额外不匹配物品会阻止启动。下列顺序与数量为需求，不代表必须摆放的位置。</p>
        <p>启动后再按需求顺序扣料，各需求的取料位置为：{{ recipe.process.slots.map(slot => slot < 0 ? '任意槽' : '第 ' + (slot + 1) + ' 槽').join('、') }}。实际扣除受该槽存量限制，剩余材料保留，不返还容器。</p>
        <p>所有产物共享一次随机抽取，较低阈值命中时较高阈值也命中。重试不会重新抽取。输出槽合并仅比较物品与变体，已有堆叠的标签保留；空间不足或运行中改变输出槽可能减少实际取得量。</p>
        <template v-if="recipe.process.kind === 'splice'">
          <p>六个材料槽；正常库存每槽限一件。斧头放工具槽 7，剪刀放工具槽 8；工具不参与材料匹配。材料槽能否放入物品还取决于已放入的材料组合。</p>
          <p>启动时两工具槽须非空；完工后对当时仍在槽内、可损耗的工具各调用一次原生损耗。耐久附魔、不可破坏状态及工具自有行为会影响结果，不保证每次掉一点耐久。损耗后达到最大损伤的工具会移除；过程中取出或更换工具会改变实际损耗对象。</p>
        </template>
      </template>
      <template v-if="recipe.process?.kind === 'vat'">
        <p>基础能量 {{ recipe.process.energy }} RF；实际速度由供能与机器设置决定。两侧储罐容量各 8,000 mB，启动前产物必须能完整放入输出罐。</p>
        <p>按原生注册顺序选择首条匹配配方。每个所需物品槽至少有一件即可；启动时消耗当前存量与标注上限中的较小值，不返还容器。流体按所列数量与标签精确匹配。</p>
        <template v-if="recipe.process.extra.length">
          <p>第二物品槽可以空置；若已有额外材料，按下列顺序取首条匹配的消耗规则，均不匹配时消耗一件。机器的插入限制仍然生效。</p>
          <details><summary>额外槽消耗规则</summary>
            <p v-for="(c, index) in recipe.process.extra" :key="index">
              {{ index + 1 }}.
              <ItemLink :target="{ kind: 'item', id: c.id }" :catalog="catalog" :records="records" :animate="animate" @select="(id, direction) => emit('select', id, direction)" />
              {{ c.rule.kind === 'wildcard' && c.rule.meta ? '任意变体' : '相同变体' }}，忽略标签；{{ c.amount > 0 ? '最多消耗 ' + amount(c.amount.toString()) + ' 件' : '不消耗' }}。
            </p>
          </details>
        </template>
        <p v-if="recipe.process.zeroOutput">本组合经原生取整后产量为零，仍可能消耗材料与能量。原生零量输出指向
          <ItemLink :target="{ kind: 'fluid', id: recipe.process.zeroOutput }" :catalog="catalog" :records="records" :animate="animate" @select="(id, direction) => emit('select', id, direction)" />，不计为可获取产物。
        </p>
      </template>
      <template v-if="recipe.process?.kind === 'enchanter'">
        <p>附魔等级 {{ recipe.process.level }}：材料槽须放入至少 {{ recipe.process.level * recipe.process.itemsPerLevel }} 件<template v-if="recipe.process.level < recipe.process.maxLevel">、少于 {{ (recipe.process.level + 1) * recipe.process.itemsPerLevel }} 件</template>。投入数量决定等级，仍受单槽与物品堆叠上限约束。</p>
        <p>需要 {{ recipe.process.cost }} 级经验；领取时扣除这些等级，创造模式免经验要求和支付。消耗一本书与笔及列出的材料数量，余料保留，不返还容器或继承书本数据。</p>
      </template>
      <template v-if="recipe.process?.kind === 'inscriber'">
        <p>{{ recipe.process.mode === 'inscribe' ? '压印：保留模板，消耗中间材料。' : '合成：清空两个模板槽与中间材料槽，不返还容器。' }} 每个非空输入槽最多放一件。</p>
        <p v-if="recipe.process.top">模板可以上下互换；缺少下模板时，另一模板槽必须为空。</p>
        <p v-else>至少一个模板槽必须为空；另一个模板槽可以放任意单件物品。注册的下模板不构成材料要求。</p>
        <p v-if="recipe.process.namePress">若非空模板槽全部是
          <ItemLink :target="{ kind: 'item', id: recipe.process.namePress }" :catalog="catalog" :records="records" :animate="animate"
            @select="(id, direction) => emit('select', id, direction)" />，会优先执行命名，不执行本配方。</p>
        <p>按快照中的原生注册顺序选取第一条匹配配方，本条顺序号为 {{ recipe.order }}。还需供能与足够产物空间；速度由升级和网络调度决定，输出时重新检查材料。</p>
      </template>
      <div class="ingredients"><section><h4>输入</h4>
        <div v-for="input in recipe.inputs" :key="input.kind + input.slot" class="ingredient">
          <ItemLink :target="{ kind: input.kind, ...chosen(input) }" :records="records" :catalog="catalog" :animate="animate"
            :amount-label="quantityLabel(input)"
            @select="(id, direction) => emit('select', id, direction)" />
          <small>{{ consumption(input) }}<template v-if="input.choices.length > 1"> · {{ input.choices.length }} 个候选</template></small>
          <template v-for="returned in chosen(input).returns" :key="returned.kind + returned.id"><small>归还</small>
            <ItemLink :target="returned" :records="records" :catalog="catalog" :animate="animate" @select="(id, direction) => emit('select', id, direction)" />
          </template>
        </div>
      </section><section><h4>产出</h4>
        <div v-for="output in products" :key="output.kind + output.slot" class="ingredient">
          <ItemLink :target="output" :records="records" :catalog="catalog" :animate="animate" :amount-label="quantityLabel(output)" :note="quantityNote(output)"
            @select="(id, direction) => emit('select', id, direction)" />
          <small>{{ output.quantity ? quantityNote(output) : chance(output.chance) }}{{ output.role === 'return' ? ' · 归还' : '' }}</small>
        </div>
      </section></div>
      <dl class="properties"><template v-for="(property, key) in recipe.properties" :key="key">
        <dt><GameText :text="records.text(property.name)" /></dt>
        <dd><Value :value="property.value" :records="records" :catalog="catalog" :animate="animate" @select="(id, direction) => emit('select', id, direction)" /></dd>
      </template></dl>
    </details>
  </article>
</template>
