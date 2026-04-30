import type { Recipe, RecipeTypeDTO } from './api';
import type { RecipeUiPayload } from './api';

export type UIPresentationFamily =
  | 'crafting'
  | 'gregtech'
  | 'botania'
  | 'thaumcraft'
  | 'blood_magic'
  | 'multiblock';

export type UIPresentationSurface =
  | 'workbench'
  | 'machine'
  | 'ritual'
  | 'research'
  | 'blueprint';

export type UIPresentationDensity = 'standard' | 'oversized';

export interface UIPresentationMeta {
  family: UIPresentationFamily;
  surface: UIPresentationSurface;
  density: UIPresentationDensity;
}

export interface UITypeConfig {
  uiType: string;
  component: string;
  presentation?: UIPresentationMeta;
  hasCircuitSlots?: boolean;
  hasFluidSlots?: boolean;
  hasEnergyBar?: boolean;
  hasCentralElement?: boolean;
  hasRuneSlots?: boolean;
  hasInfusionSlots?: boolean;
  hasVisCost?: boolean;
  hasBloodBar?: boolean;
  inputLayout?: 'grid' | 'vertical' | 'circle';
}

export interface RecipePresentationInput {
  machineType?: string | null;
  recipeType?: string | null;
  recipeTypeData?: RecipeTypeDTO | null;
  inputs?: Recipe['inputs'];
  additionalData?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  preferDetailedCrafting?: boolean;
}

export interface RecipePresentationProfile {
  uiConfig: UITypeConfig;
  component: string;
  renderMode: 'component' | 'detailed_crafting';
  reason: string;
  sourceUiType: string;
}

const STANDARD_CRAFTING: UITypeConfig = {
  uiType: 'standard_crafting',
  component: 'StandardCraftingUI',
};

const AVARITIA_EXTREME_CRAFTING: UITypeConfig = {
  uiType: 'avaritia_extreme_crafting',
  component: 'AvaritiaExtremeCraftingUI',
};

const FURNACE: UITypeConfig = {
  uiType: 'furnace',
  component: 'FurnaceUI',
};

const GT_GENERIC: UITypeConfig = {
  uiType: 'gt_generic',
  component: 'GTUniversalMachineUI',
  hasFluidSlots: true,
  hasEnergyBar: true,
};

const GT_RESEARCH_STATION: UITypeConfig = {
  uiType: 'gt_research_station',
  component: 'GTResearchStationUI',
  hasEnergyBar: true,
};

const GT_ASSEMBLER: UITypeConfig = {
  uiType: 'gt_assembler',
  component: 'GTAssemblerUI',
  hasCircuitSlots: true,
  hasFluidSlots: true,
  hasEnergyBar: true,
  inputLayout: 'grid',
};

const GT_ASSEMBLY_LINE: UITypeConfig = {
  uiType: 'gt_assembly_line',
  component: 'GTAssemblyLineUI',
  hasCircuitSlots: true,
  hasFluidSlots: true,
  hasEnergyBar: true,
};

const GT_ALLOY_SMELTER: UITypeConfig = {
  uiType: 'gt_alloy_smelter',
  component: 'GTAlloySmelterUI',
  hasEnergyBar: true,
};

const GT_CHEMICAL_REACTOR: UITypeConfig = {
  uiType: 'gt_chemical_reactor',
  component: 'GTChemicalReactorUI',
  hasFluidSlots: true,
  hasEnergyBar: true,
};

const GT_MOLECULAR: UITypeConfig = {
  uiType: 'gt_molecular',
  component: 'GTMolecularUI',
  hasEnergyBar: true,
};

const GT_ELECTROLYZER: UITypeConfig = {
  uiType: 'gt_electrolyzer',
  component: 'GTElectrolyzerUI',
  hasFluidSlots: true,
  hasEnergyBar: true,
};

const GT_BLAST_FURNACE: UITypeConfig = {
  uiType: 'gt_blast_furnace',
  component: 'GTBlastFurnaceUI',
  hasEnergyBar: true,
};

const GT_ELECTRIC_FURNACE: UITypeConfig = {
  uiType: 'gt_electric_furnace',
  component: 'GTElectricFurnaceUI',
  hasEnergyBar: true,
};

const BOTANIA_MANA_POOL: UITypeConfig = {
  uiType: 'botania_mana_pool',
  component: 'BotaniaPoolUI',
  hasCentralElement: true,
  inputLayout: 'vertical',
};

const BOTANIA_PURE_DAISY: UITypeConfig = {
  uiType: 'botania_pure_daisy',
  component: 'BotaniaPureDaisyUI',
  hasCentralElement: true,
  inputLayout: 'circle',
};

const BOTANIA_TERRA_PLATE: UITypeConfig = {
  uiType: 'botania_terra_plate',
  component: 'BotaniaTerraPlateUI',
  hasCentralElement: true,
  inputLayout: 'circle',
};

const BOTANIA_RUNE_ALTAR: UITypeConfig = {
  uiType: 'botania_rune_altar',
  component: 'BotaniaRuneAltarUI',
  hasEnergyBar: true,
};

const BOTANIA_ELVEN_TRADE: UITypeConfig = {
  uiType: 'botania_elven_trade',
  component: 'BotaniaElvenTradeUI',
  hasCentralElement: true,
};

const THAUMCRAFT_ARCANE: UITypeConfig = {
  uiType: 'thaumcraft_arcane',
  component: 'ThaumcraftArcaneUI',
  hasRuneSlots: true,
  hasVisCost: true,
};

const THAUMCRAFT_INFUSION: UITypeConfig = {
  uiType: 'thaumcraft_infusion',
  component: 'ThaumcraftInfusionUI',
  hasCentralElement: true,
  hasInfusionSlots: true,
  hasVisCost: true,
};

const THAUMCRAFT_CRUCIBLE: UITypeConfig = {
  uiType: 'thaumcraft_crucible',
  component: 'ThaumcraftCrucibleUI',
  hasCentralElement: true,
  hasVisCost: true,
};

const THAUMCRAFT_ASPECT: UITypeConfig = {
  uiType: 'thaumcraft_aspect',
  component: 'ThaumcraftAspectUI',
  hasCentralElement: true,
  hasVisCost: true,
};

