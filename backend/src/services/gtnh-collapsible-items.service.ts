import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export interface CollapsibleItemCandidate {
  itemId: string;
  modId: string;
  internalName: string;
  localizedName: string;
  damage: number;
  oreDictionaryNames?: string[];
  nbtDescriptor?: string | null;
}

export interface CollapsibleItemAssignment {
  itemId: string;
  groupKey: string | null;
  groupLabel: string | null;
  groupSize: number;
  groupSortOrder: number;
}

type GroupRule = {
  key: string;
  displayName: string | null;
  matcher: (candidate: CollapsibleItemCandidate) => boolean;
};

type GroupSettings = {
  displayName: string | null;
};

const DEFAULT_CONFIG_CANDIDATES = [
  process.env.NEONEI_COLLAPSIBLE_ITEMS_CFG,
  path.resolve(process.cwd(), 'assets', 'gtnh', 'collapsibleitems.cfg'),
  path.resolve(process.cwd(), '..', '..', 'GTNH', 'GT-New-Horizons-Modpack', 'config', 'NEI', 'collapsibleitems.cfg'),
];

let cachedRules: GroupRule[] | null = null;
let cachedConfigPath: string | null = null;

function normalizeText(value: string | null | undefined): string {
  return `${value ?? ''}`.trim().toLowerCase();
}

function buildTextMatcher(searchText: string): ((value: string) => boolean) | null {
  const normalized = searchText.trim();
  if (!normalized) {
    return null;
  }

  if (normalized.length >= 3 && normalized.startsWith('r/') && normalized.endsWith('/')) {
    try {
      const pattern = new RegExp(normalized.slice(2, -1), 'iu');
      return (value: string) => pattern.test(value);
    } catch {
      return null;
    }
  }

  const needle = normalizeText(normalized);
  return (value: string) => normalizeText(value).includes(needle);
}

function compileDamageRule(rule: string): ((candidate: CollapsibleItemCandidate) => boolean) | null {
  const parts = rule.split('-', 2).map((entry) => Number.parseInt(entry, 10));
  if (parts.some((entry) => !Number.isFinite(entry))) {
    return null;
  }

  if (parts.length === 1) {
    return (candidate) => candidate.damage === parts[0];
  }

  const [start, end] = parts;
  return (candidate) => candidate.damage >= start && candidate.damage <= end;
}

function compileStrictIdentifierRule(rule: string): ((candidate: CollapsibleItemCandidate) => boolean) | null {
  const match = rule.match(/^([^:]+):([^:]+)(?::(\d+))?$/);
  if (!match) {
    return null;
  }

  const [, modIdRaw, internalNameRaw, damageRaw] = match;
  const modId = normalizeText(modIdRaw);
  const internalName = normalizeText(internalNameRaw);
  const damage = damageRaw ? Number.parseInt(damageRaw, 10) : null;

  return (candidate) => {
    if (normalizeText(candidate.modId) !== modId) return false;
    if (normalizeText(candidate.internalName) !== internalName) return false;
    if (damage == null || damage === 32767) return true;
    return candidate.damage === damage;
  };
}

function compileIdentifierRule(rule: string): ((candidate: CollapsibleItemCandidate) => boolean) | null {
  const matcher = buildTextMatcher(rule);
  if (!matcher) return null;

  return (candidate) => matcher(`${candidate.modId}:${candidate.internalName}`);
}

function compileOreDictionaryRule(rule: string): ((candidate: CollapsibleItemCandidate) => boolean) | null {
  const matcher = buildTextMatcher(rule);
  if (!matcher) return null;

  return (candidate) => (candidate.oreDictionaryNames ?? []).some((name) => matcher(name));
}

function compileTagRule(rule: string): ((candidate: CollapsibleItemCandidate) => boolean) | null {
  const [, rawValue = ''] = rule.split('=', 2);
  const matcher = buildTextMatcher(rawValue);
  if (!matcher) return null;

  return (candidate) => matcher(candidate.nbtDescriptor ?? '');
}

function compileSingleRule(rule: string): ((candidate: CollapsibleItemCandidate) => boolean) | null {
  if (rule.startsWith('$')) {
    return compileOreDictionaryRule(rule.slice(1));
  }
  if (rule.startsWith('tag.')) {
    return compileTagRule(rule.slice(4));
  }
  if (/^\d+(?:-\d+)?$/.test(rule)) {
    return compileDamageRule(rule);
  }
  if (rule.startsWith('<') && rule.endsWith('>')) {
    return compileStrictIdentifierRule(rule.slice(1, -1));
  }
  return compileIdentifierRule(rule);
}

