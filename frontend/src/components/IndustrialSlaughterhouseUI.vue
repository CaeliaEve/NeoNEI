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

  const metadataXp = pickNumber(mergedMeta.value.xpJuiceMb);
  if (metadataXp === null || metadataXp <= 0) return [];

  return [{
    fluidId: 'f~OpenBlocks~xpjuice',
    localizedName: '液态经验',
    amount: metadataXp,
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

          <div v-else-if="entityPreviewError" class="entity-preview-card entity-preview-card--placeholder">
            <div class="entity-preview-card__placeholder-icon">?</div>
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
  --panel-bg: linear-gradient(180deg, rgba(14, 20, 28, 0.96), rgba(7, 11, 17, 0.985));
  --panel-edge: rgba(142, 183, 227, 0.16);
  --soft-edge: rgba(125, 166, 208, 0.1);
  --text-main: #f2f8ff;
  --text-soft: rgba(228, 238, 250, 0.92);
  --text-dim: rgba(153, 172, 196, 0.7);
  --cyan-glow: rgba(107, 211, 255, 0.28);
  --amber-glow: rgba(255, 187, 92, 0.18);
  --mint-glow: rgba(112, 255, 198, 0.16);
  --panel-shadow: 0 18px 34px rgba(0, 0, 0, 0.24);
  width: 100%;
  height: 100%;
  max-width: none;
  max-height: none;
  min-height: 560px;
  padding: 16px;
  border-radius: 26px;
  border: 1px solid rgba(164, 190, 214, 0.16);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.028), transparent 16%),
    radial-gradient(circle at 10% 0%, rgba(90, 174, 255, 0.1), transparent 24%),
    radial-gradient(circle at 100% 100%, rgba(20, 255, 168, 0.06), transparent 22%),
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.018) 0 1px, transparent 1px 56px),
    linear-gradient(180deg, rgba(9, 14, 21, 0.992), rgba(4, 7, 11, 1));
  box-shadow:
    0 34px 78px rgba(0, 0, 0, 0.5),
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    inset 0 0 0 1px rgba(105, 144, 190, 0.05);
  overflow: hidden;
}

.layout-shell {
  height: 100%;
  display: grid;
  grid-template-columns: 256px minmax(0, 1fr) 332px;
  gap: 14px;
  overflow: hidden;
}

.profile-panel,
.containment-panel,
.drops-panel {
  position: relative;
  border-radius: 22px;
  border: 1px solid var(--panel-edge);
  background: var(--panel-bg);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    inset 0 0 0 1px rgba(85, 117, 154, 0.05),
    var(--panel-shadow);
  min-height: 0;
}

.profile-panel::before,
.containment-panel::before,
.drops-panel::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.045), transparent 14%),
    radial-gradient(circle at 50% 0%, rgba(114, 214, 255, 0.06), transparent 28%);
  opacity: 0.8;
}

.profile-panel::after,
.containment-panel::after,
.drops-panel::after {
  content: '';
  position: absolute;
  inset: 1px;
  border-radius: inherit;
  pointer-events: none;
  border: 1px solid rgba(255, 255, 255, 0.02);
  mask: linear-gradient(180deg, rgba(255, 255, 255, 0.65), transparent 28%, transparent 72%, rgba(255, 255, 255, 0.24));
}

.profile-panel,
.drops-panel {
  padding: 12px;
}

.profile-panel,
.drops-panel {
  display: flex;
  flex-direction: column;
}

.panel-header {
  position: relative;
  z-index: 1;
  display: grid;
  gap: 4px;
}

.panel-header--entity {
  gap: 2px;
  padding-bottom: 4px;
}

