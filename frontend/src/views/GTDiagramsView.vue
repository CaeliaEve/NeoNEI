<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import RecipeChromeButton from '../components/RecipeChromeButton.vue';
import { api, getImageUrl, type GTCircuitLine, type GTDiagramsOverview, type GTMaterialPartsEntry } from '../services/api';
import { useSound } from '../services/sound.service';

type DiagramTab = 'circuits' | 'materials';

const router = useRouter();
const { playClick } = useSound();

const loading = ref(true);
const error = ref<string | null>(null);
const overview = ref<GTDiagramsOverview | null>(null);
const activeTab = ref<DiagramTab>('circuits');
const materialQuery = ref('');
const selectedMaterialId = ref('');

const circuitLines = computed(() => overview.value?.circuits?.circuitLines ?? []);
const circuitParts = computed(() => overview.value?.circuits?.circuitParts ?? []);
const materials = computed(() => overview.value?.materials?.materials ?? []);

const visibleCircuitLines = computed(() => circuitLines.value.slice(0, 12));

const filteredMaterials = computed(() => {
  const query = materialQuery.value.trim().toLowerCase();
  if (!query) return materials.value;
  return materials.value.filter((entry) => {
    return entry.materialName.toLowerCase().includes(query) || entry.materialId.toLowerCase().includes(query);
  });
});

const selectedMaterial = computed<GTMaterialPartsEntry | null>(() => {
  if (!filteredMaterials.value.length) return null;
  const explicit = filteredMaterials.value.find((entry) => entry.materialId === selectedMaterialId.value);
  return explicit || filteredMaterials.value[0] || null;
});

const selectedMaterialSections = computed(() => {
  if (!selectedMaterial.value) return [];
  return Object.entries(selectedMaterial.value.sections ?? {}).filter(([, items]) => Array.isArray(items) && items.length > 0);
});

const materialStats = computed(() => {
  if (!selectedMaterial.value) {
    return { sections: 0, entries: 0, fluids: 0 };
  }

  const sections = selectedMaterialSections.value.length;
  const entries = selectedMaterialSections.value.reduce((sum, [, items]) => sum + items.length, 0);
  const fluids = selectedMaterial.value.fluids?.length ?? 0;
  return { sections, entries, fluids };
});

const compactPartGroups = computed(() => circuitParts.value.slice(0, 6));

function prettifyPartGroupLabel(key: string) {
  const known: Record<string, string> = {
    resistor: '电阻',
    diode: '二极管',
    transistor: '晶体管',
    capacitor: '电容',
    inductor: '电感',
    board: '电路板',
  };

  return known[key.toLowerCase()] || key;
}

function prettifySectionLabel(key: string) {
  const known: Record<string, string> = {
    rods: '杆件',
    plates: '板材',
    screws: '螺丝',
    bolts: '螺栓',
    rings: '环件',
    gears: '齿轮',
    smallgears: '小齿轮',
    rotors: '转子',
    foils: '箔材',
    springs: '弹簧',
    smallsprings: '小弹簧',
    sticks: '棒材',
    wires: '导线',
    cables: '电缆',
    cells: '单元',
    nuggets: '粒',
    dusts: '粉',
    tinydusts: '小撮粉',
    ingots: '锭',
    gems: '宝石',
    blocks: '方块',
    tools: '工具',
    longrods: '长杆',
  };

  return known[key.toLowerCase()] || key;
}

