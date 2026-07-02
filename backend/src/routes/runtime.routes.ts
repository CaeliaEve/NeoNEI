import { Router, type RequestHandler } from 'express';
import { asyncHandler } from '../utils/http';
import {
  RUNTIME_PUBLIC_ENDPOINTS,
  type RuntimePublicEndpoint,
} from './runtime-public-endpoint-registry';
import { RUNTIME_PUBLIC_ENDPOINT_HANDLERS } from './runtime-public-endpoint-handlers';

const router = Router();

function registerRuntimePublicEndpoint(target: Router, endpoint: RuntimePublicEndpoint): void {
  const handler: RequestHandler = asyncHandler(RUNTIME_PUBLIC_ENDPOINT_HANDLERS[endpoint.key]);
  target.get(endpoint.path, handler);
}

for (const endpoint of RUNTIME_PUBLIC_ENDPOINTS) {
  registerRuntimePublicEndpoint(router, endpoint);
}

export default router;