.panel-header strong {
  color: var(--text-main);
  font-size: 20px;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.panel-header small {
  color: var(--text-dim);
  font-size: 11px;
  letter-spacing: 0.03em;
}

.profile-grid {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 10px;
  margin: 12px 0 0;
}

.profile-grid dt,
.profile-grid dd {
  margin: 0;
}

.profile-grid dt {
  color: var(--text-dim);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.03em;
}

.profile-grid dd {
  padding: 9px 10px 10px;
  border-radius: 14px;
  border: 1px solid var(--soft-edge);
  background:
    linear-gradient(180deg, rgba(26, 33, 43, 0.98), rgba(13, 18, 24, 0.98));
  color: var(--text-soft);
  font-size: 12px;
  font-weight: 700;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    inset 0 -10px 18px rgba(0, 0, 0, 0.12),
    0 10px 18px rgba(0, 0, 0, 0.08);
}

.flag-list {
  position: relative;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 12px;
}

.flag-chip {
  padding: 8px 11px;
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.03em;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(6px);
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
  position: relative;
  z-index: 1;
  margin-top: 12px;
  padding: 12px 13px;
  border-radius: 16px;
  border: 1px solid rgba(175, 194, 217, 0.14);
  background:
    linear-gradient(180deg, rgba(22, 29, 38, 0.96), rgba(11, 16, 22, 0.99));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    0 14px 28px rgba(0, 0, 0, 0.14);
}

.notes-card__title {
  color: var(--text-main);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.06em;
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
  padding: 14px 16px 16px;
  overflow: hidden;
  display: grid;
  grid-template-rows: minmax(0, 1fr);
  gap: 0;
  background:
    radial-gradient(circle at 50% 18%, rgba(123, 214, 255, 0.07), transparent 30%),
    radial-gradient(circle at 50% 100%, rgba(255, 188, 93, 0.05), transparent 26%),
    linear-gradient(180deg, rgba(14, 20, 28, 0.985), rgba(8, 12, 18, 1));
}

.containment-bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
  opacity: 0.92;
}

.containment-bg::before,
.containment-bg::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.containment-bg::before {
  background:
    radial-gradient(circle at 50% 22%, rgba(190, 237, 255, 0.08), transparent 18%),
    linear-gradient(180deg, rgba(126, 220, 255, 0.04), transparent 24%, transparent 76%, rgba(255, 196, 120, 0.03));
}

.containment-bg::after {
  inset: 14px;
  border-radius: 28px;
  border: 1px solid rgba(255, 255, 255, 0.022);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.018), transparent 18%, transparent 82%, rgba(255, 255, 255, 0.008)),
    linear-gradient(90deg, transparent 0%, rgba(107, 211, 255, 0.022) 48%, rgba(255, 187, 92, 0.016) 52%, transparent 100%);
  mask: linear-gradient(180deg, rgba(255,255,255,0.9), rgba(255,255,255,0.5));
}

.beam,
.ring,
.pulse,
.scan {
  position: absolute;
}

.beam--v {
  top: 42px;
  bottom: 42px;
  left: 50%;
  width: 2px;
  background: linear-gradient(180deg, transparent, rgba(123, 214, 255, 0.2), rgba(255, 194, 118, 0.14), transparent);
  box-shadow:
    0 0 18px rgba(123, 214, 255, 0.16),
    0 0 36px rgba(123, 214, 255, 0.08);
  transform: translateX(-50%);
}

.beam--h {
  left: 30px;
  right: 30px;
  top: 50%;
  height: 2px;
  background: linear-gradient(90deg, transparent, rgba(107, 211, 255, 0.14), rgba(255, 188, 93, 0.14), transparent);
  box-shadow:
    0 0 16px rgba(107, 211, 255, 0.08),
    0 0 28px rgba(255, 188, 93, 0.06);
}

.ring {
  left: 50%;
  top: 50%;
  border-radius: 50%;
  transform: translate(-50%, -50%);
}

.ring--outer {
  width: 320px;
  height: 320px;
  border: 1px solid rgba(123, 214, 255, 0.18);
  box-shadow:
    0 0 44px rgba(123, 214, 255, 0.06),
    inset 0 0 28px rgba(123, 214, 255, 0.04);
}

.ring--inner {
  width: 220px;
  height: 220px;
  border: 1px solid rgba(255, 194, 118, 0.16);
  box-shadow: inset 0 0 18px rgba(255, 194, 118, 0.04);
}

.pulse {
  left: 50%;
  top: 50%;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  animation: slaughter-pulse 5.8s ease-in-out infinite;
}

.pulse--a {
  width: 172px;
  height: 172px;
  background: radial-gradient(circle, rgba(123, 214, 255, 0.08), transparent 72%);
}

.pulse--b {
  width: 262px;
  height: 262px;
  background: radial-gradient(circle, rgba(255, 189, 113, 0.05), transparent 76%);
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
  top: 14%;
  background: linear-gradient(180deg, rgba(123, 214, 255, 0.2), transparent);
}

