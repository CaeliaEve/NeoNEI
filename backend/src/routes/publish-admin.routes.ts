import { Router, type RequestHandler } from 'express';
import { asyncHandler } from '../utils/http';
import {
  PUBLISH_ADMIN_ENDPOINTS,
  type PublishAdminEndpoint,
} from './publish-admin-endpoint-registry';
import { PUBLISH_ADMIN_ENDPOINT_HANDLERS } from './publish-admin-endpoint-handlers';

export function createPublishAdminRouter(): Router {
  const router = Router();

  for (const endpoint of PUBLISH_ADMIN_ENDPOINTS) {
    registerPublishAdminEndpoint(router, endpoint);
  }

  return router;
}

function registerPublishAdminEndpoint(target: Router, endpoint: PublishAdminEndpoint): void {
  const handler: RequestHandler = asyncHandler(PUBLISH_ADMIN_ENDPOINT_HANDLERS[endpoint.key]);
  switch (endpoint.method) {
    case 'get':
      target.get(endpoint.path, handler);
      break;
    case 'post':
      target.post(endpoint.path, handler);
      break;
  }
}
