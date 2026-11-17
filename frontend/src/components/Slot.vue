<script setup lang="ts">
import { t, language, gameLanguage } from "../i18n/index.ts";
import { computed, nextTick, ref, watch } from 'vue';
import { gtToolNote } from '../catalog/gt-tool.ts';
import { nativeContainerNote } from '../catalog/native-container.ts';
import { aeEnderDustNote } from '../catalog/ae-ender-dust.ts';
import type { Input, Output, Match } from '@elysium/contracts';
import { Catalog, Records } from '../catalog/client.ts';
import { amount, chance } from '../catalog/format.ts';
import ItemLink from './ItemLink.vue';
import Pager from './Pager.vue';
import { zeroFluidNote } from '../../../catalog/src/zero-fluid.ts';
import {fmpSawNote} from '../../../catalog/src/fmp.ts';
const props = withDefaults(defineProps<{ stack: Input | Output; catalog: Catalog; records: Records; size?: number; height?: number; animate?: boolean;
  amountLabel?: string; quantityNote?: string }>(),
  { size: 32, height: 32, animate: true, amountLabel: '', quantityNote: '' });
const emit = defineEmits<{ select: [id: string, direction: 'recipes' | 'uses'] }>();
const selected = defineModel<number>('choice', { default: 0 });
const offset = ref(0), dialog = ref<HTMLDialogElement | null>(null);
const expanded = ref(false);
const choices = computed(() => 'choices' in props.stack ? props.stack.choices : []);
function current() {
  if (selected.value === -1) return undefined;
  const choice = choices.value[selected.value];
  if (!choice) throw new Error(t("配方输入缺少所选候选"));
  return choice;
}
const target = computed(() => 'choices' in props.stack ? (current() ? { kind: props.stack.kind, ...current()! } : null) : props.stack);
const selectable = computed(() => choices.value.length > 1 || choices.value.some(choice => choice.rule.kind === 'integration'));
const note = computed(() => {
  if (!('choices' in props.stack)) return props.quantityNote || (props.stack.quantity ? props.quantityNote
    : props.stack.change?.action.kind === 'analyze' ? t("与输入堆叠数量相同；显示单个样本")
    : props.stack.change?.action.kind === 'runic' ? t("升级所投入的装备并保留其他数据；所示为样本")
    : props.stack.change?.action.kind === 'mapScaling' ? t("待完成地图样本；实际产物由世界分配新地图 ID")
    : props.stack.change?.action.kind === 'soul' ? t("按所选灵魂生成新的刷怪笼；只写入生物类型，不继承实体的其他数据")
    : (props.stack.change?.action.kind === 'floatingFlower' || props.stack.change?.action.kind === 'nativeFloatingFlower') ? t("产物取合成网格中最后一朵特殊花的类型；其余附加数据不继承，图标为样本")
    : t("概率 ") + chance(props.stack.chance) + (props.stack.role === 'return' ? t(" · 归还") : ''));
  const choice = current();
  return choice ? choiceNote(choice) : t("此组合留空");
});
function choiceNote(choice: Input['choices'][number]): string {
  if(choice.consume.kind==='wear'){
    const registry=props.records.items.get(choice.id)?.registry;
    for(const info of props.records.fmp.values()){
      const saw=info.saws.find(saw=>saw.registry===registry);if(saw)return fmpSawNote(saw, language.value)+' · '+matchNote(choice.rule);
    }
  }
  if (choice.consume.kind === 'staged') return t("阶段取料；具体时机和数量见配方原生规则 · ") + matchNote(choice.rule);
  if (choice.consume.kind === 'reserve') return t("可选研磨珠库存；装载新珠时消耗一件 · ") + matchNote(choice.rule);
  if (choice.consume.kind === 'wear') return t("完工时尝试损耗工具；附魔与工具状态决定实际耐久变化 · ") + matchNote(choice.rule);
  if (choice.consume.kind === 'gtTool') return gtToolNote(choice.consume) + ' · ' + matchNote(choice.rule);
  if (choice.consume.kind === 'nativeContainer') return nativeContainerNote(choice.consume) + ' · ' + matchNote(choice.rule);
  if (choice.consume.kind === 'allocated') return t("原生顺序分配需求；实际扣料由配方过程决定 · ") + matchNote(choice.rule);
  if (choice.consume.kind === 'upto') return t("至少一件即可；启动时最多消耗 ") + amount(choice.amount) + t(" 件 · ") + matchNote(choice.rule);
  if (choice.consume.kind === 'pedestals') return t("样本需 ") + choice.amount + t(" 座基座，每座一件；实际座数 = 1 + max(0, 输入屏障值) · ") + matchNote(choice.rule);
  const consumption = choice.consume.kind === 'keep' ? t("不消耗") : choice.consume.kind === 'buffer' ? t("内部储量门槛；补充与取用时机见配方原生规则") : choice.consume.kind === 'stack' ? t("处理整个输入堆叠") : choice.consume.kind === 'damage' ? t("消耗耐久 ") + choice.consume.points : t("消耗");
  return consumption + ' · ' + matchNote(choice.rule) + (choice.returns.length ? t(" · 归还容器") : '');
}
function matchNote(rule: Match, nested = false): string {
  if(rule.kind==='nativePoolInput')return language.value==='en-US'?'Constructor input role; admission depends on the ordered native pool snapshot.':
    '构造输入角色；是否匹配取决于原生魔力池顺序快照。';
  if(rule.kind==='matterManipulatorInput')return language.value==='en-US'?'Native manipulator state specimen. Tier eligibility and the decoded installed-upgrade bits govern matching; exact output also requires native state decoding and serialization.':'原生操纵器状态样本；按等级许可和已解码的升级位匹配，精确产物还要求原生状态解码与序列化成功。';
  if(rule.kind==='matterManipulatorUpgrade')return language.value==='en-US'?'Registered MetaItem class with a literal metadata lookup; component NBT and stack size do not change matching.':'已注册 MetaItem 类型，按字面元数据查原生升级表；材料 NBT 和堆叠数量不影响匹配。';
  if(rule.kind==='lumbermillTank')return t("水为正常插入样本；运行时只检查已存液体体积，任意流体与标签均可，成功工作 tick 最多排出 10 mB");
  if(rule.kind==='enchanterBook')return t("书与笔为正常插入样本；运行时只要求槽位存在，领取时清空整槽，不检查元数据或 NBT");
  if(rule.kind==='nativeMetadataKey')return t("同物品，原生矿辞元数据键 (metadata + 1) mod 65536 = ")+rule.code+t("；忽略 NBT，包括相隔 65536 的别名变体");
  if(rule.kind==='creativeCore')return t("CreativeCore 原生谓词 ")+(rule.input+1)+t("；库存门槛与匹配顺序见配方规则，每次占用格扣一件");
  if(rule.kind==='distilleryJar')return t("空陶罐是正常插入样本；运行时按槽位存在与数量匹配，具体取用见蒸馏规则");
  if(rule.kind==='chiselSource')return (rule.meta?t("原生默认元数据分支；明确列出的分支优先"):t("元数据精确匹配，包括字面值 32767"))+t("；忽略输入 NBT；须满足凿子取用规则");
  if(rule.kind==='chiselTool')return t("兼容凿子；允许已有耐久和 NBT，实际损耗与归还取决于工具、附魔和玩家状态");
  if(rule.kind==='fmpMaterial'&&props.records.xu.has(rule.program+'/'+rule.materialId))return t("XU 原生微方块材质 ")+rule.materialId+t("；要求带复合标签且材质编号非零；别名单跳解析，不检查形状元数据");
  if(rule.kind==='fmpMaterial')return t("原生微方块材质 ")+rule.materialId+t("；别名单跳解析，缺失或未知名称归入材质 0；形状与厚度由合成分支检查");
  if (rule.kind === 'ae2EnderDust') return aeEnderDustNote(rule);
  if (rule.kind === 'nativeZeroFluid') return zeroFluidNote(rule.policy, language.value);
  if (rule.kind === 'string_tag') return t("同物品、不区分变体；字段 ") + rule.key + t(" 必须缺失或为字符串，其他标签不限；图标为样本");
  if (rule.kind === 'metadata') return t("同物品，元数据必须为 ") + rule.value + '；'
    + (rule.nbt ? t("忽略 NBT") : t("NBT 精确匹配"))
    + (rule.absent.length ? t("；不得包含字段：") + rule.absent.join('、') : '') + t("；图标为展示示例");
  if (rule.kind === 'untagged') return t("仅接受空 NBT（无标签或空复合标签）；") + (rule.meta ? t("不区分变体") : t("变体必须相同"));
  if (rule.kind === 'soul') {
    const names=rule.filter.names.slice(0,8).map(name=>name===null?t("无灵魂标识"):name===''?t("空字符串"):name).join('、');
    return (rule.filter.exclude?t("排除以下灵魂类型："):t("允许以下灵魂类型："))+names+(rule.filter.names.length>8?t(" 等 ")+rule.filter.names.length+t(" 项"):'')+t("；按原生灵魂标识匹配，不限于展示样本");
  }
  if (rule.kind === 'integration') return t("按主输入与扩展槽组合匹配；所示为原生观察样本");
  if (rule.kind === 'forestry') return t("按共享库存、当前配方和注册顺序匹配；所示为原生需求，候选数量不代表独立扣料");
  if (rule.kind === 'ae') return t("AE2 精确匹配：同物品与变体；空 NBT 等价，其他标签按原生类型和值比较");
  if (rule.kind === 'buildcraft') return t("BuildCraft：同物品；") + (rule.wildcard ? t("源模板通配，忽略变体与 NBT") : (rule.subtypes ? t("匹配变体；") : t("不区分变体；")) + t("原生 NBT 比较，缺失与空标签不同；投入通配变体时跳过 NBT"));
  if (rule.kind === 'infusion') return t("原生注魔匹配：同物品与变体，或首个矿辞组为 ") + (rule.ores.join('、') || t("无")) + t("；仅列出已观察候选");
  if (rule.kind === 'except') {
    if (nested) throw new Error(t("配方包含嵌套匹配排除条件"));
    const examples = rule.exclude.slice(0, 3).map(prior => {
      const item = props.records.substance('item', prior.id);
      return props.records.text(item.name) + '（' + matchNote(prior.rule, true) + '）';
    });
    return matchNote(rule.base, true) + t("；排除 ") + rule.exclude.length + t(" 条前序匹配：") + examples.join('、')
      + (rule.exclude.length > 3 ? t("；另有 ") + (rule.exclude.length - 3) + t(" 条") : '') + t("；所示物品是匹配模板");
  }
  return rule.kind === 'ore' ? t("矿辞：") + rule.name + (rule.exclusive ? t("（唯一矿辞）") : '')
    : rule.kind === 'member' ? (rule.analyzed ? t("已分析") : t("未分析")) + t("的有效基因个体（不限于列出的品种）")
    : rule.kind === 'without_tags' ? t("仅忽略字段：") + rule.keys.join('、') + t("；其余 NBT 精确匹配")
    : rule.kind === 'wildcard' ? [rule.meta ? t("元数据不限") : t("元数据精确匹配"),rule.nbt ? t("忽略 NBT") : t("NBT 精确匹配")].join(' · ') : rule.kind === 'tags' ? [
      rule.keys.length ? t("匹配字段：") + rule.keys.join('、') : '',
      rule.present.length ? t("必须存在：") + rule.present.join('、') : '',
      rule.absent.length ? t("必须缺失：") + rule.absent.join('、') : '',
      t("允许其他 NBT 数据"),
    ].filter(Boolean).join('；') : t("精确匹配");
}
watch(() => props.stack, () => { offset.value = 0; dialog.value?.close(); expanded.value = false; });
async function expand(): Promise<void> {
  expanded.value = true;
  await nextTick();
  dialog.value?.showModal();
}
function choose(index: number, id: string, direction: 'recipes' | 'uses'): void {
  selected.value = index; dialog.value?.close();
  if (direction === 'uses') emit('select', id, direction);
}
</script>

