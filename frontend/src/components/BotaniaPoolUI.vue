<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { getImageUrl, type Recipe } from '../services/api';
import type { UITypeConfig } from '../services/uiTypeMapping';
import { useSound } from '../services/sound.service';
import { buildInputSlots, buildOutputSlots, type ResolvedSlot } from '../composables/useRecipeSlots';
import { readPositiveIntegerMeta } from '../composables/ritualFamilyMetadata';
import RecipeItemTooltip from './RecipeItemTooltip.vue';

interface Props { recipe: Recipe; uiConfig?: UITypeConfig }
interface Emits { (e: 'item-click', itemId: string): void }

const props = defineProps<Props>();
const emit = defineEmits<Emits>();
const { playClick } = useSound();
const inputs = ref<ResolvedSlot[]>([]);
const outputs = ref<ResolvedSlot[]>([]);
const manaCost = ref<number | null>(null);
const manaText = computed(() => (manaCost.value ? `${manaCost.value.toLocaleString()} MANA` : 'MANA INFUSION'));

async function initPool() {
  inputs.value = (await buildInputSlots(props.recipe)).slice(0, 8);
  outputs.value = await buildOutputSlots(props.recipe, 3);
  manaCost.value = readPositiveIntegerMeta(props.recipe, ['manaCost', 'mana', 'requiredMana', 'manaUsage', 'cost']);
}

function onItemClick(itemId: string) { playClick(); emit('item-click', itemId); }
function imageError(event: Event) { (event.target as HTMLImageElement).src = '/placeholder.png'; }

onMounted(() => void initPool());
watch(() => props.recipe, () => void initPool(), { deep: true });
</script>

<template>
  <div class="mana-pool-ui">
    <div class="pool-backdrop" />
    <section class="pool-column pool-inputs">
      <div class="panel-title">INPUT DROP</div>
      <div class="slot-grid">
        <RecipeItemTooltip v-for="slot in inputs" :key="slot.itemId" :item-id="slot.itemId" :count="slot.count">
          <button class="slot input-slot" type="button" @click.stop="onItemClick(slot.itemId)">
            <img :src="getImageUrl(slot.itemId)" @error="imageError" />
            <span v-if="slot.count > 1">{{ slot.count }}</span>
          </button>
        </RecipeItemTooltip>
      </div>
    </section>

    <section class="pool-core" aria-label="Mana Pool">
      <div class="liquid-aura" />
      <div class="mana-ripple ripple-a" />
      <div class="mana-ripple ripple-b" />
      <div class="drop-flow flow-a" />
      <div class="drop-flow flow-b" />
      <div class="pool-basin">
        <div class="liquid-surface" />
        <img :src="getImageUrl('i~Botania~pool~0')" @error="imageError" />
      </div>
      <div class="mana-readout">{{ manaText }}</div>
    </section>

    <section class="pool-column pool-outputs">
      <div class="panel-title output-title">OUTPUT</div>
      <div class="slot-grid single">
        <RecipeItemTooltip v-for="slot in outputs" :key="slot.itemId" :item-id="slot.itemId" :count="slot.count">
          <button class="slot output-slot" type="button" @click.stop="onItemClick(slot.itemId)">
            <img :src="getImageUrl(slot.itemId)" @error="imageError" />
            <span v-if="slot.count > 1">{{ slot.count }}</span>
          </button>
        </RecipeItemTooltip>
      </div>
    </section>
  </div>
</template>

