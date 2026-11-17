import {language,t} from './index.ts';
import {errorEnglish} from './messages-errors.ts';

const details: readonly [string,string][] = [
  ['离线资料缺少文件：','离线资料缺少文件：{0}'],
  ['资料文件请求失败：HTTP ','资料文件请求失败：HTTP {0}'],
  ['下载失败：HTTP ','下载失败：HTTP {0}'],
  ['纹理请求失败：','纹理请求失败：{0}'],
  ['数据集缺少引用：','数据集缺少引用：{0}'],
  ['接口返回的数据不符合当前契约：','接口返回的数据不符合当前契约：{0}'],
];

/** Only authored failure descriptions are translated. Native text, identifiers
 * and unrecognized technical details pass through without language guessing. */
export function errorMessage(error: unknown,fallback='加载失败'): string {
  const message=error instanceof Error?error.message:typeof error==='string'?error:'';
  if(!message)return t(fallback);
  if(language.value!=='en-US')return message;
  if(Object.hasOwn(errorEnglish,message))return errorEnglish[message]!;
  for(const [prefix,key] of details)if(message.startsWith(prefix))return t(key,message.slice(prefix.length));
  return message;
}
