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
const manaText = computed(() => (manaCost.value ? `${manaCost.value.toLocaleString()} MANA` : 'RUNE INFUSION'));

async function initRune() {
  inputs.value = (await buildInputSlots(props.recipe)).slice(0, 12);
  outputs.value = await buildOutputSlots(props.recipe, 3);
  manaCost.value = readPositiveIntegerMeta(props.recipe, ['manaCost', 'mana', 'requiredMana', 'cost']);
}

function onItemClick(itemId: string) {
  playClick();
  emit('item-click', itemId);
}

function imageError(event: Event) {
  (event.target as HTMLImageElement).src = '/placeholder.png';
}

function orbitStyle(index: number, total: number) {
  const safeTotal = Math.max(total, 1);
  const angle = (Math.PI * 2 * index) / safeTotal - Math.PI / 2;
  const radius = total > 8 ? 174 : 154;
  return {
    left: `calc(50% + ${Math.cos(angle) * radius}px)`,
    top: `calc(50% + ${Math.sin(angle) * radius}px)`,
  };
}

onMounted(() => void initRune());
watch(() => props.recipe, () => void initRune(), { deep: true });
</script>

<template>
  <div class="rune-altar-ui">
    <section class="altar">
      <div class="rune-grid" />
      <div class="rune-haze haze-a" />
      <div class="rune-haze haze-b" />
      <div class="rune-band band-outer" />
      <div class="rune-band band-inner" />
      <div class="material-flow flow-top" />
      <div class="material-flow flow-upper-right" />
      <div class="material-flow flow-lower-right" />
      <div class="material-flow flow-bottom" />
      <div class="material-flow flow-lower-left" />
      <div class="material-flow flow-upper-left" />

      <div class="rune-core">
        <div class="core-aura" />
        <img :src="getImageUrl('i~Botania~runeAltar~0')" @error="imageError" />
      </div>

      <div class="input-orbit">
        <div
          v-for="(slot, index) in inputs"
          :key="`${slot.itemId}-${index}`"
          class="orbit-anchor"
          :style="orbitStyle(index, inputs.length)"
        >
          <RecipeItemTooltip :item-id="slot.itemId" :count="slot.count">
            <button class="slot input" type="button" @click.stop="onItemClick(slot.itemId)">
              <img :src="getImageUrl(slot.itemId)" @error="imageError" />
              <span v-if="slot.count > 1">{{ slot.count }}</span>
            </button>
          </RecipeItemTooltip>
        </div>
      </div>

      <div class="altar-caption">RUNE ALTAR INSCRIPTION</div>
    </section>

    <aside class="result-panel">
      <div class="panel-title">INSCRIBED RUNE</div>
      <div class="result-stack">
        <RecipeItemTooltip v-for="slot in outputs" :key="slot.itemId" :item-id="slot.itemId" :count="slot.count">
          <button class="slot output" type="button" @click.stop="onItemClick(slot.itemId)">
            <img :src="getImageUrl(slot.itemId)" @error="imageError" />
            <span v-if="slot.count > 1">{{ slot.count }}</span>
          </button>
        </RecipeItemTooltip>
      </div>
      <div class="mana">{{ manaText }}</div>
    </aside>
  </div>
</template>

