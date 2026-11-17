import { ref } from 'vue';
import { english } from './messages.ts';

export type Language = 'zh-CN' | 'en-US';
export function uiLanguage(value: unknown): Language | null {
  return value === 'zh_CN' || value === 'zh-CN' ? 'zh-CN' : value === 'en_US' || value === 'en-US' ? 'en-US' : null;
}
export function gameLanguage(value: Language): 'zh_CN' | 'en_US' { return value === 'en-US' ? 'en_US' : 'zh_CN'; }
function initial(): Language {
  if (typeof window === 'undefined') return 'zh-CN';
  const route = uiLanguage(new URLSearchParams(window.location.search).get('lang'));
  if (route) return route;
  try { return uiLanguage(localStorage.getItem('neonei.language')) ?? 'zh-CN'; } catch { return 'zh-CN'; }
}
export const language = ref<Language>(initial());
export function setLanguage(value: Language): void {
  language.value = value;
  if (typeof document !== 'undefined') document.documentElement.lang = value;
  try { if (typeof localStorage !== 'undefined') localStorage.setItem('neonei.language', value); } catch { /* Selection still works without storage. */ }
}
/** Authored UI messages only. Native strings are never translated or filtered here. */
export function t(key: string, ...values: unknown[]): string {
  const text = language.value === 'en-US' ? english[key] : key;
  if (text === undefined) throw new Error('Missing English UI message: ' + key);
  return text.replace(/\{(\d+)\}/g, (token, index: string) => Number(index) < values.length ? String(values[Number(index)]) : token);
}
export function requireLanguage(value: unknown, requested?: string | null): Language {
  const selected = uiLanguage(value);
  if (!selected) throw new Error(t('这份数据没有可用的中文或英文语言标识。'));
  if (requested && selected !== uiLanguage(requested)) throw new Error(t('这份数据与所选语言不同，请切换到对应语言的数据。'));
  return selected;
}
