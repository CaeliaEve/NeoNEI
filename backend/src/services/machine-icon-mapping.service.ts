type MachineIconRecord = {
  itemId: string;
  imageFileName: string;
};

type MachineIconItem = {
  itemId: string;
  modId: string;
  internalName: string;
  localizedName: string;
  imageFileName: string;
};

type GtTier =
  | 'ULV'
  | 'LV'
  | 'MV'
  | 'HV'
  | 'EV'
  | 'IV'
  | 'LuV'
  | 'ZPM'
  | 'UV'
  | 'UHV'
  | 'UEV'
  | 'UIV'
  | 'UMV'
  | 'UXV'
  | 'MAX';

type TieredGtFamily = {
  patterns: RegExp[];
  metas: Partial<Record<GtTier, number>>;
  fallback: number;
};

interface RecipeWithMachineInfo {
  machineInfo?: {
    machineType?: string;
    machineIcon?: unknown;
  };
}

const GT_TIER_ORDER: GtTier[] = [
  'ULV',
  'LV',
  'MV',
  'HV',
  'EV',
  'IV',
  'LuV',
  'ZPM',
  'UV',
  'UHV',
  'UEV',
  'UIV',
  'UMV',
  'UXV',
  'MAX',
];

const THAUMCRAFT_CRUCIBLE_PATTERNS = [
  /\bcrucible\b/i,
  /\u5769\u57da/,
];

const THAUMCRAFT_ARCANE_INFUSION_PATTERNS = [
  /\barcane infusion\b/i,
  /\u5965\u672f\u6ce8\u9b54/,
];

const THAUMCRAFT_ARCANE_WORKTABLE_PATTERNS = [
  /\barcane worktable\b/i,
  /\u5965\u672f\u5de5\u4f5c\u53f0/,
  /\u5965\u672f\u5408\u6210/,
];

const BLOOD_ALTAR_PATTERNS = [
  /\bblood altar\b/i,
  /\u8840\u4e4b\u796d\u575b/,
  /\u8840\u796d\u575b/,
];

const BOTANIA_MANA_POOL_PATTERNS = [
  /\bmana pool\b/i,
  /\u9b54\u529b\u6c60/,
];

const BOTANIA_RUNE_ALTAR_PATTERNS = [
  /\brune altar\b/i,
  /\u7b26\u6587\u796d\u575b/,
];

const BOTANIA_PURE_DAISY_PATTERNS = [
  /\bpure daisy\b/i,
  /\u767d\u96cf\u83ca/,
];

const BOTANIA_TERRA_PLATE_PATTERNS = [
  /\bterra plate\b/i,
  /\u6cf0\u62c9\u51dd\u805a\u677f/,
];

const CRAFTING_TABLE_PATTERNS = [
  /^Crafting \(Shaped\)$/i,
  /^Crafting \(Shapeless\)$/i,
  /^Shaped IC2 Crafting$/i,
  /^Microblock Crafting$/i,
  /\u6709\u5e8f\u5408\u6210/,
  /\u65e0\u5e8f\u5408\u6210/,
];

const FURNACE_PATTERNS = [
  /^Furnace$/i,
  /\u70e7\u5236/,
  /\u70df\u718f/,
  /\u71c3\u6599/,
];

const BINDING_RITUAL_PATTERNS = [
  /\bbinding ritual\b/i,
  /\u7ed1\u5b9a\u4eea\u5f0f/,
];

const ALCHEMY_ARRAY_PATTERNS = [
  /\balchemy array\b/i,
  /\u70bc\u91d1\u9635/,
  /\u70bc\u91d1\u6cd5\u9635/,
];

const IC2_CROP_BREEDING_PATTERNS = [
  /\bic2 crop breeding\b/i,
];

const NASA_WORKBENCH_PATTERNS = [
  /\bnasa workbench\b/i,
  /\u004e\u0041\u0053\u0041\u5de5\u4f5c\u53f0/,
  /\u00a79NASA Workbench/i,
  /\u00a79NASA\u5de5\u4f5c\u53f0/,
];

const TCONSTRUCT_CASTING_TABLE_PATTERNS = [
  /\u6d47\u94f8\u53f0/,
];

const TCONSTRUCT_CASTING_BASIN_PATTERNS = [
  /\u94f8\u9020\u76c6/,
];

const FORESTRY_BEE_PATTERNS = [
  /\u871c\u8702\u6742\u4ea4/,
  /\u871c\u8702\u4ea7\u7269/,
  /\u871c\u8702\u80b2\u79cd\u6811/,
];

const FORESTRY_TREE_PATTERNS = [
  /\u6811\u6728\u6742\u4ea4/,
  /\u6811\u6728\u4ea7\u7269/,
];

const BOTANIA_LEXICON_PATTERNS = [
  /\u690d\u7269\u9b54\u6cd5\u8f9e\u5178/,
];

const BOTANIA_FLOATING_FLOWER_PATTERNS = [
  /\u6d6e\u7a7a\u82b1/,
];

const BOTANIA_BREWERY_PATTERNS = [
  /\u690d\u7269\u9140\u9020/,
  /\u917f\u9020/,
];

const BOTANIA_PETAL_APOTHECARY_PATTERNS = [
  /\bpetal apothecary\b/i,
  /\u82b1\u836f\u53f0/,
];

const WITCHERY_SPINNING_WHEEL_PATTERNS = [
  /\u8f6c\u8f6e/,
  /\u7eba\u8f66/,
];

const TCONSTRUCT_DRYING_RACK_PATTERNS = [
  /\u667e\u5e72\u67b6/,
];

const GENETICS_PCR_PATTERNS = [
  /\u0050\u0043\u0052\u4eea/,
];