const THAUMCRAFT_RESEARCH: UITypeConfig = {
  uiType: 'thaumcraft_research',
  component: 'ThaumcraftResearchUI',
  hasEnergyBar: true,
};

const BLOOD_MAGIC_ALTAR: UITypeConfig = {
  uiType: 'blood_magic_altar',
  component: 'BloodMagicAltarUI',
  hasBloodBar: true,
};

const BLOOD_ALCHEMY_TABLE: UITypeConfig = {
  uiType: 'blood_alchemy_table',
  component: 'BloodAlchemyTableUI',
  hasBloodBar: true,
};

const BLOOD_BINDING_RITUAL: UITypeConfig = {
  uiType: 'blood_binding_ritual',
  component: 'BloodBindingRitualUI',
  hasCentralElement: true,
};

const BLOOD_ORB_CRAFTING: UITypeConfig = {
  uiType: 'blood_orb_crafting',
  component: 'BloodOrbCraftingUI',
  hasCentralElement: true,
};

const MULTIBLOCK_BLUEPRINT: UITypeConfig = {
  uiType: 'multiblock_blueprint',
  component: 'MultiblockBlueprintUI',
  hasCentralElement: true,
};

const CJK_CHAR = /[\u3400-\u9fff]/;
const COMMON_MACHINE_CHINESE = /[工作台熔炉装配线合金分子电解化学浸洗高炉电炉奥术注魔研究血祭坛炼金]/;

const DEFAULT_PRESENTATION: UIPresentationMeta = {
  family: 'crafting',
  surface: 'workbench',
  density: 'standard',
};

const PRESENTATION_BY_UI_TYPE: Record<string, UIPresentationMeta> = {
  standard_crafting: {
    family: 'crafting',
    surface: 'workbench',
    density: 'standard',
  },
  avaritia_extreme_crafting: {
    family: 'crafting',
    surface: 'workbench',
    density: 'oversized',
  },
  furnace: {
    family: 'crafting',
    surface: 'machine',
    density: 'standard',
  },
  gt_generic: {
    family: 'gregtech',
    surface: 'machine',
    density: 'standard',
  },
  gt_research_station: {
    family: 'gregtech',
    surface: 'research',
    density: 'standard',
  },
  gt_assembler: {
    family: 'gregtech',
    surface: 'machine',
    density: 'standard',
  },
  gt_assembly_line: {
    family: 'gregtech',
    surface: 'machine',
    density: 'oversized',
  },
  gt_alloy_smelter: {
    family: 'gregtech',
    surface: 'machine',
    density: 'standard',
  },
  gt_chemical_reactor: {
    family: 'gregtech',
    surface: 'machine',
    density: 'oversized',
  },
  gt_molecular: {
    family: 'gregtech',
    surface: 'machine',
    density: 'standard',
  },
  gt_electrolyzer: {
    family: 'gregtech',
    surface: 'machine',
    density: 'standard',
  },
  gt_blast_furnace: {
    family: 'gregtech',
    surface: 'machine',
    density: 'standard',
  },
  gt_electric_furnace: {
    family: 'gregtech',
    surface: 'machine',
    density: 'standard',
  },
  botania_mana_pool: {
    family: 'botania',
    surface: 'ritual',
    density: 'standard',
  },
  botania_pure_daisy: {
    family: 'botania',
    surface: 'ritual',
    density: 'standard',
  },
  botania_terra_plate: {
    family: 'botania',
    surface: 'ritual',
    density: 'standard',
  },
  botania_rune_altar: {
    family: 'botania',
    surface: 'ritual',
    density: 'standard',
  },
  botania_elven_trade: {
    family: 'botania',
    surface: 'ritual',
    density: 'standard',
  },
  thaumcraft_arcane: {
    family: 'thaumcraft',
    surface: 'workbench',
    density: 'standard',
  },
  thaumcraft_infusion: {
    family: 'thaumcraft',
    surface: 'ritual',
    density: 'oversized',
  },
  thaumcraft_crucible: {
    family: 'thaumcraft',
    surface: 'ritual',
    density: 'standard',
  },
  thaumcraft_aspect: {
    family: 'thaumcraft',
    surface: 'research',
    density: 'standard',
  },
  thaumcraft_research: {
    family: 'thaumcraft',
    surface: 'research',
    density: 'standard',
  },
  blood_magic_altar: {
    family: 'blood_magic',
    surface: 'ritual',
    density: 'oversized',
  },
  blood_alchemy_table: {
    family: 'blood_magic',
    surface: 'ritual',
    density: 'standard',
  },
  blood_binding_ritual: {
    family: 'blood_magic',
    surface: 'ritual',
    density: 'standard',
  },
  blood_orb_crafting: {
    family: 'blood_magic',
    surface: 'ritual',
    density: 'standard',
  },
  multiblock_blueprint: {
    family: 'multiblock',
    surface: 'blueprint',
    density: 'oversized',
  },
};

