import type { ErrorEnvelopeDetails } from '../utils/error-response';
import {
  PatternsService,
  type Pattern,
  type PatternGroup,
  type PatternGroupWithPatterns,
} from './patterns.service';
import type { OcPatternExportDocument } from './pattern-export.service';

export type PatternControlOptions = Readonly<{
  crafting?: number;
  substitute?: number;
  beSubstitute?: number;
  priority?: number;
}>;

export type PatternControlError = Error & {
  statusCode: number;
  code: string;
  details?: ErrorEnvelopeDetails;
};

export type CreatePatternControlPayload = Readonly<{
  groupId: string | null;
  recipeId: string;
  patternName: string;
  outputItemId: string | null;
  options: PatternControlOptions;
}>;

function patternControlError(
  statusCode: number,
  code: string,
  message: string,
  details?: ErrorEnvelopeDetails,
): PatternControlError {
  const error = new Error(message) as PatternControlError;
  error.statusCode = statusCode;
  error.code = code;
  if (details) error.details = details;
  return error;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function requireString(value: unknown, code: string, message: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) {
    throw patternControlError(400, code, message);
  }
  return normalized;
}

export function normalizePatternOptions(body: Record<string, unknown>): PatternControlOptions {
  if (body.options && typeof body.options === 'object' && !Array.isArray(body.options)) {
    return body.options as PatternControlOptions;
  }

  return {
    crafting: body.crafting as number | undefined,
    substitute: body.substitute as number | undefined,
    beSubstitute: body.beSubstitute as number | undefined,
    priority: body.priority as number | undefined,
  };
}

export function normalizeCreatePatternPayload(body: unknown): CreatePatternControlPayload {
  const record = asRecord(body);
  return Object.freeze({
    groupId: asOptionalString(record.groupId),
    recipeId: requireString(
      record.recipeId,
      'PATTERN_REQUIRED_FIELDS_MISSING',
      'recipeId and patternName are required',
    ),
    patternName: requireString(
      record.patternName,
      'PATTERN_REQUIRED_FIELDS_MISSING',
      'recipeId and patternName are required',
    ),
    outputItemId: asOptionalString(record.outputItemId),
    options: normalizePatternOptions(record),
  });
}

export class PatternControlService {
  private readonly patternsService: PatternsService;

  constructor(patternsService: PatternsService = new PatternsService()) {
    this.patternsService = patternsService;
  }

  getGroups(): Promise<PatternGroup[]> {
    return this.patternsService.getPatternGroups();
  }

  async getGroup(groupId: string): Promise<PatternGroup> {
    const group = await this.patternsService.getPatternGroup(groupId);
    if (!group) {
      throw patternControlError(404, 'PATTERN_GROUP_NOT_FOUND', 'Pattern group not found', { groupId });
    }
    return group;
  }

  async getGroupDetail(groupId: string): Promise<PatternGroupWithPatterns> {
    const group = await this.patternsService.getPatternGroupWithPatterns(groupId);
    if (!group) {
      throw patternControlError(404, 'PATTERN_GROUP_NOT_FOUND', 'Pattern group not found', { groupId });
    }
    return group;
  }

  createGroup(body: unknown): Promise<PatternGroup> {
    const record = asRecord(body);
    const groupName = requireString(
      record.groupName,
      'PATTERN_GROUP_NAME_REQUIRED',
      'groupName is required',
    );
    const description = typeof record.description === 'string' ? record.description : undefined;
    return this.patternsService.createPatternGroup(groupName, description);
  }

  async updateGroup(groupId: string, body: unknown): Promise<PatternGroup | null> {
    const record = asRecord(body);
    const groupName = requireString(
      record.groupName,
      'PATTERN_GROUP_NAME_REQUIRED',
      'groupName is required',
    );
    const description = typeof record.description === 'string' ? record.description : undefined;
    await this.patternsService.updatePatternGroup(groupId, groupName, description);
    return this.patternsService.getPatternGroup(groupId);
  }

  async deleteGroup(groupId: string): Promise<{ success: true }> {
    await this.patternsService.deletePatternGroup(groupId);
    return { success: true };
  }

  createPattern(body: unknown): Promise<Pattern> {
    const payload = normalizeCreatePatternPayload(body);
    return this.patternsService.createPattern(
      payload.groupId,
      payload.recipeId,
      payload.patternName,
      payload.outputItemId,
      payload.options,
    );
  }

  async deletePattern(patternId: string): Promise<{ success: true }> {
    await this.patternsService.deletePattern(patternId);
    return { success: true };
  }

  async updatePattern(patternId: string, body: unknown): Promise<{ success: true }> {
    await this.patternsService.updatePattern(patternId, asRecord(body));
    return { success: true };
  }

  async exportGroup(groupId: string): Promise<OcPatternExportDocument> {
    try {
      return await this.patternsService.exportPatternGroup(groupId);
    } catch (error) {
      if (error instanceof Error && error.message === 'Pattern group not found') {
        throw patternControlError(404, 'PATTERN_GROUP_NOT_FOUND', 'Pattern group not found', { groupId });
      }
      throw error;
    }
  }
}

export function createPatternControlService(): PatternControlService {
  return new PatternControlService();
}