<style scoped>
.mana-pool-ui { position:relative; width:min(1080px,calc(100vw - 64px)); min-height:500px; display:grid; grid-template-columns:230px minmax(420px,1fr) 190px; gap:0; align-items:stretch; padding:18px; border:1px solid rgba(94,234,212,.24); border-radius:24px; background:radial-gradient(circle at 50% 48%,rgba(45,212,191,.18),transparent 42%), radial-gradient(circle at 82% 24%,rgba(232,255,170,.1),transparent 30%), linear-gradient(180deg,#07131a,#04080d); box-shadow:0 22px 60px rgba(0,0,0,.36), inset 0 1px 0 rgba(255,255,255,.05); overflow:hidden; isolation:isolate; }
.pool-backdrop { position:absolute; inset:18px; border-radius:20px; pointer-events:none; z-index:0; background-image:linear-gradient(rgba(168,255,236,.032) 1px,transparent 1px), linear-gradient(90deg,rgba(168,255,236,.032) 1px,transparent 1px), radial-gradient(circle at 52% 50%,rgba(12,80,78,.42),rgba(4,12,16,.9) 70%); background-size:28px 28px,28px 28px,100% 100%; mask-image:radial-gradient(circle at center,#000 0 72%,rgba(0,0,0,.68) 88%,transparent 105%); }
.pool-column, .pool-core { position:relative; z-index:1; }
.pool-column { display:grid; align-content:center; justify-items:center; gap:14px; padding:20px; background:transparent; }
.panel-title { color:#aefdf0; font-size:11px; font-weight:900; letter-spacing:.18em; text-align:center; }
.output-title { color:#f2ffb4; }
.slot-grid { display:grid; grid-template-columns:repeat(2,62px); gap:10px; justify-content:center; }
.slot-grid.single { grid-template-columns:1fr; }
.pool-core { min-height:464px; display:grid; place-items:center; overflow:hidden; }
.liquid-aura { position:absolute; width:360px; height:230px; border-radius:50%; background:radial-gradient(ellipse at center,rgba(94,234,212,.22),rgba(132,255,190,.08) 46%,transparent 72%); animation:liquidAura 5.6s ease-in-out infinite; }
.mana-ripple { position:absolute; border-radius:50%; border:1px solid rgba(132,255,220,.3); pointer-events:none; mix-blend-mode:screen; }
.ripple-a { width:300px; height:160px; animation:rippleDrift 7.2s ease-in-out infinite; }
.ripple-b { width:230px; height:118px; border-color:rgba(232,255,170,.22); animation:rippleDriftReverse 8.4s ease-in-out infinite .8s; }
.drop-flow { position:absolute; width:9px; height:9px; border-radius:50%; background:radial-gradient(circle,rgba(236,255,170,.95),rgba(94,234,212,.42) 48%,transparent 74%); box-shadow:0 0 18px rgba(94,234,212,.36); pointer-events:none; mix-blend-mode:screen; }
.flow-a { left:28%; top:42%; animation:dropToPoolA 4.8s ease-in-out infinite; }
.flow-b { right:26%; top:42%; animation:dropToPoolB 5.2s ease-in-out infinite 1s; }
.pool-basin { position:relative; z-index:2; width:170px; height:170px; display:grid; place-items:center; border-radius:50%; background:radial-gradient(circle,rgba(170,255,250,.22),rgba(20,80,100,.08)); box-shadow:0 0 44px rgba(45,212,191,.2), inset 0 0 28px rgba(255,255,255,.06); }
.liquid-surface { position:absolute; width:128px; height:48px; border-radius:50%; background:radial-gradient(ellipse at center,rgba(220,255,255,.74),rgba(94,234,212,.28) 55%,transparent 72%); filter:blur(.2px); animation:surfacePulse 4.6s ease-in-out infinite; }
.pool-basin img { position:relative; z-index:2; width:104px; height:104px; object-fit:contain; image-rendering:pixelated; filter:drop-shadow(0 0 14px rgba(94,234,212,.32)); }
.mana-readout { position:absolute; bottom:26px; color:rgba(223,253,250,.8); font-size:12px; font-weight:900; letter-spacing:.14em; }
.slot { position:relative; width:62px; height:62px; border:1px solid rgba(125,255,241,.34); border-radius:16px; background:radial-gradient(circle at 45% 34%,rgba(38,115,110,.68),transparent 62%), linear-gradient(180deg,#0d1c1b,#06100f); display:grid; place-items:center; cursor:pointer; box-shadow:0 12px 22px rgba(0,0,0,.26), inset 0 1px 0 rgba(255,255,255,.07); }
.slot:hover { border-color:rgba(214,255,184,.86); box-shadow:0 0 24px rgba(94,234,212,.28), inset 0 1px 0 rgba(255,255,255,.12); }
.slot img { width:46px; height:46px; object-fit:contain; image-rendering:pixelated; }
.slot span { position:absolute; right:3px; bottom:2px; color:white; font-size:10px; text-shadow:0 1px 2px black; }
.output-slot { width:74px; height:74px; border-color:rgba(250,204,21,.52); }
.output-slot img { width:54px; height:54px; }
@keyframes liquidAura { 0%,100% { opacity:.32; transform:scale(.92); } 50% { opacity:.88; transform:scale(1.08); } }
@keyframes rippleDrift { 0%,100% { opacity:.18; transform:rotate(-8deg) scale(.95); } 50% { opacity:.62; transform:rotate(8deg) scale(1.08); } }
@keyframes rippleDriftReverse { 0%,100% { opacity:.12; transform:rotate(12deg) scale(.96); } 50% { opacity:.48; transform:rotate(-10deg) scale(1.1); } }
@keyframes surfacePulse { 0%,100% { opacity:.54; transform:scaleX(.92); } 50% { opacity:1; transform:scaleX(1.08); } }
@keyframes dropToPoolA { 0%,100% { opacity:0; transform:translate(0,0) scale(.45); } 18% { opacity:.85; } 74% { opacity:.7; transform:translate(130px,34px) scale(1); } 100% { opacity:0; transform:translate(164px,42px) scale(.24); } }
@keyframes dropToPoolB { 0%,100% { opacity:0; transform:translate(0,0) scale(.45); } 18% { opacity:.85; } 74% { opacity:.7; transform:translate(-128px,34px) scale(1); } 100% { opacity:0; transform:translate(-160px,42px) scale(.24); } }
</style>
