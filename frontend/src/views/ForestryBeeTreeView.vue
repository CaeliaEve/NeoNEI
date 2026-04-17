<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import RecipeChromeButton from '../components/RecipeChromeButton.vue';
import {
  api,
  getImageUrl,
  type ForestryGeneticsItemDrop,
  type ForestryGeneticsMutation,
  type ForestryGeneticsOverview,
  type ForestryGeneticsSpecies,
} from '../services/api';
import { useSound } from '../services/sound.service';

type BeeTreeNode = {
  uid: string;
  name: string;
  memberItemId: string;
  mutationChance: number | null;
  parents: BeeTreeNode[];
};

type BeeTreeRenderNode = {
  key: string;
  uid: string;
  name: string;
  memberItemId: string;
  mutationChance: number | null;
  x: number;
  y: number;
  depth: number;
};

type BeeTreeEdge = {
  from: string;
  to: string;
};

const router = useRouter();
const { playClick } = useSound();

const loading = ref(true);
const error = ref<string | null>(null);
const overview = ref<ForestryGeneticsOverview | null>(null);
const speciesQuery = ref('');
const selectedUid = ref('');

const bees = computed(() => overview.value?.bees);
const species = computed(() => bees.value?.species ?? []);
const mutations = computed(() => bees.value?.mutations ?? []);

const speciesByUid = computed(() => {
  const map = new Map<string, ForestryGeneticsSpecies>();
  for (const entry of species.value) {
    map.set(entry.uid, entry);
  }
  return map;
});

const filteredSpecies = computed(() => {
  const query = speciesQuery.value.trim().toLowerCase();
  if (!query) return species.value;
  return species.value.filter((entry) =>
    entry.name.toLowerCase().includes(query) ||
    entry.uid.toLowerCase().includes(query),
  );
});

const selectedSpecies = computed<ForestryGeneticsSpecies | null>(() => {
  if (!filteredSpecies.value.length) return null;
  const exact = filteredSpecies.value.find((entry) => entry.uid === selectedUid.value);
  return exact || filteredSpecies.value[0] || null;
});

const selectedDrops = computed(() => ({
  products: selectedSpecies.value?.products ?? [],
  specialties: selectedSpecies.value?.specialties ?? [],
}));

const relatedMutations = computed<ForestryGeneticsMutation[]>(() => {
  if (!selectedSpecies.value) return [];
  const uid = selectedSpecies.value.uid;
  return mutations.value
    .filter((mutation) =>
      mutation.result === uid || mutation.allele0 === uid || mutation.allele1 === uid,
    )
    .sort((a, b) => b.chance - a.chance);
});

const primaryMutation = computed<ForestryGeneticsMutation | null>(() => {
  if (!selectedSpecies.value) return null;
  return mutations.value
    .filter((mutation) => mutation.result === selectedSpecies.value?.uid)
    .sort((a, b) => {
      const restrictedDelta = Number(a.restricted) - Number(b.restricted);
      if (restrictedDelta !== 0) return restrictedDelta;
      return b.chance - a.chance;
    })[0] ?? null;
});

function findBestMutationFor(uid: string): ForestryGeneticsMutation | null {
  return mutations.value
    .filter((mutation) => mutation.result === uid)
    .sort((a, b) => {
      const restrictedDelta = Number(a.restricted) - Number(b.restricted);
      if (restrictedDelta !== 0) return restrictedDelta;
      return b.chance - a.chance;
    })[0] ?? null;
}

function buildTree(uid: string, depth = 0, visited = new Set<string>()): BeeTreeNode | null {
  const found = speciesByUid.value.get(uid);
  if (!found) return null;
  if (depth >= 4 || visited.has(uid)) {
    return {
      uid: found.uid,
      name: found.name,
      memberItemId: found.memberItemId,
      mutationChance: null,
      parents: [],
    };
  }

  const mutation = findBestMutationFor(uid);
  const nextVisited = new Set(visited);
  nextVisited.add(uid);

  const parents: BeeTreeNode[] = [];
  if (mutation) {
    const left = buildTree(mutation.allele0, depth + 1, nextVisited);
    const right = buildTree(mutation.allele1, depth + 1, nextVisited);
    if (left) parents.push(left);
    if (right) parents.push(right);
  }

  return {
    uid: found.uid,
    name: found.name,
    memberItemId: found.memberItemId,
    mutationChance: mutation ? mutation.chance : null,
    parents,
  };
}