async function loadDiagrams() {
  loading.value = true;
  error.value = null;

  try {
    const payload = await api.getGTDiagramsOverview();
    overview.value = payload;

    if (!selectedMaterialId.value && payload.materials?.materials?.length) {
      selectedMaterialId.value = payload.materials.materials[0].materialId;
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载 GT Diagram 失败';
  } finally {
    loading.value = false;
  }
}

function goBack() {
  playClick();
  router.back();
}

function switchTab(tab: DiagramTab) {
  if (activeTab.value === tab) return;
  playClick();
  activeTab.value = tab;
}

function selectMaterial(materialId: string) {
  if (selectedMaterialId.value === materialId) return;
  playClick();
  selectedMaterialId.value = materialId;
}

function openItem(itemId: string) {
  playClick();
  void router.push(`/recipe/${itemId}`);
}

onMounted(() => {
  void loadDiagrams();
});
</script>

<template>
  <div class="gt-diagrams-shell">
    <header class="gt-diagrams-header">
      <div class="chrome-left">
        <RecipeChromeButton @click="goBack">返回</RecipeChromeButton>
      </div>

      <div class="gt-diagrams-titleblock">
        <span class="eyebrow">NEI CUSTOM DIAGRAM</span>
        <h1>GregTech 图谱总览</h1>
        <p>只接 canonical 导出的 GT 电路与材料图谱，不碰普通配方页，省得串味。</p>
      </div>

      <div class="header-actions">
        <button
          :class="['tab-button', activeTab === 'circuits' ? 'is-active' : '']"
          type="button"
          @click="switchTab('circuits')"
        >
          <span class="tab-kicker">线路图</span>
          <strong>电路板概览</strong>
        </button>
        <button
          :class="['tab-button', activeTab === 'materials' ? 'is-active' : '']"
          type="button"
          @click="switchTab('materials')"
        >
          <span class="tab-kicker">材料册</span>
          <strong>材料零件 / 工具</strong>
        </button>
      </div>
    </header>

    <main class="gt-diagrams-main">
      <section v-if="loading" class="diagram-state">
        <span class="eyebrow">Loading</span>
        <h2>正在读取 GT Diagram 数据</h2>
        <p>加载 canonical 目录中的电路 progression 和材料零件图谱。</p>
      </section>

      <section v-else-if="error" class="diagram-state is-error">
        <span class="eyebrow">Failure</span>
        <h2>GT Diagram 加载失败</h2>
        <p>{{ error }}</p>
        <RecipeChromeButton @click="loadDiagrams">重试</RecipeChromeButton>
      </section>

      <template v-else>
        <section v-if="activeTab === 'circuits'" class="diagram-board">
          <div class="board-topline">
            <div class="board-title">
              <span class="eyebrow">Circuit Progression</span>
              <h2>GT 电路板概览</h2>
              <p>按 Tier 展开主板与成品电路，对应 NEI 的整页图谱式查看。</p>
            </div>
            <div class="board-stats">
              <span>线路 {{ visibleCircuitLines.length }}</span>
              <span>元件组 {{ circuitParts.length }}</span>
            </div>
          </div>

          <div class="nei-circuit-sheet">
            <article
              v-for="line in visibleCircuitLines"
              :key="`line-${line.startTier}`"
              class="tier-band"
            >
              <div class="tier-rail">
                <span class="tier-mark">T{{ line.startTier }}</span>
                <span class="tier-label">CIRCUIT LINE</span>
              </div>

              <div class="tier-content">
                <div class="tier-column">
                  <div class="section-label">Boards</div>
                  <div class="slot-strip">
                    <button
                      v-for="board in line.boards"
                      :key="board.itemId"
                      class="nei-slot-chip"
                      type="button"
                      @click="openItem(board.itemId)"
                    >
                      <img :src="getImageUrl(board.itemId)" :alt="board.localizedName" />
                      <span>{{ board.localizedName }}</span>
                    </button>
                  </div>
                </div>

                <div class="tier-link">
                  <span class="link-line"></span>
                  <span class="link-node"></span>
                </div>

                <div class="tier-column output-column">
                  <div class="section-label">Circuits</div>
                  <div class="slot-strip">
                    <button
                      v-for="circuit in line.circuits"
                      :key="circuit.itemId"
                      class="nei-slot-chip is-output"
                      type="button"
                      @click="openItem(circuit.itemId)"
                    >
                      <img :src="getImageUrl(circuit.itemId)" :alt="circuit.localizedName" />
                      <span>{{ circuit.localizedName }}</span>
                      <small v-if="circuit.tierName">{{ circuit.tierName }}</small>
                    </button>
                  </div>
                </div>
              </div>
            </article>
          </div>

          <div class="parts-board">
            <div class="parts-header">
              <span class="eyebrow">Reference Parts</span>
              <h3>关键电子元件</h3>
            </div>

            <div class="parts-grid">
              <article v-for="group in compactPartGroups" :key="group.key" class="part-drawer">
                <header class="part-drawer-head">
                  <span class="drawer-index">{{ group.parts.length }}</span>
                  <strong>{{ prettifyPartGroupLabel(group.key) }}</strong>
                </header>

                <div class="part-items">
                  <button
                    v-for="part in group.parts"
                    :key="part.itemId"
                    class="part-chip"
                    type="button"
                    @click="openItem(part.itemId)"
                  >
                    <img :src="getImageUrl(part.itemId)" :alt="part.localizedName" />
                    <span>{{ part.localizedName }}</span>
                  </button>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section v-else class="diagram-board">
          <div class="board-topline">
            <div class="board-title">
              <span class="eyebrow">Material Parts Diagram</span>
              <h2>GT 材料零件 / 工具图谱</h2>
              <p>保留点击跳转，版式改成图册式浏览，尽量贴近游戏里 diagram 那股味儿。</p>
            </div>

            <div class="material-search-wrap">
              <input v-model="materialQuery" class="material-search" placeholder="搜索材料名称或 ID..." />
            </div>
          </div>

          <div class="material-sheet">
            <aside class="material-catalog">
              <div class="catalog-head">
                <span class="eyebrow">Catalog</span>
                <strong>{{ filteredMaterials.length }} 项材料</strong>
              </div>

              <div class="material-list">
                <button
                  v-for="entry in filteredMaterials"
                  :key="entry.materialId"
                  :class="['material-list-item', entry.materialId === selectedMaterial?.materialId ? 'is-active' : '']"
                  type="button"
                  @click="selectMaterial(entry.materialId)"
                >
                  <strong>{{ entry.materialName }}</strong>
                  <span>{{ entry.materialId }}</span>
                </button>
              </div>
            </aside>

            <section v-if="selectedMaterial" class="material-display">
              <header class="material-display-head">
                <div>
                  <span class="eyebrow">Selected Material</span>
                  <h3>{{ selectedMaterial.materialName }}</h3>
                  <p>{{ selectedMaterial.materialId }}</p>
                </div>

                <div class="material-metrics">
                  <span>分区 {{ materialStats.sections }}</span>
                  <span>部件 {{ materialStats.entries }}</span>
                  <span>流体 {{ materialStats.fluids }}</span>
                </div>
              </header>

              <div class="material-sections">
                <article
                  v-for="[key, items] in selectedMaterialSections"
                  :key="key"
                  class="material-drawer"
                >
                  <header class="material-drawer-head">
                    <span class="drawer-tag">{{ items.length }}</span>
                    <strong>{{ prettifySectionLabel(key) }}</strong>
                  </header>

                  <div class="part-items">
                    <button
                      v-for="part in items"
                      :key="part.itemId"
                      class="part-chip"
                      type="button"
                      @click="openItem(part.itemId)"
                    >
                      <img :src="getImageUrl(part.itemId)" :alt="part.localizedName" />
                      <span>{{ part.localizedName }}</span>
                      <small>{{ part.prefix }}</small>
                    </button>
                  </div>
                </article>
              </div>

              <article v-if="selectedMaterial.fluids?.length" class="fluids-drawer">
                <header class="material-drawer-head">
                  <span class="drawer-tag">{{ selectedMaterial.fluids.length }}</span>
                  <strong>流体映射</strong>
                </header>

                <div class="fluid-list">
                  <div
                    v-for="fluid in selectedMaterial.fluids"
                    :key="`${fluid.kind}-${fluid.fluidId}`"
                    class="fluid-chip"
                  >
                    <strong>{{ fluid.localizedName }}</strong>
                    <span>{{ fluid.kind }}</span>
                  </div>
                </div>
              </article>
            </section>
          </div>
        </section>
      </template>
    </main>
  </div>
</template>

<style scoped>
.gt-diagrams-shell {
  min-height: 100vh;
  padding: 24px 24px 40px;
  background:
    radial-gradient(circle at 50% 0%, rgba(113, 160, 214, 0.08), transparent 28%),
    linear-gradient(180deg, #0d131d 0%, #080d14 56%, #060a11 100%);
  color: #d8dde7;
}

.gt-diagrams-header,
.diagram-board,
.diagram-state {
  width: min(1720px, 100%);
  margin: 0 auto;
}

.gt-diagrams-header {
  display: grid;
  grid-template-columns: auto minmax(280px, 1fr) auto;
  gap: 18px;
  align-items: center;
  margin-bottom: 18px;
}

.chrome-left {
  display: flex;
  align-items: center;
}

.gt-diagrams-titleblock {
  padding: 14px 18px;
  border: 1px solid rgba(129, 148, 170, 0.18);
  border-radius: 14px;
  background:
    linear-gradient(180deg, rgba(22, 30, 43, 0.94), rgba(13, 18, 27, 0.97));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.gt-diagrams-titleblock h1 {
  margin: 4px 0 6px;
  font-size: 28px;
  line-height: 1.08;
  letter-spacing: 0.02em;
}

.gt-diagrams-titleblock p {
  margin: 0;
  color: rgba(216, 221, 231, 0.72);
  font-size: 13px;
}

.eyebrow {
  display: inline-block;
  color: #99b9e5;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.22em;
  text-transform: uppercase;
}

.header-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(180px, 1fr));
  gap: 10px;
}

.tab-button {
  display: grid;
  gap: 3px;
  padding: 12px 14px;
  border: 1px solid rgba(129, 148, 170, 0.18);
  border-radius: 14px;
  background:
    linear-gradient(180deg, rgba(16, 22, 31, 0.96), rgba(10, 14, 21, 0.98));
  color: #d8dde7;
  text-align: left;
  cursor: pointer;
  transition: border-color 120ms ease, transform 120ms ease, box-shadow 120ms ease;
}

.tab-button:hover,
.tab-button.is-active {
  border-color: rgba(232, 198, 126, 0.44);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 10px 26px rgba(0, 0, 0, 0.24);
  transform: translateY(-1px);
}

.tab-kicker {
  color: rgba(216, 221, 231, 0.56);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.diagram-board,
.diagram-state {
  border: 1px solid rgba(129, 148, 170, 0.18);
  border-radius: 18px;
  padding: 18px;
  background:
    linear-gradient(180deg, rgba(16, 22, 31, 0.98), rgba(8, 12, 18, 0.99)),
    linear-gradient(90deg, rgba(255, 255, 255, 0.02), transparent 30%, rgba(255, 255, 255, 0.015));
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.34), inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.diagram-state {
  display: grid;
  gap: 10px;
  place-items: start;
  min-height: 280px;
  align-content: center;
}

.diagram-state h2,
.board-title h2 {
  margin: 4px 0 8px;
}

.diagram-state p,
.board-title p {
  margin: 0;
  color: rgba(216, 221, 231, 0.7);
}

.diagram-state.is-error {
  border-color: rgba(227, 97, 97, 0.32);
}

.board-topline {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  align-items: flex-start;
  margin-bottom: 16px;
}

.board-title {
  max-width: 720px;
}

.board-stats,
.material-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.board-stats span,
.material-metrics span {
  padding: 8px 10px;
  border: 1px solid rgba(129, 148, 170, 0.18);
  border-radius: 999px;
  background: rgba(10, 15, 23, 0.88);
  color: rgba(216, 221, 231, 0.78);
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.nei-circuit-sheet,
.material-sheet {
  position: relative;
  border: 1px solid rgba(113, 129, 149, 0.14);
  border-radius: 16px;
  padding: 18px;
  background:
    linear-gradient(180deg, rgba(12, 17, 25, 0.98), rgba(8, 12, 19, 0.98)),
    repeating-linear-gradient(
      0deg,
      rgba(255, 255, 255, 0.02) 0,
      rgba(255, 255, 255, 0.02) 1px,
      transparent 1px,
      transparent 28px
    ),
    repeating-linear-gradient(
      90deg,
      rgba(255, 255, 255, 0.018) 0,
      rgba(255, 255, 255, 0.018) 1px,
      transparent 1px,
      transparent 28px
    );
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.02);
}

.nei-circuit-sheet {
  display: grid;
  gap: 12px;
}

.tier-band {
  display: grid;
  grid-template-columns: 112px minmax(0, 1fr);
  gap: 14px;
  padding: 14px;
  border: 1px solid rgba(129, 148, 170, 0.16);
  border-radius: 14px;
  background:
    linear-gradient(180deg, rgba(18, 24, 34, 0.96), rgba(12, 16, 23, 0.98));
}

.tier-rail {
  display: grid;
  align-content: start;
  gap: 8px;
  padding-right: 10px;
  border-right: 1px solid rgba(129, 148, 170, 0.16);
}

.tier-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border: 1px solid rgba(232, 198, 126, 0.28);
  border-radius: 12px;
  background:
    linear-gradient(180deg, rgba(47, 35, 18, 0.92), rgba(26, 20, 10, 0.96));
  color: #f3d296;
  font-size: 22px;
  font-weight: 900;
}

.tier-label,
.section-label {
  color: rgba(216, 221, 231, 0.58);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.tier-content {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 80px minmax(0, 1fr);
  gap: 14px;
  align-items: center;
}

.tier-column {
  display: grid;
  gap: 10px;
}

.tier-link {
  position: relative;
  height: 100%;
  min-height: 84px;
  display: grid;
  place-items: center;
}

.link-line {
  width: 100%;
  height: 2px;
  border-radius: 999px;
  background:
    linear-gradient(90deg, rgba(120, 150, 196, 0) 0%, rgba(120, 150, 196, 0.8) 50%, rgba(120, 150, 196, 0) 100%);
  box-shadow: 0 0 18px rgba(125, 179, 255, 0.22);
}

.link-node {
  position: absolute;
  width: 18px;
  height: 18px;
  border: 1px solid rgba(232, 198, 126, 0.44);
  border-radius: 50%;
  background: radial-gradient(circle, rgba(232, 198, 126, 0.94), rgba(232, 198, 126, 0.12));
  box-shadow: 0 0 16px rgba(232, 198, 126, 0.28);
}

.slot-strip,
.part-items {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.nei-slot-chip,
.part-chip {
  min-width: 146px;
  display: grid;
  grid-template-columns: 42px 1fr;
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
  border: 1px solid rgba(129, 148, 170, 0.18);
  border-radius: 10px;
  background:
    linear-gradient(180deg, rgba(22, 29, 40, 0.98), rgba(13, 18, 26, 1));
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 120ms ease, transform 120ms ease, box-shadow 120ms ease;
}

.nei-slot-chip:hover,
.part-chip:hover,
.material-list-item:hover {
  border-color: rgba(153, 185, 229, 0.42);
  transform: translateY(-1px);
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.22);
}

.nei-slot-chip.is-output {
  border-color: rgba(232, 198, 126, 0.28);
  background:
    linear-gradient(180deg, rgba(34, 29, 20, 0.98), rgba(17, 14, 10, 1));
}

.nei-slot-chip img,
.part-chip img {
  width: 38px;
  height: 38px;
  image-rendering: pixelated;
}

.nei-slot-chip span,
.part-chip span {
  font-size: 12px;
  font-weight: 700;
  line-height: 1.25;
}

.nei-slot-chip small,
.part-chip small {
  display: block;
  margin-top: 2px;
  color: rgba(216, 221, 231, 0.54);
  font-size: 10px;
}

.parts-board {
  margin-top: 18px;
  border: 1px solid rgba(113, 129, 149, 0.14);
  border-radius: 16px;
  padding: 16px;
  background:
    linear-gradient(180deg, rgba(11, 16, 23, 0.98), rgba(7, 11, 17, 0.98));
}

.parts-header h3 {
  margin: 4px 0 0;
}

.parts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
  margin-top: 14px;
}

.part-drawer,
.material-drawer,
.fluids-drawer {
  border: 1px solid rgba(129, 148, 170, 0.16);
  border-radius: 12px;
  padding: 14px;
  background:
    linear-gradient(180deg, rgba(18, 25, 36, 0.96), rgba(11, 16, 24, 0.98));
}

.part-drawer-head,
.material-drawer-head,
.catalog-head,
.material-display-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
}

