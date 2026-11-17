import type { Match } from '@elysium/contracts';
import {language,gameLanguage} from '../i18n/index.ts';

type EnderDust = Extract<Match, { kind: 'ae2EnderDust' }>;

/** EntitySingularity's argument direction differs from generic ore membership. */
export function aeEnderDustNote(rule: EnderDust, locale = gameLanguage(language.value)): string {
  const metadata = rule.metadata === 32767 ? '32767' : `${rule.metadata}${locale === 'en_US' ? ' or ' : ' 或 '}32767`;
  return locale === 'en_US'
    ? `${rule.ore}: same item with offered metadata ${metadata}. NBT is ignored; the icon is a display sample.`
    : `${rule.ore}：同物品，投入元数据须为 ${metadata}；忽略 NBT，图标为展示示例。`;
}
