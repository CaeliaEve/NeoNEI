import fs from 'fs';
import path from 'path';
import { NESQL_CANONICAL_DIR } from '../config/runtime-paths';

type GeneticsItemDrop = {
  itemId: string;
  localizedName: string;
  chance: number;
};

type GeneticsSpecies = {
  uid: string;
  name: string;
  memberItemId: string;
  products: GeneticsItemDrop[];
  specialties: GeneticsItemDrop[];
};

type GeneticsMutation = {
  allele0: string;
  allele1: string;
  result: string;
  chance: number;
  restricted: boolean;
  dimensions?: string[];
  biomes?: string[];
};

type GeneticsBranch = {
  species: GeneticsSpecies[];
  mutations: GeneticsMutation[];
};

type ForestryGeneticsDocument = {
  generatedFrom: string;
  bees: GeneticsBranch;
  trees: GeneticsBranch;
};

export interface ForestryGeneticsOverview {
  generatedFrom: string;
  bees: GeneticsBranch | null;
  trees: GeneticsBranch | null;
}

function readJsonFile<T>(filePath: string): T | null {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function normalizeBranch(branch: GeneticsBranch | undefined): GeneticsBranch | null {
  if (!branch) return null;
  return {
    species: Array.isArray(branch.species) ? branch.species : [],
    mutations: Array.isArray(branch.mutations) ? branch.mutations : [],
  };
}

export class ForestryGeneticsService {
  private cache: { expiresAt: number; value: ForestryGeneticsOverview } | null = null;
  private readonly cacheTtlMs = Number(process.env.FORESTRY_GENETICS_CACHE_TTL_MS || 60_000);

  getOverview(): ForestryGeneticsOverview {
    if (this.cache && this.cache.expiresAt > Date.now()) {
      return this.cache.value;
    }

    const canonicalDir = NESQL_CANONICAL_DIR || '';
    const filePath = canonicalDir ? path.join(canonicalDir, 'forestry-genetics.json') : '';
    const doc = readJsonFile<ForestryGeneticsDocument>(filePath);

    const overview: ForestryGeneticsOverview = doc
      ? {
          generatedFrom: doc.generatedFrom,
          bees: normalizeBranch(doc.bees),
          trees: normalizeBranch(doc.trees),
        }
      : {
          generatedFrom: '',
          bees: null,
          trees: null,
        };

    this.cache = {
      expiresAt: Date.now() + this.cacheTtlMs,
      value: overview,
    };
    return overview;
  }
}

let forestryGeneticsService: ForestryGeneticsService | null = null;

export function getForestryGeneticsService(): ForestryGeneticsService {
  if (!forestryGeneticsService) {
    forestryGeneticsService = new ForestryGeneticsService();
  }
  return forestryGeneticsService;
}
