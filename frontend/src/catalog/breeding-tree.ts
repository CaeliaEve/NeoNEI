import type { Mutation } from '@elysium/contracts';
import type { Mutations } from './client.ts';
export interface BreedingNode {
  id: string; data?: Mutations; mutation?: Mutation; parents: BreedingNode[];
  stop?: 'cycle' | 'depth'; partial?: boolean;
}
/** At most 31 nodes / 4 generations. Repeated parents share a read, never a traversal path. */
export async function breedingTree(id: string, load: (id: string) => Promise<Mutations>, depth = 4): Promise<BreedingNode> {
  const reads = new Map<string, Promise<Mutations>>();
  async function visit(current: string, remaining: number, ancestors: Set<string>): Promise<BreedingNode> {
    if (ancestors.has(current)) return { id: current, parents: [], stop: 'cycle' };
    if (!remaining) return { id: current, parents: [], stop: 'depth' };
    let pending = reads.get(current);
    if (!pending) { pending = load(current); reads.set(current, pending); }
    const data = await pending;
    const rows = [...data.rows].filter(row => row.result === current).sort((a, b) => {
      const left = BigInt(a.chance.numerator) * BigInt(b.chance.denominator);
      const right = BigInt(b.chance.numerator) * BigInt(a.chance.denominator);
      return left > right ? -1 : left < right ? 1 : a.id.localeCompare(b.id);
    });
    const mutation = rows[0];
    const next = new Set(ancestors); next.add(current);
    const parents = mutation ? await Promise.all(mutation.parents.map(parent => visit(parent, remaining - 1, next))) : [];
    return { id: current, data, mutation, parents, partial: data.total > data.rows.length };
  }
  return visit(id, Math.min(4, Math.max(1, depth)), new Set());
}
