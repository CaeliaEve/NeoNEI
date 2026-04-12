<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { getImageUrl, type Recipe } from '../services/api';
import type { UITypeConfig } from '../services/uiTypeMapping';
import { useSound } from '../services/sound.service';
import { buildInputSlots, buildOutputSlots, type ResolvedSlot } from '../composables/useRecipeSlots';
import RecipeItemTooltip from './RecipeItemTooltip.vue';

interface Props { recipe: Recipe; uiConfig?: UITypeConfig }
interface Emits { (e: 'item-click', itemId: string): void }

const props = defineProps<Props>();
const emit = defineEmits<Emits>();
const { playClick } = useSound();
const inputs = ref<ResolvedSlot[]>([]);
const outputs = ref<ResolvedSlot[]>([]);

async function initPureDaisy() {
  inputs.value = (await buildInputSlots(props.recipe)).slice(0, 4);
  outputs.value = await buildOutputSlots(props.recipe, 3);
}

function onItemClick(itemId: string) { playClick(); emit('item-click', itemId); }
function imageError(event: Event) { (event.target as HTMLImageElement).src = '/placeholder.png'; }

onMounted(() => void initPureDaisy());
watch(() => props.recipe, () => void initPureDaisy(), { deep: true });
</script>

<template>
  <div class="pure-daisy-ui">
    <div class="garden-field" />
    <section class="daisy-plot">
      <div class="soil-ring" />
      <div class="petal petal-a" />
      <div class="petal petal-b" />
      <div class="petal petal-c" />
      <div class="petal petal-d" />
      <div class="growth-mote mote-a" />
      <div class="growth-mote mote-b" />
      <div class="daisy-center">
        <img :src="getImageUrl('i~Botania~specialFlower~0~BVmnjzvOML-Ap_zxeMIMOw==')" @error="imageError" />
      </div>
    </section>

    <section class="conversion">
      <div class="lane-title">NATURAL CONVERSION</div>
      <div class="lane">
        <RecipeItemTooltip v-for="slot in inputs" :key="slot.itemId" :item-id="slot.itemId" :count="slot.count">
          <button class="slot" type="button" @click.stop="onItemClick(slot.itemId)">
            <img :src="getImageUrl(slot.itemId)" @error="imageError" />
            <span v-if="slot.count > 1">{{ slot.count }}</span>
          </button>
        </RecipeItemTooltip>
        <div class="conversion-bloom" aria-hidden="true" />
        <RecipeItemTooltip v-for="slot in outputs" :key="slot.itemId" :item-id="slot.itemId" :count="slot.count">
          <button class="slot output" type="button" @click.stop="onItemClick(slot.itemId)">
            <img :src="getImageUrl(slot.itemId)" @error="imageError" />
            <span v-if="slot.count > 1">{{ slot.count }}</span>
          </button>
        </RecipeItemTooltip>
      </div>
    </section>
  </div>
</template>

