type GtTier = typeof GT_TIER_ORDER[number];

const GT_TIER_ORDER = ['ULV', 'LV', 'MV', 'HV', 'EV', 'IV', 'LuV', 'ZPM', 'UV', 'UHV', 'UEV', 'UIV', 'UMV', 'UXV', 'MAX'] as const;

type GtMachineIconPolicyDescriptor = Readonly<{
  patterns: readonly string[];
  tiers: Readonly<Partial<Record<GtTier, number>>>;
  defaultMetaId?: number;
}>;

const GT_MACHINE_ICON_POLICY_DESCRIPTORS: readonly GtMachineIconPolicyDescriptor[] = validateGtMachineIconPolicyDescriptors([
  {
    patterns: ['电动聚爆压缩机', 'electricimplosioncompressor', 'electric implosion compressor'],
    tiers: {},
    defaultMetaId: 12734,
  },
  {
    patterns: ['聚爆压缩机', 'implosioncompressor', 'implosion compressor'],
    tiers: {},
    defaultMetaId: 1001,
  },
  {
    patterns: ['激光蚀刻机', 'laserengraver', 'laser engraver'],
    tiers: { LV: 591, MV: 592, HV: 593, EV: 594, IV: 595 },
    defaultMetaId: 591,
  },
  {
    patterns: ['压模机', 'bender'],
    tiers: { ULV: 281, LV: 281, MV: 282, HV: 283, EV: 284, IV: 285 },
    defaultMetaId: 281,
  },
  {
    patterns: ['压缩机', 'compressor'],
    tiers: { ULV: 114, LV: 115, MV: 116, EV: 118, IV: 119, LuV: 120, ZPM: 121, UV: 122, UHV: 123, UIV: 124, UMV: 125, UXV: 126 },
    defaultMetaId: 115,
  },
  {
    patterns: ['研究站', 'research station'],
    tiers: { ULV: 30, LV: 31, MV: 32, HV: 33, EV: 34, IV: 35, LuV: 36, ZPM: 37, UV: 38, UHV: 39, UEV: 40, UIV: 41, UMV: 42, UXV: 43, MAX: 44 },
    defaultMetaId: 33,
  },
  {
    patterns: ['组装机', 'assembler', 'assembly machine', 'circuit assembler'],
    tiers: { ULV: 14, LV: 15, MV: 16, HV: 17, EV: 18, IV: 19, LuV: 20, ZPM: 21, UV: 22, UHV: 23, UEV: 24, UIV: 25, UMV: 26, UXV: 27, MAX: 28 },
    defaultMetaId: 17,
  },
  {
    patterns: ['装配线加工', 'assembly line'],
    tiers: { ULV: 4, LV: 5, MV: 6, HV: 7, EV: 8, IV: 9, LuV: 10, ZPM: 11, UV: 12, UHV: 13, UEV: 14, UIV: 2059, UMV: 2060, UXV: 2061, MAX: 2062 },
    defaultMetaId: 8,
  },
  {
    patterns: ['压缩机', 'compressor'],
    tiers: { ULV: 114, LV: 115, MV: 116, HV: 117, EV: 118, IV: 119, LuV: 120, ZPM: 121, UV: 122, UHV: 123, UIV: 124, UMV: 125, UXV: 126 },
    defaultMetaId: 117,
  },
  {
    patterns: ['电解机', 'electrolyzer'],
    tiers: { LV: 245, MV: 246, HV: 247, EV: 248, IV: 249, LuV: 250, ZPM: 251, UV: 252 },
    defaultMetaId: 247,
  },
  {
    patterns: ['离心机', 'centrifuge'],
    tiers: { ULV: 214, LV: 215, MV: 216, HV: 217, EV: 218, IV: 219, LuV: 220, ZPM: 221, UV: 222, UHV: 223 },
    defaultMetaId: 217,
  },
  {
    patterns: ['高炉', 'blast furnace'],
    tiers: { ULV: 84, LV: 85, MV: 86, HV: 87, EV: 88, IV: 89, LuV: 90, ZPM: 97, UV: 95, UHV: 92, UEV: 91, UIV: 93, UMV: 94, UXV: 96, MAX: 98 },
    defaultMetaId: 87,
  },
  {
    patterns: ['电弧炉', 'arc furnace'],
    tiers: { LV: 132, MV: 133, HV: 134, UEV: 135, UHV: 136 },
    defaultMetaId: 134,
  },
  {
    patterns: ['分子重组仪', 'molecular'],
    tiers: { EV: 7, IV: 207, LuV: 207, ZPM: 210, UV: 209, UHV: 208 },
    defaultMetaId: 207,
  },
  {
    patterns: ['车床', 'lathe'],
    tiers: { ULV: 310, LV: 314, MV: 316, HV: 312, EV: 311, IV: 313, LuV: 315, ZPM: 317, UV: 318, UHV: 320, UEV: 319, UIV: 321, UMV: 322, UXV: 323 },
    defaultMetaId: 312,
  },
  {
    patterns: ['卷板机', 'bender'],
    tiers: { ULV: 148, LV: 149, MV: 150, HV: 151, EV: 152, IV: 153, LuV: 154, ZPM: 155, UV: 156, UHV: 157, UEV: 158, UMV: 160, UXV: 161, MAX: 162 },
    defaultMetaId: 151,
  },
  {
    patterns: ['挤压机', 'extruder'],
    tiers: { ULV: 172, LV: 173, MV: 174, HV: 175, EV: 176, IV: 177, LuV: 178, ZPM: 179, UV: 180, UHV: 181, UMV: 183, UXV: 184, MAX: 185 },
    defaultMetaId: 175,
  },
  {
    patterns: ['切割机', 'cutting machine'],
    tiers: { ULV: 284, LV: 285, MV: 286, HV: 287, EV: 288, IV: 289, LuV: 290, ZPM: 291, UV: 292, UHV: 293, UEV: 295 },
    defaultMetaId: 287,
  },
  {
    patterns: ['化学反应釜', 'chemical reactor'],
    tiers: { ULV: 208, LV: 209, MV: 210, HV: 211, EV: 212, IV: 213, LuV: 214, ZPM: 215, UV: 216, UHV: 217 },
    defaultMetaId: 211,
  },
]);

