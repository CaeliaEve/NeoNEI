import fs from 'fs';
import path from 'path';
import { NESQL_CANONICAL_DIR } from '../config/runtime-paths';

type CircuitItemRef = {
  itemId: string;
  localizedName: string;
  tier?: number | null;
  tierName?: string | null;
};

type CircuitLine = {
  startTier: number;
  boards: CircuitItemRef[];
  circuits: CircuitItemRef[];
};

type IndividualCircuit = {
  tier: number;
  boards: CircuitItemRef[];
  circuit: CircuitItemRef | null;
};

type CircuitPartGroup = {
  key: string;
  parts: CircuitItemRef[];
};

type CircuitProgressionDocument = {
  generatedFrom: string;
  circuitLines: CircuitLine[];
  individualCircuits: IndividualCircuit[];
  circuitParts: CircuitPartGroup[];
};

type MaterialPartRef = {
  prefix: string;
  itemId: string;
  localizedName: string;
};

type MaterialFluidRef = {
  kind: string;
  fluidId: string;
  localizedName: string;
};

type MaterialPartsEntry = {
  materialName: string;
  materialId: string;
  sections: Record<string, MaterialPartRef[]>;
  fluids: MaterialFluidRef[];
};

type MaterialPartsDocument = {
  generatedFrom: string;
  materials: MaterialPartsEntry[];
};

export interface GTDiagramOverview {
  circuits: CircuitProgressionDocument | null;
  materials: MaterialPartsDocument | null;
}

function readJsonFile<T>(filePath: string): T | null {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function hasMaterialContent(entry: MaterialPartsEntry): boolean {
  const sectionEntries = Object.values(entry.sections ?? {}).filter((items) => Array.isArray(items) && items.length > 0);
  return sectionEntries.length > 0 || (Array.isArray(entry.fluids) && entry.fluids.length > 0);
}

export class GTDiagramsService {
  private cache: { expiresAt: number; value: GTDiagramOverview } | null = null;
  private readonly cacheTtlMs = Number(process.env.GT_DIAGRAMS_CACHE_TTL_MS || 60_000);

  getOverview(): GTDiagramOverview {
    if (this.cache && this.cache.expiresAt > Date.now()) {
      return this.cache.value;
    }

    const canonicalDir = NESQL_CANONICAL_DIR || '';
    const circuitsPath = canonicalDir ? path.join(canonicalDir, 'gregtech-circuit-progression.json') : '';
    const materialsPath = canonicalDir ? path.join(canonicalDir, 'gregtech-material-parts.json') : '';

    const circuits = readJsonFile<CircuitProgressionDocument>(circuitsPath);
    const materials = readJsonFile<MaterialPartsDocument>(materialsPath);

    const filteredOverview: GTDiagramOverview = {
      circuits: circuits
        ? {
            ...circuits,
            circuitLines: (circuits.circuitLines ?? []).filter((line) => (line.boards?.length ?? 0) > 0 || (line.circuits?.length ?? 0) > 0),
            individualCircuits: (circuits.individualCircuits ?? []).filter((entry) => (entry.boards?.length ?? 0) > 0 || Boolean(entry.circuit)),
            circuitParts: (circuits.circuitParts ?? []).filter((group) => (group.parts?.length ?? 0) > 0),
          }
        : null,
      materials: materials
        ? {
            ...materials,
            materials: (materials.materials ?? []).filter((entry) => entry.materialId !== 'NULL' && hasMaterialContent(entry)),
          }
        : null,
    };

    this.cache = {
      expiresAt: Date.now() + this.cacheTtlMs,
      value: filteredOverview,
    };
    return filteredOverview;
  }
}

let gtDiagramsService: GTDiagramsService | null = null;

export function getGTDiagramsService(): GTDiagramsService {
  if (!gtDiagramsService) {
    gtDiagramsService = new GTDiagramsService();
  }
  return gtDiagramsService;
}
