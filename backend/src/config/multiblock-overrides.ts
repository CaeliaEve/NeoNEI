export interface MultiblockLegendEntry {
  label: string;
  color?: string;
  textureUrl?: string;
  blockId?: string;
}

export interface MultiblockVoxelBlueprintOverride {
  size: { x: number; y: number; z: number };
  layers: string[][];
  legend: Record<string, MultiblockLegendEntry>;
}

export interface MultiblockBlueprintOverride {
  dimensions?: { x: number; y: number; z: number; raw?: string };
  structureInformation?: string[];
  structureHints?: string[];
  voxelBlueprint?: MultiblockVoxelBlueprintOverride;
}

// Manual overrides for controllers that expose little/no tooltip structure info.
// Layers are ordered bottom -> top. Each layer row is Z axis, each char in row is X axis.
export const MULTIBLOCK_OVERRIDES: Record<string, MultiblockBlueprintOverride> = {
  // Bricked Blast Furnace
  'i~gregtech~gt.blockmachines~140': {
    dimensions: { x: 3, y: 4, z: 3, raw: 'Size: 3x4x3 (WxHxL)' },
    structureInformation: [
      'Size: 3x4x3 (WxHxL)',
      'Controller: Front center (middle layer)',
      'Main body: Bricked Casing shell',
      'Inner cavity: center column (3 air blocks)',
    ],
    structureHints: [
      'Top center must stay empty.',
    ],
    voxelBlueprint: {
      size: { x: 3, y: 4, z: 3 },
      legend: {
        X: {
          label: 'Controller',
          color: '#f59e0b',
          textureUrl: '/images/item/gregtech/gt.blockmachines~140.png',
          blockId: 'i~gregtech~gt.blockmachines~140',
        },
        C: {
          label: 'Bricked Casing',
          color: '#ef4444',
          textureUrl: '/images/item/etfuturum/blast_furnace~0.png',
          blockId: 'i~etfuturum~blast_furnace~0',
        },
        A: { label: 'Air', color: '#0ea5e9' },
      },
      layers: [
        ['CCC', 'CCC', 'CCC'],
        ['CXC', 'CAC', 'CCC'],
        ['CCC', 'CAC', 'CCC'],
        ['CCC', 'CAC', 'CCC'],
      ],
    },
  },
  // Electric Blast Furnace (Industrial Blast Furnace)
  'i~gregtech~gt.blockmachines~1000': {
    dimensions: { x: 3, y: 4, z: 3, raw: 'Size: 3x4x3 (WxHxL)' },
    structureInformation: [
      'Size: 3x4x3 (WxHxL)',
      'Controller: Front center',
      'Bottom layer: Heatproof casing shell',
      'Middle two layers: Heating Coil ring (center empty)',
      'Top center: Muffler Hatch slot',
    ],
    structureHints: [
      'Input/Output buses and hatches can replace valid casing blocks.',
    ],
    voxelBlueprint: {
      size: { x: 3, y: 4, z: 3 },
      legend: {
        X: {
          label: 'Controller',
          color: '#f59e0b',
          textureUrl: '/images/item/gregtech/gt.blockmachines~1000.png',
          blockId: 'i~gregtech~gt.blockmachines~1000',
        },
        C: {
          label: 'Heatproof Casing',
          color: '#22c55e',
          textureUrl: '/images/item/gregtech/gt.blockcasings~11.png',
          blockId: 'i~gregtech~gt.blockcasings~11',
        },
        H: {
          label: 'Heating Coil',
          color: '#f97316',
          textureUrl: '/images/item/gregtech/gt.blockcasings5~0.png',
          blockId: 'i~gregtech~gt.blockcasings5~0',
        },
        M: {
          label: 'Muffler Hatch Slot',
          color: '#60a5fa',
        },
        A: { label: 'Air', color: '#0ea5e9' },
      },
      layers: [
        ['CXC', 'CCC', 'CCC'],
        ['HHH', 'HAH', 'HHH'],
        ['HHH', 'HAH', 'HHH'],
        ['CCC', 'CMC', 'CCC'],
      ],
    },
  },
};