const EXACT_ALIASES: Array<[string, UITypeConfig]> = [
  ['crafting', STANDARD_CRAFTING],
  ['crafting (shaped)', STANDARD_CRAFTING],
  ['crafting (shapeless)', STANDARD_CRAFTING],
  ['工作台', STANDARD_CRAFTING],
  ['extreme crafting', AVARITIA_EXTREME_CRAFTING],
  ['dire crafting', AVARITIA_EXTREME_CRAFTING],
  ['有序终极合成', AVARITIA_EXTREME_CRAFTING],
  ['无序终极合成', AVARITIA_EXTREME_CRAFTING],
  ['终极合成', AVARITIA_EXTREME_CRAFTING],
  ['无尽工作台', AVARITIA_EXTREME_CRAFTING],
  ['无尽贪婪工作台', AVARITIA_EXTREME_CRAFTING],

  ['furnace', FURNACE],
  ['smelting', FURNACE],
  ['熔炉', FURNACE],

  ['assembly line', GT_ASSEMBLY_LINE],
  ['装配线', GT_ASSEMBLY_LINE],
  ['装配线', GT_ASSEMBLY_LINE],
  ['装配线', GT_ASSEMBLY_LINE],
  ['装配台', GT_ASSEMBLY_LINE],
  ['research station', GT_RESEARCH_STATION],
  ['研究站', GT_RESEARCH_STATION],
  ['研究站', GT_RESEARCH_STATION],
  ['研究站', GT_RESEARCH_STATION],
  ['研究所', GT_RESEARCH_STATION],
  ['assembler', GT_ASSEMBLER],
  ['assembly machine', GT_ASSEMBLER],
  ['circuit assembler', GT_ASSEMBLER],
  ['组装机', GT_ASSEMBLER],
  ['装配机', GT_ASSEMBLER],
  ['电路组装机', GT_ASSEMBLER],
  ['压模机', GT_GENERIC],
  ['离心机', GT_GENERIC],
  ['extruder', GT_GENERIC],
  ['centrifuge', GT_GENERIC],

  ['alloy smelter', GT_ALLOY_SMELTER],
  ['\u5408\u91d1\u7089', GT_ALLOY_SMELTER],
  ['\u5408\u91d1\u7089', GT_ALLOY_SMELTER],
  ['\u5408\u91d1\u51b6\u70bc\u7089', GT_GENERIC],

  ['chemical reactor', GT_CHEMICAL_REACTOR],
  ['large chemical reactor', GT_CHEMICAL_REACTOR],
  ['chemical reactor (lv)', GT_CHEMICAL_REACTOR],
  ['large chemical reactor (lv)', GT_CHEMICAL_REACTOR],
  ['\u5316\u5b66\u53cd\u5e94\u91dc', GT_CHEMICAL_REACTOR],
  ['\u5927\u578b\u5316\u5b66\u53cd\u5e94\u91dc', GT_CHEMICAL_REACTOR],
  ['\u5316\u5de5\u53cd\u5e94\u91dc', GT_CHEMICAL_REACTOR],

  ['molecular', GT_MOLECULAR],
  ['分子', GT_MOLECULAR],
  ['分子', GT_MOLECULAR],
  ['分子重组仪', GT_GENERIC],

  ['electrolyzer', GT_ELECTROLYZER],
  ['电解', GT_ELECTROLYZER],
  ['电解机', GT_GENERIC],
  ['化学浸洗机', GT_GENERIC],

  ['blast furnace', GT_BLAST_FURNACE],
  ['industrial blast furnace', GT_BLAST_FURNACE],
  ['高炉', GT_BLAST_FURNACE],
  ['工业高炉', GT_BLAST_FURNACE],
  ['高炉', GT_GENERIC],

  ['electric furnace', GT_ELECTRIC_FURNACE],
  ['电炉', GT_ELECTRIC_FURNACE],
  ['电炉', GT_GENERIC],

  ['mana pool', BOTANIA_MANA_POOL],
  ['魔力池', BOTANIA_MANA_POOL],
  ['魔力灌注', BOTANIA_MANA_POOL],
  ['pure daisy', BOTANIA_PURE_DAISY],
  ['纯净雏菊', BOTANIA_PURE_DAISY],
  ['白雏菊', BOTANIA_PURE_DAISY],
  ['terra plate', BOTANIA_TERRA_PLATE],
  ['泰拉凝聚板', BOTANIA_TERRA_PLATE],
  ['rune altar', BOTANIA_RUNE_ALTAR],
  ['符文祭坛', BOTANIA_RUNE_ALTAR],
  ['elven trade', BOTANIA_ELVEN_TRADE],
  ['精灵交易', BOTANIA_ELVEN_TRADE],
  ['alfheim', BOTANIA_ELVEN_TRADE],
  ['elven gateway', BOTANIA_ELVEN_TRADE],
  ['elven portal', BOTANIA_ELVEN_TRADE],
  ['gateway core', BOTANIA_ELVEN_TRADE],
  ['精灵门', BOTANIA_ELVEN_TRADE],
  ['精灵交易', BOTANIA_ELVEN_TRADE],

  ['arcane worktable', THAUMCRAFT_ARCANE],
  ['arcane crafting', THAUMCRAFT_ARCANE],
  ['ordered arcane crafting', THAUMCRAFT_ARCANE],
  ['shapeless arcane crafting', THAUMCRAFT_ARCANE],
  ['crucible', THAUMCRAFT_CRUCIBLE],
  ['坩埚', THAUMCRAFT_CRUCIBLE],
  ['物品中的要素', THAUMCRAFT_ASPECT],
  ['要素组合', THAUMCRAFT_ASPECT],
  ['aspect combination', THAUMCRAFT_ASPECT],
  ['aspects from items', THAUMCRAFT_ASPECT],
  ['奥术工作台', THAUMCRAFT_ARCANE],
  ['奥术合成', THAUMCRAFT_ARCANE],
  ['奥术注魔', THAUMCRAFT_INFUSION],
  ['魔力灌注', THAUMCRAFT_INFUSION],
  ['灌注', THAUMCRAFT_INFUSION],

  ['infusion', THAUMCRAFT_INFUSION],
  ['注魔祭坛', THAUMCRAFT_INFUSION],

  ['research', THAUMCRAFT_RESEARCH],
  ['研究', THAUMCRAFT_RESEARCH],
  ['研究台', THAUMCRAFT_RESEARCH],

  ['blood altar', BLOOD_MAGIC_ALTAR],
  ['血祭坛', BLOOD_MAGIC_ALTAR],
  ['血之祭坛', BLOOD_MAGIC_ALTAR],
  ['blood magic altar', BLOOD_MAGIC_ALTAR],
  ['bloodmagic:altar', BLOOD_MAGIC_ALTAR],
  ['bloodmagic altar', BLOOD_MAGIC_ALTAR],
  ['血之祭坛', BLOOD_MAGIC_ALTAR],
  ['血祭坛', BLOOD_MAGIC_ALTAR],
  ['血之祭坛', BLOOD_MAGIC_ALTAR],
  ['血祭坛', BLOOD_MAGIC_ALTAR],
  ['琛€绁潧', BLOOD_MAGIC_ALTAR],
  ['alchemy table', BLOOD_ALCHEMY_TABLE],
  ['炼金台', BLOOD_ALCHEMY_TABLE],
  ['炼金术台', BLOOD_ALCHEMY_TABLE],
  ['blood magic alchemy table', BLOOD_ALCHEMY_TABLE],
  ['bloodmagic:alchemy table', BLOOD_ALCHEMY_TABLE],
  ['炼金台', BLOOD_ALCHEMY_TABLE],
  ['血炼金', BLOOD_ALCHEMY_TABLE],
  ['炼金台', BLOOD_ALCHEMY_TABLE],
  ['炼金术台', BLOOD_ALCHEMY_TABLE],
];