const THAUMCRAFT_ITEM_ASPECT_PATTERNS = [
  /\u7269\u54c1\u4e2d\u7684\u8981\u7d20/,
];

const THAUMCRAFT_ASPECT_COMBINATION_PATTERNS = [
  /\u8981\u7d20\u7ec4\u5408/,
];

const EXTREME_CRAFTING_PATTERNS = [
  /^Extreme Crafting$/i,
  /\u6709\u5e8f\u7ec8\u6781\u5408\u6210/,
  /\u65e0\u5e8f\u7ec8\u6781\u5408\u6210/,
];

const BLOOD_ORB_PATTERNS = [
  /\u7279\u5b9a\u8840\u5b9d\u73e0\u5408\u6210/,
  /\u4e0d\u5b9a\u8840\u5b9d\u73e0\u5408\u6210/,
];

const ELVEN_TRADE_PATTERNS = [
  /\belven trade\b/i,
];

const SOUL_BINDING_PATTERNS = [
  /\u7075\u9b42\u7ed1\u5b9a\u5668/,
  /\bsoul crafting\b/i,
];

const WITCHERY_KETTLE_PATTERNS = [
  /\u6c34\u58f6/,
  /\u5deb\u5e08\u70bc\u836f\u9505/,
];

const EXTRA_UTILITIES_PATTERNS = [
  /^Extra Utilities$/i,
];

const EXTRA_UTILITIES_MICROBLOCK_PATTERNS = [
  /^Extra Utilities: Microblocks$/i,
];

const SCRAPBOX_PATTERNS = [
  /^Scrapbox$/i,
];

const BARTWORKS_ORES_PATTERNS = [
  /^BartWorks Ores$/i,
];

const ALCHEMIC_CALCINATOR_PATTERNS = [
  /^Alchemic Calcinator$/i,
];

const IMBUING_STATION_PATTERNS = [
  /^Imbuing Station$/i,
];

const QED_PATTERNS = [
  /^QED Recipes$/i,
];

const FLOWER_BREEDING_PATTERNS = [
  /花卉杂交/,
];

const ORE_VEIN_INFO_PATTERNS = [
  /矿脉信息/,
];

const AE2_WORLD_CRAFTING_PATTERNS = [
  /AE2在世界中的合成/,
];

const HUMIDIFIER_PATTERNS = [
  /加湿器/,
];

const INTEGRATED_TABLE_PATTERNS = [
  /集成台/,
];

const REACTOR_PATTERNS = [
  /反应堆/,
];

const DECAY_PATTERNS = [
  /可衰变/,
];

const GENE_TEMPLATE_PATTERNS = [
  /基因模板/,
];

const FIREWORK_PATTERNS = [
  /烟花/,
];

const MANIPULATOR_UPGRADE_PATTERNS = [
  /操纵者升级/,
  /操纵者.*升级/,
];

