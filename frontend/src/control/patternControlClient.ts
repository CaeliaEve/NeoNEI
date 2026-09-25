import {
  deleteControlPayload,
  getControlPayload,
  postControlPayload,
  putControlPayload,
} from './adminControlClient';
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
    return getControlPayload<PatternGroup[]>('/patterns/groups');
  },

  getGroup(groupId: string): Promise<PatternGroup> {
    return getControlPayload<PatternGroup>(`/patterns/groups/${groupId}`);
  },

  getGroupWithPatterns(groupId: string): Promise<PatternGroupWithPatterns> {
    return getControlPayload<PatternGroupWithPatterns>(`/patterns/groups/${groupId}/detail`);
  },

  createGroup(groupName: string, description?: string): Promise<PatternGroup> {
    return postControlPayload<PatternGroup>('/patterns/groups', {
      groupName,
      description,
    });
  },

  async updateGroup(groupId: string, groupName: string, description?: string): Promise<void> {
    await putControlPayload(`/patterns/groups/${groupId}`, {
      groupName,
      description,
    });
  },

  async deleteGroup(groupId: string): Promise<void> {
    await deleteControlPayload(`/patterns/groups/${groupId}`);
  },

  createPattern(data: CreatePatternPayload): Promise<Pattern> {
    return postControlPayload<Pattern>('/patterns', data);
  },

  async deletePattern(patternId: string): Promise<void> {
    await deleteControlPayload(`/patterns/${patternId}`);
  },

  async updatePattern(patternId: string, updates: UpdatePatternPayload): Promise<void> {
    await putControlPayload(`/patterns/${patternId}`, updates);
  },

  exportGroup(groupId: string): Promise<PatternExportData> {
    return getControlPayload<PatternExportData>(`/patterns/groups/${groupId}/export`);
  },
};
