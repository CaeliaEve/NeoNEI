<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { getImageUrl, type Recipe } from '../services/api';
import type { UITypeConfig } from '../services/uiTypeMapping';
import { useSound } from '../services/sound.service';
import { buildInputSlots, buildOutputSlots, type ResolvedSlot } from '../composables/useRecipeSlots';
import { readPositiveIntegerMeta } from '../composables/ritualFamilyMetadata';
import RecipeItemTooltip from './RecipeItemTooltip.vue';
import AnimatedItemIcon from './AnimatedItemIcon.vue';
interface Props { recipe: Recipe; uiConfig?: UITypeConfig }
interface Emits { (e: 'item-click', itemId: string): void }
const props = defineProps<Props>(); const emit = defineEmits<Emits>(); const { playClick } = useSound();
const inputs = ref<ResolvedSlot[]>([]); const outputs = ref<ResolvedSlot[]>([]); const manaCost = ref<number | null>(null);
const manaText = computed(() => (manaCost.value ? `${manaCost.value.toLocaleString()} MANA` : ''));
async function initTerra() { inputs.value = (await buildInputSlots(props.recipe)).slice(0, 8); outputs.value = await buildOutputSlots(props.recipe, 2); manaCost.value = readPositiveIntegerMeta(props.recipe, ['manaCost', 'mana', 'requiredMana', 'cost']); }
function onItemClick(itemId: string) { playClick(); emit('item-click', itemId); }
function imageError(event: Event) { (event.target as HTMLImageElement).src = '/placeholder.png'; }
function orbitStyle(index: number, total: number) {
  const safeTotal = Math.max(total, 1);
  const angle = (Math.PI * 2 * index) / safeTotal - Math.PI / 2;
  const radius = 142;
  return {
    left: `calc(50% + ${Math.cos(angle) * radius}px)`,
    top: `calc(50% + ${Math.sin(angle) * radius}px)`,
  };
}
onMounted(() => void initTerra()); watch(() => props.recipe, () => void initTerra(), { deep: true });
</script>
<template>
  <div class="terra-ui">
    <div class="plate-field">
      <div class="terra-grid" />
      <div class="mana-vein vein-a" />
      <div class="mana-vein vein-b" />
      <div class="mana-vein vein-c" />
      <div class="terra-sigil sigil-a" />
      <div class="terra-sigil sigil-b" />
      <div class="terra-sigil sigil-c" />
      <div class="flora-mote mote-a" />
      <div class="flora-mote mote-b" />
      <div class="flora-mote mote-c" />
      <div class="flora-mote mote-d" />
      <div class="petal petal-a" />
      <div class="petal petal-b" />
      <div class="petal petal-c" />
      <div class="petal petal-d" />
      <div class="mana-ribbon ribbon-a" />
      <div class="mana-ribbon ribbon-b" />
      <div class="convergence-petal petal-top" />
      <div class="convergence-petal petal-left" />
      <div class="convergence-petal petal-right" />
      <div class="mana-wisp wisp-top-a" />
      <div class="mana-wisp wisp-top-b" />
      <div class="mana-wisp wisp-left-a" />
      <div class="mana-wisp wisp-left-b" />
      <div class="mana-wisp wisp-right-a" />
      <div class="mana-wisp wisp-right-b" />
      <div class="mana-orbital orbital-a" />
      <div class="mana-orbital orbital-b" />
      <div class="fusion-bloom" />
      <div class="spark spark-a" />
      <div class="spark spark-b" />
      <div class="spark spark-c" />
      <div class="spark spark-d" />
      <div class="plate">
        <div class="plate-aura" />
        <RecipeItemTooltip v-if="outputs[0]" :item-id="outputs[0].itemId" :count="outputs[0].count">
          <button class="plate-result-button" type="button" @click.stop="onItemClick(outputs[0].itemId)">
            <AnimatedItemIcon
              :item-id="outputs[0].itemId"
              :render-asset-ref="outputs[0].renderAssetRef || null"
              :image-file-name="outputs[0].imageFileName || null"
              :size="76"
              class="plate-result-icon"
            />
          </button>
        </RecipeItemTooltip>
      </div>
      <div class="input-orbit">
        <div v-for="(slot, index) in inputs" :key="`${slot.itemId}-${index}`" class="orbit-anchor" :style="orbitStyle(index, inputs.length)">
          <RecipeItemTooltip :item-id="slot.itemId" :count="slot.count" @click="onItemClick(slot.itemId)">
            <button class="slot input" type="button"><AnimatedItemIcon :item-id="slot.itemId" :render-asset-ref="slot.renderAssetRef || null" :image-file-name="slot.imageFileName || null" :size="48" /><span v-if="slot.count > 1">{{ slot.count }}</span></button>
          </RecipeItemTooltip>
        </div>
      </div>
      <div class="terra-caption">TERRESTRIAL AGGLOMERATION PLATE</div>
      <div v-if="manaText" class="mana">{{ manaText }}</div>
    </div>
  </div>