const DIRECT_ICON_PATTERNS: Array<{ patterns: RegExp[]; icon: MachineIconRecord }> = [
  {
    patterns: THAUMCRAFT_CRUCIBLE_PATTERNS,
    icon: {
      itemId: 'i~Thaumcraft~blockMetalDevice~0',
      imageFileName: 'Thaumcraft/blockMetalDevice~0.gif',
    },
  },
  {
    patterns: THAUMCRAFT_ARCANE_INFUSION_PATTERNS,
    icon: {
      itemId: 'i~Thaumcraft~blockStoneDevice~2',
      imageFileName: 'Thaumcraft/blockStoneDevice~2.png',
    },
  },
  {
    patterns: THAUMCRAFT_ARCANE_WORKTABLE_PATTERNS,
    icon: {
      itemId: 'i~Thaumcraft~blockTable~15',
      imageFileName: 'Thaumcraft/blockTable~15.png',
    },
  },
  {
    patterns: BLOOD_ALTAR_PATTERNS,
    icon: {
      itemId: 'i~AWWayofTime~Altar~0',
      imageFileName: 'AWWayofTime/Altar~0.png',
    },
  },
  {
    patterns: BOTANIA_MANA_POOL_PATTERNS,
    icon: {
      itemId: 'i~Botania~pool~0',
      imageFileName: 'Botania/pool~0.png',
    },
  },
  {
    patterns: BOTANIA_RUNE_ALTAR_PATTERNS,
    icon: {
      itemId: 'i~Botania~runeAltar~0',
      imageFileName: 'Botania/runeAltar~0.png',
    },
  },
  {
    patterns: BOTANIA_PURE_DAISY_PATTERNS,
    icon: {
      itemId: 'i~Botania~specialFlower~0~BVmnjzvOML-Ap_zxeMIMOw==',
      imageFileName: 'Botania/specialFlower~0~BVmnjzvOML-Ap_zxeMIMOw==.png',
    },
  },
  {
    patterns: BOTANIA_TERRA_PLATE_PATTERNS,
    icon: {
      itemId: 'i~Botania~terraPlate~0',
      imageFileName: 'Botania/terraPlate~0.png',
    },
  },
  {
    patterns: CRAFTING_TABLE_PATTERNS,
    icon: {
      itemId: 'i~minecraft~crafting_table~0',
      imageFileName: 'minecraft/crafting_table~0.png',
    },
  },
  {
    patterns: FURNACE_PATTERNS,
    icon: {
      itemId: 'i~minecraft~furnace~0',
      imageFileName: 'minecraft/furnace~0.png',
    },
  },
  {
    patterns: BINDING_RITUAL_PATTERNS,
    icon: {
      itemId: 'i~AWWayofTime~ritualStone~0',
      imageFileName: 'AWWayofTime/ritualStone~0.png',
    },
  },
  {
    patterns: ALCHEMY_ARRAY_PATTERNS,
    icon: {
      itemId: 'i~AWWayofTime~ritualStone~0',
      imageFileName: 'AWWayofTime/ritualStone~0.png',
    },
  },
  {
    patterns: IC2_CROP_BREEDING_PATTERNS,
    icon: {
      itemId: 'i~IC2~blockCrop~0',
      imageFileName: 'IC2/blockCrop~0.png',
    },
  },
  {
    patterns: NASA_WORKBENCH_PATTERNS,
    icon: {
      itemId: 'i~GalacticraftCore~tile.rocketWorkbench~0',
      imageFileName: 'GalacticraftCore/tile.rocketWorkbench~0.png',
    },
  },
  {
    patterns: TCONSTRUCT_CASTING_TABLE_PATTERNS,
    icon: {
      itemId: 'i~TConstruct~Smeltery~0',
      imageFileName: 'TConstruct/Smeltery~0.png',
    },
  },
  {
    patterns: TCONSTRUCT_CASTING_BASIN_PATTERNS,
    icon: {
      itemId: 'i~TConstruct~Smeltery~1',
      imageFileName: 'TConstruct/Smeltery~1.png',
    },
  },
  {
    patterns: FORESTRY_BEE_PATTERNS,
    icon: {
      itemId: 'i~Forestry~beealyzer~0',
      imageFileName: 'Forestry/beealyzer~0.png',
    },
  },
  {
    patterns: FORESTRY_TREE_PATTERNS,
    icon: {
      itemId: 'i~Forestry~treealyzer~0',
      imageFileName: 'Forestry/treealyzer~0.png',
    },
  },
  {
    patterns: BOTANIA_LEXICON_PATTERNS,
    icon: {
      itemId: 'i~Botania~lexicon~0',
      imageFileName: 'Botania/lexicon~0.png',
    },
  },
  {
    patterns: BOTANIA_FLOATING_FLOWER_PATTERNS,
    icon: {
      itemId: 'i~Botania~specialFlower~0',
      imageFileName: 'Botania/specialFlower~0.png',
    },
  },
  {
    patterns: BOTANIA_BREWERY_PATTERNS,
    icon: {
      itemId: 'i~Botania~brewery~0',
      imageFileName: 'Botania/brewery~0.png',
    },
  },
  {
    patterns: BOTANIA_PETAL_APOTHECARY_PATTERNS,
    icon: {
      itemId: 'i~Botania~specialFlower~0',
      imageFileName: 'Botania/specialFlower~0.png',
    },
  },
  {
    patterns: WITCHERY_SPINNING_WHEEL_PATTERNS,
    icon: {
      itemId: 'i~witchery~spinningwheel~0',
      imageFileName: 'witchery/spinningwheel~0.png',
    },
  },
  {
    patterns: TCONSTRUCT_DRYING_RACK_PATTERNS,
    icon: {
      itemId: 'i~TConstruct~Armor.DryingRack~0',
      imageFileName: 'TConstruct/Armor.DryingRack~0.png',
    },
  },
  {
    patterns: GENETICS_PCR_PATTERNS,
    icon: {
      itemId: 'i~Genetics~machine~2',
      imageFileName: 'Genetics/machine~2.png',
    },
  },
  {
    patterns: THAUMCRAFT_ITEM_ASPECT_PATTERNS,
    icon: {
      itemId: 'i~Thaumcraft~ItemResearchNotes~0',
      imageFileName: 'Thaumcraft/ItemResearchNotes~0.png',
    },
  },
  {
    patterns: THAUMCRAFT_ASPECT_COMBINATION_PATTERNS,
    icon: {
      itemId: 'i~Thaumcraft~ItemResource~9',
      imageFileName: 'Thaumcraft/ItemResource~9.png',
    },
  },
  {
    patterns: EXTREME_CRAFTING_PATTERNS,
    icon: {
      itemId: 'i~Avaritia~Dire_Crafting~0',
      imageFileName: 'Avaritia/Dire_Crafting~0.png',
    },
  },
  {
    patterns: BLOOD_ORB_PATTERNS,
    icon: {
      itemId: 'i~AWWayofTime~apprenticeBloodOrb~0',
      imageFileName: 'AWWayofTime/apprenticeBloodOrb~0.png',
    },
  },
  {
    patterns: ELVEN_TRADE_PATTERNS,
    icon: {
      itemId: 'i~botanichorizons~automatedAlfPortal~0',
      imageFileName: 'botanichorizons/automatedAlfPortal~0.png',
    },
  },
  {
    patterns: SOUL_BINDING_PATTERNS,
    icon: {
      itemId: 'i~EnderIO~itemSoulVessel~0',
      imageFileName: 'EnderIO/itemSoulVessel~0.png',
    },
  },
  {
    patterns: WITCHERY_KETTLE_PATTERNS,
    icon: {
      itemId: 'i~witchery~kettle~0',
      imageFileName: 'witchery/kettle~0.png',
    },
  },
  {
    patterns: EXTRA_UTILITIES_PATTERNS,
    icon: {
      itemId: 'i~ExtraUtilities~chandelier~0',
      imageFileName: 'ExtraUtilities/chandelier~0.png',
    },
  },
  {
    patterns: EXTRA_UTILITIES_MICROBLOCK_PATTERNS,
    icon: {
      itemId: 'i~ExtraUtilities~microblocks~1',
      imageFileName: 'ExtraUtilities/microblocks~1.png',
    },
  },
  {
    patterns: SCRAPBOX_PATTERNS,
    icon: {
      itemId: 'i~IC2~itemScrapbox~0',
      imageFileName: 'IC2/itemScrapbox~0.png',
    },
  },
  {
    patterns: BARTWORKS_ORES_PATTERNS,
    icon: {
      itemId: 'i~bartworks~bw.blockores.01~9',
      imageFileName: 'bartworks/bw.blockores.01~9.png',
    },
  },
  {
    patterns: ALCHEMIC_CALCINATOR_PATTERNS,
    icon: {
      itemId: 'i~AWWayofTime~blockAlchemicCalcinator~0',
      imageFileName: 'AWWayofTime/blockAlchemicCalcinator~0.png',
    },
  },
  {
    patterns: IMBUING_STATION_PATTERNS,
    icon: {
      itemId: 'i~RandomThings~imbuingStation~0',
      imageFileName: 'RandomThings/imbuingStation~0.png',
    },
  },
  {
    patterns: QED_PATTERNS,
    icon: {
      itemId: 'i~ExtraUtilities~endConstructor~0',
      imageFileName: 'ExtraUtilities/endConstructor~0.png',
    },
  },
  {
    patterns: FLOWER_BREEDING_PATTERNS,
    icon: {
      itemId: 'i~Botania~specialFlower~0',
      imageFileName: 'Botania/specialFlower~0.png',
    },
  },
  {
    patterns: ORE_VEIN_INFO_PATTERNS,
    icon: {
      itemId: 'i~bartworks~bw.blockores.01~9',
      imageFileName: 'bartworks/bw.blockores.01~9.png',
    },
  },
  {
    patterns: AE2_WORLD_CRAFTING_PATTERNS,
    icon: {
      itemId: 'i~appliedenergistics2~tile.BlockQuartzGrowthAccelerator~0',
      imageFileName: 'appliedenergistics2/tile.BlockQuartzGrowthAccelerator~0.png',
    },
  },
  {
    patterns: HUMIDIFIER_PATTERNS,
    icon: {
      itemId: 'i~gendustry~ApiaryUpgrade~4',
      imageFileName: 'gendustry/ApiaryUpgrade~4.png',
    },
  },
  {
    patterns: INTEGRATED_TABLE_PATTERNS,
    icon: {
      itemId: 'i~GoodGenerator~componentAssemblylineCasing~0',
      imageFileName: 'GoodGenerator/componentAssemblylineCasing~0.png',
    },
  },
  {
    patterns: REACTOR_PATTERNS,
    icon: {
      itemId: 'i~IC2~blockReactorAccessHatch~0',
      imageFileName: 'IC2/blockReactorAccessHatch~0.png',
    },
  },
  {
    patterns: DECAY_PATTERNS,
    icon: {
      itemId: 'i~miscutils~blockDecayablesChest~0',
      imageFileName: 'miscutils/blockDecayablesChest~0.png',
    },
  },
  {
    patterns: GENE_TEMPLATE_PATTERNS,
    icon: {
      itemId: 'i~gendustry~GeneTemplate~0',
      imageFileName: 'gendustry/GeneTemplate~0.png',
    },
  },
  {
    patterns: FIREWORK_PATTERNS,
    icon: {
      itemId: 'i~minecraft~fireworks~0',
      imageFileName: 'minecraft/fireworks~0.png',
    },
  },
  {
    patterns: MANIPULATOR_UPGRADE_PATTERNS,
    icon: {
      itemId: 'i~matter-manipulator~metaitem~24',
      imageFileName: 'matter-manipulator/metaitem~24.png',
    },
  },
];