function compileToken(token: string): ((candidate: CollapsibleItemCandidate) => boolean) | null {
  const positiveRules: Array<(candidate: CollapsibleItemCandidate) => boolean> = [];
  const negativeRules: Array<(candidate: CollapsibleItemCandidate) => boolean> = [];

  for (const rawRule of token.split(',').map((entry) => entry.trim()).filter(Boolean)) {
    const negated = rawRule.startsWith('!');
    const compiled = compileSingleRule(negated ? rawRule.slice(1) : rawRule);
    if (!compiled) continue;
    if (negated) {
      negativeRules.push(compiled);
    } else {
      positiveRules.push(compiled);
    }
  }

  if (positiveRules.length === 0 && negativeRules.length === 0) {
    return null;
  }

  return (candidate) => {
    const positiveMatch =
      positiveRules.length === 0 ? true : positiveRules.some((matcher) => matcher(candidate));
    if (!positiveMatch) return false;
    if (negativeRules.some((matcher) => matcher(candidate))) return false;
    return true;
  };
}

function compileFilterExpression(filterText: string): ((candidate: CollapsibleItemCandidate) => boolean) | null {
  const partMatchers: Array<(candidate: CollapsibleItemCandidate) => boolean> = [];

  for (const part of filterText.split(/\s*\|\s*/).map((entry) => entry.trim()).filter(Boolean)) {
    const tokenMatchers = part
      .split(/\s+/)
      .map((token) => compileToken(token))
      .filter((token): token is (candidate: CollapsibleItemCandidate) => boolean => Boolean(token));

    if (tokenMatchers.length === 0) continue;

    partMatchers.push((candidate) => tokenMatchers.every((matcher) => matcher(candidate)));
  }

  if (partMatchers.length === 0) {
    return null;
  }

  return (candidate) => partMatchers.some((matcher) => matcher(candidate));
}

function resolveConfigPath(configPath?: string): string | null {
  const candidates = [configPath, ...DEFAULT_CONFIG_CANDIDATES]
    .map((entry) => `${entry ?? ''}`.trim())
    .filter(Boolean);

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (fs.existsSync(resolved)) {
      return resolved;
    }
  }

  return null;
}

function parseConfigSettings(line: string): GroupSettings {
  try {
    const parsed = JSON.parse(line.slice(2).trim()) as Record<string, unknown>;
    return {
      displayName: typeof parsed.displayName === 'string' && parsed.displayName.trim()
        ? parsed.displayName.trim()
        : null,
    };
  } catch {
    return { displayName: null };
  }
}

function loadRules(configPath?: string): GroupRule[] {
  const resolvedPath = resolveConfigPath(configPath);
  if (!resolvedPath) {
    return [];
  }

  if (cachedRules && cachedConfigPath === resolvedPath) {
    return cachedRules;
  }

  const content = fs.readFileSync(resolvedPath, 'utf8');
  const lines = content.split(/\r?\n/);
  const rules: GroupRule[] = [];
  let pendingSettings: GroupSettings = { displayName: null };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    if (line.startsWith('; ')) {
      pendingSettings = parseConfigSettings(line);
      continue;
    }

    const matcher = compileFilterExpression(line);
    if (!matcher) {
      pendingSettings = { displayName: null };
      continue;
    }

    const key = `gtnh-collapsible:${crypto.createHash('md5').update(line).digest('hex')}`;
    rules.push({
      key,
      displayName: pendingSettings.displayName,
      matcher,
    });
    pendingSettings = { displayName: null };
  }

  cachedRules = rules;
  cachedConfigPath = resolvedPath;
  return rules;
}

export function buildCollapsibleItemAssignments(
  candidates: CollapsibleItemCandidate[],
  options?: { configPath?: string },
): Map<string, CollapsibleItemAssignment> {
  const rules = loadRules(options?.configPath);
  const assignments = new Map<string, CollapsibleItemAssignment>();

  if (candidates.length === 0) {
    return assignments;
  }

  const sortedCandidates = [...candidates];
  const matchedRuleByItem = new Map<string, GroupRule | null>();
  const groupSizes = new Map<string, number>();

  for (const candidate of sortedCandidates) {
    const matchedRule = rules.find((rule) => rule.matcher(candidate)) ?? null;
    matchedRuleByItem.set(candidate.itemId, matchedRule);
    if (matchedRule) {
      groupSizes.set(matchedRule.key, (groupSizes.get(matchedRule.key) ?? 0) + 1);
    }
  }

  const groupSortOrder = new Map<string, number>();
  let nextSortOrder = 0;

  for (const candidate of sortedCandidates) {
    const matchedRule = matchedRuleByItem.get(candidate.itemId) ?? null;
    if (!matchedRule) {
      assignments.set(candidate.itemId, {
        itemId: candidate.itemId,
        groupKey: null,
        groupLabel: null,
        groupSize: 1,
        groupSortOrder: nextSortOrder++,
      });
      continue;
    }

    if (!groupSortOrder.has(matchedRule.key)) {
      groupSortOrder.set(matchedRule.key, nextSortOrder++);
    }

    assignments.set(candidate.itemId, {
      itemId: candidate.itemId,
      groupKey: matchedRule.key,
      groupLabel: matchedRule.displayName,
      groupSize: groupSizes.get(matchedRule.key) ?? 1,
      groupSortOrder: groupSortOrder.get(matchedRule.key) ?? 0,
    });
  }

  return assignments;
}
