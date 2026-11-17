import { assertTable, canonical } from '@elysium/contracts';
import type { QuestBigItemStack, QuestItemPattern } from '@elysium/contracts';
import { hash, questReferences } from '@neonei/catalog/source';
import type { QuestPage, QuestSearch } from '@neonei/catalog/source';
import { ApiError } from './transport.ts';
export type { QuestPage, QuestSearch } from '@neonei/catalog/source';

const invalid = (): never => { throw new ApiError('invalid_response', '任务资料缺少原生声明或来源不一致'); };
const uuid = (value: string) => /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(value);
const taskNames: Record<string, [string, string]> = {
  crafting: ['Crafting', 'crafting'], fluid: ['Fluid', 'fluid'], meeting: ['Meeting', 'meeting'],
  hunt: ['Hunt', 'hunt'], interactItem: ['InteractItem', 'interact_item'], interactEntity: ['InteractEntity', 'interact_entity'],
  checkbox: ['Checkbox', 'checkbox'], location: ['Location', 'location'], xp: ['XP', 'xp'],
  blockBreak: ['BlockBreak', 'block_break'], scoreboard: ['Scoreboard', 'scoreboard'],
};
const rewardNames: Record<string, [string, string]> = {
  item: ['Item', 'item'], choice: ['Choice', 'choice'], xp: ['XP', 'xp'], command: ['Command', 'command'],
  scoreboard: ['Scoreboard', 'scoreboard'], questCompletion: ['QuestCompletion', 'questcompletion'],
};

