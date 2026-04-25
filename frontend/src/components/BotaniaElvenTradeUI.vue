<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { getImageUrl, type Recipe } from '../services/api';
import type { UITypeConfig } from '../services/uiTypeMapping';
import { useSound } from '../services/sound.service';
import { buildInputSlots, buildOutputSlots, type ResolvedSlot } from '../composables/useRecipeSlots';
import RecipeItemTooltip from './RecipeItemTooltip.vue';
import AnimatedItemIcon from './AnimatedItemIcon.vue';

interface Props { recipe: Recipe; uiConfig?: UITypeConfig }
interface Emits { (e: 'item-click', itemId: string): void }

const props = defineProps<Props>();
const emit = defineEmits<Emits>();
const { playClick } = useSound();
const inputs = ref<ResolvedSlot[]>([]);
const outputs = ref<ResolvedSlot[]>([]);

async function initElven() {
  inputs.value = (await buildInputSlots(props.recipe)).slice(0, 12);
  outputs.value = await buildOutputSlots(props.recipe, 6);
}

function onItemClick(itemId: string) { playClick(); emit('item-click', itemId); }
function imageError(event: Event) { (event.target as HTMLImageElement).src = '/placeholder.png'; }

onMounted(() => void initElven());
watch(() => props.recipe, () => void initElven(), { deep: true });
</script>

<template>
  <div class="elven-ui">
    <div class="portal-field" />
    <section class="trade-bank offer-bank">
      <div class="label">OFFER</div>
      <div class="slot-grid">
        <RecipeItemTooltip v-for="slot in inputs" :key="slot.itemId" :item-id="slot.itemId" :count="slot.count">
          <button class="slot" type="button" @click.stop="onItemClick(slot.itemId)">
            <AnimatedItemIcon
              :item-id="slot.itemId"
              :render-asset-ref="slot.renderAssetRef || null"
              :image-file-name="slot.imageFileName || null"
              :size="42"
            />
            <span v-if="slot.count > 1">{{ slot.count }}</span>
          </button>
        </RecipeItemTooltip>
      </div>
    </section>

    <section class="portal">
      <div class="portal-arc arc-a" />
      <div class="portal-arc arc-b" />
      <div class="exchange-flow flow-a" />
      <div class="exchange-flow flow-b" />
      <div class="portal-core">
        <div class="portal-glow" />
        <div class="portal-glyph" aria-hidden="true">
          <span class="glyph-strut strut-left" />
          <span class="glyph-strut strut-right" />
          <span class="glyph-keystone" />
          <span class="glyph-rift" />
        </div>
      </div>
      <div class="portal-label">ELVEN GATE EXCHANGE</div>
    </section>

    <section class="trade-bank output-bank">
      <div class="label">RETURN</div>
      <div class="slot-grid">
        <RecipeItemTooltip v-for="slot in outputs" :key="slot.itemId" :item-id="slot.itemId" :count="slot.count">
          <button class="slot output" type="button" @click.stop="onItemClick(slot.itemId)">
            <AnimatedItemIcon
              :item-id="slot.itemId"
              :render-asset-ref="slot.renderAssetRef || null"
              :image-file-name="slot.imageFileName || null"
              :size="42"
            />
            <span v-if="slot.count > 1">{{ slot.count }}</span>
          </button>
        </RecipeItemTooltip>
      </div>
    </section>
  </div>
</template>