function countLeaves(node: BeeTreeNode): number {
  if (!node.parents.length) return 1;
  return node.parents.reduce((sum, parent) => sum + countLeaves(parent), 0);
}

function layoutTree(root: BeeTreeNode | null) {
  const renderNodes: BeeTreeRenderNode[] = [];
  const edges: BeeTreeEdge[] = [];
  if (!root) {
    return { nodes: renderNodes, edges, width: 0, height: 0 };
  }

  const levelHeight = 138;
  const marginX = 70;
  const leafGap = 152;
  const leafCount = countLeaves(root);

  const place = (node: BeeTreeNode, startLeaf: number, depth: number): number => {
    const leafSpan = countLeaves(node);
    const centerLeaf = startLeaf + (leafSpan - 1) / 2;
    const x = marginX + centerLeaf * leafGap;
    const y = 48 + depth * levelHeight;
    const key = `${node.uid}-${depth}-${startLeaf}`;

    renderNodes.push({
      key,
      uid: node.uid,
      name: node.name,
      memberItemId: node.memberItemId,
      mutationChance: node.mutationChance,
      x,
      y,
      depth,
    });

    let childStart = startLeaf;
    for (const parent of node.parents) {
      const parentKey = place(parent, childStart, depth + 1);
      edges.push({ from: key, to: parentKey });
      childStart += countLeaves(parent);
    }
    return key;
  };

  place(root, 0, 0);

  const maxDepth = renderNodes.reduce((max, node) => Math.max(max, node.depth), 0);
  return {
    nodes: renderNodes,
    edges,
    width: Math.max(760, marginX * 2 + Math.max(0, leafCount - 1) * leafGap + 120),
    height: 140 + maxDepth * levelHeight,
  };
}

const selectedTree = computed(() => buildTree(selectedSpecies.value?.uid ?? ''));
const treeLayout = computed(() => layoutTree(selectedTree.value));

const renderNodeMap = computed(() => {
  const map = new Map<string, BeeTreeRenderNode>();
  for (const node of treeLayout.value.nodes) {
    map.set(node.key, node);
  }
  return map;
});

function lineStyle(edge: BeeTreeEdge) {
  const from = renderNodeMap.value.get(edge.from);
  const to = renderNodeMap.value.get(edge.to);
  if (!from || !to) return {};
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  return {
    left: `${from.x}px`,
    top: `${from.y + 26}px`,
    width: `${length}px`,
    transform: `rotate(${angle}deg)`,
  };
}

function nodeStyle(node: BeeTreeRenderNode) {
  return {
    left: `${node.x}px`,
    top: `${node.y}px`,
  };
}

function chanceText(chance: number | null) {
  if (chance == null) return '';
  return `${Math.round(chance * 100)}%`;
}