.part-drawer-head,
.material-drawer-head {
  margin-bottom: 12px;
}

.drawer-index,
.drawer-tag {
  min-width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 8px;
  border: 1px solid rgba(232, 198, 126, 0.3);
  border-radius: 999px;
  background: rgba(35, 29, 19, 0.94);
  color: #f3d296;
  font-size: 11px;
  font-weight: 800;
}

.material-search-wrap {
  min-width: 260px;
}

.material-search {
  width: 100%;
  height: 42px;
  padding: 0 14px;
  border: 1px solid rgba(129, 148, 170, 0.18);
  border-radius: 12px;
  background: rgba(8, 12, 19, 0.94);
  color: #d8dde7;
}

.material-sheet {
  display: grid;
  grid-template-columns: 290px minmax(0, 1fr);
  gap: 16px;
}

.material-catalog,
.material-display {
  border: 1px solid rgba(129, 148, 170, 0.16);
  border-radius: 14px;
  background:
    linear-gradient(180deg, rgba(15, 21, 30, 0.98), rgba(8, 12, 18, 0.98));
}

.material-catalog {
  padding: 12px;
  display: grid;
  gap: 12px;
  max-height: 78vh;
}

.material-list {
  display: grid;
  gap: 8px;
  overflow: auto;
  padding-right: 4px;
}