export async function readQuests(
  read: (path: string, signal?: AbortSignal) => Promise<unknown>, search: QuestSearch, signal?: AbortSignal,
): Promise<QuestPage> {
  const raw = await read('/quests?' + new URLSearchParams({ ...search, offset: String(search.offset), limit: String(search.limit) }), signal);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) invalid();
  const page = raw as QuestPage;
  try {
    if (!Array.isArray(page.rows) || page.rows.length > 100 || page.definition === undefined) invalid();
    const leaves = [...(page.definition ? [page.definition] : []), ...page.rows];
    assertTable({ kind: 'references', records: leaves });
    for (const kind of ['items','fluids','categories','strings','textures','topics'] as const)
      assertTable({ kind, records: page.related[kind] });
    for (let start = 0; start < leaves.length; start += 16) {
      const checks = await Promise.all(leaves.slice(start, start + 16).map(async row =>
        row.id === 'refrow_' + await hash(canonical({ domain: row.domain, order: row.order, data: row.data }))));
      if (checks.some(ok => !ok)) invalid();
    }
    if (!Number.isSafeInteger(page.total) || page.total < 0 || page.offset !== search.offset || page.limit !== search.limit
      || page.rows.length !== Math.max(0, Math.min(page.limit, page.total - page.offset))) invalid();
    const definition = page.definition;
    if (!definition) {
      if (page.rows.length || page.total || page.related.categories.length) invalid();
      return page;
    }
    const def = definition.data, category = page.related.categories[0];
    const registry = new Set(def.registry), visible = new Set(def.visible);
    if (def.kind !== 'questsDefinition' || definition.order !== 0 || !def.ready || def.consuming
      || def.scope !== 'nativeCurrentPlayerVisibility' || def.source.handler !== 'bq_standard.integration.nei.QuestRecipeHandler'
      || def.source.key !== def.source.handler || !def.source.owner || page.related.categories.length !== 1
      || category.reference !== definition.domain || canonical(category.source) !== canonical(def.source)
      || def.registry.length !== def.registered || def.visible.length !== def.counts.quests
      || def.registry.some(id => !uuid(id)) || registry.size !== def.registry.length
      || visible.size !== def.visible.length || def.visible.some(id => !registry.has(id))
      || page.total > def.counts.quests) invalid();
    const items = new Map(page.related.items.map(item => [item.id, item]));
    const strings = new Set(page.related.strings.map(row => row.id)), textures = new Set(page.related.textures.map(row => row.id));
    if (!strings.has(category.name)) invalid();
    const references = questReferences(page.rows.map(row => row.data));
    if (items.size !== references.items.size || page.related.fluids.length !== references.fluids.size) invalid();
    for (const id of references.items) if (!items.has(id)) invalid();
    for (const id of references.fluids) if (!page.related.fluids.some(row => row.id === id)) invalid();
    for (const fact of [...page.related.items, ...page.related.fluids])
      if (!strings.has(fact.name) || fact.icon && !textures.has(fact.icon)) invalid();

    function pattern(value: QuestItemPattern) {
      if (value.examples.length > 65536 || value.meta !== 32767 && value.examples.length !== 1) invalid();
      for (const id of value.examples) {
        const item = items.get(id);
        if (!item || item.registry !== value.registry || canonical(item.nbt) !== canonical(value.nbt)
          || (value.meta === 32767 ? item.meta < 0 || item.meta === 32767 : item.meta !== value.meta)) invalid();
      }
    }
    function stack(value: QuestBigItemStack) {
      pattern(value.base);
      if (!value.candidates.length || value.candidates.length > 65536
        || (value.oreActive ? !value.oreKey : value.candidates.length !== 1 || canonical(value.candidates[0]) !== canonical(value.base))) invalid();
      for (const candidate of value.candidates) pattern(candidate);
    }
    function declarations(value: unknown) {
      if (Array.isArray(value)) { for (const child of value) declarations(child); }
      else if (value && typeof value === 'object') {
        if ('base' in value && 'candidates' in value) { stack(value as QuestBigItemStack); return; }
        if ('registry' in value && 'examples' in value) { pattern(value as QuestItemPattern); return; }
        for (const [key, child] of Object.entries(value)) if (!['nbt', 'targetNBT'].includes(key)) declarations(child);
      }
    }
    let previous = -1;
    for (const row of page.rows) {
      const quest = row.data;
      if (quest.kind !== 'questDeclaration' || row.domain !== definition.domain || row.order !== 1 + quest.ordinal
        || quest.ordinal <= previous || def.visible[quest.ordinal] !== quest.questUuid
        || search.quest && quest.questUuid !== search.quest) invalid();
      previous = quest.ordinal;
      const key = btoa(String.fromCharCode(...quest.questUuid.replace(/-/g, '').match(/../g)!.map(byte => parseInt(byte, 16))))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      if (quest.name.key !== `betterquesting.quest.${key}.name` || quest.description.key !== `betterquesting.quest.${key}.desc`) invalid();
      const prerequisites = new Set<string>();
      for (const target of quest.prerequisites) {
        const state = visible.has(target.questUuid) ? 'visible' : registry.has(target.questUuid) ? 'hidden' : 'missing';
        if (!uuid(target.questUuid) || prerequisites.has(target.questUuid) || target.state !== state) invalid();
        prerequisites.add(target.questUuid);
      }
      for (const [reward, entries] of [[false, quest.tasks], [true, quest.rewards]] as const) {
        let id = -1;
        for (const entry of entries) {
          const rule = entry.rule;
          const [suffix, name] = rule.type === 'retrieval'
            ? rule.optional ? ['OptionalRetrieval', 'optional_retrieval'] : ['Retrieval', 'retrieval']
            : (reward ? rewardNames : taskNames)[rule.type] ?? invalid();
          if (entry.nativeId <= id || entry.nativeClass !== `bq_standard.${reward ? 'rewards.Reward' : 'tasks.Task'}${suffix}`
            || entry.factory !== 'bq_standard:' + name || entry.labelKey !== `bq_standard.${reward ? 'reward' : 'task'}.${name}`) invalid();
          id = entry.nativeId;
          if (rule.type === 'choice' && rule.selectionCount !== 1) invalid();
        }
      }
      declarations(quest);
    }
    return page;
  } catch { return invalid(); }
}
