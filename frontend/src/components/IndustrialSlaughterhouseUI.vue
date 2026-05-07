<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { FluidStack, Recipe, RecipeUiPayload } from '../services/api';
import type { UITypeConfig } from '../services/uiTypeMapping';
import { parseAdditionalData } from '../composables/useRecipeSlots';
import { useSound } from '../services/sound.service';
import RecipeItemTooltip from './RecipeItemTooltip.vue';
import AnimatedItemIcon from './AnimatedItemIcon.vue';
import EntityModelViewer from './EntityModelViewer.vue';

interface Props {
  recipe: Recipe;
  uiConfig?: UITypeConfig;
  uiPayload?: RecipeUiPayload | null;
}

interface Emits {
  (e: 'item-click', itemId: string): void;
}

interface DisplayItem {
  itemId: string;
  localizedName: string;
  modId: string;
  internalName: string;
  count: number;
  probability: number | null;
  renderAssetRef?: string | null;
  imageFileName?: string | null;
  tooltip?: string | null;
}

interface DisplayFluid {
  fluidId: string;
  localizedName: string;
  amount: number;
  temperature: number | null;
  renderAssetRef?: string | null;
}

interface EntityPreviewDescriptor {
  mobName: string;
  localizedName: string | null;
  modId: string | null;
  imageUrl: string;
  frameCount: number | null;
  frameDurationMs: number | null;
  width: number | null;
  height: number | null;
  renderMode: string | null;
}

interface EntityModelDescriptor {
  mobName: string;
  localizedName: string | null;
  modId: string | null;
  modelUrl: string;
  componentCount: number | null;
  renderMode: string | null;
}

interface DropSection {
  key: string;
  label: string;
  accent: 'normal' | 'rare' | 'extra' | 'infernal' | 'misc' | 'fluid';
  items: DisplayItem[];
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();
const { playClick } = useSound();
const entityModelError = ref('');
const entityPreviewError = ref('');
let previewValidationToken: symbol | null = null;

function normalizeCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
}

function normalizeProbability(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.min(1, Math.max(0, value));
}

function pickNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function extractDisplayItem(node: unknown): DisplayItem | null {
  if (!node || typeof node !== 'object') return null;

  const record = node as {
    itemId?: unknown;
    localizedName?: unknown;
    modId?: unknown;
    internalName?: unknown;
    count?: unknown;
    stackSize?: unknown;
    probability?: unknown;
    renderAssetRef?: unknown;
    imageFileName?: unknown;
    tooltip?: unknown;
    item?: {
      itemId?: unknown;
      localizedName?: unknown;
      modId?: unknown;
      internalName?: unknown;
      renderAssetRef?: unknown;
      imageFileName?: unknown;
      tooltip?: unknown;
    };
    items?: unknown[];
  };

  const nested = record.item && typeof record.item === 'object' ? record.item : null;
  const itemId =
    typeof record.itemId === 'string' && record.itemId.trim()
      ? record.itemId.trim()
      : (typeof nested?.itemId === 'string' && nested.itemId.trim() ? nested.itemId.trim() : '');
  if (!itemId) return null;

  return {
    itemId,
    localizedName:
      (typeof record.localizedName === 'string' && record.localizedName.trim())
      || (typeof nested?.localizedName === 'string' && nested.localizedName.trim())
      || itemId,
    modId:
      (typeof record.modId === 'string' && record.modId.trim())
      || (typeof nested?.modId === 'string' && nested.modId.trim())
      || '',
    internalName:
      (typeof record.internalName === 'string' && record.internalName.trim())
      || (typeof nested?.internalName === 'string' && nested.internalName.trim())
      || itemId,
    count: normalizeCount(record.count ?? record.stackSize),
    probability: normalizeProbability(record.probability),
    renderAssetRef:
      typeof record.renderAssetRef === 'string'
        ? record.renderAssetRef
        : (typeof nested?.renderAssetRef === 'string' ? nested.renderAssetRef : null),
    imageFileName:
      typeof record.imageFileName === 'string'
        ? record.imageFileName
        : (typeof nested?.imageFileName === 'string' ? nested.imageFileName : null),
    tooltip:
      typeof record.tooltip === 'string'
        ? record.tooltip
        : (typeof nested?.tooltip === 'string' ? nested.tooltip : null),
  };
}

function collectDisplayItems(node: unknown, sink: DisplayItem[]): void {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const child of node) collectDisplayItems(child, sink);
    return;
  }

  const direct = extractDisplayItem(node);
  if (direct) {
    sink.push(direct);
    return;
  }

  if (typeof node !== 'object') return;
  const record = node as { items?: unknown[]; item?: unknown };
  if (Array.isArray(record.items)) {
    for (const child of record.items) collectDisplayItems(child, sink);
  }
  if (record.item) {
    collectDisplayItems(record.item, sink);
  }
}