const GT_GENERIC_MACHINE_ICON_META = 11;

const GT_MULTIBLOCK_ICON_BY_FAMILY: Array<{
  patterns: RegExp[];
  itemId: string;
  imageFileName: string;
}> = [
  {
    patterns: [/\u88c5\u914d\u7ebf\u52a0\u5de5/, /\bassembly line\b/i, /\u7ec4\u88c5\u673a/, /\bassembler\b/i, /\bcircuit assembler\b/i],
    itemId: 'i~gregtech~gt.blockmachines~1170',
    imageFileName: 'gregtech/gt.blockmachines~1170.png',
  },
  {
    patterns: [/\u7814\u7a76\u7ad9/, /\bresearch station\b/i],
    itemId: 'i~gregtech~gt.blockmachines~15331',
    imageFileName: 'gregtech/gt.blockmachines~15331.png',
  },
  {
    patterns: [/\u592a\u7a7a\u7ec4\u88c5\u673a/, /\bspace assembler\b/i],
    itemId: 'i~gregtech~gt.blockmachines~14004',
    imageFileName: 'gregtech/gt.blockmachines~14004.png',
  },
  {
    patterns: [/\u538b\u7f29\u673a/, /\bcompressor\b/i],
    itemId: 'i~gregtech~gt.blockmachines~1001',
    imageFileName: 'gregtech/gt.blockmachines~1001.png',
  },
  {
    patterns: [/\u7535\u89e3\u673a/, /\belectrolyzer\b/i],
    itemId: 'i~gregtech~gt.blockmachines~796',
    imageFileName: 'gregtech/gt.blockmachines~796.png',
  },
  {
    patterns: [/\u79bb\u5fc3\u673a/, /\bcentrifuge\b/i],
    itemId: 'i~gregtech~gt.blockmachines~790',
    imageFileName: 'gregtech/gt.blockmachines~790.png',
  },
  {
    patterns: [/\u9ad8\u7089/, /\u5de5\u4e1a\u9ad8\u7089/, /\bblast furnace\b/i],
    itemId: 'i~gregtech~gt.blockmachines~1000',
    imageFileName: 'gregtech/gt.blockmachines~1000.png',
  },
  {
    patterns: [/\u5316\u5b66\u53cd\u5e94\u91dc/, /\bchemical reactor\b/i],
    itemId: 'i~gregtech~gt.blockmachines~1169',
    imageFileName: 'gregtech/gt.blockmachines~1169.png',
  },
  {
    patterns: [/\u6405\u62cc\u673a/, /\u5de5\u4e1a\u6405\u62cc\u673a/, /\bmixer\b/i],
    itemId: 'i~gregtech~gt.blockmachines~811',
    imageFileName: 'gregtech/gt.blockmachines~811.png',
  },
  {
    patterns: [/\u771f\u7a7a\u51b7\u51bb\u673a/, /\bvacuum freezer\b/i, /\u51db\u51b0\u51b7\u51bb\u673a/],
    itemId: 'i~gregtech~gt.blockmachines~12731',
    imageFileName: 'gregtech/gt.blockmachines~12731.png',
  },
  {
    patterns: [/\u6d17\u77ff\u673a/, /\u7b80\u6613\u6d17\u77ff\u6c60/, /\bore washer\b/i],
    itemId: 'i~gregtech~gt.blockmachines~850',
    imageFileName: 'gregtech/gt.blockmachines~850.png',
  },
  {
    patterns: [/\u7c89\u788e\u673a/, /\bcrusher\b/i, /\bmacerator\b/i],
    itemId: 'i~gregtech~gt.blockmachines~797',
    imageFileName: 'gregtech/gt.blockmachines~797.png',
  },
  {
    patterns: [/\u7535\u5f27\u7089/, /\barc furnace\b/i],
    itemId: 'i~gregtech~gt.blockmachines~862',
    imageFileName: 'gregtech/gt.blockmachines~862.png',
  },
  {
    patterns: [/\u5408\u91d1\u7089/, /\balloy smelter\b/i],
    itemId: 'i~gregtech~gt.blockmachines~31023',
    imageFileName: 'gregtech/gt.blockmachines~31023.png',
  },
  {
    patterns: [/\u6d41\u4f53\u56fa\u5316\u5668/, /\bfluid solidifier\b/i],
    itemId: 'i~gregtech~gt.blockmachines~10891',
    imageFileName: 'gregtech/gt.blockmachines~10891.png',
  },
  {
    patterns: [/\u6d41\u4f53\u63d0\u53d6\u673a/, /\u63d0\u53d6\u673a/, /\bextractor\b/i],
    itemId: 'i~gregtech~gt.blockmachines~2730',
    imageFileName: 'gregtech/gt.blockmachines~2730.png',
  },
  {
    patterns: [/\u6253\u5305\u673a/, /\bpackager\b/i],
    itemId: 'i~gregtech~gt.blockmachines~407',
    imageFileName: 'gregtech/gt.blockmachines~407.png',
  },
  {
    patterns: [/\u89e3\u5305\u5668/, /\bunpackager\b/i],
    itemId: 'i~gregtech~gt.blockmachines~418',
    imageFileName: 'gregtech/gt.blockmachines~418.png',
  },
  {
    patterns: [/\u8f66\u5e8a/, /\blathe\b/i],
    itemId: 'i~gregtech~gt.blockmachines~686',
    imageFileName: 'gregtech/gt.blockmachines~686.png',
  },
  {
    patterns: [/\u5377\u677f\u673a/, /\bbender\b/i],
    itemId: 'i~gregtech~gt.blockmachines~10801',
    imageFileName: 'gregtech/gt.blockmachines~10801.png',
  },
  {
    patterns: [/\u538b\u6a21\u673a/, /\bforming press\b/i, /\bextruder\b/i, /\u51b2\u538b\u673a\u5e8a/],
    itemId: 'i~gregtech~gt.blockmachines~859',
    imageFileName: 'gregtech/gt.blockmachines~859.png',
  },
  {
    patterns: [/\u677f\u6750\u5207\u5272\u673a/, /\bcutting machine\b/i, /\bcutter\b/i],
    itemId: 'i~gregtech~gt.blockmachines~10821',
    imageFileName: 'gregtech/gt.blockmachines~10821.png',
  },
  {
    patterns: [/\u6fc0\u5149\u8680\u523b\u673a/, /\blaser engraver\b/i],
    itemId: 'i~gregtech~gt.blockmachines~3004',
    imageFileName: 'gregtech/gt.blockmachines~3004.png',
  },
  {
    patterns: [/\u0050\u0043\u0042\u5de5\u5382/, /\bpcb\b/i],
    itemId: 'i~gregtech~gt.blockmachines~356',
    imageFileName: 'gregtech/gt.blockmachines~356.png',
  },
  {
    patterns: [/\u592a\u9633\u80fd\u677f\u5236\u9020\u5382/, /\bsolar panel\b/i],
    itemId: 'i~gregtech~gt.blockmachines~367',
    imageFileName: 'gregtech/gt.blockmachines~367.png',
  },
  {
    patterns: [/\u805a\u7206\u538b\u7f29\u673a/, /\bimplosion compressor\b/i],
    itemId: 'i~gregtech~gt.blockmachines~1001',
    imageFileName: 'gregtech/gt.blockmachines~1001.png',
  },
  {
    patterns: [/\u5316\u5de5\u5382/, /\bchemical plant\b/i],
    itemId: 'i~gregtech~gt.blockmachines~998',
    imageFileName: 'gregtech/gt.blockmachines~998.png',
  },
];