.scan--bottom {
  bottom: 12%;
  background: linear-gradient(180deg, transparent, rgba(255, 189, 113, 0.16));
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

.hero-stage::before {
  content: '';
  position: absolute;
  inset: 10px 8px 0;
  border-radius: 34px;
  border: 1px solid rgba(123, 214, 255, 0.05);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.018), transparent 18%),
    radial-gradient(circle at 50% 0%, rgba(123, 214, 255, 0.045), transparent 30%);
  pointer-events: none;
}

.hero-stage::after {
  content: '';
  position: absolute;
  inset: 20px 24px 18px;
  border-radius: 30px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.012), transparent 14%),
    radial-gradient(circle at 50% 50%, rgba(107, 211, 255, 0.028), transparent 46%);
  box-shadow:
    inset 0 0 0 1px rgba(123, 214, 255, 0.03),
    inset 0 -20px 34px rgba(0, 0, 0, 0.12);
  pointer-events: none;
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

.entity-preview-card--placeholder {
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

.entity-preview-card__placeholder-icon {
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
  border-radius: 32px;
  overflow: hidden;
  border: 1px solid rgba(190, 212, 236, 0.18);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.02), transparent 18%),
    radial-gradient(circle at 50% 50%, rgba(233, 243, 255, 0.82) 0%, rgba(121, 196, 255, 0.46) 20%, rgba(34, 62, 96, 0.22) 46%, rgba(12, 19, 29, 0.08) 70%, transparent 82%),
    linear-gradient(180deg, rgba(12, 21, 32, 0.98), rgba(5, 12, 19, 1));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    inset 0 -30px 64px rgba(0, 0, 0, 0.18),
    0 0 0 1px rgba(123, 214, 255, 0.08),
    0 28px 54px rgba(0, 0, 0, 0.28);
}

.entity-preview-card__viewport::before {
  content: '';
  position: absolute;
  inset: 10px;
  border-radius: 24px;
  border: 1px solid rgba(255, 255, 255, 0.035);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.028), transparent 24%),
    linear-gradient(90deg, transparent, rgba(107, 211, 255, 0.04), transparent);
  pointer-events: none;
}

.entity-preview-card__viewport::after {
  content: '';
  position: absolute;
  left: 12%;
  right: 12%;
  bottom: 12%;
  height: 42px;
  border-radius: 999px;
  background: radial-gradient(circle, rgba(0, 0, 0, 0.26) 0%, rgba(0, 0, 0, 0.08) 46%, transparent 78%);
  filter: blur(10px);
  pointer-events: none;
}

.entity-preview-card__viewport > .entity-preview-card__grid::before,
.entity-preview-card__viewport > .entity-preview-card__grid::after {
  content: '';
  position: absolute;
  pointer-events: none;
}

.entity-preview-card__viewport > .entity-preview-card__grid::before {
  top: 10%;
  bottom: 10%;
  left: 50%;
  width: 1px;
  transform: translateX(-50%);
  background: linear-gradient(180deg, transparent, rgba(107, 211, 255, 0.1), transparent);
}

.entity-preview-card__viewport > .entity-preview-card__grid::after {
  left: 10%;
  right: 10%;
  top: 50%;
  height: 1px;
  transform: translateY(-50%);
  background: linear-gradient(90deg, transparent, rgba(255, 188, 93, 0.08), transparent);
}

.entity-preview-card__aura,
.entity-preview-card__grid {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.entity-preview-card__aura--outer {
  inset: 10%;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(220, 242, 255, 0.88) 0%, rgba(134, 215, 255, 0.42) 28%, rgba(111, 175, 235, 0.14) 56%, transparent 76%);
  filter: blur(14px);
  opacity: 0.9;
}

.entity-preview-card__aura--inner {
  inset: 22%;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 245, 219, 0.72) 0%, rgba(255, 213, 146, 0.22) 36%, transparent 74%);
  filter: blur(9px);
  opacity: 0.72;
}

.entity-preview-card__grid {
  inset: 12px;
  border-radius: 24px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.032) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.032) 1px, transparent 1px);
  background-size: 18px 18px;
  opacity: 0.32;
  mix-blend-mode: screen;
}

.entity-preview-card__image {
  position: relative;
  z-index: 1;
  width: min(100%, 72%);
  max-width: 320px;
  height: auto;
  max-height: 78%;
  object-fit: contain;
  image-rendering: pixelated;
  transform: translateY(-2px);
  filter:
    drop-shadow(0 0 12px rgba(230, 244, 255, 0.74))
    drop-shadow(0 0 28px rgba(123, 214, 255, 0.2))
    drop-shadow(0 18px 30px rgba(0, 0, 0, 0.36))
    contrast(1.08)
    saturate(1.04);
}