const KEYWORD_ALIASES: Array<[string, UITypeConfig]> = [
  ['assembly line', GT_ASSEMBLY_LINE],
  ['装配线', GT_ASSEMBLY_LINE],
  ['装配台', GT_ASSEMBLY_LINE],
  ['research station', GT_RESEARCH_STATION],
  ['研究站', GT_RESEARCH_STATION],
  ['研究所', GT_RESEARCH_STATION],
  ['assembler', GT_ASSEMBLER],
  ['assembly machine', GT_ASSEMBLER],
  ['circuit assembler', GT_ASSEMBLER],
  ['组装机', GT_ASSEMBLER],
  ['装配机', GT_ASSEMBLER],
  ['电路组装机', GT_ASSEMBLER],
  ['压模机', GT_GENERIC],
  ['离心机', GT_GENERIC],
  ['extruder', GT_GENERIC],
  ['centrifuge', GT_GENERIC],
  ['alloy smelter', GT_ALLOY_SMELTER],
  ['\u5408\u91d1', GT_GENERIC],
  ['chemical reactor', GT_CHEMICAL_REACTOR],
  ['large chemical reactor', GT_CHEMICAL_REACTOR],
  ['\u5316\u5b66\u53cd\u5e94\u91dc', GT_CHEMICAL_REACTOR],
  ['\u5927\u578b\u5316\u5b66\u53cd\u5e94\u91dc', GT_CHEMICAL_REACTOR],
  ['\u5316\u5de5\u53cd\u5e94\u91dc', GT_CHEMICAL_REACTOR],
  ['molecular', GT_MOLECULAR],
  ['分子', GT_GENERIC],
  ['electroly', GT_ELECTROLYZER],
  ['电解', GT_ELECTROLYZER],
  ['电解', GT_GENERIC],
  ['chemical bath', GT_GENERIC],
  ['浸洗', GT_GENERIC],
  ['blast furnace', GT_BLAST_FURNACE],
  ['industrial blast furnace', GT_BLAST_FURNACE],
  ['高炉', GT_BLAST_FURNACE],
  ['工业高炉', GT_BLAST_FURNACE],
  ['高炉', GT_GENERIC],
  ['electric furnace', GT_ELECTRIC_FURNACE],
  ['电炉', GT_ELECTRIC_FURNACE],
  ['电炉', GT_GENERIC],

  ['mana pool', BOTANIA_MANA_POOL],
  ['魔力池', BOTANIA_MANA_POOL],
  ['魔力灌注', BOTANIA_MANA_POOL],
  ['pure daisy', BOTANIA_PURE_DAISY],
  ['纯净雏菊', BOTANIA_PURE_DAISY],
  ['白雏菊', BOTANIA_PURE_DAISY],
  ['terra plate', BOTANIA_TERRA_PLATE],
  ['泰拉凝聚板', BOTANIA_TERRA_PLATE],
  ['rune altar', BOTANIA_RUNE_ALTAR],
  ['符文祭坛', BOTANIA_RUNE_ALTAR],
  ['elven trade', BOTANIA_ELVEN_TRADE],
  ['精灵交易', BOTANIA_ELVEN_TRADE],
  ['alfheim', BOTANIA_ELVEN_TRADE],
  ['elven gateway', BOTANIA_ELVEN_TRADE],
  ['elven portal', BOTANIA_ELVEN_TRADE],
  ['gateway core', BOTANIA_ELVEN_TRADE],
  ['精灵门', BOTANIA_ELVEN_TRADE],
  ['精灵交易', BOTANIA_ELVEN_TRADE],

  ['infusion', THAUMCRAFT_INFUSION],
  ['注魔', THAUMCRAFT_INFUSION],
  ['灌注', THAUMCRAFT_INFUSION],
  ['arcane infusion', THAUMCRAFT_INFUSION],
  ['crucible', THAUMCRAFT_CRUCIBLE],
  ['坩埚', THAUMCRAFT_CRUCIBLE],
  ['物品中的要素', THAUMCRAFT_ASPECT],
  ['要素组合', THAUMCRAFT_ASPECT],
  ['aspect combination', THAUMCRAFT_ASPECT],
  ['aspects from items', THAUMCRAFT_ASPECT],
  ['奥术注魔', THAUMCRAFT_INFUSION],
  ['魔力灌注', THAUMCRAFT_INFUSION],
  ['arcane', THAUMCRAFT_ARCANE],
  ['ordered arcane', THAUMCRAFT_ARCANE],
  ['shapeless arcane', THAUMCRAFT_ARCANE],
  ['奥术', THAUMCRAFT_ARCANE],
  ['research', THAUMCRAFT_RESEARCH],
  ['研究', THAUMCRAFT_RESEARCH],
  ['研究', THAUMCRAFT_RESEARCH],

  ['blood altar', BLOOD_MAGIC_ALTAR],
  ['血祭坛', BLOOD_MAGIC_ALTAR],
  ['血之祭坛', BLOOD_MAGIC_ALTAR],
  ['blood magic altar', BLOOD_MAGIC_ALTAR],
  ['bloodmagic', BLOOD_MAGIC_ALTAR],
  ['life essence', BLOOD_MAGIC_ALTAR],
  ['血之祭坛', BLOOD_MAGIC_ALTAR],
  ['血祭坛', BLOOD_MAGIC_ALTAR],
  ['血之祭坛', BLOOD_MAGIC_ALTAR],
  ['血祭坛', BLOOD_MAGIC_ALTAR],
  ['琛€绁潧', BLOOD_MAGIC_ALTAR],
  ['alchemy table', BLOOD_ALCHEMY_TABLE],
  ['炼金台', BLOOD_ALCHEMY_TABLE],
  ['炼金术台', BLOOD_ALCHEMY_TABLE],
  ['blood alchemy', BLOOD_ALCHEMY_TABLE],
  ['炼金台', BLOOD_ALCHEMY_TABLE],
  ['血炼金', BLOOD_ALCHEMY_TABLE],
  ['炼金台', BLOOD_ALCHEMY_TABLE],
  ['炼金术台', BLOOD_ALCHEMY_TABLE],
  ['工作台', STANDARD_CRAFTING],
  ['extreme crafting', AVARITIA_EXTREME_CRAFTING],
  ['dire crafting', AVARITIA_EXTREME_CRAFTING],
  ['有序终极合成', AVARITIA_EXTREME_CRAFTING],
  ['无序终极合成', AVARITIA_EXTREME_CRAFTING],
  ['终极合成', AVARITIA_EXTREME_CRAFTING],
  ['无尽工作台', AVARITIA_EXTREME_CRAFTING],
  ['无尽贪婪工作台', AVARITIA_EXTREME_CRAFTING],
];

