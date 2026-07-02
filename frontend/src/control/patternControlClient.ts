import {
  deleteLabControlPayload,
  getLabControlPayload,
  postLabControlPayload,
  putLabControlPayload,
} from './labControlClient';
import type {
  Pattern,
  PatternExportData,
  PatternGroup,
  PatternGroupWithPatterns,
} from '../runtime/types';

export interface CreatePatternPayload {
  groupId?: string;
  recipeId: string;
  patternName: string;
  outputItemId?: string;
  crafting?: number;
  substitute?: number;
  beSubstitute?: number;
  priority?: number;
}

export interface UpdatePatternPayload {
  patternName?: string;
  priority?: number;
  enabled?: number;
  crafting?: number;
  substitute?: number;
  beSubstitute?: number;
}

export const patternControlClient = {
  getGroups(): Promise<PatternGroup[]> {
    return getLabControlPayload<PatternGroup[]>('/patterns/groups');
  },

  getGroup(groupId: string): Promise<PatternGroup> {
    return getLabControlPayload<PatternGroup>(`/patterns/groups/${groupId}`);
  },

  getGroupWithPatterns(groupId: string): Promise<PatternGroupWithPatterns> {
    return getLabControlPayload<PatternGroupWithPatterns>(`/patterns/groups/${groupId}/detail`);
  },

  createGroup(groupName: string, description?: string): Promise<PatternGroup> {
    return postLabControlPayload<PatternGroup>('/patterns/groups', {
      groupName,
      description,
    });
  },

  async updateGroup(groupId: string, groupName: string, description?: string): Promise<void> {
    await putLabControlPayload(`/patterns/groups/${groupId}`, {
      groupName,
      description,
    });
  },

  async deleteGroup(groupId: string): Promise<void> {
    await deleteLabControlPayload(`/patterns/groups/${groupId}`);
  },

  createPattern(data: CreatePatternPayload): Promise<Pattern> {
    return postLabControlPayload<Pattern>('/patterns', data);
  },

  async deletePattern(patternId: string): Promise<void> {
    await deleteLabControlPayload(`/patterns/${patternId}`);
  },

  async updatePattern(patternId: string, updates: UpdatePatternPayload): Promise<void> {
    await putLabControlPayload(`/patterns/${patternId}`, updates);
  },

  exportGroup(groupId: string): Promise<PatternExportData> {
    return getLabControlPayload<PatternExportData>(`/patterns/groups/${groupId}/export`);
  },
};
