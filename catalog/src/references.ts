import type { GeneticReferenceRow } from '@elysium/contracts';
import { type Catalog, Fault } from './store.ts';
import type { Page, Related } from './query.ts';

export interface ReferenceSearch { domain: string; root: string; query: string; offset: number; limit: number }
export interface GeneticReferencePage extends Page<GeneticReferenceRow> {
  domain: string; definition: GeneticReferenceRow | null; roots: GeneticReferenceRow[]; chromosomes: GeneticReferenceRow[]; related: Related;
}

/** One query implementation serves both immutable online catalogs and the offline worker. */
export async function geneticReferences(catalog: Pick<Catalog, 'scan' | 'records'>, search: ReferenceSearch): Promise<GeneticReferencePage> {
  if (!Number.isSafeInteger(search.offset) || search.offset < 0 || !Number.isSafeInteger(search.limit) || search.limit < 1 || search.limit > 100
    || search.query.length > 256 || search.root.length > 256 || search.domain && !/^reference_[a-f0-9]{64}$/.test(search.domain)) {
    throw new Fault('invalid_query', 'Invalid genetic reference query', 400);
  }
  const definitions: GeneticReferenceRow[] = [], roots: GeneticReferenceRow[] = [], chromosomes: GeneticReferenceRow[] = [];
  for await (const row of catalog.scan('references')) {
    if (row.data.kind === 'definition') definitions.push(row);
    else if (row.data.kind === 'root') roots.push(row);
    else if (row.data.kind === 'chromosome') chromosomes.push(row);
    if (definitions.length > 4 || roots.length > 16 || chromosomes.length > 2048) throw new Fault('reference_limit', 'Native reference catalogue metadata exceeds its budget');
  }
  definitions.sort((a, b) => a.domain.localeCompare(b.domain));
  const definition = (search.domain ? definitions.find(row => row.domain === search.domain) : definitions[0]) ?? null;
  if (search.domain && !definition) throw new Fault('not_found', 'Native genetic reference domain not found', 404);
  const domain = definition?.domain ?? '', selectedRoots = roots.filter(row => row.domain === domain).sort((a, b) => a.order - b.order);
  if (search.root && !selectedRoots.some(row => row.data.kind === 'root' && row.data.definition.root === search.root)) throw new Fault('invalid_query', 'Unknown native reference root', 400);
  const selectedChromosomes = chromosomes.filter(row => row.domain === domain).sort((a, b) => a.order - b.order);
  const rows: GeneticReferenceRow[] = [], query = search.query.trim().toLowerCase(); let total = 0;
  // Scan the bounded native leaves; retain only the requested page, not the whole gene catalogue.
  for await (const row of catalog.scan('references')) if (row.domain === domain && row.data.kind === 'gene') {
    const gene = row.data.gene;
    if (search.root && gene.root !== search.root || query && !`${gene.root} ${gene.chromosome} ${gene.allele}`.toLowerCase().includes(query)) continue;
    // Catalog scan follows immutable content IDs; this gives stable pagination without retaining all genes.
    if (total >= search.offset && rows.length < search.limit) rows.push(row);
    total++;
  }
  const ids = new Set<string>();
  for (const row of rows) if (row.data.kind === 'gene') for (const id of [row.data.gene.serum, row.data.gene.genome, row.data.gene.sequence]) ids.add(id);
  if (definition?.data.kind === 'definition') for (const container of definition.data.containers) ids.add(container.empty);
  const items = await catalog.records('items', ids), categoryIds = new Set<string>();
  for await (const category of catalog.scan('categories')) if (category.reference === domain && category.source.owner === 'Genetics' && category.source.handler === 'binnie.genetics.nei.DatabaseRecipeHandler') categoryIds.add(category.id);
  const categories = await catalog.records('categories', categoryIds);
  const strings = await catalog.records('strings', new Set([...items.flatMap(item => [item.name, ...item.tooltip]), ...categories.map(category => category.name)]));
  const textures = await catalog.records('textures', new Set(items.flatMap(item => item.icon ? [item.icon] : [])));
  const related: Related = { items, categories, strings, textures, fluids: [], topics: [] };
  return { domain, definition, roots: selectedRoots, chromosomes: selectedChromosomes, rows, total, offset: search.offset, limit: search.limit, related };
}
