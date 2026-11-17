import { assertTable, type GeneticReferenceRow } from '@elysium/contracts';
import type { GeneticReferencePage, ReferenceSearch } from '@neonei/catalog/source';
import { ApiError } from './transport.ts';
export type { GeneticReferencePage, ReferenceSearch } from '@neonei/catalog/source';

type Read = (endpoint: string, signal?: AbortSignal) => Promise<unknown>;
export async function readGeneticReferences(read: Read, search: ReferenceSearch, signal?: AbortSignal): Promise<GeneticReferencePage> {
  const parameters = new URLSearchParams({ domain: search.domain, root: search.root, query: search.query, offset: String(search.offset), limit: String(search.limit) });
  const data = await read('/references?' + parameters, signal);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new ApiError('invalid_response', '基因数据库响应格式无效');
  const value = data as GeneticReferencePage;
  if (![value.total, value.offset, value.limit].every(Number.isSafeInteger) || value.total < 0 || value.offset !== search.offset || value.limit !== search.limit
    || !Array.isArray(value.rows) || !Array.isArray(value.roots) || !Array.isArray(value.chromosomes)
    || value.rows.length > value.limit || value.rows.length > value.total || typeof value.domain !== 'string'
    || value.domain && !/^reference_[a-f0-9]{64}$/.test(value.domain)
    || value.definition !== null && (!value.definition || typeof value.definition !== 'object' || Array.isArray(value.definition))
    || !value.related || typeof value.related !== 'object' || Array.isArray(value.related)) throw new ApiError('invalid_response', '基因数据库分页与身份不匹配');
  const references: GeneticReferenceRow[] = [...value.rows, ...value.roots, ...value.chromosomes, ...(value.definition ? [value.definition] : [])];
  try {
    assertTable({ kind: 'references', records: references });
    for (const kind of ['items','fluids','categories','strings','textures','topics'] as const) assertTable({ kind, records: value.related[kind] });
  } catch { throw new ApiError('invalid_response', '基因数据库不符合已发布契约'); }
  if (references.some(row => row.domain !== value.domain) || value.rows.some(row => row.data.kind !== 'gene')
    || value.roots.some(row => row.data.kind !== 'root') || value.chromosomes.some(row => row.data.kind !== 'chromosome')
    || value.definition && value.definition.data.kind !== 'definition') throw new ApiError('invalid_response', '基因数据库混合了不同领域的记录');
  if (value.domain ? value.definition?.data.kind !== 'definition' : value.definition !== null || references.length !== 0 || value.total !== 0) throw new ApiError('invalid_response', '基因数据库缺少原生领域定义');
  if (value.definition?.data.kind === 'definition' && (value.total > value.definition.data.counts.genes
    || value.roots.length !== value.definition.data.counts.roots || value.chromosomes.length !== value.definition.data.counts.chromosomes)
    || value.related.categories.some(category => category.reference !== value.domain)) throw new ApiError('invalid_response', '基因数据库目录计数与类别绑定不匹配');
  const items = new Set(value.related.items.map(item => item.id));
  for (const row of value.rows) if (row.data.kind === 'gene' && [row.data.gene.serum, row.data.gene.genome, row.data.gene.sequence].some(id => !items.has(id))) throw new ApiError('invalid_response', '基因数据库缺少原生基因物品');
  return value;
}
