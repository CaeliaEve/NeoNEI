import type {GeneticReferenceRow} from '@elysium/contracts';
import {Catalog, Fault} from './store.ts';
import type {Related} from './query.ts';
export type DraconicReactorDefinition = Omit<GeneticReferenceRow, 'data'> & {data: Extract<GeneticReferenceRow['data'], {kind: 'draconicReactorDefinition'}>};
export interface DraconicReactorPage {definition: DraconicReactorDefinition | null; related: Related}

export class DraconicReactorQuery {
  private readonly catalog: Pick<Catalog, 'scan' | 'records'>;
  private pending?: Promise<DraconicReactorPage>;
  constructor(catalog: Pick<Catalog, 'scan' | 'records'>) { this.catalog = catalog; }
  page() { return this.pending ??= this.load().catch(error => { this.pending = undefined; throw error; }); }
  private async load(): Promise<DraconicReactorPage> {
    let definition: DraconicReactorDefinition | null = null;
    for await (const row of this.catalog.scan('references')) if (row.data.kind === 'draconicReactorDefinition') {
      if (definition || JSON.stringify(row).length * 2 > 1024 * 1024)
        throw new Fault('invalid_reference', 'Reactor reference is ambiguous or oversized');
      definition = row as DraconicReactorDefinition;
    }
    const ids = new Set<string>();
    if (definition) {
      if (!definition.data.ready || definition.data.consuming || definition.order !== 0
        || definition.data.fuels.length !== 3 || definition.data.products.length !== 4)
        throw new Fault('invalid_reference', 'Reactor reference is incomplete or consuming');
      ids.add(definition.data.core);
      for (const row of [...definition.data.fuels, ...definition.data.products]) ids.add(row.item);
    }
    const items = await this.catalog.records('items', ids), categories = [];
    if (definition) for await (const category of this.catalog.scan('categories'))
      if (category.reference === definition.domain) categories.push(category);
    const strings = await this.catalog.records('strings', new Set([...items.flatMap(row => [row.name, ...row.tooltip]), ...categories.map(row => row.name)]));
    const textures = await this.catalog.records('textures', new Set(items.flatMap(row => row.icon ? [row.icon] : [])));
    return {definition, related: {items, categories, strings, textures, fluids: [], topics: []}};
  }
}