const EXACT_ALIAS_MAP = new Map<string, UITypeConfig>(
  EXACT_ALIASES.map(([name, cfg]) => [name.toLowerCase(), cfg]),
);

function enrichUITypeConfig(
  config: UITypeConfig,
  presentationOverrides?: Partial<UIPresentationMeta>,
): UITypeConfig {
  return {
    ...config,
    presentation: {
      ...(PRESENTATION_BY_UI_TYPE[config.uiType] ?? DEFAULT_PRESENTATION),
      ...(config.presentation ?? {}),
      ...(presentationOverrides ?? {}),
    },
  };
}

function decodeLatin1Mojibake(input: string): string {
  try {
    const bytes = Uint8Array.from(input, (ch) => ch.charCodeAt(0) & 0xff);
    const decoded = new TextDecoder('utf-8').decode(bytes);
    if (!decoded || decoded.includes('\uFFFD') || !CJK_CHAR.test(decoded)) {
      return input;
    }
    return decoded;
  } catch {
    return input;
  }
}

function normalizeMachineType(machineType: string): string {
  const base = machineType.trim();
  const decoded = decodeLatin1Mojibake(base);
  const preferDecoded =
    decoded !== base &&
    COMMON_MACHINE_CHINESE.test(decoded) &&
    !COMMON_MACHINE_CHINESE.test(base);
  const chosen = preferDecoded ? decoded : base;
  return chosen.replace(/[?？]+$/g, '').trim().toLowerCase();
}

function detectBaseUIType(machineType: string): UITypeConfig {
  if (!machineType) {
    return STANDARD_CRAFTING;
  }

  const normalized = normalizeMachineType(machineType);
  if (
    normalized.includes('extreme crafting') ||
    normalized.includes('dire crafting') ||
    normalized.includes('有序终极合成') ||
    normalized.includes('无序终极合成') ||
    normalized.includes('终极合成') ||
    normalized.includes('无尽工作台') ||
    normalized.includes('无尽贪婪工作台') ||
    normalized.includes('无尽')
  ) {
    return AVARITIA_EXTREME_CRAFTING;
  }
  if (
    normalized.includes('binding ritual') ||
    normalized.includes('缁戝畾浠紡')
  ) {
    return BLOOD_BINDING_RITUAL;
  }
  if (
    normalized.includes('blood orb') ||
    normalized.includes('琛€瀹濈彔') ||
    normalized.includes('鐗瑰畾琛€瀹濈彔鍚堟垚') ||
    normalized.includes('涓嶅畾琛€瀹濈彔鍚堟垚')
  ) {
    return BLOOD_ORB_CRAFTING;
  }
  if (
    normalized.includes('bloodmagic') ||
    normalized.includes('blood magic') ||
    normalized.includes('blood altar') ||
    normalized.includes('血之祭坛') ||
    normalized.includes('血祭坛')
  ) {
    if (
      normalized.includes('alchemy') ||
      normalized.includes('炼金')
    ) {
      return BLOOD_ALCHEMY_TABLE;
    }
    return BLOOD_MAGIC_ALTAR;
  }
  if (
    normalized.includes('chemical reactor') ||
    normalized.includes('large chemical reactor') ||
    normalized.includes('\u5316\u5b66\u53cd\u5e94\u91dc') ||
    normalized.includes('\u5927\u578b\u5316\u5b66\u53cd\u5e94\u91dc') ||
    normalized.includes('\u5316\u5de5\u53cd\u5e94\u91dc')
  ) {
    return GT_CHEMICAL_REACTOR;
  }
  if (
    normalized.includes('gregtech') &&
    (normalized.includes('assembly line') || normalized.includes('\u88c5\u914d\u7ebf'))
  ) {
    return GT_ASSEMBLY_LINE;
  }
  if (
    normalized.includes('gregtech') &&
    (normalized.includes('research station') || normalized.includes('研究站'))
  ) {
    return GT_RESEARCH_STATION;
  }
  if (normalized.includes('gregtech')) {
    return GT_GENERIC;
  }
  const exact = EXACT_ALIAS_MAP.get(normalized);
  if (exact) {
    return exact;
  }

  for (const [keyword, config] of KEYWORD_ALIASES) {
    if (normalized.includes(keyword.toLowerCase())) {
      return config;
    }
  }

  return STANDARD_CRAFTING;
}

export function detectUIType(machineType: string): UITypeConfig {
  return enrichUITypeConfig(detectBaseUIType(machineType));
}

function getCombinedDescriptor(input: RecipePresentationInput): string {
  const { machineType, recipeType, recipeTypeData } = input;

  return [
    machineType ?? '',
    recipeType ?? '',
    typeof recipeTypeData?.id === 'string' ? recipeTypeData.id : '',
    typeof recipeTypeData?.type === 'string' ? recipeTypeData.type : '',
    typeof recipeTypeData?.category === 'string' ? recipeTypeData.category : '',
    typeof recipeTypeData?.machineType === 'string' ? recipeTypeData.machineType : '',
  ].join(' ').toLowerCase();
}