.material-list-item {
  padding: 10px 12px;
  border: 1px solid rgba(129, 148, 170, 0.14);
  border-radius: 10px;
  background: rgba(12, 17, 25, 0.96);
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 120ms ease, transform 120ms ease, box-shadow 120ms ease;
}

.material-list-item strong,
.material-display-head h3 {
  display: block;
  margin-bottom: 4px;
}

.material-list-item span,
.material-display-head p,
.fluid-chip span {
  color: rgba(216, 221, 231, 0.54);
  font-size: 11px;
}

.material-list-item.is-active {
  border-color: rgba(232, 198, 126, 0.34);
  background:
    linear-gradient(180deg, rgba(41, 33, 20, 0.98), rgba(21, 18, 12, 0.98));
}

.material-display {
  padding: 16px;
}

.material-display-head {
  padding-bottom: 14px;
  border-bottom: 1px solid rgba(129, 148, 170, 0.12);
  margin-bottom: 14px;
}

.material-display-head h3 {
  margin: 4px 0 6px;
  font-size: 24px;
}

.material-display-head p {
  margin: 0;
}

.material-sections {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 12px;
}

.fluid-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.fluid-chip {
  min-width: 180px;
  padding: 10px 12px;
  border: 1px solid rgba(129, 148, 170, 0.16);
  border-radius: 10px;
  background: rgba(11, 16, 24, 0.96);
}

@media (max-width: 1240px) {
  .gt-diagrams-header,
  .board-topline,
  .material-sheet,
  .tier-band,
  .tier-content {
    grid-template-columns: 1fr;
    flex-direction: column;
  }

  .header-actions {
    width: 100%;
  }

  .material-search-wrap {
    width: 100%;
  }

  .tier-rail {
    border-right: 0;
    border-bottom: 1px solid rgba(129, 148, 170, 0.16);
    padding-right: 0;
    padding-bottom: 10px;
  }

  .tier-link {
    min-height: 52px;
  }
}

@media (max-width: 760px) {
  .gt-diagrams-shell {
    padding: 18px 12px 28px;
  }

  .header-actions {
    grid-template-columns: 1fr;
  }

  .parts-grid,
  .material-sections {
    grid-template-columns: 1fr;
  }
}
</style>