<style scoped>
.elven-ui { position:relative; width:min(1080px,calc(100vw - 64px)); min-height:500px; display:grid; grid-template-columns:250px minmax(360px,1fr) 250px; gap:0; padding:18px; border:1px solid rgba(120,220,255,.24); border-radius:24px; background:radial-gradient(circle at 50% 48%,rgba(120,220,255,.18),transparent 38%), radial-gradient(circle at 78% 24%,rgba(255,226,130,.11),transparent 30%), linear-gradient(180deg,#081421,#05080f); box-shadow:0 22px 60px rgba(0,0,0,.36), inset 0 1px 0 rgba(255,255,255,.05); overflow:hidden; isolation:isolate; }
.portal-field { position:absolute; inset:18px; border-radius:20px; z-index:0; pointer-events:none; background-image:linear-gradient(rgba(185,235,255,.03) 1px,transparent 1px), linear-gradient(90deg,rgba(185,235,255,.03) 1px,transparent 1px), radial-gradient(circle at 50% 50%,rgba(30,110,150,.42),rgba(5,12,20,.92) 72%); background-size:30px 30px,30px 30px,100% 100%; mask-image:radial-gradient(circle at center,#000 0 72%,rgba(0,0,0,.68) 88%,transparent 106%); }
.trade-bank, .portal { position:relative; z-index:1; }
.trade-bank { display:grid; align-content:center; justify-items:center; gap:14px; padding:22px; }
.label { color:#c4f2ff; font-size:11px; font-weight:900; letter-spacing:.18em; }
.output-bank .label { color:#ffe7a6; }
.slot-grid { display:flex; flex-wrap:wrap; gap:10px; justify-content:center; align-items:center; max-width:194px; }
.portal { display:grid; place-items:center; min-height:464px; overflow:hidden; }
.portal-arc { position:absolute; border-radius:50%; border:1px solid rgba(120,220,255,.34); border-left-color:transparent; border-right-color:transparent; pointer-events:none; mix-blend-mode:screen; }
.arc-a { width:292px; height:292px; animation:portalArc 8s ease-in-out infinite; }
.arc-b { width:220px; height:220px; border-color:rgba(255,226,130,.24); border-left-color:transparent; border-right-color:transparent; animation:portalArcReverse 9.2s ease-in-out infinite .8s; }
.exchange-flow { position:absolute; width:9px; height:9px; border-radius:50%; background:radial-gradient(circle,rgba(230,255,255,.95),rgba(120,220,255,.48) 48%,transparent 74%); box-shadow:0 0 18px rgba(120,220,255,.4); pointer-events:none; mix-blend-mode:screen; }
.flow-a { left:24%; top:48%; animation:flowToPortal 5s ease-in-out infinite; }
.flow-b { right:24%; top:52%; animation:flowFromPortal 5.4s ease-in-out infinite 1s; }
.portal-core { position:relative; z-index:2; width:184px; height:184px; border-radius:50%; display:grid; place-items:center; background:radial-gradient(circle,rgba(220,255,255,.2),rgba(20,70,90,.1)); box-shadow:0 0 54px rgba(120,220,255,.24), inset 0 0 34px rgba(255,255,255,.05); }
.portal-glow { position:absolute; width:250px; height:250px; border-radius:50%; background:radial-gradient(circle,rgba(120,220,255,.3),rgba(255,226,130,.08) 44%,transparent 72%); animation:portalGlow 4.8s ease-in-out infinite; }
.portal-glyph { position:relative; z-index:2; width:124px; height:150px; display:grid; place-items:center; filter:drop-shadow(0 0 18px rgba(120,220,255,.38)); }
.portal-glyph::before { content:''; position:absolute; inset:8px 18px 18px; border-radius:50% 50% 42% 42%; border:2px solid rgba(220,250,255,.54); border-bottom-color:rgba(255,226,130,.34); box-shadow:0 0 24px rgba(120,220,255,.28), inset 0 0 22px rgba(120,220,255,.14); }
.glyph-strut { position:absolute; bottom:10px; width:14px; height:92px; border-radius:10px; background:linear-gradient(180deg,rgba(236,255,255,.92),rgba(120,220,255,.34) 54%,rgba(16,54,74,.18)); box-shadow:0 0 18px rgba(120,220,255,.22), inset 0 1px 0 rgba(255,255,255,.28); }
.strut-left { left:22px; transform:rotate(-7deg); }
.strut-right { right:22px; transform:rotate(7deg); }
.glyph-keystone { position:absolute; top:14px; width:72px; height:18px; border-radius:999px; background:linear-gradient(90deg,rgba(255,226,130,.72),rgba(210,250,255,.9),rgba(120,220,255,.48)); box-shadow:0 0 20px rgba(255,226,130,.28); }
.glyph-rift { position:absolute; width:56px; height:98px; border-radius:50%; background:radial-gradient(ellipse at center,rgba(235,255,255,.88),rgba(120,220,255,.3) 46%,rgba(255,226,130,.1) 62%,transparent 78%); animation:riftPulse 4.6s ease-in-out infinite; }
.portal-label { position:absolute; bottom:26px; color:#e5fbff; font-size:12px; font-weight:900; letter-spacing:.16em; text-align:center; }
.slot { position:relative; width:58px; height:58px; border:1px solid rgba(120,220,255,.35); border-radius:14px; background:radial-gradient(circle at 45% 35%,rgba(44,92,118,.64),transparent 62%), linear-gradient(180deg,#0c1724,#060b12); display:grid; place-items:center; cursor:pointer; box-shadow:0 12px 22px rgba(0,0,0,.26), inset 0 1px 0 rgba(255,255,255,.07); }
.slot:hover { border-color:rgba(210,245,255,.84); box-shadow:0 0 24px rgba(120,220,255,.28), inset 0 1px 0 rgba(255,255,255,.12); }
.slot img { width:42px; height:42px; object-fit:contain; image-rendering:pixelated; }
.slot span { position:absolute; right:3px; bottom:2px; color:#fff; font-size:10px; text-shadow:0 1px 2px #000; }
.output { border-color:rgba(250,204,21,.5); }
@keyframes portalArc { 0%,100% { opacity:.2; transform:rotate(-8deg) scale(.96); } 50% { opacity:.7; transform:rotate(12deg) scale(1.08); } }
@keyframes portalArcReverse { 0%,100% { opacity:.16; transform:rotate(12deg) scale(.95); } 50% { opacity:.58; transform:rotate(-14deg) scale(1.1); } }
@keyframes portalGlow { 0%,100% { opacity:.34; transform:scale(.9); } 50% { opacity:1; transform:scale(1.08); } }
@keyframes riftPulse { 0%,100% { opacity:.52; transform:scale(.88); } 50% { opacity:1; transform:scale(1.08); } }
@keyframes flowToPortal { 0%,100% { opacity:0; transform:translate(0,0) scale(.45); } 18% { opacity:.88; } 72% { opacity:.74; transform:translate(210px,8px) scale(1); } 100% { opacity:0; transform:translate(260px,10px) scale(.25); } }
@keyframes flowFromPortal { 0%,100% { opacity:0; transform:translate(0,0) scale(.45); } 18% { opacity:.88; } 72% { opacity:.74; transform:translate(-210px,-8px) scale(1); } 100% { opacity:0; transform:translate(-260px,-10px) scale(.25); } }
</style>