function looksLikeCraftingSurface(text: string): boolean {
  return (
    text.includes('crafting')
    || text.includes('shaped')
    || text.includes('shapeless')
    || text.includes('minecraft')
    || text.includes('worktable')
    || text.includes('work bench')
    || text.includes('workbench')
    || text.includes('有序合成')
    || text.includes('无序合成')
    || text.includes('工作台')
  );
}

function getMergedMeta(input: RecipePresentationInput): Record<string, unknown> {
  return {
    ...(input.additionalData && typeof input.additionalData === 'object' ? input.additionalData : {}),
    ...(input.metadata && typeof input.metadata === 'object' ? input.metadata : {}),
  };
}

function getInputMetrics(inputs: RecipePresentationInput['inputs']): {
  width: number;
  height: number;
  slotCount: number;
} {
  const rows = Array.isArray(inputs) ? inputs : [];
  const height = rows.length;
  const width = rows.length > 0
    ? Math.max(...rows.map((row) => (Array.isArray(row) ? row.length : 0)))
    : 0;

  return {
    width,
    height,
    slotCount: width * height,
  };
}

function createPresentationProfile(
  config: UITypeConfig,
  options?: {
    preferDetailedCrafting?: boolean;
    reason?: string;
    sourceUiType?: string;
    presentationOverrides?: Partial<UIPresentationMeta>;
  },
): RecipePresentationProfile {
  const uiConfig = enrichUITypeConfig(config, options?.presentationOverrides);
  return {
    uiConfig,
    component: uiConfig.component,
    renderMode: options?.preferDetailedCrafting && uiConfig.uiType === 'standard_crafting'
      ? 'detailed_crafting'
      : 'component',
    reason: options?.reason ?? `detected:${uiConfig.uiType}`,
    sourceUiType: options?.sourceUiType ?? uiConfig.uiType,
  };
}