<style scoped>
.pure-daisy-ui { position:relative; width:min(980px,calc(100vw - 64px)); min-height:430px; display:grid; grid-template-columns:340px 1fr; gap:0; align-items:stretch; padding:18px; border:1px solid rgba(255,220,236,.24); border-radius:24px; background:radial-gradient(circle at 28% 45%,rgba(255,220,236,.18),transparent 36%), radial-gradient(circle at 80% 28%,rgba(190,255,180,.1),transparent 30%), linear-gradient(180deg,#10141a,#05080d); box-shadow:0 22px 60px rgba(0,0,0,.34), inset 0 1px 0 rgba(255,255,255,.05); overflow:hidden; isolation:isolate; }
.garden-field { position:absolute; inset:18px; z-index:0; border-radius:20px; pointer-events:none; background-image:linear-gradient(rgba(255,240,248,.026) 1px,transparent 1px), linear-gradient(90deg,rgba(255,240,248,.026) 1px,transparent 1px), radial-gradient(circle at 32% 50%,rgba(50,120,70,.4),rgba(6,14,12,.9) 70%); background-size:30px 30px,30px 30px,100% 100%; mask-image:radial-gradient(circle at 40% 50%,#000 0 68%,rgba(0,0,0,.7) 86%,transparent 105%); }
.daisy-plot, .conversion { position:relative; z-index:1; }
.daisy-plot { min-height:394px; display:grid; place-items:center; overflow:hidden; border-radius:20px 0 0 20px; }
.soil-ring { position:absolute; width:250px; height:250px; border-radius:50%; border:1px dashed rgba(255,240,248,.18); box-shadow:0 0 28px rgba(255,210,236,.12); animation:soilBreathe 7s ease-in-out infinite; }
.petal { position:absolute; width:128px; height:58px; border-radius:999px; background:linear-gradient(90deg,rgba(255,255,255,.78),rgba(255,190,230,.26),transparent); filter:drop-shadow(0 0 14px rgba(255,220,236,.12)); animation:petalPulse 6.2s ease-in-out infinite; }
.petal-a { transform:translateY(-66px) rotate(90deg); }
.petal-b { transform:translateY(66px) rotate(90deg); animation-delay:1.1s; }
.petal-c { transform:translateX(-66px); animation-delay:1.8s; }
.petal-d { transform:translateX(66px); animation-delay:2.5s; }
.growth-mote { position:absolute; width:9px; height:9px; border-radius:50%; background:radial-gradient(circle,rgba(255,244,180,.96),rgba(165,255,180,.45),transparent 74%); box-shadow:0 0 16px rgba(255,220,160,.34); animation:growthDrift 6s ease-in-out infinite; }
.mote-a { left:28%; top:34%; } .mote-b { right:26%; bottom:34%; animation-delay:1.6s; }
.daisy-center { position:relative; z-index:2; width:92px; height:92px; border-radius:50%; background:radial-gradient(circle,#ffeaa0,#d89643); display:grid; place-items:center; box-shadow:0 0 26px rgba(255,210,140,.32), inset 0 1px 0 rgba(255,255,255,.2); }
.daisy-center img { width:60px; height:60px; object-fit:contain; image-rendering:pixelated; }
.conversion { display:grid; align-content:center; padding:22px 28px; }
.lane-title { margin-bottom:22px; color:#ffd8ee; font-size:11px; font-weight:900; letter-spacing:.2em; }
.lane { display:flex; align-items:center; gap:16px; flex-wrap:wrap; }
.conversion-bloom { width:54px; height:54px; border-radius:50%; background:radial-gradient(circle,rgba(255,240,180,.42),rgba(168,255,190,.18) 48%,transparent 72%); animation:conversionPulse 4.4s ease-in-out infinite; }
.slot { position:relative; width:66px; height:66px; border-radius:16px; border:1px solid rgba(255,210,236,.32); background:radial-gradient(circle at 44% 35%,rgba(90,58,82,.52),transparent 62%), linear-gradient(180deg,#10141d,#070b12); display:grid; place-items:center; cursor:pointer; box-shadow:0 12px 22px rgba(0,0,0,.25), inset 0 1px 0 rgba(255,255,255,.07); }
.slot:hover { border-color:rgba(255,240,248,.78); box-shadow:0 0 22px rgba(255,210,236,.24), inset 0 1px 0 rgba(255,255,255,.12); }
.slot img { width:48px; height:48px; object-fit:contain; image-rendering:pixelated; }
.slot span { position:absolute; right:3px; bottom:2px; color:white; font-size:10px; text-shadow:0 1px 2px #000; }
.output { border-color:rgba(250,204,21,.48); }
@keyframes soilBreathe { 0%,100% { opacity:.26; transform:scale(.96); } 50% { opacity:.72; transform:scale(1.05); } }
@keyframes petalPulse { 0%,100% { opacity:.54; } 50% { opacity:.92; } }
@keyframes growthDrift { 0%,100% { opacity:.24; transform:translateY(0) scale(.7); } 50% { opacity:.9; transform:translateY(-16px) scale(1.05); } }
@keyframes conversionPulse { 0%,100% { opacity:.3; transform:scale(.82); } 50% { opacity:.86; transform:scale(1.1); } }
</style>
