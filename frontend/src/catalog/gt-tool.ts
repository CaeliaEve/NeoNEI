import type { Choice } from '@elysium/contracts';
import {language,gameLanguage} from '../i18n/index.ts';

type ToolUse = Extract<Choice['consume'], { kind: 'gtTool' }>;

/** Describes captured native tool semantics; does not predict a player's tool state. */
export function gtToolNote(use: ToolUse, locale = gameLanguage(language.value)): string {
  if (locale === 'en_US') return `Keep one tool available; it can be reused. The crafting cost is ${use.cost} native units. `
    + (use.sample.electric ? 'Electric tools attempt to use energy; after successful energy use, wear has a 1/25 chance. Insufficient energy retains the tool without wear. '
      : 'Non-electric tools gain wear each craft. ')
    + 'A tool disappears when wear reaches its native limit. The actual branch depends on the offered tool state.';
  return `需备一件可复用工具；合成损耗基数为 ${use.cost} 原生单位。`
    + (use.sample.electric ? '电动工具尝试用电，成功耗电后以 1/25 概率增加耐久损耗；电量不足时保留工具且不扣耐久。' : '物理工具每次增加耐久损耗。')
    + '达到原生上限后损坏并消失；实际分支取决于输入工具状态。';
}
