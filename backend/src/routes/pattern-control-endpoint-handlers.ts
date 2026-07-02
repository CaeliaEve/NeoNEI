import type { Request, Response } from 'express';
import { createPatternControlService } from '../services/pattern-control.service';
import { PATTERN_CONTROL_ENDPOINTS, type PatternControlEndpointKey } from './pattern-control-endpoint-registry';
import { validateAndFreezeRouteHandlers } from './route-descriptor-registry';

export type PatternControlEndpointHandler = (req: Request, res: Response) => Promise<void>;

function sendPatternControlJson(res: Response, payload: unknown, statusCode = 200): void {
  if (statusCode !== 200) {
    res.status(statusCode);
  }
  res.json(payload);
}

export const PATTERN_CONTROL_ENDPOINT_HANDLERS: Readonly<Record<PatternControlEndpointKey, PatternControlEndpointHandler>> =
  validateAndFreezeRouteHandlers({
    label: 'pattern control endpoint',
    descriptors: PATTERN_CONTROL_ENDPOINTS,
    handlers: {
      'list-groups': async (_req, res) => {
        sendPatternControlJson(res, await createPatternControlService().getGroups());
      },
      'get-group': async (req, res) => {
        sendPatternControlJson(res, await createPatternControlService().getGroup(req.params.groupId));
      },
      'get-group-detail': async (req, res) => {
        sendPatternControlJson(res, await createPatternControlService().getGroupDetail(req.params.groupId));
      },
      'create-group': async (req, res) => {
        sendPatternControlJson(res, await createPatternControlService().createGroup(req.body), 201);
      },
      'update-group': async (req, res) => {
        sendPatternControlJson(res, await createPatternControlService().updateGroup(req.params.groupId, req.body));
      },
      'delete-group': async (req, res) => {
        sendPatternControlJson(res, await createPatternControlService().deleteGroup(req.params.groupId));
      },
      'create-pattern': async (req, res) => {
        sendPatternControlJson(res, await createPatternControlService().createPattern(req.body), 201);
      },
      'delete-pattern': async (req, res) => {
        sendPatternControlJson(res, await createPatternControlService().deletePattern(req.params.patternId));
      },
      'update-pattern': async (req, res) => {
        sendPatternControlJson(res, await createPatternControlService().updatePattern(req.params.patternId, req.body));
      },
      'export-group': async (req, res) => {
        sendPatternControlJson(res, await createPatternControlService().exportGroup(req.params.groupId));
      },
    },
  });
