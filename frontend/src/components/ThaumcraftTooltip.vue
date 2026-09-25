<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  tooltip: string;
}

const props = defineProps<Props>();

type TooltipLineType = 'text' | 'vis_discount' | 'warp' | 'protection';

interface ParsedLine {
  type: TooltipLineType;
  content: string;
  badge?: string;
}

const parsedTooltip = computed<ParsedLine[]>(() => {
  return props.tooltip
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => parseLine(line));
});

function parseLine(line: string): ParsedLine {
  const lower = line.toLowerCase();

  if (lower.includes('vis') || line.includes('减免') || line.includes('折扣')) {
    return { type: 'vis_discount', content: line, badge: 'Vis' };
  }

  if (lower.includes('warp') || line.includes('扭曲')) {
    return { type: 'warp', content: line, badge: 'Warp' };
  }

  if (lower.includes('protect') || line.includes('保护') || line.includes('shield')) {
    return { type: 'protection', content: line, badge: 'Ward' };
  }

  return { type: 'text', content: line };
}
</script>

<template>
  <div class="thaumcraft-tooltip">
    <div
      v-for="(line, index) in parsedTooltip"
      :key="index"
      class="tooltip-line"
      :class="`line-${line.type}`"
    >
      <span v-if="line.badge" class="line-badge">{{ line.badge }}</span>
      <span class="line-content">{{ line.content }}</span>
    </div>
  </div>
</template>

<style scoped>
.thaumcraft-tooltip {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.tooltip-line {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  color: rgba(234, 242, 255, 0.92);
  font-size: 12px;
  line-height: 1.5;
}

.line-badge {
  min-width: 32px;
  padding: 1px 6px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  background: rgba(15, 23, 42, 0.72);
  color: #eaf2ff;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.4;
  text-align: center;
  flex-shrink: 0;
}

.line-content {
  word-break: break-word;
}

.line-vis_discount {
  color: #ddd6fe;
}

.line-vis_discount .line-badge {
  border-color: rgba(196, 181, 253, 0.3);
  background: rgba(59, 28, 84, 0.72);
  color: #f5f3ff;
}

.line-warp {
  color: #fecdd3;
}

.line-warp .line-badge {
  border-color: rgba(251, 113, 133, 0.32);
  background: rgba(76, 5, 25, 0.72);
  color: #fff1f2;
}

.line-protection {
  color: #ccfbf1;
}

.line-protection .line-badge {
  border-color: rgba(94, 234, 212, 0.28);
  background: rgba(17, 94, 89, 0.72);
  color: #f0fdfa;
}
</style>
