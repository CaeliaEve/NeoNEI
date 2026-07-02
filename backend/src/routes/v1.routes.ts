import { Router, type RequestHandler } from 'express';
import { asyncHandler } from '../utils/http';
import { API_V1_ENDPOINTS, type ApiV1Endpoint } from './v1-endpoint-registry';
import { API_V1_ENDPOINT_HANDLERS } from './v1-endpoint-handlers';

const router = Router();

function registerApiV1Endpoint(target: Router, endpoint: ApiV1Endpoint): void {
  const handler: RequestHandler = asyncHandler(API_V1_ENDPOINT_HANDLERS[endpoint.key]);
  target.get(endpoint.path, handler);
}

for (const endpoint of API_V1_ENDPOINTS) {
  registerApiV1Endpoint(router, endpoint);
}

export default router;
