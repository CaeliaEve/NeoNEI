import { t, language } from "../i18n/index.ts";
import type { Chance } from '@elysium/contracts';

export function amount(value: string): string { return BigInt(value).toLocaleString(language.value); }
export function ticks(value: string): string {
  const count = BigInt(value);
  if (count < 0n) return t("原生耗时异常（{0} tick）", value);
  const fraction = String((count % 20n) * 5n).padStart(2, '0').replace(/0+$/, '');
  return amount(String(count / 20n)) + (fraction ? '.' + fraction : '') + ' s';
}
export function chance(value: Chance): string {
  const numerator = BigInt(value.numerator), denominator = BigInt(value.denominator);
  const hundredths = numerator * 10000n / denominator;
  const fraction = String(hundredths % 100n).padStart(2, '0').replace(/0+$/, '');
  const percent = String(hundredths / 100n) + (fraction ? '.' + fraction : '') + '%';
  return numerator * 10000n % denominator ? value.numerator + '/' + value.denominator + ' · ≈' + percent : percent;
}
export function plain(text: string): string { return text.replace(/§[0-9a-fk-or]/gi, ''); }
export function color(argb: number): string {
  return 'rgba(' + ((argb >>> 16) & 255) + ',' + ((argb >>> 8) & 255) + ',' + (argb & 255) + ',' + ((argb >>> 24) / 255) + ')';
}
export const units = { get count(){return t("个");}, tick: 'tick', eu: 'EU', eu_per_tick: 'EU/t', mb: 'mB', kelvin: 'K', pascal: 'Pa',
  rpm: 'RPM', mana: 'Mana', lp: 'LP', vis: 'Vis', percent: '%' } as const;
