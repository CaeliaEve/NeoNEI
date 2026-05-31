import {
  deleteLabPayload,
  getLabPayload,
  postLabPayload,
  putLabPayload,
} from './devCompatClient';
import type {
  Pattern,
  PatternExportData,
  PatternGroup,
  PatternGroupWithPatterns,
} from './types';

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

export const patternRuntimeClient = {
  getGroups(): Promise<PatternGroup[]> {
    return getLabPayload<PatternGroup[]>('/patterns/groups');
  },

  getGroup(groupId: string): Promise<PatternGroup> {
    return getLabPayload<PatternGroup>(`/patterns/groups/${groupId}`);
  },

  getGroupWithPatterns(groupId: string): Promise<PatternGroupWithPatterns> {
    return getLabPayload<PatternGroupWithPatterns>(`/patterns/groups/${groupId}/detail`);
  },

  createGroup(groupName: string, description?: string): Promise<PatternGroup> {
    return postLabPayload<PatternGroup>('/patterns/groups', {
      groupName,
      description,
    });
  },

  async updateGroup(groupId: string, groupName: string, description?: string): Promise<void> {
    await putLabPayload(`/patterns/groups/${groupId}`, {
      groupName,
      description,
    });
  },

  async deleteGroup(groupId: string): Promise<void> {
    await deleteLabPayload(`/patterns/groups/${groupId}`);
  },

  createPattern(data: CreatePatternPayload): Promise<Pattern> {
    return postLabPayload<Pattern>('/patterns', data);
  },

  async deletePattern(patternId: string): Promise<void> {
    await deleteLabPayload(`/patterns/${patternId}`);
  },

  async updatePattern(patternId: string, updates: UpdatePatternPayload): Promise<void> {
    await putLabPayload(`/patterns/${patternId}`, updates);
  },

  exportGroup(groupId: string): Promise<PatternExportData> {
    return getLabPayload<PatternExportData>(`/patterns/groups/${groupId}/export`);
  },
};