export function resolveRecipePresentationProfile(
  input: RecipePresentationInput,
): RecipePresentationProfile {
  const machineType = input.machineType ?? '';
  const recipeType = input.recipeType ?? '';
  const combined = getCombinedDescriptor(input);
  const mergedMeta = getMergedMeta(input);
  const inputMetrics = getInputMetrics(input.inputs);
  const craftingSurface = looksLikeCraftingSurface(combined);
  const fluidDim = input.recipeTypeData?.fluidInputDimension;
  const hasFluidLayout =
    Boolean(fluidDim?.width && fluidDim.width > 0)
    || Boolean(fluidDim?.height && fluidDim.height > 0)
    || Array.isArray((input.additionalData as Record<string, unknown> | null | undefined)?.fluidInputs)
    || Array.isArray((input.additionalData as Record<string, unknown> | null | undefined)?.fluidOutputs)
    || Array.isArray((input.metadata as Record<string, unknown> | null | undefined)?.fluidInputs)
    || Array.isArray((input.metadata as Record<string, unknown> | null | undefined)?.fluidOutputs);
  const hasMachineMetrics =
    typeof mergedMeta.voltage === 'number'
    || typeof mergedMeta.euPerTick === 'number'
    || typeof mergedMeta.eut === 'number'
    || typeof mergedMeta.EUt === 'number'
    || typeof mergedMeta.duration === 'number'
    || typeof mergedMeta.totalEU === 'number'
    || typeof mergedMeta.amperage === 'number'
    || Boolean(mergedMeta.requiresCleanroom)
    || Boolean(mergedMeta.requiresLowGravity);

  if (mergedMeta.isMultiblockBlueprint || mergedMeta.multiblockBlueprint) {
    return createPresentationProfile(MULTIBLOCK_BLUEPRINT, {
      reason: 'metadata:multiblock_blueprint',
    });
  }

  if (
    combined.includes('alchemy array') ||
    combined.includes('alchemy table') ||
    combined.includes('blood alchemy') ||
    combined.includes('锟斤拷锟斤拷台') ||
    combined.includes('锟斤拷锟斤拷锟斤拷台') ||
    combined.includes('血锟斤拷锟斤拷')
  ) {
    return createPresentationProfile(BLOOD_ALCHEMY_TABLE, {
      reason: 'combined:blood_alchemy_table',
    });
  }

  if (
    combined.includes('alloy smelter') ||
    combined.includes('\u5408\u91d1\u7089')
  ) {
    return createPresentationProfile(GT_ALLOY_SMELTER, {
      reason: 'combined:gt_alloy_smelter',
    });
  }

  if (
    combined.includes('chemical reactor') ||
    combined.includes('large chemical reactor') ||
    combined.includes('\u5316\u5b66\u53cd\u5e94\u91dc') ||
    combined.includes('\u5927\u578b\u5316\u5b66\u53cd\u5e94\u91dc') ||
    combined.includes('\u5316\u5de5\u53cd\u5e94\u91dc')
  ) {
    return createPresentationProfile(GT_CHEMICAL_REACTOR, {
      reason: 'combined:gt_chemical_reactor',
    });
  }

  if (
    combined.includes('molecular') ||
    combined.includes('分子')
  ) {
    return createPresentationProfile(GT_MOLECULAR, {
      reason: 'combined:gt_molecular',
    });
  }

  if (
    combined.includes('electrolyzer') ||
    combined.includes('电解')
  ) {
    return createPresentationProfile(GT_ELECTROLYZER, {
      reason: 'combined:gt_electrolyzer',
    });
  }

  if (
    combined.includes('industrial blast furnace') ||
    combined.includes('blast furnace') ||
    combined.includes('高炉') ||
    combined.includes('工业高炉')
  ) {
    return createPresentationProfile(GT_BLAST_FURNACE, {
      reason: 'combined:gt_blast_furnace',
    });
  }

  if (
    combined.includes('electric furnace') ||
    combined.includes('电炉')
  ) {
    return createPresentationProfile(GT_ELECTRIC_FURNACE, {
      reason: 'combined:gt_electric_furnace',
    });
  }

  if (
    combined.includes('mana pool') ||
    combined.includes('魔力池') ||
    combined.includes('魔力灌注')
  ) {
    return createPresentationProfile(BOTANIA_MANA_POOL, {
      reason: 'combined:botania_mana_pool',
    });
  }

  if (
    combined.includes('rune altar') ||
    combined.includes('符文祭坛')
  ) {
    return createPresentationProfile(BOTANIA_RUNE_ALTAR, {
      reason: 'combined:botania_rune_altar',
    });
  }

  if (
    combined.includes('terra plate') ||
    combined.includes('泰拉凝聚板')
  ) {
    return createPresentationProfile(BOTANIA_TERRA_PLATE, {
      reason: 'combined:botania_terra_plate',
    });
  }

  if (
    combined.includes('elven trade') ||
    combined.includes('精灵交易')
  ) {
    return createPresentationProfile(BOTANIA_ELVEN_TRADE, {
      reason: 'combined:botania_elven_trade',
    });
  }

  if (
    combined.includes('binding ritual') ||
    combined.includes('缁戝畾浠紡')
  ) {
    return createPresentationProfile(BLOOD_BINDING_RITUAL, {
      reason: 'combined:blood_binding_ritual',
    });
  }

  if (
    combined.includes('blood orb') ||
    combined.includes('specific blood orb') ||
    combined.includes('indefinite blood orb') ||
    combined.includes('特定血宝珠合成') ||
    combined.includes('不定血宝珠合成')
  ) {
    return createPresentationProfile(STANDARD_CRAFTING, {
      preferDetailedCrafting: input.preferDetailedCrafting,
      reason: 'combined:blood_orb_crafting:workbench_override',
      sourceUiType: BLOOD_ORB_CRAFTING.uiType,
    });
  }

  if (
    combined.includes('bloodmagic') ||
    combined.includes('blood magic') ||
    combined.includes('blood altar') ||
    combined.includes('血之锟斤拷坛') ||
    combined.includes('血锟斤拷坛') ||
    typeof mergedMeta.bloodCost === 'number' ||
    typeof mergedMeta.lpCost === 'number' ||
    typeof mergedMeta.requiredLP === 'number'
  ) {
    return createPresentationProfile(BLOOD_MAGIC_ALTAR, {
      reason: 'combined:blood_magic_altar',
    });
  }

  if (
    mergedMeta.specialRecipeType === 'NEI_Thaumcraft' &&
    mergedMeta.thaumcraftLayout === 'infusion'
  ) {
    return createPresentationProfile(THAUMCRAFT_INFUSION, {
      reason: 'metadata:nei_thaumcraft_infusion',
    });
  }

  if (
    mergedMeta.specialRecipeType === 'NEI_Thaumcraft' &&
    mergedMeta.thaumcraftLayout === 'arcane'
  ) {
    return createPresentationProfile(THAUMCRAFT_ARCANE, {
      reason: 'metadata:nei_thaumcraft_arcane',
    });
  }

  const normalizedPrimary = (machineType || recipeType || 'Crafting (Shaped)').toLowerCase();
  if (
    normalizedPrimary.includes('物品中的要素') ||
    normalizedPrimary.includes('要素组合') ||
    normalizedPrimary.includes('aspect combination') ||
    normalizedPrimary.includes('aspects from items')
  ) {
    return createPresentationProfile(THAUMCRAFT_ASPECT, {
      reason: 'combined:thaumcraft_aspect',
    });
  }

  if (
    normalizedPrimary.includes('crucible') ||
    normalizedPrimary.includes('坩埚') ||
    normalizedPrimary.includes('\u5769\u57da')
  ) {
    return createPresentationProfile(THAUMCRAFT_CRUCIBLE, {
      reason: 'combined:thaumcraft_crucible',
    });
  }

  if (
    normalizedPrimary.includes('infusion') ||
    normalizedPrimary.includes('注魔') ||
    normalizedPrimary.includes('锟斤拷注') ||
    normalizedPrimary.includes('锟斤拷锟斤拷注魔') ||
    normalizedPrimary.includes('魔锟斤拷锟斤拷注')
  ) {
    return createPresentationProfile(THAUMCRAFT_INFUSION, {
      reason: 'combined:thaumcraft_infusion',
    });
  }

  if (
    normalizedPrimary.includes('arcane') ||
    normalizedPrimary.includes('ordered arcane') ||
    normalizedPrimary.includes('shapeless arcane') ||
    normalizedPrimary.includes('奥术') ||
    normalizedPrimary.includes('有序奥术') ||
    normalizedPrimary.includes('无序奥术')
  ) {
    return createPresentationProfile(THAUMCRAFT_ARCANE, {
      reason: 'combined:thaumcraft_arcane',
    });
  }

  if (
    mergedMeta.aspects &&
    typeof mergedMeta.aspects === 'object' &&
    (
      normalizedPrimary.includes('crafting') ||
      normalizedPrimary.includes('worktable') ||
      normalizedPrimary.includes('有序') ||
      normalizedPrimary.includes('无序')
    )
  ) {
    return createPresentationProfile(THAUMCRAFT_ARCANE, {
      reason: 'metadata:thaumcraft_arcane_aspects',
    });
  }

  const detected = detectUIType(machineType || recipeType);
  if (detected.uiType === 'standard_crafting') {
    if (craftingSurface) {
      return createPresentationProfile(STANDARD_CRAFTING, {
        preferDetailedCrafting: input.preferDetailedCrafting,
        reason: 'crafting_surface:standard',
        sourceUiType: detected.uiType,
      });
    }

    if (
      inputMetrics.width <= 3
      && inputMetrics.height <= 3
      && inputMetrics.slotCount <= 9
      && !hasFluidLayout
      && !hasMachineMetrics
    ) {
      return createPresentationProfile(STANDARD_CRAFTING, {
        preferDetailedCrafting: input.preferDetailedCrafting,
        reason: 'crafting_layout:standard',
        sourceUiType: detected.uiType,
      });
    }

    if (machineType.trim()) {
      return createPresentationProfile(GT_GENERIC, {
        reason: 'fallback:machine_type_present',
        sourceUiType: detected.uiType,
      });
    }
    if (inputMetrics.width > 3 || inputMetrics.height > 3 || inputMetrics.slotCount > 9) {
      return createPresentationProfile(GT_GENERIC, {
        reason: 'oversized_crafting:gt_generic',
        sourceUiType: detected.uiType,
        presentationOverrides: {
          density: 'oversized',
        },
      });
    }
  }

  return createPresentationProfile(detected, {
    preferDetailedCrafting: input.preferDetailedCrafting,
  });
}