async function loadTree() {
  loading.value = true;
  error.value = null;
  try {
    const payload = await api.getForestryGeneticsOverview();
    overview.value = payload;
    if (!selectedUid.value && payload.bees?.species?.length) {
      selectedUid.value = payload.bees.species[0].uid;
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载蜜蜂育种树失败';
  } finally {
    loading.value = false;
  }
}

function goBack() {
  playClick();
  router.back();
}

function selectSpecies(uid: string) {
  if (selectedUid.value === uid) return;
  playClick();
  selectedUid.value = uid;
}

function openItem(itemId: string) {
  playClick();
  void router.push(`/recipe/${itemId}`);
}

function renderChance(drop: ForestryGeneticsItemDrop) {
  return `${Math.round(drop.chance * 100)}%`;
}

onMounted(() => {
  void loadTree();
});
</script>

<template>
  <div class="bee-tree-shell">
    <header class="bee-tree-header">
      <RecipeChromeButton @click="goBack">返回</RecipeChromeButton>
      <div class="title-block">
        <span class="eyebrow">Bee Tree</span>
        <h1>蜜蜂育种树</h1>
        <p>按育种链反推父母系，并显示突变概率，尽量贴近游戏内 NEI 的树状味道。</p>
      </div>
      <input v-model="speciesQuery" class="species-search" placeholder="搜索蜂种..." />
    </header>

    <main class="bee-tree-main">
      <section v-if="loading" class="state-card">
        <h2>正在加载蜜蜂图谱</h2>
        <p>读取 forestry-genetics canonical 数据。</p>
      </section>

      <section v-else-if="error" class="state-card error">
        <h2>蜜蜂育种树加载失败</h2>
        <p>{{ error }}</p>
        <RecipeChromeButton @click="loadTree">重试</RecipeChromeButton>
      </section>

      <template v-else>
        <aside class="species-panel">
          <div class="panel-title">
            <span class="eyebrow">Species</span>
            <strong>{{ filteredSpecies.length }} 种</strong>
          </div>

          <div class="species-list">
            <button
              v-for="entry in filteredSpecies"
              :key="entry.uid"
              :class="['species-row', entry.uid === selectedSpecies?.uid ? 'is-active' : '']"
              type="button"
              @click="selectSpecies(entry.uid)"
            >
              <img :src="getImageUrl(entry.memberItemId)" :alt="entry.name" />
              <div>
                <strong>{{ entry.name }}</strong>
                <span>{{ entry.uid }}</span>
              </div>
            </button>
          </div>
        </aside>

        <section v-if="selectedSpecies" class="detail-panel">
          <article class="tree-board">
            <div class="tree-board-head">
              <span class="eyebrow">Breeding Graph</span>
              <strong>{{ selectedSpecies.name }}</strong>
              <small v-if="primaryMutation">主突变概率 {{ chanceText(primaryMutation.chance) }}</small>
            </div>

            <div class="tree-canvas" :style="{ width: `${treeLayout.width}px`, minHeight: `${treeLayout.height}px` }">
              <div
                v-for="edge in treeLayout.edges"
                :key="`${edge.from}-${edge.to}`"
                class="tree-edge"
                :style="lineStyle(edge)"
              />

              <button
                v-for="node in treeLayout.nodes"
                :key="node.key"
                class="tree-node"
                :class="{ 'is-root': node.depth === 0 }"
                type="button"
                :style="nodeStyle(node)"
                @click="openItem(node.memberItemId)"
              >
                <img :src="getImageUrl(node.memberItemId)" :alt="node.name" />
                <strong>{{ node.name }}</strong>
                <span v-if="node.mutationChance !== null" class="chance">{{ chanceText(node.mutationChance) }}</span>
              </button>
            </div>
          </article>

          <div class="detail-grid">
            <article class="detail-card">
              <div class="panel-title">
                <span class="eyebrow">Products</span>
                <strong>{{ selectedDrops.products.length }}</strong>
              </div>
              <div class="drop-grid">
                <button
                  v-for="drop in selectedDrops.products"
                  :key="`${selectedSpecies.uid}-${drop.itemId}`"
                  class="drop-chip"
                  type="button"
                  @click="openItem(drop.itemId)"
                >
                  <img :src="getImageUrl(drop.itemId)" :alt="drop.localizedName" />
                  <div>
                    <strong>{{ drop.localizedName }}</strong>
                    <span>{{ renderChance(drop) }}</span>
                  </div>
                </button>
              </div>
            </article>

            <article class="detail-card">
              <div class="panel-title">
                <span class="eyebrow">Specialties</span>
                <strong>{{ selectedDrops.specialties.length }}</strong>
              </div>
              <div class="drop-grid">
                <button
                  v-for="drop in selectedDrops.specialties"
                  :key="`${selectedSpecies.uid}-special-${drop.itemId}`"
                  class="drop-chip"
                  type="button"
                  @click="openItem(drop.itemId)"
                >
                  <img :src="getImageUrl(drop.itemId)" :alt="drop.localizedName" />
                  <div>
                    <strong>{{ drop.localizedName }}</strong>
                    <span>{{ renderChance(drop) }}</span>
                  </div>
                </button>
              </div>
            </article>
          </div>

          <article class="detail-card mutation-card">
            <div class="panel-title">
              <span class="eyebrow">Mutations</span>
              <strong>{{ relatedMutations.length }}</strong>
            </div>
            <div class="mutation-list">
              <div
                v-for="mutation in relatedMutations"
                :key="`${mutation.allele0}-${mutation.allele1}-${mutation.result}`"
                class="mutation-row"
              >
                <span class="mutation-parent">{{ mutation.allele0 }}</span>
                <span class="mutation-plus">+</span>
                <span class="mutation-parent">{{ mutation.allele1 }}</span>
                <span class="mutation-arrow">→</span>
                <span class="mutation-result">{{ mutation.result }}</span>
                <span class="mutation-chance">{{ chanceText(mutation.chance) }}</span>
              </div>
            </div>
          </article>
        </section>
      </template>
    </main>
  </div>
</template>

<style scoped>
.bee-tree-shell {
  min-height: 100vh;
  padding: 28px;
  background:
    radial-gradient(circle at 16% 16%, rgba(255, 224, 140, 0.08), transparent 22%),
    radial-gradient(circle at 84% 12%, rgba(201, 161, 255, 0.08), transparent 24%),
    linear-gradient(180deg, #0c0d11, #05060a 62%, #040508);
  color: #edf3ea;
}

.bee-tree-header,
.bee-tree-main,
.state-card {
  width: min(1720px, 100%);
  margin: 0 auto;
}

.bee-tree-header {
  display: grid;
  grid-template-columns: auto 1fr 220px;
  gap: 18px;
  align-items: center;
  margin-bottom: 22px;
}

.title-block h1 {
  margin: 4px 0 6px;
  font-size: 32px;
}

.title-block p {
  margin: 0;
  color: rgba(223, 232, 222, 0.72);
}

.eyebrow {
  color: #f5d28f;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.2em;
  text-transform: uppercase;
}

.species-search {
  height: 42px;
  padding: 0 14px;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(8, 12, 16, 0.92);
  color: #edf3ea;
}

.bee-tree-main {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 18px;
}

.species-panel,
.detail-card,
.state-card,
.tree-board {
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 22px;
  box-shadow: 0 22px 60px rgba(0, 0, 0, 0.32);
}

.state-card,
.species-panel,
.detail-card {
  background:
    linear-gradient(180deg, rgba(13, 18, 20, 0.94), rgba(7, 10, 12, 0.98)),
    radial-gradient(circle at top, rgba(255, 255, 255, 0.03), transparent 40%);
}

.tree-board {
  padding: 18px;
  background: #c9c9c9;
  color: #131313;
  overflow: auto;
}

.tree-board-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
  color: #2a2a2a;
}

.tree-board-head small {
  margin-left: auto;
  color: #9d1f1f;
  font-weight: 700;
}

.tree-canvas {
  position: relative;
  margin: 0 auto;
}

.tree-edge {
  position: absolute;
  height: 2px;
  transform-origin: left center;
  background: linear-gradient(90deg, rgba(94, 94, 94, 0.95), rgba(150, 48, 48, 0.88));
}

.tree-node {
  position: absolute;
  transform: translate(-50%, 0);
  width: 112px;
  display: grid;
  justify-items: center;
  gap: 4px;
  background: transparent;
  border: 0;
  color: #171717;
  cursor: pointer;
}

.tree-node img {
  width: 34px;
  height: 34px;
  image-rendering: pixelated;
}

.tree-node strong {
  font-size: 12px;
  font-weight: 700;
}

.tree-node .chance {
  color: #b11616;
  font-size: 12px;
  font-weight: 800;
}

.tree-node.is-root strong {
  color: #8e1f8e;
}

.species-panel {
  padding: 16px;
}

.panel-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 14px;
}