<style scoped>
.rune-altar-ui { width:min(1120px,calc(100vw - 64px)); min-height:540px; display:grid; grid-template-columns:minmax(720px,1fr) 210px; gap:0; align-items:stretch; padding:18px; border:1px solid rgba(133,255,188,.26); border-radius:24px; background:radial-gradient(circle at 38% 52%,rgba(80,255,170,.16),transparent 40%), radial-gradient(circle at 82% 24%,rgba(255,226,130,.11),transparent 28%), linear-gradient(180deg,#08130f,#04080d); box-shadow:0 22px 60px rgba(0,0,0,.36), inset 0 1px 0 rgba(255,255,255,.05); overflow:hidden; isolation:isolate; }
.rune-altar-ui::before { content:''; position:absolute; inset:18px; border-radius:20px; pointer-events:none; z-index:0; background-image:linear-gradient(rgba(200,255,180,.032) 1px,transparent 1px), linear-gradient(90deg,rgba(200,255,180,.032) 1px,transparent 1px), radial-gradient(circle at 42% 50%,rgba(22,76,50,.45),rgba(5,13,12,.86) 68%,rgba(5,13,12,.92)); background-size:28px 28px,28px 28px,100% 100%; mask-image:radial-gradient(circle at 46% 50%,#000 0 68%,rgba(0,0,0,.72) 84%,transparent 102%); }
.rune-altar-ui::after { content:none; }
.rune-altar-ui { position:relative; }
.altar { position:relative; z-index:1; min-height:502px; display:grid; place-items:center; border:0; border-radius:20px 0 0 20px; overflow:hidden; background:transparent; }
.rune-grid { display:none; }
.rune-haze { position:absolute; border-radius:50%; filter:blur(28px); opacity:.36; }
.haze-a { width:300px; height:180px; left:18%; top:22%; background:rgba(118,255,150,.18); }
.haze-b { width:280px; height:220px; right:18%; bottom:18%; background:rgba(78,255,205,.12); }
.rune-band { position:absolute; border-radius:50%; pointer-events:none; mix-blend-mode:screen; }
.band-outer { width:390px; height:390px; background:conic-gradient(from 12deg,rgba(216,255,150,.68) 0 7deg,transparent 7deg 25deg,rgba(104,255,186,.44) 25deg 31deg,transparent 31deg 52deg); -webkit-mask:radial-gradient(circle,transparent 0 68%,#000 69% 71%,transparent 72%); mask:radial-gradient(circle,transparent 0 68%,#000 69% 71%,transparent 72%); animation:runeTurn 28s linear infinite; opacity:.72; }
.band-inner { width:270px; height:270px; background:conic-gradient(from 180deg,transparent 0 22deg,rgba(255,226,130,.52) 22deg 27deg,transparent 27deg 48deg,rgba(101,255,188,.34) 48deg 54deg); -webkit-mask:radial-gradient(circle,transparent 0 64%,#000 65% 68%,transparent 69%); mask:radial-gradient(circle,transparent 0 64%,#000 65% 68%,transparent 69%); animation:runeTurnReverse 22s linear infinite; opacity:.68; }
.material-flow { position:absolute; z-index:3; width:9px; height:9px; border-radius:50%; background:radial-gradient(circle,rgba(255,246,172,.95),rgba(130,255,170,.48) 48%,rgba(86,255,210,.12) 72%,transparent); box-shadow:0 0 18px rgba(190,255,128,.42); pointer-events:none; mix-blend-mode:screen; }
.flow-top { left:50%; top:20%; animation:flowTop 4.8s ease-in-out infinite; }
.flow-upper-right { right:30%; top:34%; animation:flowUpperRight 5.4s ease-in-out infinite .55s; }
.flow-lower-right { right:30%; bottom:34%; animation:flowLowerRight 5s ease-in-out infinite 1.1s; }
.flow-bottom { left:50%; bottom:20%; animation:flowBottom 5.6s ease-in-out infinite 1.65s; }
.flow-lower-left { left:30%; bottom:34%; animation:flowLowerLeft 5.2s ease-in-out infinite 2.2s; }
.flow-upper-left { left:30%; top:34%; animation:flowUpperLeft 5.8s ease-in-out infinite 2.75s; }
.rune-core { position:relative; z-index:3; width:132px; height:132px; display:grid; place-items:center; border-radius:42%; background:radial-gradient(circle,rgba(220,255,168,.28),rgba(18,78,48,.42)); box-shadow:0 0 42px rgba(120,255,180,.24), inset 0 0 28px rgba(255,255,255,.08); }
.core-aura { position:absolute; width:210px; height:210px; border-radius:50%; background:radial-gradient(circle,rgba(200,255,150,.3),rgba(118,255,160,.13) 42%,transparent 70%); animation:coreBreathe 4.8s ease-in-out infinite; }
.rune-core img { position:relative; z-index:2; width:86px; height:86px; image-rendering:pixelated; object-fit:contain; filter:drop-shadow(0 0 14px rgba(180,255,180,.42)); }
.input-orbit { position:absolute; inset:0; z-index:4; pointer-events:none; }
.orbit-anchor { position:absolute; transform:translate(-50%,-50%); pointer-events:auto; }
.slot { position:relative; width:62px; height:62px; border:1px solid rgba(142,255,190,.38); border-radius:50%; background:radial-gradient(circle at 44% 34%,rgba(42,110,64,.72),transparent 62%), linear-gradient(180deg,#0e1c15,#06100d); display:grid; place-items:center; cursor:pointer; box-shadow:0 12px 22px rgba(0,0,0,.28), 0 0 16px rgba(90,255,165,.08), inset 0 1px 0 rgba(255,255,255,.07); }
.slot:hover { border-color:rgba(226,255,160,.86); box-shadow:0 0 26px rgba(184,247,138,.32), 0 0 0 2px rgba(97,255,165,.08), inset 0 1px 0 rgba(255,255,255,.12); }
.slot img { width:44px; height:44px; object-fit:contain; image-rendering:pixelated; }
.slot span { position:absolute; right:2px; bottom:1px; color:#fff; font-size:10px; text-shadow:0 1px 2px #000; }
.altar-caption { position:absolute; left:50%; bottom:22px; transform:translateX(-50%); color:#e7ffd5; font-size:12px; font-weight:900; letter-spacing:.18em; text-shadow:0 0 18px rgba(184,247,138,.35); }
.result-panel { position:relative; z-index:1; display:grid; gap:14px; justify-items:center; align-content:center; padding:20px 20px 20px 34px; border:0; border-radius:0 20px 20px 0; background:transparent; box-shadow:none; }
.result-panel::before,
.result-panel::after { content:none; }
.panel-title { color:#d9ffb3; font-size:11px; font-weight:900; letter-spacing:.18em; text-align:center; }
.result-stack { display:flex; flex-wrap:wrap; gap:10px; justify-content:center; }
.output { width:76px; height:76px; border-color:rgba(250,204,21,.55); border-radius:18px; }
.output img { width:56px; height:56px; }
.mana { color:rgba(239,255,216,.78); font-size:12px; font-weight:800; letter-spacing:.12em; text-align:center; }
@keyframes runeTurn { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
@keyframes runeTurnReverse { from { transform:rotate(360deg); } to { transform:rotate(0deg); } }
@keyframes flowTop { 0%,100% { opacity:0; transform:translate(0,0) scale(.45); } 18% { opacity:.9; } 72% { opacity:.75; transform:translate(0,132px) scale(1); } 100% { opacity:0; transform:translate(0,164px) scale(.24); } }
@keyframes flowBottom { 0%,100% { opacity:0; transform:translate(0,0) scale(.45); } 18% { opacity:.9; } 72% { opacity:.75; transform:translate(0,-132px) scale(1); } 100% { opacity:0; transform:translate(0,-164px) scale(.24); } }
@keyframes flowUpperRight { 0%,100% { opacity:0; transform:translate(0,0) scale(.45); } 18% { opacity:.9; } 72% { opacity:.75; transform:translate(-118px,78px) scale(1); } 100% { opacity:0; transform:translate(-148px,98px) scale(.24); } }
@keyframes flowLowerRight { 0%,100% { opacity:0; transform:translate(0,0) scale(.45); } 18% { opacity:.9; } 72% { opacity:.75; transform:translate(-118px,-78px) scale(1); } 100% { opacity:0; transform:translate(-148px,-98px) scale(.24); } }
@keyframes flowUpperLeft { 0%,100% { opacity:0; transform:translate(0,0) scale(.45); } 18% { opacity:.9; } 72% { opacity:.75; transform:translate(118px,78px) scale(1); } 100% { opacity:0; transform:translate(148px,98px) scale(.24); } }
@keyframes flowLowerLeft { 0%,100% { opacity:0; transform:translate(0,0) scale(.45); } 18% { opacity:.9; } 72% { opacity:.75; transform:translate(118px,-78px) scale(1); } 100% { opacity:0; transform:translate(148px,-98px) scale(.24); } }
@keyframes coreBreathe { 0%,100% { opacity:.34; transform:scale(.86); } 44%,58% { opacity:1; transform:scale(1.16); } 72% { opacity:.48; transform:scale(.96); } }
</style>
