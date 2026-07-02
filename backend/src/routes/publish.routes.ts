import { Router, type RequestHandler, type Router as ExpressRouter } from 'express';
import { asyncHandler } from '../utils/http';
import {
  PUBLISH_PUBLIC_ENDPOINTS,
  type PublishPublicEndpoint,
} from './publish-public-endpoint-registry';
import { PUBLISH_PUBLIC_ENDPOINT_HANDLERS } from './publish-public-endpoint-handlers';

function registerPublishPublicEndpoint(router: ExpressRouter, endpoint: PublishPublicEndpoint): void {
  const handler: RequestHandler = asyncHandler(PUBLISH_PUBLIC_ENDPOINT_HANDLERS[endpoint.key]);
  router.get(endpoint.path, handler);
}

function registerPublicReadRoutes(router: ExpressRouter): void {
  for (const endpoint of PUBLISH_PUBLIC_ENDPOINTS) {
    registerPublishPublicEndpoint(router, endpoint);
  }
}

export function createPublishRoutes(): ExpressRouter {
  const router = Router();
  registerPublicReadRoutes(router);
  return router;
}

export const publicPublishRoutes = createPublishRoutes();

export default publicPublishRoutes;