.species-list {
  display: grid;
  gap: 8px;
  max-height: 78vh;
  overflow: auto;
}

.species-row,
.drop-chip {
  display: grid;
  grid-template-columns: 44px 1fr;
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(10, 14, 18, 0.92);
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.species-row.is-active {
  border-color: rgba(250, 204, 21, 0.26);
  background: rgba(36, 31, 15, 0.82);
}

.species-row img,
.drop-chip img {
  width: 38px;
  height: 38px;
  image-rendering: pixelated;
}

.species-row span,
.drop-chip span,
.mutation-chance {
  color: rgba(214, 223, 213, 0.62);
  font-size: 11px;
}

.detail-panel {
  display: grid;
  gap: 18px;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

.detail-card {
  padding: 18px;
}

.drop-grid,
.mutation-list {
  display: grid;
  gap: 10px;
}

.mutation-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 24px minmax(0, 1fr) 28px minmax(0, 1fr) 72px;
  gap: 10px;
  align-items: center;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(10, 14, 18, 0.92);
}

.mutation-plus,
.mutation-arrow {
  text-align: center;
  color: #f8d084;
  font-weight: 800;
}

.mutation-result {
  color: #d9ffe2;
  font-weight: 700;
}

@media (max-width: 1080px) {
  .bee-tree-header,
  .bee-tree-main,
  .detail-grid,
  .mutation-row {
    grid-template-columns: 1fr;
  }
}
</style>