const GT_FAMILY_MAP: TieredGtFamily[] = [
  {
    patterns: [/\u88c5\u914d\u7ebf\u52a0\u5de5/, /\bassembly line\b/i],
    metas: { ULV: 145, LV: 145, MV: 146, HV: 147, EV: 147, IV: 147, LuV: 147, ZPM: 147, UV: 147, UHV: 147, UEV: 147, UIV: 147, UMV: 147, UXV: 147, MAX: 147 },
    fallback: 145,
  },
  {
    patterns: [/\u7814\u7a76\u7ad9/, /\bresearch station\b/i],
    metas: { ULV: 341, LV: 342, MV: 343, HV: 344, EV: 345, IV: 345, LuV: 345, ZPM: 345, UV: 345, UHV: 345, UEV: 345, UIV: 345, UMV: 345, UXV: 345, MAX: 345 },
    fallback: 345,
  },
  {
    patterns: [/\u592a\u7a7a\u7ec4\u88c5\u673a/, /\bspace assembler\b/i],
    metas: { ZPM: 215, UV: 215, UHV: 215, UEV: 215, UIV: 215 },
    fallback: 215,
  },
  {
    patterns: [/\u7ec4\u88c5\u673a/, /\bassembler\b/i, /\bcircuit assembler\b/i],
    metas: { ULV: 211, LV: 212, MV: 213, HV: 214, EV: 215, IV: 215, LuV: 215, ZPM: 215, UV: 215, UHV: 215, UEV: 215, UIV: 215, UMV: 215, UXV: 215, MAX: 215 },
    fallback: 211,
  },
  {
    patterns: [/\u538b\u7f29\u673a/, /\bcompressor\b/i],
    metas: { ULV: 241, LV: 242, MV: 243, HV: 244, EV: 245, IV: 245, LuV: 245, ZPM: 245, UV: 245, UHV: 245, UEV: 245, UIV: 245, UMV: 245, UXV: 245, MAX: 245 },
    fallback: 241,
  },
  {
    patterns: [/\u7535\u89e3\u673a/, /\belectrolyzer\b/i],
    metas: { ULV: 371, LV: 372, MV: 373, HV: 374, EV: 375, IV: 375, LuV: 375, ZPM: 375, UV: 375, UHV: 375, UEV: 375, UIV: 375, UMV: 375, UXV: 375, MAX: 375 },
    fallback: 371,
  },
  {
    patterns: [/\u79bb\u5fc3\u673a/, /\bcentrifuge\b/i],
    metas: { ULV: 361, LV: 362, MV: 363, HV: 364, EV: 365, IV: 365, LuV: 365, ZPM: 365, UV: 365, UHV: 365, UEV: 365, UIV: 365, UMV: 365, UXV: 365, MAX: 365 },
    fallback: 361,
  },
  {
    patterns: [/\u5de5\u4e1a\u7535\u89e3\u673a/, /\bindustrial electrolyzer\b/i],
    metas: { ULV: 371, LV: 372, MV: 373, HV: 374, EV: 375, IV: 375, LuV: 375, ZPM: 375, UV: 375, UHV: 375, UEV: 375, UIV: 375, UMV: 375, UXV: 375, MAX: 375 },
    fallback: 373,
  },
  {
    patterns: [/\u5de5\u4e1a\u79bb\u5fc3\u673a/, /\bindustrial centrifuge\b/i],
    metas: { ULV: 361, LV: 362, MV: 363, HV: 364, EV: 365, IV: 365, LuV: 365, ZPM: 365, UV: 365, UHV: 365, UEV: 365, UIV: 365, UMV: 365, UXV: 365, MAX: 365 },
    fallback: 363,
  },
  {
    patterns: [/\u677f\u6750\u5207\u5272\u673a/, /\bcutting machine\b/i, /\bcutter\b/i],
    metas: { ULV: 251, LV: 252, MV: 253, HV: 254, EV: 255, IV: 255, LuV: 255, ZPM: 255, UV: 255, UHV: 255, UEV: 255, UIV: 255, UMV: 255, UXV: 255, MAX: 255 },
    fallback: 251,
  },
  {
    patterns: [/\u8f66\u5e8a/, /\blathe\b/i],
    metas: { ULV: 291, LV: 292, MV: 293, HV: 294, EV: 295, IV: 295, LuV: 295, ZPM: 295, UV: 295, UHV: 295, UEV: 295, UIV: 295, UMV: 295, UXV: 295, MAX: 295 },
    fallback: 291,
  },
  {
    patterns: [/\u5377\u677f\u673a/, /\bbender\b/i],
    metas: { ULV: 221, LV: 222, MV: 223, HV: 224, EV: 225, IV: 225, LuV: 225, ZPM: 225, UV: 225, UHV: 225, UEV: 225, UIV: 225, UMV: 225, UXV: 225, MAX: 225 },
    fallback: 221,
  },
  {
    patterns: [/\u538b\u6a21\u673a/, /\bforming press\b/i, /\bextruder\b/i],
    metas: { ULV: 281, LV: 282, MV: 283, HV: 284, EV: 285, IV: 285, LuV: 285, ZPM: 285, UV: 285, UHV: 285, UEV: 285, UIV: 285, UMV: 285, UXV: 285, MAX: 285 },
    fallback: 281,
  },
  {
    patterns: [/\u51b2\u538b\u673a\u5e8a/, /\bstamp/i],
    metas: { ULV: 281, LV: 282, MV: 283, HV: 284, EV: 285, IV: 285, LuV: 285, ZPM: 285, UV: 285, UHV: 285, UEV: 285, UIV: 285, UMV: 285, UXV: 285, MAX: 285 },
    fallback: 283,
  },
  {
    patterns: [/\u5316\u5b66\u53cd\u5e94\u91dc/, /\bchemical reactor\b/i],
    metas: { ULV: 421, LV: 422, MV: 423, HV: 424, EV: 425, IV: 425, LuV: 425, ZPM: 425, UV: 425, UHV: 425, UEV: 425, UIV: 425, UMV: 425, UXV: 425, MAX: 425 },
    fallback: 421,
  },
  {
    patterns: [/\u6d41\u4f53\u704c\u88c5\u673a/, /\u88c5\u74f6\u673a/, /\bcanner\b/i, /\bcanning machine\b/i, /\bfluid canning machine\b/i, /\bfilling\b/i],
    metas: { ULV: 431, LV: 432, MV: 433, HV: 434, EV: 435, IV: 435, LuV: 435, ZPM: 435, UV: 435, UHV: 435, UEV: 435, UIV: 435, UMV: 435, UXV: 435, MAX: 435 },
    fallback: 431,
  },
  {
    patterns: [/\u6d41\u4f53\u56fa\u5316\u5668/, /\bfluid solidifier\b/i],
    metas: { ULV: 521, LV: 522, MV: 523, HV: 524, EV: 525, IV: 525, LuV: 525, ZPM: 525, UV: 525, UHV: 525, UEV: 525, UIV: 525, UMV: 525, UXV: 525, MAX: 525 },
    fallback: 521,
  },
  {
    patterns: [/\u6d41\u4f53\u63d0\u53d6\u673a/, /\u63d0\u53d6\u673a/, /\bextractor\b/i],
    metas: { ULV: 511, LV: 512, MV: 513, HV: 514, EV: 515, IV: 515, LuV: 515, ZPM: 515, UV: 515, UHV: 515, UEV: 515, UIV: 515, UMV: 515, UXV: 515, MAX: 515 },
    fallback: 511,
  },
  {
    patterns: [/\u6253\u5305\u673a/, /\bpackager\b/i],
    metas: { ULV: 401, LV: 402, MV: 403, HV: 404, EV: 405, IV: 406, LuV: 407, ZPM: 408, UV: 408, UHV: 408, UEV: 408, UIV: 408, UMV: 408, UXV: 408, MAX: 408 },
    fallback: 401,
  },
  {
    patterns: [/\u89e3\u5305\u5668/, /\bunpackager\b/i],
    metas: { ULV: 411, LV: 412, MV: 413, HV: 414, EV: 415, IV: 416, LuV: 417, ZPM: 418, UV: 418, UHV: 418, UEV: 418, UIV: 418, UMV: 418, UXV: 418, MAX: 418 },
    fallback: 411,
  },
  {
    patterns: [/\u5408\u91d1\u7089/, /\balloy smelter\b/i],
    metas: { ULV: 201, LV: 202, MV: 203, HV: 204, EV: 205, IV: 205, LuV: 205, ZPM: 205, UV: 205, UHV: 205, UEV: 205, UIV: 205, UMV: 205, UXV: 205, MAX: 205 },
    fallback: 201,
  },
  {
    patterns: [/\u7535\u5f27\u7089/, /\barc furnace\b/i],
    metas: { ULV: 261, LV: 262, MV: 263, HV: 264, EV: 265, IV: 265, LuV: 265, ZPM: 265, UV: 265, UHV: 265, UEV: 265, UIV: 265, UMV: 265, UXV: 265, MAX: 265 },
    fallback: 261,
  },
  {
    patterns: [/\u9ad8\u7089/, /\u5de5\u4e1a\u9ad8\u7089/, /\bblast furnace\b/i],
    metas: { ULV: 140, LV: 140, MV: 140, HV: 140, EV: 140, IV: 140, LuV: 140, ZPM: 140, UV: 140, UHV: 140, UEV: 140, UIV: 140, UMV: 140, UXV: 140, MAX: 140 },
    fallback: 140,
  },
  {
    patterns: [/\u771f\u7a7a\u51b7\u51bb\u673a/, /\bvacuum freezer\b/i, /\u51db\u51b0\u51b7\u51bb\u673a/],
    metas: { ULV: 261, LV: 262, MV: 263, HV: 264, EV: 265, IV: 265, LuV: 265, ZPM: 265, UV: 265, UHV: 265, UEV: 265, UIV: 265, UMV: 265, UXV: 265, MAX: 265 },
    fallback: 263,
  },
  {
    patterns: [/\u6405\u62cc\u673a/, /\u5de5\u4e1a\u6405\u62cc\u673a/, /\bmixer\b/i],
    metas: { ULV: 421, LV: 422, MV: 423, HV: 424, EV: 425, IV: 425, LuV: 425, ZPM: 425, UV: 425, UHV: 425, UEV: 425, UIV: 425, UMV: 425, UXV: 425, MAX: 425 },
    fallback: 423,
  },
  {
    patterns: [/\u6d17\u77ff\u673a/, /\u7b80\u6613\u6d17\u77ff\u6c60/, /\bore washer\b/i],
    metas: { ULV: 391, LV: 392, MV: 393, HV: 394, EV: 395, IV: 395, LuV: 395, ZPM: 395, UV: 395, UHV: 395, UEV: 395, UIV: 395, UMV: 395, UXV: 395, MAX: 395 },
    fallback: 391,
  },
  {
    patterns: [/\u6fc0\u5149\u8680\u523b\u673a/, /\blaser engraver\b/i],
    metas: { ULV: 321, LV: 322, MV: 323, HV: 324, EV: 325, IV: 326, LuV: 327, ZPM: 328, UV: 328, UHV: 328, UEV: 328, UIV: 328, UMV: 328, UXV: 328, MAX: 328 },
    fallback: 321,
  },
  {
    patterns: [/\u9ad8\u538b\u91dc/, /\bautoclave\b/i],
    metas: { ULV: 431, LV: 432, MV: 433, HV: 434, EV: 435, IV: 435, LuV: 435, ZPM: 435, UV: 435, UHV: 435, UEV: 435, UIV: 435, UMV: 435, UXV: 435, MAX: 435 },
    fallback: 432,
  },
  {
    patterns: [/\u592a\u9633\u80fd\u677f\u5236\u9020\u5382/, /\bsolar panel\b/i],
    metas: { LV: 367, MV: 367, HV: 367, EV: 367, IV: 367, LuV: 367, ZPM: 367, UV: 367, UHV: 367, UEV: 367, UIV: 367, UMV: 367, UXV: 367, MAX: 367 },
    fallback: 367,
  },
  {
    patterns: [/\bpcb\b/i, /\u0050\u0043\u0042\u5de5\u5382/],
    metas: { LV: 356, MV: 356, HV: 356, EV: 356, IV: 356, LuV: 356, ZPM: 356, UV: 356, UHV: 356, UEV: 356, UIV: 356, UMV: 356, UXV: 356, MAX: 356 },
    fallback: 356,
  },
];

