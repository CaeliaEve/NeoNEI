import type {Choice} from '@elysium/contracts';
import {language,gameLanguage} from '../i18n/index.ts';

type NativeUse=Extract<Choice['consume'],{kind:'nativeContainer'}>;

/** Native rules apply to the actual inventory stack; a sample is not a fixed return. */
export function nativeContainerNote(use:NativeUse,locale=gameLanguage(language.value)):string {
  if(use.callback==='ic2Cutter')return locale==='en_US'
    ? 'Keep one cutter available. Each craft attempts one durability damage with the native IC2 RNG; enchantments and offered tool state determine wear and breakage. The returned tool stays in the crafting grid.'
    : '需备一把剪线钳；每次合成按 IC2 原生随机源尝试损耗一点耐久，附魔与实际工具状态决定损耗和损坏，未损坏的工具留在合成格。';
  if(use.callback==='thaumicMortar')return locale==='en_US'
    ? 'Consumes one mortar input and returns a new mortar with one additional damage, clearing its tags. At the native durability limit it returns nothing; the actual offered damage determines breakage.'
    : '每次使用一件研钵，按实际损伤值返还增加一点损伤的新研钵并清空标签；达到原生耐久上限时不返还。';
  if(use.callback==='railFirestone')return locale==='en_US'
    ? 'Returns a new refined firestone with native random wear; the resulting damage and breakage depend on the offered stack and the Railcraft random source. This is a rule, not a fixed returned sample.'
    : '按 Railcraft 原生随机源返还带随机损耗的新精炼火石；实际输入状态决定损伤和损坏，不能将样本当作固定返还。';
  if(use.callback==='botaniaBlackHole')return locale==='en_US'
    ? 'The actual blockCount tag determines the return. Exactly zero returns nothing; otherwise the talisman is copied with its full tags and stack count, up to 64 stored blocks are removed, and active metadata 1 resets to 0. The native grid-retention rule still applies; this is not a fixed remainder.'
    : '按实际 blockCount 标签决定返还：恰为零时不返还；否则复制护符的完整标签和堆叠数，扣除最多 64 个储存方块，并将激活状态元数据 1 重置为 0。仍遵守原生留格规则，不能视为固定返还物。';
  return locale==='en_US'
    ? 'Consumes one bauble per craft. Its cosmeticItem NBT is deserialized as the returned cosmetic, or nothing when absent or invalid. The actual offered stack determines the return; this is not a fixed sample item.'
    : '每次合成消耗一件饰品；从实际输入的 cosmeticItem NBT 解析返还装饰品，缺失或无法解析时不返还，不能将样本视为固定返还物。';
}