<template>
  <div class="stack-slot" :style="!target ? { width: size + 'px', height: height + 'px' } : undefined">
    <ItemLink v-if="target" :target="target" :catalog="catalog" :records="records" :width="size" :height="height" :animate="animate" compact :note="note" :amount-label="amountLabel"
      @select="(id, direction) => emit('select', id, direction)" />
    <button v-if="selectable" type="button" class="alternatives" :aria-label="t('查看 ') + choices.length + t(' 个候选输入')"
      @click="expand" @contextmenu.prevent="target && emit('select', target.id, 'uses')">{{ choices.length }}</button>
    <dialog v-if="expanded && selectable" ref="dialog" class="dialog choices-dialog" @close="expanded = false">
      <header><h2> {{ t("候选输入") }} </h2><button type="button" :aria-label="t('关闭候选输入')" @click="dialog?.close()">×</button></header>
      <p> {{ t("选择当前显示的物品；右键查看其用途。") }} </p>
      <div class="choice-list"><div v-for="(choice, index) in choices.slice(offset, offset + 24)" :key="offset + index">
        <ItemLink :target="{ kind: stack.kind, ...choice }" :note="choiceNote(choice)"
          :amount-label="choice.consume.kind === 'upto' ? '≤' + amount(choice.amount) : ''"
          :catalog="catalog" :records="records" :animate="animate" @select="(id, direction) => choose(offset + index, id, direction)" />
        <small class="choice-note">{{ choiceNote(choice) }}</small>
      </div></div>
      <Pager :total="choices.length" :offset="offset" :limit="24" :label="t('候选输入')" @change="offset = $event" />
    </dialog>
  </div>