.entity-preview-card__meta {
  display: grid;
  gap: 4px;
  text-align: center;
  justify-items: center;
  padding: 0 12px 2px;
  flex-shrink: 0;
}

.entity-preview-card__meta strong {
  color: var(--text-main);
  font-size: 14px;
  line-height: 1.15;
  letter-spacing: -0.01em;
}

.entity-preview-card__meta small {
  color: var(--text-dim);
  font-size: 10px;
  line-height: 1.15;
  letter-spacing: 0.03em;
}

.entity-model-card :deep(.entity-model-viewer) {
  height: 100% !important;
  min-height: 0;
  border-radius: 32px;
  border: 1px solid rgba(190, 212, 236, 0.18);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.02), transparent 18%),
    radial-gradient(circle at 50% 50%, rgba(233, 243, 255, 0.18) 0%, rgba(121, 196, 255, 0.1) 18%, rgba(34, 62, 96, 0.18) 42%, transparent 78%),
    linear-gradient(180deg, rgba(12, 21, 32, 0.98), rgba(5, 12, 19, 1));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    inset 0 -30px 64px rgba(0, 0, 0, 0.16),
    0 0 0 1px rgba(123, 214, 255, 0.08),
    0 28px 54px rgba(0, 0, 0, 0.28);
}

.entity-model-card :deep(.entity-model-viewer__canvas) {
  height: 100%;
}

.entity-model-card :deep(.entity-model-viewer__canvas canvas) {
  filter:
    drop-shadow(0 0 14px rgba(230, 244, 255, 0.52))
    drop-shadow(0 0 24px rgba(107, 211, 255, 0.18))
    drop-shadow(0 18px 34px rgba(0, 0, 0, 0.34));
}

.entity-model-card :deep(.entity-model-viewer__overlay) {
  backdrop-filter: blur(10px);
  background: rgba(7, 13, 19, 0.52);
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
  position: relative;
  z-index: 1;
  gap: 2px;
  padding: 2px 0 12px;
  border-bottom: 1px solid rgba(171, 191, 214, 0.1);
}

.drops-scroll {
  position: relative;
  z-index: 1;
  flex: 1;
  min-height: 0;
  overflow: auto;
  margin-top: 12px;
  padding-right: 4px;
}

.drop-section + .drop-section {
  margin-top: 10px;
}

.drop-section {
  padding: 12px;
  border-radius: 18px;
  border: 1px solid rgba(168, 189, 211, 0.12);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.02), transparent 14%),
    linear-gradient(180deg, rgba(21, 28, 37, 0.97), rgba(11, 16, 22, 0.99));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.03),
    0 12px 24px rgba(0, 0, 0, 0.16);
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
  margin-bottom: 10px;
}

.drop-section__header h4 {
  margin: 0;
  color: var(--text-main);
  font-size: 14px;
  letter-spacing: -0.01em;
}

.drop-section__header span {
  color: var(--text-dim);
  font-size: 11px;
}

.drop-icon-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(46px, 1fr));
  gap: 9px;
}

.drop-icon {
  position: relative;
  width: 46px;
  height: 46px;
  padding: 0;
  border: 1px solid rgba(170, 190, 213, 0.12);
  border-radius: 14px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.028), transparent 18%),
    linear-gradient(180deg, rgba(30, 37, 46, 0.98), rgba(14, 19, 26, 0.99));
  cursor: pointer;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    0 10px 18px rgba(0, 0, 0, 0.16);
  transition: transform 160ms ease, border-color 160ms ease, background 160ms ease, box-shadow 160ms ease;
}

.drop-icon:hover {
  transform: translateY(-2px);
  border-color: rgba(196, 213, 231, 0.26);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.05),
    0 0 0 1px rgba(107, 211, 255, 0.08),
    0 14px 22px rgba(0, 0, 0, 0.22);
}

.drop-icon:active {
  transform: translateY(0);
}


.drop-card__icon {
  position: relative;
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  border-radius: 13px;
  background:
    radial-gradient(circle at 50% 18%, rgba(255, 255, 255, 0.04), transparent 42%),
    rgba(255, 255, 255, 0.02);
}

.drops-scroll::-webkit-scrollbar {
  width: 8px;
}

.drops-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.drops-scroll::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(123, 214, 255, 0.24), rgba(255, 188, 93, 0.18));
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
