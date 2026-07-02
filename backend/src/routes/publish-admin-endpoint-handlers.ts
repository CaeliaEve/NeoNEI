import type { Request, Response } from 'express';
import { createPublishAdminControlService } from '../services/publish-admin-control.service';
import { setNoStoreHeaders } from '../utils/http-cache';
import { PUBLISH_ADMIN_ENDPOINTS, type PublishAdminEndpointKey } from './publish-admin-endpoint-registry';
import { validateAndFreezeRouteHandlers } from './route-descriptor-registry';
import { sendRuntimeAdminJson } from './runtime-admin-transport';

export type PublishAdminEndpointHandler = (req: Request, res: Response) => Promise<void>;

export const PUBLISH_ADMIN_ENDPOINT_HANDLERS: Readonly<Record<PublishAdminEndpointKey, PublishAdminEndpointHandler>> =
  validateAndFreezeRouteHandlers({
    label: 'publish admin endpoint',
    descriptors: PUBLISH_ADMIN_ENDPOINTS,
    handlers: {
      'list-releases': async (_req, res) => {
        setNoStoreHeaders(res);
        sendRuntimeAdminJson(res, createPublishAdminControlService().listReleases());
      },
      'activate-release': async (req, res) => {
        sendRuntimeAdminJson(
          res,
          createPublishAdminControlService().activateRelease(req.params.sourceSignature),
        );
      },
    },
  });
