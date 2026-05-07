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
  accent: 'normal' | 'rare' | 'extra' | 'infernal' | 'misc';
  items: DisplayItem[];
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();
const { playClick } = useSound();
const entityModelError = ref('');

function normalizeCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
}

function normalizeProbability(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return Math.min(1, Math.max(0, value));
}

function pickNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) {
      return number;
    }
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
    if (seen.has(item.itemId)) continue;
    seen.add(item.itemId);
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
  if (probability === null) return '--';
  if (probability <= 0) return '0%';
  if (probability >= 1) return '100%';
  const percent = probability * 100;
  if (percent < 0.01) return '<0.01%';
  if (percent < 1) return `${percent.toFixed(2)}%`;
  if (percent < 10) return `${percent.toFixed(1)}%`;
  return `${Math.round(percent * 10) / 10}%`;
}

function probabilityBarWidth(probability: number | null): string {
  if (probability === null || probability <= 0) return '0%';
  return `${Math.min(100, Math.max(probability * 100, 4))}%`;
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
    .replace(/\s+秒\b/g, ' 秒')
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

const machineIcon = computed(() => recipe.value.machineInfo?.machineIcon ?? recipe.value.recipeTypeData?.machineIcon ?? null);
const machineTitle = computed(() => '工业屠宰场');
const machineSubtitle = computed(() => {
  const machineType = `${recipe.value.machineInfo?.machineType ?? recipe.value.recipeType ?? ''}`.trim();
  return machineType || 'Extreme Entity Crusher';
});

const inputSource = computed<unknown>(() => {
  const additional = parseAdditionalData(recipe.value);
  if (additional && 'rawIndexedInputs' in additional) {
    return (additional as Record<string, unknown>).rawIndexedInputs;
  }
  return recipe.value.inputs;
});

const inputCandidates = computed<DisplayItem[]>(() => {
  const collected: DisplayItem[] = [];
  collectDisplayItems(inputSource.value, collected);
  return uniqueItems(collected);
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
  if (direct.length > 0) {
    return direct;
  }

  const fallbackXp = pickNumber(mergedMeta.value.xpJuiceMb);
  if (fallbackXp === null || fallbackXp <= 0) {
    return [];
  }

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
const maxHealth = computed(() => pickNumber(mergedMeta.value.maxHealth));
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
const normalOutputsCount = computed(() => Math.max(0, Math.floor(pickNumber(mergedMeta.value.normalOutputsCount) ?? 0)));
const rareOutputsCount = computed(() => Math.max(0, Math.floor(pickNumber(mergedMeta.value.rareOutputsCount) ?? 0)));
const additionalOutputsCount = computed(() => Math.max(0, Math.floor(pickNumber(mergedMeta.value.additionalOutputsCount) ?? 0)));
const infernalOutputsCount = computed(() => Math.max(0, Math.floor(pickNumber(mergedMeta.value.infernalOutputsCount) ?? 0)));

const additionalInformation = computed<string[]>(() => {
  const raw = mergedMeta.value.additionalInformation;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => normalizeInfoLine(`${entry ?? ''}`))
    .filter(Boolean);
});

const healthBandWidth = computed(() => {
  const health = maxHealth.value;
  if (health === null || health <= 0) return '12%';
  const scaled = 22 + Math.log10(health + 1) * 28;
  return `${Math.max(12, Math.min(100, scaled))}%`;
});

const heroItem = computed<DisplayItem | null>(() => {
  const priority = (entry: DisplayItem): number => {
    const internal = entry.internalName.toLowerCase();
    const localized = entry.localizedName.toLowerCase();
    if (internal.includes('mobsoul') || localized.includes('灵魂')) return 400;
    if (internal.includes('poweredspawner') || internal.includes('soulvessel') || internal.includes('brokenspawner')) return 300;
    if (localized.includes(mobLocalizedName.value.toLowerCase())) return 260;
    if (internal.includes('placer')) return 220;
    return 100;
  };

  return [...outputItems.value, ...inputCandidates.value]
    .sort((left, right) => priority(right) - priority(left))[0] ?? null;
});

const entityPreview = computed<EntityPreviewDescriptor | null>(() => {
  const candidate = uiPayload.value?.entityPreview;
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }

  const record = candidate as Record<string, unknown>;
  const imageUrl = `${record.imageUrl ?? ''}`.trim();
  if (!imageUrl) {
    return null;
  }

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
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }

  const record = candidate as Record<string, unknown>;
  const modelUrl = `${record.modelUrl ?? ''}`.trim();
  if (!modelUrl) {
    return null;
  }

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
const shouldRenderEntityPreview = computed(() => Boolean(entityPreview.value) && !shouldRenderEntityModel.value);

const dropSections = computed<DropSection[]>(() => {
  const outputs = outputItems.value;
  const sections: DropSection[] = [];
  let cursor = 0;

  const consume = (
    key: string,
    label: string,
    accent: DropSection['accent'],
    count: number,
  ) => {
    if (count <= 0) return;
    const slice = outputs.slice(cursor, cursor + count);
    cursor += count;
    if (slice.length > 0) {
      sections.push({ key, label, accent, items: slice });
    }
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
    sections.push({
      key: 'all',
      label: '全部掉落',
      accent: 'normal',
      items: outputs,
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
  if (bossLabel.value) {
    flags.push({ label: bossLabel.value, tone: 'danger' });
  }
  if (infernalType.value === 1) {
    flags.push({ label: '精英词缀', tone: 'danger' });
  } else if (infernalType.value === 2) {
    flags.push({ label: '终极词缀', tone: 'danger' });
  } else if (infernalType.value === 0) {
    flags.push({ label: '无额外词缀', tone: 'neutral' });
  }
  return flags;
});

const carrierLabel = computed(() => {
  if (inputCandidates.value.length >= 3) return '容器 / 捕获载体';
  if (inputCandidates.value.length > 0) return '输入载体';
  return '未记录输入载体';
});

watch(
  () => entityModel.value?.modelUrl ?? '',
  () => {
    entityModelError.value = '';
  },
  { immediate: true },
);

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
</script>

<template>
  <div class="slaughterhouse-ui">
    <header class="machine-header">
      <div class="machine-heading">
        <div v-if="machineIcon" class="machine-icon">
          <AnimatedItemIcon
            :item-id="machineIcon.itemId"
            :render-asset-ref="machineIcon.renderAssetRef || null"
            :image-file-name="machineIcon.imageFileName || null"
            :size="26"
          />
        </div>
        <div class="machine-copy">
          <span class="machine-eyebrow">NeoNEI 实体处理</span>
          <h2>{{ machineTitle }}</h2>
          <p>{{ machineSubtitle }}</p>
        </div>
      </div>

      <div class="machine-chip-row">
        <span class="machine-chip">{{ formatNumber(euPerTick, ' EU/t') }}</span>
        <span class="machine-chip">{{ formatDurationSeconds(durationSeconds) }}</span>
        <span class="machine-chip">{{ outputItems.length }} 个掉落</span>
      </div>
    </header>

    <div class="layout-shell">
      <aside class="profile-panel">
        <div class="panel-header">
          <span class="panel-kicker">目标实体</span>
          <strong>{{ mobLocalizedName }}</strong>
          <small v-if="mobName">{{ mobName }}</small>
        </div>

        <div class="health-card">
          <div class="health-card__row">
            <span>生命值</span>
            <strong>{{ formatNumber(maxHealth) }}</strong>
          </div>
          <div class="health-bar">
            <span class="health-bar__fill" :style="{ width: healthBandWidth }"></span>
          </div>
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

        <div class="containment-copy">
          <span class="containment-kicker">实体预览</span>
          <h3>{{ mobLocalizedName }}</h3>
          <p>{{ mobMod }}</p>
        </div>

        <div class="hero-stage">
          <div v-if="shouldRenderEntityModel && entityModel" class="entity-model-card">
            <EntityModelViewer
              :model-url="entityModel.modelUrl"
              :height="292"
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
            <img
              class="entity-preview-card__image"
              :src="entityPreview.imageUrl"
              :alt="entityPreview.localizedName || mobLocalizedName"
              loading="eager"
              decoding="async"
              draggable="false"
            >
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
              <strong>实体模型加载失败</strong>
              <small>{{ entityModelError }}</small>
            </div>
          </div>

          <div v-else class="hero-slot" :class="{ 'hero-slot--empty': !heroItem }">
            <RecipeItemTooltip
              v-if="heroItem"
              :item-id="heroItem.itemId"
              :count="heroItem.count"
              @click="handleEntityClick(heroItem.itemId)"
            >
              <button type="button" class="hero-button">
                <AnimatedItemIcon
                  :item-id="heroItem.itemId"
                  :render-asset-ref="heroItem.renderAssetRef || null"
                  :image-file-name="heroItem.imageFileName || null"
                  :size="88"
                />
              </button>
            </RecipeItemTooltip>
            <span v-else class="hero-placeholder">?</span>
          </div>
        </div>

        <div class="carrier-strip">
          <div class="carrier-strip__label">{{ carrierLabel }}</div>
          <div class="carrier-grid">
            <template v-for="carrier in inputCandidates" :key="carrier.itemId">
              <RecipeItemTooltip
                :item-id="carrier.itemId"
                :count="carrier.count"
                @click="handleEntityClick(carrier.itemId)"
              >
                <button type="button" class="carrier-slot">
                  <AnimatedItemIcon
                    :item-id="carrier.itemId"
                    :render-asset-ref="carrier.renderAssetRef || null"
                    :image-file-name="carrier.imageFileName || null"
                    :size="34"
                  />
                  <span v-if="carrier.count > 1" class="carrier-slot__count">{{ carrier.count }}</span>
                </button>
              </RecipeItemTooltip>
            </template>
            <div v-if="inputCandidates.length === 0" class="carrier-empty">未记录输入载体</div>
          </div>
        </div>

        <div v-if="fluidOutputs.length > 0" class="fluid-strip">
          <div class="fluid-strip__label">副产流体</div>
          <div class="fluid-strip__list">
            <RecipeItemTooltip
              v-for="fluid in fluidOutputs"
              :key="fluid.fluidId"
              :item-id="fluid.fluidId"
              :count="1"
              @click="handleEntityClick(fluid.fluidId)"
            >
              <button type="button" class="fluid-chip">
                <AnimatedItemIcon
                  :item-id="fluid.fluidId"
                  :render-asset-ref="fluid.renderAssetRef || null"
                  :size="28"
                />
                <span class="fluid-chip__copy">
                  <strong>{{ fluid.localizedName }}</strong>
                  <small>{{ formatNumber(fluid.amount, ' mB') }}</small>
                </span>
              </button>
            </RecipeItemTooltip>
          </div>
        </div>
      </section>

      <aside class="drops-panel">
        <div class="panel-header panel-header--drops">
          <span class="panel-kicker">掉落列表</span>
          <strong>{{ outputItems.length }} 个掉落</strong>
          <small>已按掉落池与概率分组</small>
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

            <div class="drop-grid">
              <RecipeItemTooltip
                v-for="(drop, dropIndex) in section.items"
                :key="`${section.key}-${drop.itemId}-${dropIndex}-${drop.count}-${drop.probability ?? 'na'}`"
                :item-id="drop.itemId"
                :count="drop.count"
                @click="handleEntityClick(drop.itemId)"
              >
                <button type="button" class="drop-card">
                  <div class="drop-card__icon">
                    <AnimatedItemIcon
                      :item-id="drop.itemId"
                      :render-asset-ref="drop.renderAssetRef || null"
                      :image-file-name="drop.imageFileName || null"
                      :size="32"
                    />
                    <span v-if="drop.count > 1" class="drop-card__count">{{ drop.count }}</span>
                  </div>
                  <div class="drop-card__copy">
                    <strong>{{ drop.localizedName }}</strong>
                    <small>{{ drop.modId || drop.internalName }}</small>
                  </div>
                  <div class="drop-card__chance">
                    <span>{{ formatProbability(drop.probability) }}</span>
                    <div class="chance-track">
                      <span class="chance-fill" :style="{ width: probabilityBarWidth(drop.probability) }"></span>
                    </div>
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
  --text-main: #eff6ff;
  --text-soft: rgba(219, 231, 247, 0.76);
  --text-dim: rgba(166, 182, 201, 0.68);
  --cyan: #7bd6ff;
  --amber: #f5c97c;
  --blood: #ff5f75;
  width: min(1180px, calc(100vw - 72px));
  min-height: 650px;
  height: min(760px, calc(100vh - 210px));
  padding: 18px;
  border-radius: 24px;
  border: 1px solid rgba(164, 190, 214, 0.14);
  background:
    radial-gradient(circle at 8% 0%, rgba(123, 214, 255, 0.06), transparent 26%),
    radial-gradient(circle at 92% 100%, rgba(255, 95, 117, 0.06), transparent 28%),
    linear-gradient(180deg, rgba(11, 16, 23, 0.995), rgba(5, 8, 13, 1));
  box-shadow:
    0 30px 72px rgba(0, 0, 0, 0.46),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
  overflow: hidden;
}

.machine-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 18px;
  align-items: center;
  padding-bottom: 14px;
  border-bottom: 1px solid rgba(167, 188, 209, 0.1);
}

.machine-heading {
  display: flex;
  align-items: center;
  gap: 14px;
}

.machine-icon {
  width: 46px;
  height: 46px;
  display: grid;
  place-items: center;
  border-radius: 14px;
  border: 1px solid rgba(169, 192, 216, 0.18);
  background: linear-gradient(180deg, rgba(29, 37, 47, 0.96), rgba(17, 23, 31, 0.98));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.machine-copy h2 {
  margin: 2px 0 0;
  color: var(--text-main);
  font-size: 28px;
  line-height: 1;
}

.machine-copy p {
  margin: 7px 0 0;
  color: var(--text-dim);
  font-size: 12px;
}

.machine-eyebrow {
  color: rgba(123, 214, 255, 0.86);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.machine-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;
}

.machine-chip {
  padding: 9px 12px;
  border-radius: 999px;
  border: 1px solid rgba(177, 197, 219, 0.16);
  background: linear-gradient(180deg, rgba(26, 34, 43, 0.96), rgba(14, 19, 26, 0.98));
  color: var(--text-soft);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
}

.layout-shell {
  height: calc(100% - 77px);
  display: grid;
  grid-template-columns: 288px minmax(0, 1fr) 360px;
  gap: 16px;
  padding-top: 16px;
}

.profile-panel,
.containment-panel,
.drops-panel {
  border-radius: 20px;
  border: 1px solid var(--panel-edge);
  background: var(--panel-bg);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

.profile-panel,
.drops-panel {
  padding: 16px;
}

.panel-header {
  display: grid;
  gap: 4px;
}

.panel-kicker {
  color: rgba(123, 214, 255, 0.82);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
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

.health-card {
  margin-top: 16px;
  padding: 14px 15px;
  border-radius: 16px;
  border: 1px solid rgba(255, 95, 117, 0.16);
  background:
    radial-gradient(circle at 0% 50%, rgba(255, 95, 117, 0.08), transparent 52%),
    linear-gradient(180deg, rgba(32, 23, 28, 0.96), rgba(16, 13, 17, 0.98));
}

.health-card__row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: var(--text-soft);
  font-size: 12px;
}

.health-card__row strong {
  color: #fff4f5;
  font-size: 18px;
}

.health-bar {
  position: relative;
  height: 10px;
  margin-top: 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.05);
  overflow: hidden;
}

.health-bar__fill {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: inherit;
  background:
    linear-gradient(90deg, rgba(255, 95, 117, 0.95), rgba(255, 160, 135, 0.92));
  box-shadow: 0 0 16px rgba(255, 95, 117, 0.36);
}

.profile-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 12px;
  margin: 16px 0 0;
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
  padding: 8px 10px 9px;
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
  gap: 8px;
  margin-top: 16px;
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
  margin-top: 16px;
  padding: 14px 15px;
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
  padding: 18px 20px;
  overflow: hidden;
  display: grid;
  grid-template-rows: auto 1fr auto auto;
  gap: 16px;
}

.containment-copy {
  position: relative;
  z-index: 2;
  text-align: center;
}

.containment-kicker {
  color: rgba(245, 201, 124, 0.88);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.containment-copy h3 {
  margin: 6px 0 0;
  color: var(--text-main);
  font-size: 24px;
}

.containment-copy p {
  margin: 6px 0 0;
  color: var(--text-dim);
  font-size: 12px;
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
}

.entity-model-card {
  width: min(100%, 360px);
  display: grid;
  gap: 12px;
}

.entity-preview-card {
  width: 192px;
  min-height: 208px;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  gap: 10px;
  padding: 14px 12px 12px;
  border-radius: 32px;
  border: 1px solid rgba(171, 191, 214, 0.16);
  background:
    radial-gradient(circle at 50% 18%, rgba(123, 214, 255, 0.12), transparent 34%),
    radial-gradient(circle at 50% 82%, rgba(255, 95, 117, 0.08), transparent 38%),
    linear-gradient(180deg, rgba(31, 41, 52, 0.96), rgba(13, 19, 27, 0.98));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    0 0 0 1px rgba(123, 214, 255, 0.08),
    0 24px 48px rgba(0, 0, 0, 0.36);
}

.entity-preview-card--animated {
  animation: entity-preview-breathe 4.8s ease-in-out infinite;
}

.entity-preview-card--error {
  min-height: 192px;
  place-items: center;
  background:
    radial-gradient(circle at 50% 18%, rgba(255, 95, 117, 0.14), transparent 36%),
    linear-gradient(180deg, rgba(35, 19, 24, 0.96), rgba(17, 11, 15, 0.98));
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

.entity-preview-card__image {
  width: 100%;
  height: 176px;
  object-fit: contain;
  image-rendering: pixelated;
  filter:
    drop-shadow(0 8px 18px rgba(0, 0, 0, 0.46))
    drop-shadow(0 0 18px rgba(123, 214, 255, 0.12));
  user-select: none;
  -webkit-user-drag: none;
}

.entity-preview-card__meta {
  display: grid;
  gap: 3px;
  text-align: center;
}

.entity-preview-card__meta--model {
  padding: 0 6px;
}

.entity-preview-card__meta strong {
  color: var(--text-main);
  font-size: 13px;
}

.entity-preview-card__meta small {
  color: var(--text-dim);
  font-size: 11px;
  letter-spacing: 0.04em;
}

.hero-slot {
  width: 164px;
  height: 164px;
  display: grid;
  place-items: center;
  border-radius: 32px;
  border: 1px solid rgba(171, 191, 214, 0.16);
  background:
    radial-gradient(circle at 50% 24%, rgba(255, 255, 255, 0.08), transparent 38%),
    linear-gradient(180deg, rgba(30, 40, 51, 0.96), rgba(13, 19, 27, 0.98));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    0 0 0 1px rgba(123, 214, 255, 0.07),
    0 24px 48px rgba(0, 0, 0, 0.34);
}

.hero-slot::before,
.hero-slot::after {
  content: '';
  position: absolute;
  border-radius: inherit;
  pointer-events: none;
}

.hero-slot::before {
  inset: 10px;
  border: 1px solid rgba(123, 214, 255, 0.12);
}

.hero-slot::after {
  inset: 26px;
  border: 1px dashed rgba(255, 95, 117, 0.14);
}

.hero-button {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  border: none;
  background: transparent;
  cursor: pointer;
}

.hero-button:hover {
  transform: translateY(-1px);
}

.hero-slot--empty {
  color: rgba(200, 214, 233, 0.45);
}

.hero-placeholder {
  font-size: 48px;
  font-weight: 700;
}

@keyframes entity-preview-breathe {
  0%,
  100% {
    transform: translateY(0);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.04),
      0 0 0 1px rgba(123, 214, 255, 0.08),
      0 24px 48px rgba(0, 0, 0, 0.36);
  }
  50% {
    transform: translateY(-2px);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.05),
      0 0 0 1px rgba(123, 214, 255, 0.12),
      0 28px 56px rgba(0, 0, 0, 0.42);
  }
}

.carrier-strip,
.fluid-strip {
  position: relative;
  z-index: 2;
  padding: 14px 16px;
  border-radius: 16px;
  border: 1px solid rgba(166, 186, 208, 0.12);
  background: linear-gradient(180deg, rgba(19, 24, 31, 0.96), rgba(11, 15, 21, 0.98));
}

.carrier-strip__label,
.fluid-strip__label {
  color: var(--text-soft);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.carrier-grid,
.fluid-strip__list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 12px;
}

.carrier-slot,
.fluid-chip {
  position: relative;
  border: 1px solid rgba(171, 191, 214, 0.12);
  background: linear-gradient(180deg, rgba(30, 38, 48, 0.96), rgba(15, 20, 27, 0.98));
  cursor: pointer;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

.carrier-slot {
  width: 58px;
  height: 58px;
  display: grid;
  place-items: center;
  border-radius: 16px;
}

.carrier-slot:hover,
.fluid-chip:hover,
.drop-card:hover {
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

.fluid-chip {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 160px;
  padding: 10px 12px;
  border-radius: 16px;
}

.fluid-chip__copy {
  display: grid;
  gap: 2px;
  text-align: left;
}

.fluid-chip__copy strong {
  color: var(--text-main);
  font-size: 12px;
}

.fluid-chip__copy small {
  color: var(--text-dim);
  font-size: 11px;
}

.panel-header--drops {
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(171, 191, 214, 0.08);
}

.drops-scroll {
  height: calc(100% - 66px);
  overflow: auto;
  margin-top: 14px;
  padding-right: 4px;
}

.drops-scroll::-webkit-scrollbar {
  width: 8px;
}

.drops-scroll::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgba(161, 179, 201, 0.18);
}

.drop-section + .drop-section {
  margin-top: 14px;
}

.drop-section {
  padding: 12px;
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

.drop-section--extra {
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
}

.drop-section__header span {
  color: var(--text-dim);
  font-size: 11px;
}

.drop-grid {
  display: grid;
  gap: 10px;
}

.drop-card {
  width: 100%;
  display: grid;
  grid-template-columns: 46px minmax(0, 1fr) 92px;
  gap: 12px;
  align-items: center;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid rgba(170, 190, 213, 0.1);
  background: linear-gradient(180deg, rgba(30, 37, 46, 0.96), rgba(15, 20, 27, 0.98));
  cursor: pointer;
  transition: transform 160ms ease, border-color 160ms ease, background 160ms ease;
}

.drop-card__icon {
  position: relative;
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.03);
}

.drop-card__copy {
  min-width: 0;
  display: grid;
  gap: 3px;
  text-align: left;
}

.drop-card__copy strong {
  color: var(--text-main);
  font-size: 12px;
  line-height: 1.2;
}

.drop-card__copy small {
  color: var(--text-dim);
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.drop-card__chance {
  display: grid;
  gap: 6px;
  justify-items: end;
}

.drop-card__chance span {
  color: var(--text-soft);
  font-size: 11px;
  font-weight: 800;
}

.chance-track {
  width: 100%;
  height: 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  overflow: hidden;
}

.chance-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, rgba(123, 214, 255, 0.95), rgba(245, 201, 124, 0.95));
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

@media (max-width: 1280px) {
  .slaughterhouse-ui {
    width: min(1080px, calc(100vw - 40px));
    min-height: 620px;
  }

  .layout-shell {
    grid-template-columns: 260px minmax(0, 1fr) 330px;
  }
}

@media (max-width: 1120px) {
  .layout-shell {
    grid-template-columns: 1fr;
    grid-template-rows: auto auto minmax(280px, 1fr);
    overflow-y: auto;
  }

  .drops-scroll {
    height: auto;
    max-height: 360px;
  }

  .containment-panel {
    min-height: 520px;
  }
}
</style>