function validateGtMachineIconPolicyDescriptors(
  descriptors: readonly GtMachineIconPolicyDescriptor[],
): readonly GtMachineIconPolicyDescriptor[] {
  const seenPatterns = new Set<string>();
  for (const descriptor of descriptors) {
    if (!Array.isArray(descriptor.patterns) || descriptor.patterns.length === 0) {
      throw new Error('GT machine icon policy descriptor must declare at least one pattern');
    }
    if (Object.keys(descriptor.tiers).length === 0 && typeof descriptor.defaultMetaId !== 'number') {
      throw new Error(`GT machine icon policy descriptor must declare tier mappings or a default meta id: ${descriptor.patterns.join(',')}`);
    }
    for (const pattern of descriptor.patterns) {
      const normalized = `${pattern ?? ''}`.trim().toLowerCase();
      if (!normalized) {
        throw new Error('GT machine icon policy descriptor contains an empty pattern');
      }
      if (seenPatterns.has(normalized)) {
        continue;
      }
      seenPatterns.add(normalized);
    }
  }
  return Object.freeze(descriptors.map((descriptor) => Object.freeze({
    patterns: Object.freeze([...descriptor.patterns]),
    tiers: Object.freeze({ ...descriptor.tiers }),
    defaultMetaId: descriptor.defaultMetaId,
  })));
}

const detectGtTier = (name: string): GtTier | null => {
  const match = name.match(/\((ULV|LV|MV|HV|EV|IV|LuV|ZPM|UV|UHV|UEV|UIV|UMV|UXV|MAX)\)/i);
  if (!match) return null;
  const normalized = match[1];
  return GT_TIER_ORDER.find((tier) => tier.toLowerCase() === normalized.toLowerCase()) ?? null;
};

export const resolveMachineIconByName = (
  machineName: string,
  getImagePath: (itemId: string) => string,
): string | null => {
  const normalized = machineName.trim().toLowerCase();
  if (!normalized) return null;

  for (const descriptor of GT_MACHINE_ICON_POLICY_DESCRIPTORS) {
    if (!descriptor.patterns.some((pattern) => normalized.includes(pattern.toLowerCase()))) {
      continue;
    }
    const tier = detectGtTier(machineName);
    const metaId = (tier ? descriptor.tiers[tier] : undefined) ?? descriptor.defaultMetaId;
    if (!metaId) return null;
    return getImagePath(`i~gregtech~gt.blockmachines~${metaId}`);
  }

  return null;
};

export const MACHINE_ICON_POLICY_CATALOG = Object.freeze({
  abi: 'neonei.machine-icon-policy.v1',
  authority: 'descriptor-owned-machine-icons',
  gtMachineIconDescriptors: GT_MACHINE_ICON_POLICY_DESCRIPTORS,
});