function uniqueItems(items: DisplayItem[]): DisplayItem[] {
  const seen = new Set<string>();
  const result: DisplayItem[] = [];
  for (const item of items) {
    const key = `${item.itemId}:${item.count}:${item.probability ?? 'na'}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function parseFluid(entry: FluidStack | null | undefined): DisplayFluid | null {
  if (!entry?.fluid?.fluidId) return null;
  return {
    fluidId: entry.fluid.fluidId,
    localizedName: entry.fluid.localizedName || entry.fluid.internalName || entry.fluid.fluidId,
    amount: Math.max(0, Number(entry.amount ?? 0)),
    temperature:
      typeof entry.fluid.temperature === 'number' && Number.isFinite(entry.fluid.temperature)
        ? entry.fluid.temperature
        : null,
    renderAssetRef: entry.fluid.renderAssetRef ?? null,
  };
}

function formatProbability(probability: number | null): string {
  if (probability === null) return '概率未记录';
  if (probability <= 0) return '0%';
  if (probability >= 1) return '100%';
  const percent = probability * 100;
  if (percent < 0.01) return '<0.01%';
  if (percent < 1) return `${percent.toFixed(2)}%`;
  if (percent < 10) return `${percent.toFixed(1)}%`;
  return `${Math.round(percent * 10) / 10}%`;
}

function formatNumber(value: number | null, suffix = ''): string {
  if (value === null) return '--';
  return `${value.toLocaleString()}${suffix}`;
}

function formatDurationSeconds(value: number | null): string {
  if (value === null) return '--';
  if (value < 1) return `${value.toFixed(2)} 秒`;
  if (value < 10) return `${value.toFixed(1)} 秒`;
  return `${Math.round(value * 10) / 10} 秒`;
}

function normalizeInfoLine(value: string): string {
  const trimmed = `${value ?? ''}`.trim();
  if (!trimmed) return '';
  return trimmed
    .replace(/\bsecs?\b/gi, '秒')
    .replace(/\bseconds?\b/gi, '秒')
    .replace(/\s{2,}/g, ' ');
}

const recipe = computed(() => props.recipe);
const recipeAdditionalData = computed<Record<string, unknown>>(() => parseAdditionalData(recipe.value) ?? {});

const uiPayload = computed<Record<string, unknown> | null>(() => {
  const candidate = props.uiPayload ?? recipeAdditionalData.value.uiPayload;
  return candidate && typeof candidate === 'object' ? candidate as Record<string, unknown> : null;
});

const mergedMeta = computed<Record<string, unknown>>(() => {
  const metadata =
    recipe.value.metadata && typeof recipe.value.metadata === 'object'
      ? recipe.value.metadata as Record<string, unknown>
      : {};
  return { ...recipeAdditionalData.value, ...metadata };
});

const outputItems = computed<DisplayItem[]>(() => {
  const outputs = Array.isArray(recipe.value.outputs) ? recipe.value.outputs : [];
  return outputs
    .map((entry) => extractDisplayItem(entry))
    .filter((entry): entry is DisplayItem => entry !== null);
});

const fluidOutputs = computed<DisplayFluid[]>(() => {
  const direct = (Array.isArray(recipe.value.fluidOutputs) ? recipe.value.fluidOutputs : [])
    .map((entry) => parseFluid(entry))
    .filter((entry): entry is DisplayFluid => entry !== null);
  if (direct.length > 0) return direct;

  const fallbackXp = pickNumber(mergedMeta.value.xpJuiceMb);
  if (fallbackXp === null || fallbackXp <= 0) return [];

  return [{
    fluidId: 'f~OpenBlocks~xpjuice',
    localizedName: '液态经验',
    amount: fallbackXp,
    temperature: null,
    renderAssetRef: 'nesqlpp:fluid/f~OpenBlocks~xpjuice',
  }];
});

const mobLocalizedName = computed(() => {
  const value = `${mergedMeta.value.localizedName ?? ''}`.trim();
  return value || '未知实体';
});
const mobName = computed(() => `${mergedMeta.value.mobName ?? ''}`.trim());
const mobMod = computed(() => `${mergedMeta.value.mobMod ?? ''}`.trim() || `${mergedMeta.value.modName ?? ''}`.trim() || '--');
const spawnInfoCount = computed(() => pickNumber(mergedMeta.value.spawnInfoCount) ?? 0);
const euPerTick = computed(() => pickNumber(mergedMeta.value.eecEuPerTick, mergedMeta.value.euPerTick, mergedMeta.value.EUt, mergedMeta.value.eut));
const durationSeconds = computed(() => {
  const seconds = pickNumber(mergedMeta.value.eecDurationSeconds);
  if (seconds !== null) return seconds;
  const ticks = pickNumber(mergedMeta.value.eecDurationTicks, mergedMeta.value.duration);
  return ticks === null ? null : ticks / 20;
});
const infernalType = computed(() => pickNumber(mergedMeta.value.infernalType) ?? -1);
const bossLabel = computed(() => `${mergedMeta.value.bossLabel ?? ''}`.trim());
const isUsableInVial = computed(() => Boolean(mergedMeta.value.isUsableInVial));
const isPeacefulAllowed = computed(() => Boolean(mergedMeta.value.isPeacefulAllowed));
const xpJuiceMb = computed(() => pickNumber(mergedMeta.value.xpJuiceMb));
const maxHealth = computed(() => pickNumber(mergedMeta.value.maxHealth));
const normalOutputsCount = computed(() => Math.max(0, Math.floor(pickNumber(mergedMeta.value.normalOutputsCount) ?? 0)));
const rareOutputsCount = computed(() => Math.max(0, Math.floor(pickNumber(mergedMeta.value.rareOutputsCount) ?? 0)));
const additionalOutputsCount = computed(() => Math.max(0, Math.floor(pickNumber(mergedMeta.value.additionalOutputsCount) ?? 0)));
const infernalOutputsCount = computed(() => Math.max(0, Math.floor(pickNumber(mergedMeta.value.infernalOutputsCount) ?? 0)));

const additionalInformation = computed<string[]>(() => {
  const raw = mergedMeta.value.additionalInformation;
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => normalizeInfoLine(`${entry ?? ''}`)).filter(Boolean);
});

const entityPreview = computed<EntityPreviewDescriptor | null>(() => {
  const candidate = uiPayload.value?.entityPreview;
  if (!candidate || typeof candidate !== 'object') return null;

  const record = candidate as Record<string, unknown>;
  const imageUrl = `${record.imageUrl ?? ''}`.trim();
  if (!imageUrl) return null;

  const parseNumber = (value: unknown): number | null => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  };

  return {
    mobName: `${record.mobName ?? mobName.value}`.trim() || mobName.value,
    localizedName: `${record.localizedName ?? mobLocalizedName.value}`.trim() || mobLocalizedName.value,
    modId: `${record.modId ?? mobMod.value}`.trim() || mobMod.value,
    imageUrl,
    frameCount: parseNumber(record.frameCount),
    frameDurationMs: parseNumber(record.frameDurationMs),
    width: parseNumber(record.width),
    height: parseNumber(record.height),
    renderMode: `${record.renderMode ?? ''}`.trim() || null,
  };
});

const entityModel = computed<EntityModelDescriptor | null>(() => {
  const candidate = uiPayload.value?.entityModel;
  if (!candidate || typeof candidate !== 'object') return null;

  const record = candidate as Record<string, unknown>;
  const modelUrl = `${record.modelUrl ?? ''}`.trim();
  if (!modelUrl) return null;

  const componentCount = Number(record.componentCount);
  return {
    mobName: `${record.mobName ?? mobName.value}`.trim() || mobName.value,
    localizedName: `${record.localizedName ?? mobLocalizedName.value}`.trim() || mobLocalizedName.value,
    modId: `${record.modId ?? mobMod.value}`.trim() || mobMod.value,
    modelUrl,
    componentCount: Number.isFinite(componentCount) ? componentCount : null,
    renderMode: `${record.renderMode ?? ''}`.trim() || null,
  };
});

const shouldRenderEntityModel = computed(() => Boolean(entityModel.value) && !entityModelError.value);
const shouldRenderEntityPreview = computed(() => Boolean(entityPreview.value) && !entityPreviewError.value && !shouldRenderEntityModel.value);

const fluidAsDropItems = computed<DisplayItem[]>(() =>
  fluidOutputs.value.map((fluid) => ({
    itemId: fluid.fluidId,
    localizedName: fluid.localizedName,
    modId: 'fluid',
    internalName: fluid.fluidId,
    count: 1,
    probability: null,
    renderAssetRef: fluid.renderAssetRef ?? null,
    imageFileName: null,
    tooltip: `${formatNumber(fluid.amount, ' mB')}${fluid.temperature !== null ? ` · ${fluid.temperature}K` : ''}`,
  })),
);

const dropSections = computed<DropSection[]>(() => {
  const outputs = outputItems.value;
  const sections: DropSection[] = [];
  let cursor = 0;

  const consume = (key: string, label: string, accent: DropSection['accent'], count: number) => {
    if (count <= 0) return;
    const slice = outputs.slice(cursor, cursor + count);
    cursor += count;
    if (slice.length > 0) sections.push({ key, label, accent, items: slice });
  };

  consume('normal', '普通掉落', 'normal', normalOutputsCount.value);
  consume('rare', '稀有掉落', 'rare', rareOutputsCount.value);
  consume('extra', '额外掉落', 'extra', additionalOutputsCount.value);
  consume('infernal', '精英掉落', 'infernal', infernalOutputsCount.value);

  if (cursor < outputs.length) {
    sections.push({
      key: 'misc',
      label: sections.length > 0 ? '其他掉落' : '掉落列表',
      accent: 'misc',
      items: outputs.slice(cursor),
    });
  }

  if (sections.length === 0 && outputs.length > 0) {
    sections.push({ key: 'all', label: '全部掉落', accent: 'normal', items: outputs });
  }

  if (fluidAsDropItems.value.length > 0) {
    sections.push({
      key: 'fluid',
      label: '副产流体',
      accent: 'fluid',
      items: fluidAsDropItems.value,
    });
  }

  return sections;
});

const profileRows = computed(() => ([
  { label: '生命值', value: formatNumber(maxHealth.value) },
  { label: '功耗', value: formatNumber(euPerTick.value, ' EU/t') },
  { label: '耗时', value: formatDurationSeconds(durationSeconds.value) },
  { label: '液态经验', value: formatNumber(xpJuiceMb.value, ' mB') },
  { label: '生成信息', value: spawnInfoCount.value > 0 ? `${spawnInfoCount.value} 条` : '未记录' },
  { label: '来源模组', value: mobMod.value },
]));

const flagRows = computed(() => {
  const flags: Array<{ label: string; tone: 'good' | 'warn' | 'danger' | 'neutral' }> = [];
  flags.push({
    label: isUsableInVial.value ? '可装入灵魂瓶' : '不可装入灵魂瓶',
    tone: isUsableInVial.value ? 'good' : 'warn',
  });
  flags.push({
    label: isPeacefulAllowed.value ? '和平模式可生成' : '和平模式禁用',
    tone: isPeacefulAllowed.value ? 'good' : 'neutral',
  });
  if (bossLabel.value) flags.push({ label: bossLabel.value, tone: 'danger' });
  if (infernalType.value === 1) flags.push({ label: '精英词缀', tone: 'danger' });
  else if (infernalType.value === 2) flags.push({ label: '终极词缀', tone: 'danger' });
  else if (infernalType.value === 0) flags.push({ label: '无额外词缀', tone: 'neutral' });
  return flags;
});

const carrierLabel = computed(() => {
  if (inputCandidates.value.length >= 3) return '容器 / 捕获载体';
  if (inputCandidates.value.length > 0) return '输入载体';
  return '未记录输入载体';
});

watch(() => entityModel.value?.modelUrl ?? '', () => {
  entityModelError.value = '';
}, { immediate: true });

watch(() => entityPreview.value?.imageUrl ?? '', () => {
  previewValidationToken = null;
  entityPreviewError.value = '';
}, { immediate: true });

function handleEntityClick(itemId: string): void {
  playClick();
  emit('item-click', itemId);
}

function handleEntityModelReady(): void {
  entityModelError.value = '';
}

function handleEntityModelError(message: string): void {
  entityModelError.value = `${message ?? ''}`.trim() || '实体模型加载失败';
}

async function validateEntityPreview(url: string, token: symbol, event?: Event): Promise<void> {
  const target = event?.target instanceof HTMLImageElement ? event.target : null;
  const width = target?.naturalWidth ?? 0;
  const height = target?.naturalHeight ?? 0;

  if (width > 0 && width <= 2 && height > 0 && height <= 2) {
    if (token === previewValidationToken) {
      entityPreviewError.value = '实体预览不可用';
    }
    return;
  }

  try {
    const response = await fetch(url, { cache: 'force-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    if (token !== previewValidationToken) return;
    if (blob.size > 0 && blob.size <= 256) {
      entityPreviewError.value = '实体预览不可用';
      return;
    }
    entityPreviewError.value = '';
  } catch (error) {
    if (token !== previewValidationToken) return;
    if (width <= 0 || height <= 0) {
      entityPreviewError.value = error instanceof Error ? error.message : '实体预览不可用';
    }
  }
}

function handleEntityPreviewLoad(event: Event): void {
  const preview = entityPreview.value;
  if (!preview) {
    entityPreviewError.value = '';
    return;
  }
  const token = Symbol(preview.imageUrl);
  previewValidationToken = token;
  void validateEntityPreview(preview.imageUrl, token, event);
}

function handleEntityPreviewError(): void {
  previewValidationToken = null;
  entityPreviewError.value = '实体预览不可用';
}
</script>

<template>
  <div class="slaughterhouse-ui">
    <div class="layout-shell">
      <aside class="profile-panel">
        <div class="panel-header panel-header--entity">
          <strong>{{ mobLocalizedName }}</strong>
          <small v-if="mobName">{{ mobName }}</small>
        </div>

        <dl class="profile-grid">
          <template v-for="row in profileRows" :key="row.label">
            <dt>{{ row.label }}</dt>
            <dd>{{ row.value }}</dd>
          </template>
        </dl>

        <div v-if="flagRows.length > 0" class="flag-list">
          <span
            v-for="flag in flagRows"
            :key="flag.label"
            class="flag-chip"
            :class="`flag-chip--${flag.tone}`"
          >
            {{ flag.label }}
          </span>
        </div>

        <div v-if="additionalInformation.length > 0" class="notes-card">
          <div class="notes-card__title">额外说明</div>
          <ul>
            <li v-for="note in additionalInformation" :key="note">{{ note }}</li>
          </ul>
        </div>
      </aside>

      <section class="containment-panel">
        <div class="containment-bg" aria-hidden="true">
          <span class="beam beam--v"></span>
          <span class="beam beam--h"></span>
          <span class="ring ring--outer"></span>
          <span class="ring ring--inner"></span>
          <span class="pulse pulse--a"></span>
          <span class="pulse pulse--b"></span>
          <span class="scan scan--top"></span>
          <span class="scan scan--bottom"></span>
        </div>

        <div class="hero-stage">
          <div v-if="shouldRenderEntityModel && entityModel" class="entity-model-card">
            <EntityModelViewer
              :model-url="entityModel.modelUrl"
              :height="392"
              @ready="handleEntityModelReady"
              @error="handleEntityModelError"
            />
            <div class="entity-preview-card__meta entity-preview-card__meta--model">
              <strong>{{ mobLocalizedName }}</strong>
              <small>
                {{ entityModel.modId || mobMod }}
                <template v-if="(entityModel.componentCount ?? 0) > 0">
                  · {{ entityModel.componentCount }} 组件
                </template>
              </small>
            </div>
          </div>

          <div
            v-else-if="shouldRenderEntityPreview && entityPreview"
            class="entity-preview-card"
            :class="{ 'entity-preview-card--animated': (entityPreview.frameCount ?? 1) > 1 }"
          >
            <div class="entity-preview-card__viewport">
              <span class="entity-preview-card__aura entity-preview-card__aura--outer"></span>
              <span class="entity-preview-card__aura entity-preview-card__aura--inner"></span>
              <span class="entity-preview-card__grid"></span>
              <img
                class="entity-preview-card__image"
                :src="entityPreview.imageUrl"
                :alt="entityPreview.localizedName || mobLocalizedName"
                loading="eager"
                decoding="async"
                draggable="false"
                @load="handleEntityPreviewLoad"
                @error="handleEntityPreviewError"
              >
            </div>
            <div class="entity-preview-card__meta">
              <strong>{{ mobLocalizedName }}</strong>
              <small>
                {{ entityPreview.modId || mobMod }}
                <template v-if="(entityPreview.frameCount ?? 0) > 1">
                  · {{ entityPreview.frameCount }} 帧
                </template>
              </small>
            </div>
          </div>

          <div v-else-if="entityModelError" class="entity-preview-card entity-preview-card--error">
            <div class="entity-preview-card__error-copy">
              <strong>模型不可用</strong>
              <small>{{ entityModelError }}</small>
            </div>
          </div>

          <div v-else-if="entityPreviewError" class="entity-preview-card entity-preview-card--fallback">
            <div class="entity-preview-card__fallback-icon">?</div>
            <div class="entity-preview-card__error-copy">
              <strong>{{ mobLocalizedName }}</strong>
              <small>{{ entityPreviewError }}</small>
            </div>
          </div>
        </div>

      </section>

      <aside class="drops-panel">
        <div class="panel-header panel-header--drops">
          <strong>掉落列表</strong>
          <small>{{ outputItems.length }} 项物品产出</small>
        </div>

        <div class="drops-scroll">
          <section
            v-for="section in dropSections"
            :key="section.key"
            class="drop-section"
            :class="`drop-section--${section.accent}`"
          >
            <header class="drop-section__header">
              <h4>{{ section.label }}</h4>
              <span>{{ section.items.length }} 项</span>
            </header>

            <div class="drop-icon-grid">
              <RecipeItemTooltip
                v-for="(drop, dropIndex) in section.items"
                :key="`${section.key}-${drop.itemId}-${dropIndex}-${drop.count}-${drop.probability ?? 'na'}`"
                :item-id="drop.itemId"
                :count="drop.count"
                :extra-lines="[drop.probability !== null ? `掉落概率: ${formatProbability(drop.probability)}` : '', drop.tooltip || '']"
                @click="handleEntityClick(drop.itemId)"
              >
                <button
                  type="button"
                  class="drop-icon"
                  :data-probability="formatProbability(drop.probability)"
                >
                  <div class="drop-card__icon">
                    <AnimatedItemIcon
                      :item-id="drop.itemId"
                      :render-asset-ref="drop.renderAssetRef || null"
                      :image-file-name="drop.imageFileName || null"
                      :size="32"
                    />
                    <span v-if="drop.count > 1" class="drop-card__count">{{ drop.count }}</span>
                  </div>
                </button>
              </RecipeItemTooltip>
            </div>
          </section>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.slaughterhouse-ui {
  --panel-bg: linear-gradient(180deg, rgba(15, 21, 29, 0.98), rgba(8, 12, 18, 1));
  --panel-edge: rgba(168, 191, 212, 0.14);
  --soft-edge: rgba(142, 167, 196, 0.1);
  --text-main: #eff7ff;
  --text-soft: rgba(224, 234, 246, 0.92);
  --text-dim: rgba(166, 182, 201, 0.68);
  width: 100%;
  height: 100%;
  max-width: none;
  max-height: none;
  min-height: 560px;
  padding: 14px;
  border-radius: 24px;
  border: 1px solid rgba(164, 190, 214, 0.14);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.02), transparent 18%),
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.02) 0 1px, transparent 1px 48px),
    radial-gradient(circle at 8% 0%, rgba(123, 214, 255, 0.06), transparent 26%),
    radial-gradient(circle at 92% 100%, rgba(255, 95, 117, 0.06), transparent 28%),
    linear-gradient(180deg, rgba(11, 16, 23, 0.995), rgba(5, 8, 13, 1));
  box-shadow:
    0 30px 72px rgba(0, 0, 0, 0.46),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
  overflow: hidden;
}

.layout-shell {
  height: 100%;
  display: grid;
  grid-template-columns: 256px minmax(0, 1fr) 332px;
  gap: 12px;
  overflow: hidden;
}

.profile-panel,
.containment-panel,
.drops-panel {
  border-radius: 20px;
  border: 1px solid var(--panel-edge);
  background: var(--panel-bg);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
  min-height: 0;
}

.profile-panel,
.drops-panel {
  padding: 10px;
}

.profile-panel,
.drops-panel {
  display: flex;
  flex-direction: column;
}

.panel-header {
  display: grid;
  gap: 4px;
}

.panel-header--entity {
  gap: 2px;
  padding-bottom: 4px;
}

.panel-header strong {
  color: var(--text-main);
  font-size: 19px;
  font-weight: 800;
}

.panel-header small {
  color: var(--text-dim);
  font-size: 11px;
}

.profile-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px 9px;
  margin: 10px 0 0;
}

.profile-grid dt,
.profile-grid dd {
  margin: 0;
}

.profile-grid dt {
  color: var(--text-dim);
  font-size: 11px;
  font-weight: 700;
}

.profile-grid dd {
  padding: 7px 9px 8px;
  border-radius: 12px;
  border: 1px solid var(--soft-edge);
  background: linear-gradient(180deg, rgba(24, 30, 39, 0.96), rgba(13, 18, 24, 0.98));
  color: var(--text-soft);
  font-size: 12px;
  font-weight: 700;
}

.flag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.flag-chip {
  padding: 8px 10px;
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.04em;
}

.flag-chip--good {
  color: #dbfff2;
  border-color: rgba(94, 237, 177, 0.18);
  background: rgba(41, 109, 80, 0.28);
}

.flag-chip--warn {
  color: #fff6d8;
  border-color: rgba(245, 201, 124, 0.18);
  background: rgba(104, 79, 27, 0.24);
}

.flag-chip--danger {
  color: #ffe4e8;
  border-color: rgba(255, 95, 117, 0.22);
  background: rgba(123, 32, 47, 0.28);
}

.flag-chip--neutral {
  color: #dce7f5;
  border-color: rgba(171, 191, 214, 0.15);
  background: rgba(44, 57, 74, 0.24);
}

.notes-card {
  margin-top: 10px;
  padding: 10px 11px;
  border-radius: 16px;
  border: 1px solid rgba(175, 194, 217, 0.12);
  background: linear-gradient(180deg, rgba(22, 27, 35, 0.96), rgba(12, 16, 22, 0.98));
}

.notes-card__title {
  color: var(--text-main);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.notes-card ul {
  margin: 10px 0 0;
  padding-left: 18px;
  color: var(--text-soft);
  font-size: 12px;
  line-height: 1.55;
}

.containment-panel {
  position: relative;
  padding: 12px 14px 14px;
  overflow: hidden;
  display: grid;
  grid-template-rows: minmax(0, 1fr);
  gap: 0;
  background:
    radial-gradient(circle at 50% 18%, rgba(123, 214, 255, 0.05), transparent 30%),
    linear-gradient(180deg, rgba(15, 21, 29, 0.98), rgba(8, 12, 18, 1));
}

.containment-bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

.beam,
.ring,
.pulse,
.scan {
  position: absolute;
}

.beam--v {
  top: 58px;
  bottom: 78px;
  left: 50%;
  width: 1px;
  background: linear-gradient(180deg, transparent, rgba(123, 214, 255, 0.16), transparent);
  transform: translateX(-50%);
}

.beam--h {
  left: 42px;
  right: 42px;
  top: 50%;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255, 95, 117, 0.14), transparent);
}

.ring {
  left: 50%;
  top: 50%;
  border-radius: 50%;
  transform: translate(-50%, -50%);
}

.ring--outer {
  width: 290px;
  height: 290px;
  border: 1px solid rgba(123, 214, 255, 0.14);
  box-shadow: 0 0 40px rgba(123, 214, 255, 0.05);
}

.ring--inner {
  width: 190px;
  height: 190px;
  border: 1px solid rgba(255, 95, 117, 0.14);
}

.pulse {
  left: 50%;
  top: 50%;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  animation: slaughter-pulse 5.8s ease-in-out infinite;
}

.pulse--a {
  width: 144px;
  height: 144px;
  background: radial-gradient(circle, rgba(123, 214, 255, 0.07), transparent 72%);
}

.pulse--b {
  width: 210px;
  height: 210px;
  background: radial-gradient(circle, rgba(255, 95, 117, 0.06), transparent 76%);
  animation-delay: -2.3s;
}

.scan {
  left: 12%;
  right: 12%;
  height: 64px;
  opacity: 0.24;
  filter: blur(12px);
}

.scan--top {
  top: 18%;
  background: linear-gradient(180deg, rgba(123, 214, 255, 0.18), transparent);
}

.scan--bottom {
  bottom: 16%;
  background: linear-gradient(180deg, transparent, rgba(255, 95, 117, 0.18));
}

.hero-stage {
  position: relative;
  z-index: 2;
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  min-height: 0;
  padding: 0 0 6px;
  overflow: hidden;
}

.entity-model-card {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  gap: 8px;
  overflow: hidden;
}

.entity-preview-card {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  gap: 10px;
  padding: 0;
  border: none;
  background: transparent;
  box-shadow: none;
}

.entity-preview-card--animated {
  animation: entity-preview-breathe 4.8s ease-in-out infinite;
}

.entity-preview-card--error {
  min-height: 0;
  place-items: center;
}

.entity-preview-card--fallback {
  min-height: 0;
  align-content: center;
  justify-items: center;
  gap: 14px;
  border-radius: 30px;
  border: 1px solid rgba(171, 191, 214, 0.16);
  background:
    radial-gradient(circle at 50% 18%, rgba(123, 214, 255, 0.08), transparent 36%),
    linear-gradient(180deg, rgba(31, 41, 52, 0.94), rgba(13, 19, 27, 0.98));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    0 0 0 1px rgba(123, 214, 255, 0.08),
    0 24px 48px rgba(0, 0, 0, 0.28);
}

.entity-preview-card__fallback-icon {
  width: 72px;
  height: 72px;
  display: grid;
  place-items: center;
  border-radius: 22px;
  color: rgba(238, 246, 255, 0.88);
  font-size: 30px;
  border: 1px solid rgba(178, 201, 225, 0.22);
  background:
    radial-gradient(circle at 50% 38%, rgba(123, 214, 255, 0.24), transparent 58%),
    linear-gradient(180deg, rgba(28, 36, 47, 0.96), rgba(14, 18, 25, 0.98));
}

.entity-preview-card__error-copy {
  display: grid;
  gap: 8px;
  text-align: center;
  padding: 0 10px;
}

.entity-preview-card__error-copy strong {
  color: #fff0f2;
  font-size: 14px;
}

.entity-preview-card__error-copy small {
  color: rgba(255, 206, 212, 0.8);
  font-size: 11px;
  line-height: 1.45;
}

.entity-preview-card__viewport {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  display: grid;
  place-items: center;
  border-radius: 30px;
  overflow: hidden;
  border: 1px solid rgba(190, 212, 236, 0.16);
  background:
    radial-gradient(circle at 50% 50%, rgba(233, 243, 255, 0.98) 0%, rgba(150, 211, 255, 0.74) 18%, rgba(90, 131, 178, 0.28) 40%, rgba(19, 27, 37, 0.06) 62%, transparent 76%),
    linear-gradient(180deg, rgba(24, 32, 42, 0.96), rgba(11, 17, 24, 0.98));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    0 0 0 1px rgba(123, 214, 255, 0.08),
    0 28px 54px rgba(0, 0, 0, 0.28);
}

.entity-preview-card__aura,
.entity-preview-card__grid {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.entity-preview-card__aura--outer {
  inset: 18px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(245, 250, 255, 0.98) 0%, rgba(188, 228, 255, 0.84) 22%, rgba(111, 175, 235, 0.28) 54%, transparent 76%);
  filter: blur(10px);
  opacity: 0.95;
}

.entity-preview-card__aura--inner {
  inset: 38px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 248, 225, 0.92) 0%, rgba(255, 213, 146, 0.38) 36%, transparent 72%);
  filter: blur(6px);
  opacity: 0.88;
}

.entity-preview-card__grid {
  inset: 12px;
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px);
  background-size: 14px 14px;
  opacity: 0.4;
  mix-blend-mode: screen;
}

.entity-preview-card__image {
  position: relative;
  z-index: 1;
  width: min(100%, 72%);
  max-width: 300px;
  height: auto;
  max-height: 78%;
  object-fit: contain;
  image-rendering: pixelated;
  filter:
    drop-shadow(0 0 10px rgba(245, 250, 255, 0.92))
    drop-shadow(0 0 22px rgba(123, 214, 255, 0.42))
    drop-shadow(0 10px 18px rgba(0, 0, 0, 0.34))
    contrast(1.08);
}

.entity-preview-card__meta {
  display: grid;
  gap: 3px;
  text-align: center;
  justify-items: center;
  padding: 0 12px;
  flex-shrink: 0;
}

.entity-preview-card__meta strong {
  color: var(--text-main);
  font-size: 13px;
  line-height: 1.15;
}

.entity-preview-card__meta small {
  color: var(--text-dim);
  font-size: 10px;
  line-height: 1.15;
}

.entity-model-card :deep(.entity-model-viewer) {
  height: 100% !important;
  min-height: 0;
  border-radius: 30px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    0 0 0 1px rgba(123, 214, 255, 0.08),
    0 28px 54px rgba(0, 0, 0, 0.28);
}

.entity-model-card :deep(.entity-model-viewer__canvas) {
  height: 100%;
}

.carrier-strip {
  position: relative;
  z-index: 2;
  padding: 11px 12px;
  border-radius: 16px;
  border: 1px solid rgba(166, 186, 208, 0.12);
  background: linear-gradient(180deg, rgba(19, 24, 31, 0.96), rgba(11, 15, 21, 0.98));
  max-height: 92px;
  overflow: hidden;
}

.carrier-strip__label {
  color: var(--text-soft);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.carrier-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
  overflow: auto;
  max-height: 52px;
  padding-right: 2px;
}

.carrier-slot {
  position: relative;
  width: 52px;
  height: 52px;
  display: grid;
  place-items: center;
  border-radius: 16px;
  border: 1px solid rgba(171, 191, 214, 0.12);
  background: linear-gradient(180deg, rgba(30, 38, 48, 0.96), rgba(15, 20, 27, 0.98));
  cursor: pointer;
}

.carrier-slot:hover {
  transform: translateY(-1px);
  border-color: rgba(196, 213, 231, 0.24);
}

.carrier-slot__count,
.drop-card__count {
  position: absolute;
  right: 6px;
  bottom: 4px;
  color: #f8fcff;
  font-size: 11px;
  font-weight: 800;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
}

.carrier-empty {
  color: var(--text-dim);
  font-size: 12px;
}

.panel-header--drops {
  gap: 2px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(171, 191, 214, 0.08);
}

.drops-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  margin-top: 10px;
  padding-right: 4px;
}

.drop-section + .drop-section {
  margin-top: 10px;
}

.drop-section {
  padding: 10px;
  border-radius: 16px;
  border: 1px solid rgba(168, 189, 211, 0.1);
  background: linear-gradient(180deg, rgba(22, 28, 36, 0.96), rgba(12, 17, 23, 0.98));
}

.drop-section--normal {
  box-shadow: inset 0 0 0 1px rgba(123, 214, 255, 0.03);
}

.drop-section--rare {
  box-shadow: inset 0 0 0 1px rgba(245, 201, 124, 0.05);
}

.drop-section--extra,
.drop-section--fluid {
  box-shadow: inset 0 0 0 1px rgba(132, 228, 175, 0.05);
}

.drop-section--infernal {
  box-shadow: inset 0 0 0 1px rgba(255, 95, 117, 0.06);
}

.drop-section__header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: baseline;
  margin-bottom: 8px;
}

.drop-section__header h4 {
  margin: 0;
  color: var(--text-main);
  font-size: 14px;
}

.drop-section__header span {
  color: var(--text-dim);
  font-size: 11px;
}

.drop-icon-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(46px, 1fr));
  gap: 8px;
}

.drop-icon {
  position: relative;
  width: 46px;
  height: 46px;
  padding: 0;
  border: 1px solid rgba(170, 190, 213, 0.1);
  border-radius: 12px;
  background: linear-gradient(180deg, rgba(30, 37, 46, 0.96), rgba(15, 20, 27, 0.98));
  cursor: pointer;
  transition: transform 160ms ease, border-color 160ms ease, background 160ms ease;
}

.drop-icon:hover {
  transform: translateY(-1px);
  border-color: rgba(196, 213, 231, 0.24);
}


.drop-card__icon {
  position: relative;
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.03);
}

@keyframes slaughter-pulse {
  0%,
  100% {
    opacity: 0.28;
    transform: translate(-50%, -50%) scale(0.94);
  }
  50% {
    opacity: 0.5;
    transform: translate(-50%, -50%) scale(1.04);
  }
}

@keyframes entity-preview-breathe {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-2px);
  }
}

@media (max-width: 1120px) {
  .slaughterhouse-ui {
    height: auto;
    min-height: 760px;
  }

  .layout-shell {
    grid-template-columns: 1fr;
    height: auto;
    overflow-y: auto;
  }
}
</style>