export function getAllUITypes(): string[] {
  return Array.from(
    new Set(
      [
        AVARITIA_EXTREME_CRAFTING,
        STANDARD_CRAFTING,
        FURNACE,
        GT_GENERIC,
        GT_RESEARCH_STATION,
        GT_ASSEMBLER,
        GT_ASSEMBLY_LINE,
        GT_ALLOY_SMELTER,
        GT_CHEMICAL_REACTOR,
        GT_MOLECULAR,
        GT_ELECTROLYZER,
        GT_BLAST_FURNACE,
        GT_ELECTRIC_FURNACE,
        BOTANIA_MANA_POOL,
        BOTANIA_PURE_DAISY,
        BOTANIA_TERRA_PLATE,
        BOTANIA_RUNE_ALTAR,
        BOTANIA_ELVEN_TRADE,
        THAUMCRAFT_ARCANE,
        THAUMCRAFT_INFUSION,
        THAUMCRAFT_CRUCIBLE,
        THAUMCRAFT_ASPECT,
        THAUMCRAFT_RESEARCH,
        BLOOD_MAGIC_ALTAR,
        BLOOD_ALCHEMY_TABLE,
        BLOOD_BINDING_RITUAL,
        BLOOD_ORB_CRAFTING,
        MULTIBLOCK_BLUEPRINT,
      ].map((config) => config.uiType),
    ),
  );
}

export function isUIType(machineType: string, uiType: string): boolean {
  return detectUIType(machineType).uiType === uiType;
}

const UI_CONFIG_BY_TYPE: Record<string, UITypeConfig> = {
  [STANDARD_CRAFTING.uiType]: STANDARD_CRAFTING,
  [AVARITIA_EXTREME_CRAFTING.uiType]: AVARITIA_EXTREME_CRAFTING,
  [FURNACE.uiType]: FURNACE,
  [GT_GENERIC.uiType]: GT_GENERIC,
  [GT_RESEARCH_STATION.uiType]: GT_RESEARCH_STATION,
  [GT_ASSEMBLER.uiType]: GT_ASSEMBLER,
  [GT_ASSEMBLY_LINE.uiType]: GT_ASSEMBLY_LINE,
  [GT_ALLOY_SMELTER.uiType]: GT_ALLOY_SMELTER,
  [GT_CHEMICAL_REACTOR.uiType]: GT_CHEMICAL_REACTOR,
  [GT_MOLECULAR.uiType]: GT_MOLECULAR,
  [GT_ELECTROLYZER.uiType]: GT_ELECTROLYZER,
  [GT_BLAST_FURNACE.uiType]: GT_BLAST_FURNACE,
  [GT_ELECTRIC_FURNACE.uiType]: GT_ELECTRIC_FURNACE,
  [BOTANIA_MANA_POOL.uiType]: BOTANIA_MANA_POOL,
  [BOTANIA_PURE_DAISY.uiType]: BOTANIA_PURE_DAISY,
  [BOTANIA_TERRA_PLATE.uiType]: BOTANIA_TERRA_PLATE,
  [BOTANIA_RUNE_ALTAR.uiType]: BOTANIA_RUNE_ALTAR,
  [BOTANIA_ELVEN_TRADE.uiType]: BOTANIA_ELVEN_TRADE,
  [THAUMCRAFT_ARCANE.uiType]: THAUMCRAFT_ARCANE,
  [THAUMCRAFT_INFUSION.uiType]: THAUMCRAFT_INFUSION,
  [THAUMCRAFT_CRUCIBLE.uiType]: THAUMCRAFT_CRUCIBLE,
  [THAUMCRAFT_ASPECT.uiType]: THAUMCRAFT_ASPECT,
  [THAUMCRAFT_RESEARCH.uiType]: THAUMCRAFT_RESEARCH,
  [BLOOD_MAGIC_ALTAR.uiType]: BLOOD_MAGIC_ALTAR,
  [BLOOD_ALCHEMY_TABLE.uiType]: BLOOD_ALCHEMY_TABLE,
  [BLOOD_BINDING_RITUAL.uiType]: BLOOD_BINDING_RITUAL,
  [BLOOD_ORB_CRAFTING.uiType]: BLOOD_ORB_CRAFTING,
  [MULTIBLOCK_BLUEPRINT.uiType]: MULTIBLOCK_BLUEPRINT,
};

const FAMILY_KEY_TO_UI_TYPE: Record<string, string> = {
  botania_terra_plate: BOTANIA_TERRA_PLATE.uiType,
  botania_rune_altar: BOTANIA_RUNE_ALTAR.uiType,
  botania_mana_pool: BOTANIA_MANA_POOL.uiType,
  thaumcraft_infusion: THAUMCRAFT_INFUSION.uiType,
  blood_magic_altar: BLOOD_MAGIC_ALTAR.uiType,
};

export function resolveRecipePresentationProfileFromUiPayload(
  uiPayload: RecipeUiPayload | null | undefined,
): RecipePresentationProfile | null {
  if (!uiPayload?.familyKey) {
    return null;
  }

  const uiType = FAMILY_KEY_TO_UI_TYPE[uiPayload.familyKey];
  if (!uiType) {
    return null;
  }

  const baseConfig = UI_CONFIG_BY_TYPE[uiType];
  if (!baseConfig) {
    return null;
  }

  return createPresentationProfile(baseConfig, {
    reason: `ui_payload:${uiPayload.familyKey}`,
    sourceUiType: uiType,
    presentationOverrides: {
      surface:
        uiPayload.presentation?.surface === 'nature_ritual' || uiPayload.presentation?.surface === 'ritual'
          ? 'ritual'
          : undefined,
      density:
        uiPayload.presentation?.density === 'wide'
          ? 'oversized'
          : undefined,
    },
  });
}