function detectGtTier(machineType: string): GtTier | null {
  const match = machineType.match(/\((ULV|LV|MV|HV|EV|IV|LuV|ZPM|UV|UHV|UEV|UIV|UMV|UXV|MAX)\)/i);
  if (!match) return null;
  const rawTier = match[1].toLowerCase();
  return GT_TIER_ORDER.find((tier) => tier.toLowerCase() === rawTier) ?? null;
}

function createItemRecord(itemId: string, imageFileName: string, localizedName: string): MachineIconItem {
  const parts = itemId.split('~');
  const modId = parts[1] ?? '';
  const internalName = parts[2] ?? '';

  return {
    itemId,
    modId,
    internalName,
    localizedName,
    imageFileName,
  };
}

function createGtIcon(meta: number, localizedName: string): MachineIconItem {
  return createItemRecord(
    `i~gregtech~gt.blockmachines~${meta}`,
    `gregtech/gt.blockmachines~${meta}.png`,
    localizedName,
  );
}

function resolveGtMultiblockIcon(machineType: string): MachineIconRecord | null {
  const normalized = machineType.trim();
  if (!normalized) {
    return null;
  }

  const matched = GT_MULTIBLOCK_ICON_BY_FAMILY.find((entry) =>
    entry.patterns.some((pattern) => pattern.test(normalized)),
  );

  if (!matched) {
    return null;
  }

  return {
    itemId: matched.itemId,
    imageFileName: matched.imageFileName,
  };
}

