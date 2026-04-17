import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSearchIndexEntry,
  matchesIndexedItem,
  normalizeSearchKeyword,
} from '../src/services/items-search.service';

test('buildSearchIndexEntry includes full pinyin and acronym for localized Chinese names', () => {
  const entry = buildSearchIndexEntry({
    itemId: 'item~Thaumcraft~ItemThaumonomicon~0',
    localizedName: '神秘时代',
    modId: 'Thaumcraft',
    internalName: 'ItemThaumonomicon',
    searchTerms: 'thaumcraft thaumonomicon',
  });

  assert.equal(entry.pinyinFull, 'shenmishidai');
  assert.equal(entry.pinyinAcronym, 'smsd');
});

test('matchesIndexedItem supports localized text, full pinyin, and acronym queries', () => {
  const entry = buildSearchIndexEntry({
    itemId: 'item~Thaumcraft~ItemThaumonomicon~0',
    localizedName: '神秘时代',
    modId: 'Thaumcraft',
    internalName: 'ItemThaumonomicon',
    searchTerms: 'thaumcraft thaumonomicon',
  });

  assert.equal(matchesIndexedItem(entry, normalizeSearchKeyword('神秘')), true);
  assert.equal(matchesIndexedItem(entry, normalizeSearchKeyword('shenmi')), true);
  assert.equal(matchesIndexedItem(entry, normalizeSearchKeyword('smsd')), true);
  assert.equal(matchesIndexedItem(entry, normalizeSearchKeyword('thaumonomicon')), true);
});

test('matchesIndexedItem keeps english-name search working', () => {
  const entry = buildSearchIndexEntry({
    itemId: 'item~minecraft~iron_ingot~0',
    localizedName: 'Iron Ingot',
    modId: 'minecraft',
    internalName: 'iron_ingot',
    searchTerms: 'iron ingot metal',
  });

  assert.equal(matchesIndexedItem(entry, normalizeSearchKeyword('iron')), true);
  assert.equal(matchesIndexedItem(entry, normalizeSearchKeyword('ii')), false);
});