</template>

<style scoped>
.stack-slot { position: relative; display: inline-flex; }
/* Keep the candidate hit target inside its own slot, including direct recipe pages. */
.alternatives { position: absolute; right: 0; bottom: 0; z-index: 1; min-width: 12px; height: 12px; padding: 0 2px; border: 1px solid #64748b; border-radius: 2px; background: #18212deb; color: white; font-size: 9px; line-height: 10px; }
/* Retain the original catalog choice dialog without leaking into the homepage. */
.choices-dialog { color: #e4eaf0; background: #111c2a; border: 1px solid #405164; border-radius: 12px; padding: 22px; width: min(480px, calc(100vw - 30px)); max-height: 85vh; overflow: auto; box-shadow: 0 24px 90px #0009; margin: auto; }
.choices-dialog::backdrop { background: #03080bc9; }
.choices-dialog > header { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 22px; }
.choices-dialog > header h2 { font-size: 18px; }
.choices-dialog > header button { padding: 2px 8px; font-size: 20px; background: transparent; border-color: transparent; color: inherit; }
.choices-dialog > p { color: #8b9aaf; font-size: 12px; margin-bottom: 15px; line-height: 1.8; }
.choice-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-bottom: 15px; }
.choice-list :deep(.item-link) { background: #182637; border: 1px solid #253143; width: 100%; color: inherit; }
.choice-note { display: block; padding: 4px 8px; color: #8b9aaf; overflow-wrap: anywhere; font-size: 11px; }
</style>