function resolveGtMeta(machineType: string): number | null {
  const normalized = machineType.trim();
  if (!normalized) return null;

  const tier = detectGtTier(normalized);

  for (const family of GT_FAMILY_MAP) {
    if (!family.patterns.some((pattern) => pattern.test(normalized))) {
      continue;
    }

    if (!tier) {
      return family.fallback;
    }

    const exact = family.metas[tier];
    if (typeof exact === 'number') {
      return exact;
    }

    const tierIndex = GT_TIER_ORDER.indexOf(tier);
    for (let index = tierIndex; index >= 0; index -= 1) {
      const candidate = family.metas[GT_TIER_ORDER[index]];
      if (typeof candidate === 'number') {
        return candidate;
      }
    }

    return family.fallback;
  }

  return null;
}

export function getMachineIcon(machineType: string): MachineIconRecord | null {
  const normalized = machineType.trim();
  if (!normalized) {
    return null;
  }

  const direct = DIRECT_ICON_PATTERNS.find((entry) => entry.patterns.some((pattern) => pattern.test(normalized)));
  if (direct) {
    return direct.icon;
  }

  const gtMultiblock = resolveGtMultiblockIcon(normalized);
  if (gtMultiblock) {
    return gtMultiblock;
  }

  const gtMeta = resolveGtMeta(normalized);
  if (typeof gtMeta === 'number') {
    return {
      itemId: `i~gregtech~gt.blockmachines~${gtMeta}`,
      imageFileName: `gregtech/gt.blockmachines~${gtMeta}.png`,
    };
  }

  const looksLikeGregTechMachine =
    /\((ULV|LV|MV|HV|EV|IV|LuV|ZPM|UV|UHV|UEV|UIV|UMV|UXV|MAX)\)/i.test(normalized) ||
    /\b(gregtech|assembly|assembler|compressor|electrolyzer|centrifuge|lathe|bender|reactor)\b/i.test(normalized) ||
    /[\u673a\u7089\u91dc\u88c5\u914d\u7814\u7a76\u79bb\u5fc3\u7535\u89e3\u538b\u7f29\u6d41\u4f53]/.test(normalized);

  if (looksLikeGregTechMachine) {
    return {
      itemId: `i~gregtech~gt.blockmachines~${GT_GENERIC_MACHINE_ICON_META}`,
      imageFileName: `gregtech/gt.blockmachines~${GT_GENERIC_MACHINE_ICON_META}.png`,
    };
  }

  return null;
}

export function getMachineIconItem(machineType: string): MachineIconItem | null {
  const icon = getMachineIcon(machineType);
  if (!icon) {
    return null;
  }

  return createItemRecord(icon.itemId, icon.imageFileName, machineType.trim());
}

export function addMachineIconsToRecipes<T extends RecipeWithMachineInfo>(recipes: T[]): T[] {
  return recipes.map((recipe) => {
    if (!recipe.machineInfo?.machineType) {
      return recipe;
    }

    const iconItem = getMachineIconItem(recipe.machineInfo.machineType);
    if (iconItem) {
      recipe.machineInfo.machineIcon = iconItem;
    }

    return recipe;
  });
}