</template>
<style scoped>
.terra-ui { width:min(1180px,calc(100vw - 56px)); min-height:560px; display:block; padding:18px; border:1px solid rgba(190,255,130,.28); border-radius:24px; background:radial-gradient(circle at 43% 50%, rgba(160,255,86,.22), transparent 38%), radial-gradient(circle at 80% 20%, rgba(77,255,187,.12), transparent 28%), radial-gradient(circle at 18% 76%, rgba(245,210,120,.1), transparent 24%), linear-gradient(180deg,#0d170b,#05080d); box-shadow:0 22px 60px rgba(0,0,0,.36), inset 0 1px 0 rgba(255,255,255,.06); }
.plate-field { position:relative; display:grid; place-items:center; min-height:520px; border-radius:24px; background:radial-gradient(circle at 50% 50%, rgba(72,122,42,.58), rgba(5,14,12,.86) 62%), radial-gradient(circle at 22% 18%, rgba(245,206,96,.16), transparent 34%), radial-gradient(circle at 80% 80%, rgba(64,255,174,.12), transparent 32%), linear-gradient(180deg,rgba(10,24,14,.64),rgba(4,8,8,.94)); overflow:hidden; border:1px solid rgba(190,255,130,.18); }
.terra-grid { position:absolute; inset:0; background-image:linear-gradient(rgba(206,255,159,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(206,255,159,.035) 1px, transparent 1px); background-size:30px 30px; mask-image:radial-gradient(circle at center, #000 0 62%, transparent 88%); opacity:.7; }
.mana-vein { position:absolute; width:126%; height:2px; background:linear-gradient(90deg,transparent,rgba(245,210,120,.08) 22%,rgba(219,255,156,.82) 50%,rgba(111,255,190,.46) 68%,transparent); box-shadow:0 0 26px rgba(184,247,138,.34); animation:manaFlow 4s ease-in-out infinite; }
.vein-a { transform:rotate(31deg); } .vein-b { transform:rotate(-31deg); animation-delay:.7s; } .vein-c { transform:rotate(90deg); opacity:.46; animation-delay:1.35s; }
.terra-sigil { position:absolute; clip-path:polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%); border:1px solid rgba(204,255,154,.34); background:linear-gradient(135deg,rgba(184,247,138,.09),rgba(116,255,196,.025)); box-shadow:0 0 34px rgba(184,247,138,.18), inset 0 0 36px rgba(116,255,196,.06); }
.sigil-a { width:390px; height:390px; animation:sigilTurn 34s linear infinite; }
.sigil-b { width:294px; height:294px; border-color:rgba(116,255,196,.26); animation:sigilTurnReverse 23s linear infinite; }
.sigil-c { width:190px; height:190px; border-color:rgba(245,210,120,.3); animation:sigilBreathe 3.4s ease-in-out infinite; }
.flora-mote { position:absolute; z-index:2; width:18px; height:18px; border:1px solid rgba(226,255,160,.34); border-radius:50% 50% 50% 8px; background:radial-gradient(circle at 35% 35%,rgba(236,255,180,.9),rgba(123,255,159,.28) 48%,transparent 70%); box-shadow:0 0 20px rgba(184,247,138,.42); animation:moteDrift 5s ease-in-out infinite; }
.mote-a { left:25%; top:24%; transform:rotate(-28deg); } .mote-b { right:25%; top:24%; animation-delay:.7s; transform:rotate(42deg); } .mote-c { left:26%; bottom:24%; animation-delay:1.2s; transform:rotate(-118deg); } .mote-d { right:26%; bottom:24%; animation-delay:1.8s; transform:rotate(128deg); }
.petal { position:absolute; z-index:2; width:86px; height:32px; border-radius:50%; background:linear-gradient(90deg,transparent,rgba(172,255,96,.2),rgba(93,255,170,.1),transparent); filter:blur(.2px); opacity:.55; animation:petalPulse 4.8s ease-in-out infinite; }
.petal-a { top:28%; left:50%; transform:translateX(-50%) rotate(0deg); } .petal-b { bottom:28%; left:50%; transform:translateX(-50%) rotate(180deg); animation-delay:.8s; } .petal-c { left:34%; top:50%; transform:translateY(-50%) rotate(90deg); animation-delay:1.3s; } .petal-d { right:34%; top:50%; transform:translateY(-50%) rotate(-90deg); animation-delay:1.9s; }
.mana-ribbon { position:absolute; z-index:1; width:440px; height:170px; border:1px solid rgba(124,255,174,.14); border-left-color:transparent; border-right-color:transparent; border-radius:50%; filter:drop-shadow(0 0 14px rgba(111,255,190,.18)); animation:ribbonFloat 7s ease-in-out infinite; }
.ribbon-a { transform:rotate(18deg); } .ribbon-b { transform:rotate(-18deg); animation-delay:1.4s; }
.convergence-petal { position:absolute; z-index:2; width:128px; height:58px; border-radius:60% 40% 70% 30%; background:radial-gradient(ellipse at 50% 50%,rgba(218,255,134,.18),rgba(86,255,166,.06) 54%,transparent 74%); filter:blur(.4px); mix-blend-mode:screen; animation:convergePetal 4.6s ease-in-out infinite; }
.petal-top { left:50%; top:33%; --petal-rotation:90deg; transform:translate(-50%,-50%) rotate(var(--petal-rotation)); animation-delay:.1s; }
.petal-left { left:40%; top:55%; --petal-rotation:22deg; transform:translate(-50%,-50%) rotate(var(--petal-rotation)); animation-delay:.55s; }
.petal-right { left:60%; top:55%; --petal-rotation:-22deg; transform:translate(-50%,-50%) rotate(var(--petal-rotation)); animation-delay:1s; }
.mana-wisp { position:absolute; z-index:2; width:8px; height:8px; border-radius:50%; background:radial-gradient(circle,rgba(255,244,164,.96),rgba(143,255,134,.52) 42%,rgba(83,255,190,.08) 72%,transparent); box-shadow:0 0 18px rgba(178,255,110,.46),0 0 32px rgba(77,255,187,.16); mix-blend-mode:screen; pointer-events:none; }
.wisp-top-a { left:50%; top:28%; animation:wispTopSpiral 5.8s cubic-bezier(.42,0,.18,1) infinite; }
.wisp-top-b { left:47%; top:31%; animation:wispTopSpiral 6.9s cubic-bezier(.42,0,.18,1) infinite 1.15s; }
.wisp-left-a { left:36%; top:60%; animation:wispLeftSpiral 6.2s cubic-bezier(.42,0,.18,1) infinite .35s; }
.wisp-left-b { left:40%; top:64%; animation:wispLeftSpiral 7.2s cubic-bezier(.42,0,.18,1) infinite 1.55s; }
.wisp-right-a { left:64%; top:60%; animation:wispRightSpiral 6.2s cubic-bezier(.42,0,.18,1) infinite .65s; }
.wisp-right-b { left:60%; top:64%; animation:wispRightSpiral 7.2s cubic-bezier(.42,0,.18,1) infinite 1.85s; }
.mana-orbital { position:absolute; z-index:2; width:210px; height:92px; border-radius:50%; border:1px solid rgba(178,255,110,.12); border-top-color:rgba(236,255,180,.34); border-bottom-color:transparent; filter:drop-shadow(0 0 16px rgba(111,255,190,.16)); pointer-events:none; mix-blend-mode:screen; }
.orbital-a { animation:orbitalSweep 7.8s ease-in-out infinite; }
.orbital-b { width:170px; height:70px; border-top-color:rgba(85,255,179,.28); animation:orbitalSweepReverse 9.2s ease-in-out infinite .7s; }
.fusion-bloom { position:absolute; z-index:2; width:150px; height:150px; border-radius:50%; background:radial-gradient(circle,rgba(236,255,180,.24),rgba(111,255,190,.09) 44%,transparent 72%); filter:blur(.2px); animation:fusionBloom 5.6s ease-in-out infinite; }
.plate { position:relative; z-index:3; width:150px; height:150px; display:grid; place-items:center; border-radius:34%; background:radial-gradient(circle,rgba(228,255,184,.36),rgba(40,70,30,.42)); box-shadow:0 0 46px rgba(184,247,138,.3), inset 0 0 28px rgba(255,255,255,.08); }
.plate-aura { position:absolute; width:190px; height:190px; border-radius:34%; background:radial-gradient(circle,rgba(184,247,138,.22),transparent 68%); animation:plateAura 2.8s ease-in-out infinite; }
.plate-result-button { position:relative; z-index:3; width:86px; height:86px; border:0; padding:0; background:transparent; cursor:pointer; }
.plate-result-icon { width:76px; height:76px; object-fit:contain; image-rendering:pixelated; filter:drop-shadow(0 0 18px rgba(236,255,180,.78)); transition:transform .18s ease, filter .18s ease; }
.plate-result-button:hover .plate-result-icon { transform:scale(1.1); filter:drop-shadow(0 0 26px rgba(236,255,180,.96)); }
.input-orbit { position:absolute; inset:0; z-index:4; pointer-events:none; }
.orbit-anchor { position:absolute; transform:translate(-50%,-50%); z-index:5; pointer-events:auto; }
.orbit-anchor .slot { border-radius:50%; }
.terra-caption { position:absolute; bottom:24px; letter-spacing:.18em; color:#e7ffd5; font-size:12px; font-weight:900; text-shadow:0 0 18px rgba(184,247,138,.35); }
.spark { position:absolute; width:6px; height:6px; border-radius:50%; background:#dbff9c; box-shadow:0 0 14px #b8f78a; animation:floatSpark 4s ease-in-out infinite; }
.spark-a { left:22%; top:28%; } .spark-b { right:23%; top:31%; animation-delay:.8s; } .spark-c { left:30%; bottom:24%; animation-delay:1.4s; } .spark-d { right:31%; bottom:28%; animation-delay:2.1s; }
.slot { position:relative; width:66px; height:66px; border:1px solid rgba(190,255,130,.42); border-radius:16px; background:radial-gradient(circle at 45% 35%,rgba(70,120,45,.7),transparent 62%), linear-gradient(180deg,#102017,#08110d); display:grid; place-items:center; cursor:pointer; box-shadow:0 12px 20px rgba(0,0,0,.28), 0 0 18px rgba(80,255,150,.08), inset 0 1px 0 rgba(255,255,255,.07); }
.slot:hover { border-color:rgba(226,255,160,.85); box-shadow:0 0 26px rgba(184,247,138,.34), 0 0 0 2px rgba(97,255,165,.08), inset 0 1px 0 rgba(255,255,255,.12); }
.slot img { width:48px; height:48px; object-fit:contain; image-rendering:pixelated; }
.slot span { position:absolute; right:3px; bottom:2px; color:#fff; font-size:10px; }
.output { width:82px; height:82px; border-color:rgba(250,204,21,.55); border-radius:18px; }
.output img { width:60px; height:60px; }
.mana { position:absolute; right:22px; bottom:22px; color:rgba(239,255,216,.72); font-size:12px; font-weight:800; letter-spacing:.12em; }
@keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
@keyframes spinReverse { from { transform:rotate(360deg); } to { transform:rotate(0deg); } }
@keyframes ringBreathe { 0%,100% { transform:scale(.98); opacity:.55; } 50% { transform:scale(1.04); opacity:1; } }
@keyframes beamPulse { 0%,100% { opacity:.45; } 50% { opacity:1; } }
@keyframes manaFlow { 0%,100% { opacity:.42; filter:hue-rotate(0deg); } 50% { opacity:1; filter:hue-rotate(24deg); } }
@keyframes sigilTurn { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
@keyframes sigilTurnReverse { from { transform:rotate(360deg); } to { transform:rotate(0deg); } }
@keyframes sigilBreathe { 0%,100% { transform:scale(.96); opacity:.5; } 50% { transform:scale(1.05); opacity:1; } }
@keyframes moteDrift { 0%,100% { margin-top:0; opacity:.5; } 50% { margin-top:-10px; opacity:1; } }
@keyframes petalPulse { 0%,100% { opacity:.24; filter:blur(.6px); } 50% { opacity:.72; filter:blur(0); } }
@keyframes ribbonFloat { 0%,100% { opacity:.18; transform:rotate(18deg) scale(.98); } 50% { opacity:.55; transform:rotate(25deg) scale(1.04); } }
@keyframes convergePetal { 0%,100% { opacity:.18; transform:translate(-50%,-50%) scale(.78) rotate(var(--petal-rotation, 0deg)); } 50% { opacity:.62; transform:translate(-50%,-50%) scale(1.08) rotate(var(--petal-rotation, 0deg)); } }
@keyframes wispTopSpiral { 0% { opacity:0; transform:translate(0,0) scale(.45); } 16% { opacity:.75; } 46% { transform:translate(28px,54px) scale(.9); } 78% { opacity:.7; transform:translate(-14px,102px) scale(1); } 100% { opacity:0; transform:translate(0,130px) scale(.22); } }
@keyframes wispLeftSpiral { 0% { opacity:0; transform:translate(0,0) scale(.45); } 16% { opacity:.75; } 46% { transform:translate(46px,-10px) scale(.9); } 78% { opacity:.7; transform:translate(94px,-58px) scale(1); } 100% { opacity:0; transform:translate(124px,-86px) scale(.22); } }
@keyframes wispRightSpiral { 0% { opacity:0; transform:translate(0,0) scale(.45); } 16% { opacity:.75; } 46% { transform:translate(-46px,-10px) scale(.9); } 78% { opacity:.7; transform:translate(-94px,-58px) scale(1); } 100% { opacity:0; transform:translate(-124px,-86px) scale(.22); } }
@keyframes orbitalSweep { 0%,100% { opacity:.12; transform:rotate(-16deg) scale(.94); } 44%,58% { opacity:.5; transform:rotate(18deg) scale(1.08); } }
@keyframes orbitalSweepReverse { 0%,100% { opacity:.1; transform:rotate(18deg) scale(.96); } 42%,62% { opacity:.42; transform:rotate(-22deg) scale(1.1); } }
@keyframes fusionBloom { 0%,100% { opacity:.18; transform:scale(.88); } 45%,58% { opacity:.62; transform:scale(1.12); } 64% { opacity:.28; transform:scale(.96); } }
@keyframes plateAura { 0%,100% { transform:scale(.94); opacity:.45; } 50% { transform:scale(1.08); opacity:1; } }
@keyframes floatSpark { 0%,100% { transform:translateY(0) scale(.8); opacity:.45; } 50% { transform:translateY(-18px) scale(1.2); opacity:1; } }
</style>
